import axios from "axios";
import type {
  SendMessagePayload,
  SharedFileItem,
  SharedLinkItem,
  SharedMediaItem,
} from "../types/chat.types";
import type { PrivateNotesResponse } from "../types/privateNotes.types";
import type { UserPresenceResponse } from "../types/user.types";
import type { DailyQuoteApiResponse } from "../utils/quoteMessage";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URI,
  headers: {
    "Content-Type": "application/json",
  },
});

type RequestOptions = {
  signal?: AbortSignal;
  timeout?: number;
};

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const getMessages = (
  user1: string,
  user2: string,
  params?: { limit?: number; before?: string },
) => {
  return api.get(`/chat/${user1}/${user2}`, { params });
};

export const saveMessage = (payload: SendMessagePayload) => {
  return api.post("/chat", payload);
};

export const deleteMessage = (messageId: string) => {
  return api.delete(`/chat/${messageId}`);
};

export const updateMessage = (messageId: string, message: string) => {
  return api.put(`/chat/${messageId}`, { message });
};

export const addReaction = (messageId: string, emoji: string, userPhone: string) => {
  return api.post(`/chat/${messageId}/reactions`, { emoji, userPhone });
};

export const removeReaction = (messageId: string, emoji: string, userPhone: string) => {
  return api.delete(`/chat/${messageId}/reactions`, { data: { emoji, userPhone } });
};

export const getUnseenCounts = (receiver: string) => {
  return api.get(`/chat/unseen-counts/${receiver}`);
};

export const markConversationSeen = (sender: string, receiver: string) => {
  return api.post("/chat/mark-seen", { sender, receiver });
};

export const getChatMedia = (
  chatId: string,
  params?: { user1?: string; user2?: string },
) => api.get<SharedMediaItem[]>(`/chat/${chatId}/media`, { params });

export const getChatFiles = (
  chatId: string,
  params?: { user1?: string; user2?: string },
) => api.get<SharedFileItem[]>(`/chat/${chatId}/files`, { params });

export const getChatLinks = (
  chatId: string,
  params?: { user1?: string; user2?: string },
) => api.get<SharedLinkItem[]>(`/chat/${chatId}/links`, { params });

export const setMessageStarred = (messageId: string, starred: boolean) =>
  api.post("/message/star", { messageId, starred });

export const getChatStarredMessages = (
  chatId: string,
  params?: { user1?: string; user2?: string },
) => api.get(`/chat/${chatId}/starred`, { params });

export const setMessagePinned = (messageId: string, pinned: boolean, userPhone: string) =>
  api.post(`/chat/${messageId}/pin`, { pinned, userPhone });

export const getChatPinnedMessages = (
  chatId: string,
  params?: { user1?: string; user2?: string },
) => api.get(`/chat/${chatId}/pinned`, { params });

export const ping = () => api.get("/ping");

export const getDailyQuote = (dateKey?: string, options?: RequestOptions) =>
  api.get<DailyQuoteApiResponse>("/daily-quote", {
    ...options,
    params: dateKey ? { dateKey } : undefined,
  });

export const registerUser = (data: any) => api.post("/users/register", data);

export const loginUser = (data: any) => api.post("/users/login", data);

export const getUsers = () => api.get("/users");

export const getUserPresence = (phone: string, viewer?: string) =>
  api.get<UserPresenceResponse>(`/users/${encodeURIComponent(phone)}/presence`, {
    params: viewer ? { viewer } : undefined,
  });

export const getPrivateNotesVault = (
  targetUserPhone: string,
  options?: RequestOptions,
) => api.get<PrivateNotesResponse>(`/private-notes/${encodeURIComponent(targetUserPhone)}`, options);

export const createPrivateNotesVault = (
  targetUserPhone: string,
  payload: { notes: PrivateNotesResponse["notes"] },
  options?: RequestOptions,
) =>
  api.post<PrivateNotesResponse>(
    `/private-notes/${encodeURIComponent(targetUserPhone)}`,
    payload,
    options,
  );

export const updatePrivateNotesVault = (
  targetUserPhone: string,
  payload: { notes: PrivateNotesResponse["notes"] },
  options?: RequestOptions,
) =>
  api.put<PrivateNotesResponse>(
    `/private-notes/${encodeURIComponent(targetUserPhone)}`,
    payload,
    options,
  );

export const updateUser = (id: string, data: any) =>
  api.put(`/users/${id}`, data);

export const deleteUser = (id: string) => api.delete(`/users/${id}`);
