export interface User {
  _id: string
  name: string
  phone: string
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
