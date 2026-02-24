import { io, Socket } from "socket.io-client"
import { SendMessagePayload, MessageResponse } from "../types/chat.types"

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

  onReceiveMessage(callback: (msg: MessageResponse) => void) {
    this.socket.on("receiveMessage", callback)
  }

  offReceiveMessage() {
    this.socket.off("receiveMessage")
  }
}

export const socketService = new SocketService()
