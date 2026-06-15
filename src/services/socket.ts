import { io, Socket } from "socket.io-client"
import { SendMessagePayload, MessageResponse } from "../types/chat.types"
import type { PresenceStatus } from "../types/user.types"

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

export interface MessagePinnedPayload {
  message: MessageResponse
}

export type ChatEffectKind = "confetti" | "punch" | "love"

export interface ChatEffectPayload {
  sender: string
  receiver: string
  effect: ChatEffectKind
  eventId?: string
  createdAt?: string
}

export interface PresenceUpdatePayload {
  userPhone: string
  status: PresenceStatus
  lastActiveAt?: string | null
}

export interface TypingUpdatePayload {
  userPhone: string
  targetUserPhone: string
  isTyping: boolean
}

class SocketService {
  private socket: Socket

  constructor() {
    this.socket = io(import.meta.env.VITE_SOCKET_URI, {
      autoConnect: false,
    })

    // lifecycle logging for debugging live issues
    this.socket.on("connect", () => {
      // eslint-disable-next-line no-console
      console.info("socket connected", this.socket.id)
    })
    this.socket.on("disconnect", (reason) => {
      // eslint-disable-next-line no-console
      console.warn("socket disconnected", reason)
    })
    this.socket.on("connect_error", (err) => {
      // eslint-disable-next-line no-console
      console.error("socket connect_error", err)
    })
    this.socket.on("receiveMessage", (msg) => {
      // eslint-disable-next-line no-console
      console.info("socket received message", msg?._id, msg?.sender, "->", msg?.receiver)
    })
    this.socket.on("game.created", (msg) => {
      // eslint-disable-next-line no-console
      console.info("socket received game.created", (msg as any)?._id, (msg as any)?.gameId)
    })
    this.socket.on("game.updated", (msg) => {
      // eslint-disable-next-line no-console
      console.info("socket received game.updated", (msg as any)?._id, (msg as any)?.gameId)
    })
    this.socket.on("chatEffect", (payload) => {
      // eslint-disable-next-line no-console
      console.info("socket received chatEffect", payload)
    })
  }

  connect(userId: string) {
    if (!this.socket.connected) {
      this.socket.connect()
    }
    this.socket.emit("join", userId)
  }

  disconnect() {
    if (this.socket.connected) {
      this.socket.disconnect()
    }
  }

  sendMessage(payload: SendMessagePayload) {
    if (!this.socket.connected) {
      // eslint-disable-next-line no-console
      console.warn("sendMessage called but socket not connected", payload)
    }
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

  pinMessage(messageId: string) {
    this.socket.emit("pinMessage", { messageId })
  }

  sendChatEffect(payload: ChatEffectPayload) {
    if (!this.socket.connected) {
      // eslint-disable-next-line no-console
      console.warn("sendChatEffect called but socket not connected", payload)
    }
    // eslint-disable-next-line no-console
    console.info("socket sending chatEffect", payload)
    this.socket.emit("chatEffect", payload)
  }

  addReaction(messageId: string, emoji: string, userPhone: string) {
    this.socket.emit("addReaction", { messageId, emoji, userPhone })
  }

  removeReaction(messageId: string, emoji: string, userPhone: string) {
    this.socket.emit("removeReaction", { messageId, emoji, userPhone })
  }

  heartbeat(payload: { userPhone: string; activeThreadPhone?: string | null; isChatActive?: boolean }) {
    this.socket.emit("presence:heartbeat", payload)
  }

  setActiveThread(payload: { userPhone: string; activeThreadPhone?: string | null; isChatActive?: boolean }) {
    this.socket.emit("presence:thread", payload)
  }

  startTyping(payload: { userPhone: string; targetUserPhone: string }) {
    this.socket.emit("typing:start", payload)
  }

  stopTyping(payload: { userPhone: string; targetUserPhone: string }) {
    this.socket.emit("typing:stop", payload)
  }

  // Game-specific helpers
  sendGameMove(gameId: string, index: number, playerId: string) {
    if (!this.socket.connected) {
      // eslint-disable-next-line no-console
      console.warn("sendGameMove called but socket not connected", { gameId, index, playerId })
    }
    this.socket.emit("game.move", { gameId, index, playerId })
  }

  sendGameRematch(gameId: string, requesterId: string) {
    if (!this.socket.connected) {
      // eslint-disable-next-line no-console
      console.warn("sendGameRematch called but socket not connected", { gameId, requesterId })
    }
    this.socket.emit("game.rematch", { gameId, requesterId })
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

  onMessagePinned(callback: (payload: MessagePinnedPayload) => void) {
    this.socket.on("messagePinned", callback)
  }

  offMessagePinned(callback?: (payload: MessagePinnedPayload) => void) {
    this.socket.off("messagePinned", callback as any)
  }

  onChatEffect(callback: (payload: ChatEffectPayload) => void) {
    this.socket.on("chatEffect", callback)
  }

  offChatEffect(callback?: (payload: ChatEffectPayload) => void) {
    this.socket.off("chatEffect", callback as any)
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

  onConnect(callback: () => void) {
    this.socket.on("connect", callback)
  }

  offConnect(callback?: () => void) {
    this.socket.off("connect", callback as any)
  }

  onDisconnect(callback: (reason: string) => void) {
    this.socket.on("disconnect", callback)
  }

  offDisconnect(callback?: (reason: string) => void) {
    this.socket.off("disconnect", callback as any)
  }

  // Game-specific events
  onGameCreated(callback: (msg: MessageResponse) => void) {
    this.socket.on("game.created", callback)
  }

  offGameCreated(callback?: (msg: MessageResponse) => void) {
    this.socket.off("game.created", callback as any)
  }

  onGameUpdated(callback: (msg: MessageResponse) => void) {
    this.socket.on("game.updated", callback)
  }

  offGameUpdated(callback?: (msg: MessageResponse) => void) {
    this.socket.off("game.updated", callback as any)
  }

  onPresenceUpdate(callback: (payload: PresenceUpdatePayload) => void) {
    this.socket.on("presence:update", callback)
  }

  offPresenceUpdate(callback?: (payload: PresenceUpdatePayload) => void) {
    this.socket.off("presence:update", callback as any)
  }

  onTypingUpdate(callback: (payload: TypingUpdatePayload) => void) {
    this.socket.on("typing:update", callback)
  }

  offTypingUpdate(callback?: (payload: TypingUpdatePayload) => void) {
    this.socket.off("typing:update", callback as any)
  }
}

export const socketService = new SocketService()
