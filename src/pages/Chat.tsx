import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { getMessages, getUsers } from "../services/api"
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

    socketService.onReceiveMessage((msg) => {
      setMessages((prev) => [...prev, msg])
    })

    return () => {
      socketService.offReceiveMessage()
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

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadUsers()
    }, 0)

    return () => {
      window.clearTimeout(timer)
    }
  }, [])

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
        {chatUsers.map((user) => (
          <div
            key={user._id}
            className={`p-3 border-bottom cursor-pointer ${
              selectedUser?._id === user._id ? "bg-light" : ""
            }`}
            onClick={() => setSelectedUser(user)}
            style={{ cursor: "pointer" }}
          >
            <strong>{user.name}</strong>
            <div className="text-muted small">{user.phone}</div>
          </div>
        ))}
      </div>

      {/* RIGHT SIDE - CHAT AREA */}
      <div className="flex-grow-1 d-flex flex-column">
        
        {/* Header */}
        <div className="p-3 border-bottom bg-white">
          {selectedUser ? (
            <strong>{selectedUser.name}</strong>
          ) : (
            "Select a user"
          )}
        </div>

        {/* Messages */}
        <div
          className="flex-grow-1 p-3"
          style={{ overflowY: "auto", background: "#f5f5f5" }}
        >
          {filteredMessages.map((m, index) => (
              <div
                key={index}
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
                      : "bg-white"
                  }`}
                  style={{ maxWidth: "60%" }}
                >
                  {m.message}
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
              <div className="border rounded bg-white p-2 mb-2">
                <div className="d-flex flex-wrap gap-2">
                  {emojis.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      className="btn btn-light btn-sm"
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
