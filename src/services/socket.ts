import { io, Socket } from "socket.io-client"
import { SendMessagePayload, MessageResponse } from "../types/chat.types"

export interface MessagesSeenPayload {
  sender: string
  receiver: string
  seenAt?: string
  modifiedCount?: number
}

export interface MessageDeletedPayload {
  messageId: string
}

export interface ReactionPayload {
  messageId: string
  emoji: string
  userPhone: string
}

export interface MessageUpdatedPayload {
  message: MessageResponse
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

  deleteMessage(messageId: string) {
    this.socket.emit("deleteMessage", { messageId })
  }

  updateMessage(messageId: string) {
    this.socket.emit("updateMessage", { messageId })
  }

  addReaction(messageId: string, emoji: string, userPhone: string) {
    this.socket.emit("addReaction", { messageId, emoji, userPhone })
  }

  removeReaction(messageId: string, emoji: string, userPhone: string) {
    this.socket.emit("removeReaction", { messageId, emoji, userPhone })
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

  onMessageDeleted(callback: (payload: MessageDeletedPayload) => void) {
    this.socket.on("messageDeleted", callback)
  }

  offMessageDeleted(callback?: (payload: MessageDeletedPayload) => void) {
    this.socket.off("messageDeleted", callback as any)
  }

  onMessageUpdated(callback: (payload: MessageUpdatedPayload) => void) {
    this.socket.on("messageUpdated", callback)
  }

  offMessageUpdated(callback?: (payload: MessageUpdatedPayload) => void) {
    this.socket.off("messageUpdated", callback as any)
  }

  onReactionAdded(callback: (payload: ReactionPayload) => void) {
    this.socket.on("reactionAdded", callback)
  }

  offReactionAdded(callback?: (payload: ReactionPayload) => void) {
    this.socket.off("reactionAdded", callback as any)
  }

  onReactionRemoved(callback: (payload: ReactionPayload) => void) {
    this.socket.on("reactionRemoved", callback)
  }

  offReactionRemoved(callback?: (payload: ReactionPayload) => void) {
    this.socket.off("reactionRemoved", callback as any)
  }
}

export const socketService = new SocketService()
