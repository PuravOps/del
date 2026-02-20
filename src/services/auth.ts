import axios from "axios"

const API = "http://localhost:5000/api/users"

export const registerUser = (data: {
  name: string
  phone: string
  password: string
}) => {
  return axios.post(`${API}/register`, data)
}

export const loginUser = (data: {
  phone: string
  password: string
}) => {
  return axios.post(`${API}/login`, data)
}
