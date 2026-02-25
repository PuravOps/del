import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { getMessages, getUnseenCounts, getUsers } from "../services/api"
import { socketService } from "./ChatService"
import type { MessageResponse, SendMessagePayload } from "../types/chat.types"
import { usePageActivity } from "../utils/usePageActivity"

interface User {
  _id: string
  name: string
  phone: string
}

const PAGE_SIZE = 30

const formatTimeLabel = (iso: string) => {
  const d = new Date(iso)
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(d)
}

const formatDateLabel = (iso: string) => {
  const d = new Date(iso)
  const today = new Date()
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const startOfThatDay = new Date(d.getFullYear(), d.getMonth(), d.getDate())

  const diffDays = Math.round(
    (startOfToday.getTime() - startOfThatDay.getTime()) / (24 * 60 * 60 * 1000),
  )

  if (diffDays === 0) return "Today"
  if (diffDays === 1) return "Yesterday"

  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(d)
}

const Chat = () => {
  const [users, setUsers] = useState<User[]>([])
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [messages, setMessages] = useState<MessageResponse[]>([])
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({})
  const [input, setInput] = useState("")
  const [sendError, setSendError] = useState<string | null>(null)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true)

  const inputRef = useRef<HTMLInputElement | null>(null)
  const messagesContainerRef = useRef<HTMLDivElement | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const oldestCursorRef = useRef<string | null>(null)
  const messagesRef = useRef<MessageResponse[]>([])

  const sender = localStorage.getItem("userPhone") || ""
  const isPageActive = usePageActivity()

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  useEffect(() => {
    const phone = selectedUser?.phone ?? null
    ;(window as any).__activeChatThreadPhone = phone
    ;(window as any).__activeChatThreadIsActive = Boolean(phone) && isPageActive

    window.dispatchEvent(
      new CustomEvent("activeChatThreadChanged", {
        detail: { phone, isActive: Boolean(phone) && isPageActive },
      }),
    )

    return () => {
      ;(window as any).__activeChatThreadPhone = null
      ;(window as any).__activeChatThreadIsActive = false
      window.dispatchEvent(
        new CustomEvent("activeChatThreadChanged", {
          detail: { phone: null, isActive: false },
        }),
      )
    }
  }, [selectedUser?.phone, isPageActive])

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

    const next = messages.filter(
      (m) =>
        (m.sender === sender && m.receiver === selectedUser.phone) ||
        (m.sender === selectedUser.phone && m.receiver === sender),
    )

    next.sort((a, b) => {
      const at = new Date(a.createdAt).getTime()
      const bt = new Date(b.createdAt).getTime()
      return at - bt
    })

    return next
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
    if (!shouldAutoScroll) return
    scrollToBottom("smooth")
  }, [filteredMessages.length, scrollToBottom, selectedUser, shouldAutoScroll])

  useEffect(() => {
    if (!sender) return

    const handleReceive = (msg: MessageResponse) => {
      const isCurrentThread = Boolean(
        selectedUser &&
          ((msg.sender === sender && msg.receiver === selectedUser.phone) ||
            (msg.sender === selectedUser.phone && msg.receiver === sender)),
      )

      if (isCurrentThread) {
        setMessages((prev) => [...prev, msg])
      }

      if (msg.receiver !== sender) return

      const from = msg.sender

      const isSelectedThread = selectedUser?.phone === from

      if (!isSelectedThread || !isPageActive) {
        setUnreadCounts((prev) => ({
          ...prev,
          [from]: (prev[from] ?? 0) + 1,
        }))
        window.dispatchEvent(new Event("unreadCountsChanged"))
        return
      }

      setUnreadCounts((prev) => ({ ...prev, [from]: 0 }))
      socketService.markSeen({ sender: from, receiver: sender })
      window.dispatchEvent(new Event("unreadCountsChanged"))
    }

    socketService.onReceiveMessage(handleReceive)

    return () => {
      socketService.offReceiveMessage(handleReceive)
    }
  }, [sender, selectedUser, isPageActive])

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
        setIsLoadingMore(true)
        setHasMore(false)
        oldestCursorRef.current = null
        setMessages([])

        const res = await getMessages(sender, selectedUser.phone, { limit: PAGE_SIZE })
        const rows = Array.isArray(res.data) ? (res.data as MessageResponse[]) : []

        const sorted = [...rows].sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        )

        const page = sorted.length > PAGE_SIZE ? sorted.slice(sorted.length - PAGE_SIZE) : sorted

        setMessages(page)
        oldestCursorRef.current = page[0]?.createdAt ?? null
        setHasMore(sorted.length > PAGE_SIZE ? true : rows.length >= PAGE_SIZE)

        window.requestAnimationFrame(() => {
          scrollToBottom("auto")
        })
      } catch (e) {
        console.error("Failed to load messages", e)
      } finally {
        setIsLoadingMore(false)
      }
    }

    loadThread()
  }, [selectedUser, sender, scrollToBottom])

  const loadMore = useCallback(async () => {
    if (!selectedUser || !sender) return
    if (!hasMore || isLoadingMore) return
    if (!oldestCursorRef.current) return

    const container = messagesContainerRef.current
    const prevScrollHeight = container?.scrollHeight ?? 0
    const prevScrollTop = container?.scrollTop ?? 0

    setIsLoadingMore(true)
    setShouldAutoScroll(false)

    try {
      const res = await getMessages(sender, selectedUser.phone, {
        limit: PAGE_SIZE,
        before: oldestCursorRef.current,
      })
      const rows = Array.isArray(res.data) ? (res.data as MessageResponse[]) : []
      if (rows.length === 0) {
        setHasMore(false)
        return
      }

      const sorted = [...rows].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      )

      const cursorTime = new Date(oldestCursorRef.current).getTime()
      const older = sorted.filter((m) => new Date(m.createdAt).getTime() < cursorTime)
      const page =
        older.length > PAGE_SIZE ? older.slice(older.length - PAGE_SIZE) : older

      if (page.length === 0) {
        setHasMore(false)
        return
      }

      oldestCursorRef.current = page[0]?.createdAt ?? oldestCursorRef.current

      const seen = new Set(messagesRef.current.map((m) => m._id))
      const toPrepend = page.filter((m) => !seen.has(m._id))
      if (toPrepend.length === 0) {
        setHasMore(false)
        return
      }

      setMessages((prev) => {
        const merged = [...toPrepend, ...prev]
        merged.sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        )
        return merged
      })

      window.requestAnimationFrame(() => {
        const el = messagesContainerRef.current
        if (!el) return
        const newScrollHeight = el.scrollHeight
        el.scrollTop = prevScrollTop + (newScrollHeight - prevScrollHeight)
      })

      setHasMore(older.length > PAGE_SIZE || rows.length >= PAGE_SIZE)
    } catch (e) {
      console.error("Failed to load older messages", e)
    } finally {
      setIsLoadingMore(false)
    }
  }, [hasMore, isLoadingMore, selectedUser, sender])

  useEffect(() => {
    if (!selectedUser || !sender || !isPageActive) return

    const hasUnseenIncoming = filteredMessages.some(
      (m) =>
        m.sender === selectedUser.phone &&
        m.receiver === sender &&
        !m.seen,
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
  }, [filteredMessages, selectedUser, sender, isPageActive])

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
    setUnreadCounts((prev) => ({ ...prev, [selectedUser.phone]: 0 }))
    socketService.markSeen({ sender: selectedUser.phone, receiver: sender })
    window.dispatchEvent(new Event("unreadCountsChanged"))
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

  const messageItems = useMemo(() => {
    const items: Array<
      | { type: "date"; key: string; label: string }
      | { type: "message"; key: string; msg: MessageResponse }
    > = []

    let lastDateKey: string | null = null
    for (const m of filteredMessages) {
      const dateKey = new Date(m.createdAt).toDateString()
      if (dateKey !== lastDateKey) {
        items.push({ type: "date", key: `date:${dateKey}`, label: formatDateLabel(m.createdAt) })
        lastDateKey = dateKey
      }
      items.push({ type: "message", key: m._id, msg: m })
    }

    return items
  }, [filteredMessages])

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
          ref={messagesContainerRef}
          onScroll={() => {
            const el = messagesContainerRef.current
            if (!el) return

            const distanceFromBottom = el.scrollHeight - (el.scrollTop + el.clientHeight)
            setShouldAutoScroll(distanceFromBottom < 120)

            if (el.scrollTop < 80) {
              void loadMore()
            }
          }}
        >
          {hasMore && (
            <div className="text-center small text-body-secondary mb-2">
              {isLoadingMore ? "Loading..." : "Scroll up to load older messages"}
            </div>
          )}
          {messageItems.map((item) => {
            if (item.type === "date") {
              return (
                <div key={item.key} className="d-flex justify-content-center my-2">
                  <span className="badge text-bg-light border">{item.label}</span>
                </div>
              )
            }

            const m = item.msg
            const isOutgoing = m.sender === sender
            const isLastOutgoing = isOutgoing && m._id === lastOutgoingMessageId
            const timeLabel = formatTimeLabel(m.createdAt)

            return (
              <div
                key={item.key}
                className={`mb-2 d-flex ${
                  isOutgoing ? "justify-content-end" : "justify-content-start"
                }`}
              >
                <div
                  className={`p-2 rounded ${
                    isOutgoing ? "bg-success text-white" : "bg-body border"
                  }`}
                  style={{ maxWidth: "60%" }}
                >
                  <div>{m.message}</div>
                  <div
                    className={`text-end small mt-1 ${
                      isOutgoing ? "text-white-50" : "text-body-secondary"
                    }`}
                  >
                    {timeLabel}
                    {isLastOutgoing && (
                      <>
                        {" "}
                        - {m.seen ? "Seen" : "Sent"}
                      </>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
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
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return
                  if (e.nativeEvent.isComposing) return
                  e.preventDefault()
                  void sendMessage()
                }}
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
