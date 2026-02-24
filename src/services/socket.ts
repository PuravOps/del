import { io, Socket } from "socket.io-client"
import { SendMessagePayload, MessageResponse } from "../types/chat.types"

export interface MessagesSeenPayload {
  sender: string
  receiver: string
  seenAt?: string
  modifiedCount?: number
}

class SocketService {
  private socket: Socket

  constructor() {
    this.socket = io(import.meta.env.VITE_SOCKET_URI, {
      autoConnect: false,
    })
  }

  connect(userId: string) {
    if (!this.socket.connected) {
      this.socket.connect()
      this.socket.emit("join", userId)
    }
  }

  disconnect() {
    if (this.socket.connected) {
      this.socket.disconnect()
    }
  }

  sendMessage(payload: SendMessagePayload) {
    this.socket.emit("sendMessage", payload)
  }

  markSeen(payload: { sender: string; receiver: string }) {
    this.socket.emit("markSeen", payload)
  }

  onReceiveMessage(callback: (msg: MessageResponse) => void) {
    this.socket.on("receiveMessage", callback)
  }

  offReceiveMessage(callback?: (msg: MessageResponse) => void) {
    this.socket.off("receiveMessage", callback as any)
  }

  onMessagesSeen(callback: (payload: MessagesSeenPayload) => void) {
    this.socket.on("messagesSeen", callback)
  }

  offMessagesSeen(callback?: (payload: MessagesSeenPayload) => void) {
    this.socket.off("messagesSeen", callback as any)
  }
}

export const socketService = new SocketService()
