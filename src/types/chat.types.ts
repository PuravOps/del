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
  createdAt: string
  updatedAt: string
}
