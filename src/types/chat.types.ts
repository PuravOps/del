export interface SendMessagePayload {
  sender: string
  receiver: string
  message: string
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
}
