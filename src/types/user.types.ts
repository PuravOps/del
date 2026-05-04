export interface User {
  _id: string
  name: string
  phone: string
  lastActiveAt?: string | null
}

export type PresenceStatus = "online" | "away" | "offline"

export interface UserPresenceResponse {
  phone: string
  status: PresenceStatus
  lastActiveAt: string | null
  isTyping: boolean
}

export interface LoginPayload {
  phone: string
  password: string
}

export interface RegisterPayload {
  name: string
  phone: string
  password: string
}

export interface UserFormPayload {
  name: string
  phone: string
  password: string
}
