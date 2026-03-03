export {}

declare global {
  interface Window {
    __activeChatThreadPhone?: string | null
    __activeChatThreadIsActive?: boolean
  }
}

