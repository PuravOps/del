import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { getMessages, getUnseenCounts, getUsers } from "../services/api"
import { socketService } from "./ChatService"
import type { MessageResponse, SendMessagePayload } from "../types/chat.types"

interface User {
  _id: string
  name: string
  phone: string
}

const Chat = () => {
  const [users, setUsers] = useState<User[]>([])
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [messages, setMessages] = useState<MessageResponse[]>([])
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({})
  const [input, setInput] = useState("")
  const [sendError, setSendError] = useState<string | null>(null)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)

  const inputRef = useRef<HTMLInputElement | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  const sender = localStorage.getItem("userPhone") || ""

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    window.requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior })
    })
  }, [])

  const chatUsers = useMemo(() => {
    if (!sender) return users
    return users.filter((u) => u.phone !== sender)
  }, [users, sender])

  const filteredMessages = useMemo(() => {
    if (!selectedUser) return []

    return messages.filter(
      (m) =>
        (m.sender === sender && m.receiver === selectedUser.phone) ||
        (m.sender === selectedUser.phone && m.receiver === sender),
    )
  }, [messages, selectedUser, sender])

  const lastOutgoingMessageId = useMemo(() => {
    for (let i = filteredMessages.length - 1; i >= 0; i -= 1) {
      const m = filteredMessages[i]
      if (m.sender === sender) return m._id
    }
    return null
  }, [filteredMessages, sender])

  const emojis = useMemo(
    () => ["😀", "😁", "😂", "🤣", "😊", "😍", "😘", "😎", "🤔", "😢", "😡", "👍", "👎", "🙏", "👏", "🎉", "❤️", "🔥"],
    [],
  )

  useEffect(() => {
    if (!selectedUser) return
    scrollToBottom("smooth")
  }, [filteredMessages.length, scrollToBottom, selectedUser?._id])

  useEffect(() => {
    if (!sender) return

    const handleReceive = (msg: MessageResponse) => {
      setMessages((prev) => [...prev, msg])

      if (msg.receiver !== sender) return

      const from = msg.sender

      if (!selectedUser || selectedUser.phone !== from) {
        setUnreadCounts((prev) => ({
          ...prev,
          [from]: (prev[from] ?? 0) + 1,
        }))
        window.dispatchEvent(new Event("unreadCountsChanged"))
        return
      }

      socketService.markSeen({ sender: from, receiver: sender })
      window.dispatchEvent(new Event("unreadCountsChanged"))
    }

    socketService.onReceiveMessage(handleReceive)

    return () => {
      socketService.offReceiveMessage(handleReceive)
    }
  }, [sender, selectedUser])

  useEffect(() => {
    if (!sender) return

    const handler = (payload: {
      sender: string
      receiver: string
      seenAt?: string
      modifiedCount?: number
    }) => {
      if (payload.sender !== sender) return

      const seenAt = payload.seenAt ?? new Date().toISOString()
      setMessages((prev) =>
        prev.map((m) =>
          m.sender === sender && m.receiver === payload.receiver
            ? { ...m, seen: true, seenAt }
            : m,
        ),
      )
    }

    socketService.onMessagesSeen(handler)

    return () => {
      socketService.offMessagesSeen(handler)
    }
  }, [sender])

  const loadUsers = async () => {
    try {
      const res = await getUsers()
      setUsers(res.data)
    } catch (e) {
      console.error("Failed to load users", e)
    }
  }

  const refreshUnseenCounts = useCallback(async () => {
    if (!sender) return
    try {
      const res = await getUnseenCounts(sender)
      const next: Record<string, number> = {}

      for (const row of res.data ?? []) {
        if (!row?.sender) continue
        next[row.sender] = Number(row.count ?? 0)
      }

      setUnreadCounts(next)
      window.dispatchEvent(new Event("unreadCountsChanged"))
    } catch (e) {
      console.error("Failed to load unseen counts", e)
    }
  }, [sender])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadUsers()
    }, 0)

    return () => {
      window.clearTimeout(timer)
    }
  }, [])

  useEffect(() => {
    void refreshUnseenCounts()
  }, [refreshUnseenCounts])

  useEffect(() => {
    if (!selectedUser || !sender) return

    const loadThread = async () => {
      try {
        const res = await getMessages(sender, selectedUser.phone)
        setMessages(res.data)
      } catch (e) {
        console.error("Failed to load messages", e)
      }
    }

    loadThread()
  }, [selectedUser, sender])

  useEffect(() => {
    if (!selectedUser || !sender) return

    const hasUnseenIncoming = filteredMessages.some(
      (m) =>
        m.sender === selectedUser.phone &&
        m.receiver === sender &&
        !Boolean(m.seen),
    )
    if (!hasUnseenIncoming) return

    const seenAt = new Date().toISOString()
    socketService.markSeen({ sender: selectedUser.phone, receiver: sender })
    setUnreadCounts((prev) => ({ ...prev, [selectedUser.phone]: 0 }))
    window.dispatchEvent(new Event("unreadCountsChanged"))
    setMessages((prev) =>
      prev.map((m) =>
        m.sender === selectedUser.phone && m.receiver === sender
          ? { ...m, seen: true, seenAt }
          : m,
      ),
    )
  }, [filteredMessages, selectedUser, sender])

  const sendMessage = async () => {
    const trimmed = input.trim()
    if (!selectedUser || !trimmed || !sender) return
    setSendError(null)

    const payload: SendMessagePayload = {
      sender,
      receiver: selectedUser.phone,
      message: trimmed,
    }

    socketService.sendMessage(payload)
    setInput("")
    setShowEmojiPicker(false)
    scrollToBottom("smooth")

    // try {
    //   await saveMessage(payload)
    // } catch (e) {
    //   console.error("Message sent but not saved to DB", e)
    //   setSendError("Message sent, but it wasn't saved. Check API/DB logs.")
    // }
  }

  return (
    <div className="d-flex" style={{ height: "80vh", border: "1px solid #ddd" }}>
      
      {/* LEFT SIDE - USER LIST */}
      <div
        style={{
          width: "30%",
          borderRight: "1px solid #ddd",
          overflowY: "auto",
        }}
      >
        {chatUsers.map((user) => {
          const unread = unreadCounts[user.phone] ?? 0
          const isSelected = selectedUser?._id === user._id
          const hasUnseen = unread > 0

          return (
            <div
              key={user._id}
              className={`p-3 border-bottom cursor-pointer ${
                isSelected
                  ? "bg-body-secondary"
                  : hasUnseen
                    ? "bg-warning-subtle"
                    : ""
              }`}
              onClick={() => {
                setSelectedUser(user)
                if (sender) {
                  setUnreadCounts((prev) => ({ ...prev, [user.phone]: 0 }))
                  socketService.markSeen({ sender: user.phone, receiver: sender })
                  window.dispatchEvent(new Event("unreadCountsChanged"))
                }
              }}
              style={{ cursor: "pointer" }}
            >
              <div className="d-flex align-items-center justify-content-between">
                <strong className={hasUnseen ? "fw-semibold" : undefined}>
                  {user.name}
                </strong>
                {hasUnseen && <span className="badge bg-danger">{unread}</span>}
              </div>
              <div className="text-muted small">{user.phone}</div>
            </div>
          )
        })}
      </div>

      {/* RIGHT SIDE - CHAT AREA */}
      <div className="flex-grow-1 d-flex flex-column">
        
        {/* Header */}
        <div className="p-3 border-bottom bg-body">
          {selectedUser ? (
            <strong>{selectedUser.name}</strong>
          ) : (
            "Select a user"
          )}
        </div>

        {/* Messages */}
        <div
          className="flex-grow-1 p-3 bg-body-tertiary"
          style={{ overflowY: "auto" }}
        >
          {filteredMessages.map((m, index) => (
              <div
                key={m._id ?? index}
                className={`mb-2 d-flex ${
                  m.sender === sender
                    ? "justify-content-end"
                    : "justify-content-start"
                }`}
              >
                <div
                  className={`p-2 rounded ${
                    m.sender === sender
                      ? "bg-success text-white"
                      : "bg-body border"
                  }`}
                  style={{ maxWidth: "60%" }}
                >
                  {m.message}
                  {m.sender === sender && m._id === lastOutgoingMessageId && (
                    <div className="text-end small text-white-50 mt-1">
                      {m.seen ? "Seen" : "Sent"}
                    </div>
                  )}
                </div>
              </div>
            ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        {selectedUser && (
          <div className="p-3 border-top">
            {sendError && (
              <div className="alert alert-warning py-2 mb-2">{sendError}</div>
            )}
            {showEmojiPicker && (
              <div className="border rounded bg-body p-2 mb-2">
                <div className="d-flex flex-wrap gap-2">
                  {emojis.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      className="btn btn-outline-secondary btn-sm"
                      onClick={() => {
                        setInput((prev) => `${prev}${emoji}`)
                        inputRef.current?.focus()
                      }}
                      aria-label={`Insert ${emoji}`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="d-flex align-items-center">
              <button
                type="button"
                className="btn btn-outline-secondary me-2"
                onClick={() => setShowEmojiPicker((v) => !v)}
                aria-label="Toggle emoji picker"
                title="Emojis"
              >
                😊
              </button>
              <input
                ref={inputRef}
                className="form-control me-2"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type a message..."
              />
              <button className="btn btn-success" onClick={sendMessage}>
                Send
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default Chat
