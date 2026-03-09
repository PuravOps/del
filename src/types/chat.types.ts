export interface SendMessagePayload {
  sender: string
  receiver: string
  message: string
}

export interface Reaction {
  emoji: string
  users: string[] // array of user phones who reacted
}

export interface MessageResponse {
  _id: string
  sender: string
  receiver: string
  message: string
  seen?: boolean
  seenAt?: string | null
  createdAt: string
  updatedAt: string
  isDeleted?: boolean
  editedAt?: string | null
  reactions?: Reaction[]
}
