/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SOCKET_URI?: string
  readonly VITE_API_URI?: string
  readonly VITE_KLIPY_API_KEY?: string
  readonly VITE_GIPHY_API_KEY?: string
  readonly VITE_TENOR_API_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
