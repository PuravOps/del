import axios from "axios";

const api = axios.create({
  baseURL: "http://localhost:5000/api",
  headers: {
    "Content-Type": "application/json",
  },
});

export const getMessages = (user1: string, user2: string) => {
  return api.get(`/chat/${user1}/${user2}`);
};

export const registerUser = (data: any) => api.post("/users/register", data);

export const loginUser = (data: any) => api.post("/users/login", data);

export const getUsers = () => api.get("/users");

export const updateUser = (id: string, data: any) =>
  api.put(`/users/${id}`, data);

export const deleteUser = (id: string) => api.delete(`/users/${id}`);
