export interface SendMessagePayload {
  sender: string
  receiver: string
  message: string
}

export interface Reaction {
  emoji: string
  users: string[] // array of user phones who reacted
}

export interface SharedMediaItem {
  id: string
  messageId: string
  sender: string
  createdAt: string
  url: string
  title: string
  mediaType: "image" | "video" | "gif"
  mimeType?: string
  text?: string
}

export interface SharedFileItem {
  id: string
  messageId: string
  sender: string
  createdAt: string
  url: string
  fileName: string
  mimeType?: string
  sizeBytes?: number
  text?: string
}

export interface SharedLinkItem {
  id: string
  messageId: string
  sender: string
  createdAt: string
  url: string
  label: string
  text?: string
}

export interface SharedContentCollection {
  media: SharedMediaItem[]
  files: SharedFileItem[]
  links: SharedLinkItem[]
}

export interface MessageResponse {
  _id: string
  sender: string
  receiver: string
  message: string
  starred?: boolean
  pinned?: boolean
  pinnedAt?: string | null
  pinnedBy?: string | null
  seen?: boolean
  seenAt?: string | null
  createdAt: string
  updatedAt: string
  isDeleted?: boolean
  editedAt?: string | null
  reactions?: Reaction[]
}
