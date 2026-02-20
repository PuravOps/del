import { useEffect, useMemo, useState } from "react"
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

  const sender = localStorage.getItem("userPhone") || ""

  const filteredMessages = useMemo(() => {
    if (!selectedUser) return []

    return messages.filter(
      (m) =>
        (m.sender === sender && m.receiver === selectedUser.phone) ||
        (m.sender === selectedUser.phone && m.receiver === sender),
    )
  }, [messages, selectedUser, sender])

  useEffect(() => {
    if (!sender) return

    socketService.connect(sender)
    socketService.onReceiveMessage((msg) => {
      setMessages((prev) => [...prev, msg])
    })

    return () => {
      socketService.offReceiveMessage()
      socketService.disconnect()
    }
  }, [sender])

  useEffect(() => {
    loadUsers()
  }, [])

  useEffect(() => {
    if (!selectedUser || !sender) return

    const loadThread = async () => {
      const res = await getMessages(sender, selectedUser.phone)
      setMessages(res.data)
    }

    loadThread()
  }, [selectedUser, sender])

  const loadUsers = async () => {
    const res = await getUsers()
    setUsers(res.data)
  }

  const sendMessage = () => {
    if (!selectedUser || !input) return

    const payload: SendMessagePayload = {
      sender,
      receiver: selectedUser.phone,
      message: input,
    }

    socketService.sendMessage(payload)
    setInput("")
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
        {users.map((user) => (
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
        </div>

        {/* Input */}
        {selectedUser && (
          <div className="p-3 border-top d-flex">
            <input
              className="form-control me-2"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a message..."
            />
            <button
              className="btn btn-success"
              onClick={sendMessage}
            >
              Send
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default Chat
