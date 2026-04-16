import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react"
import type { ClipboardEvent, ChangeEvent } from "react"
import { getMessages, getUnseenCounts, getUsers, deleteMessage, updateMessage, addReaction, removeReaction } from "../services/api"
import { socketService } from "./ChatService"
import TicTacToeCard from "../components/TicTacToeCard"
import { encodeGameMessage, decodeGameMessage, type TicTacToePayloadV1 } from "../utils/gameMessage"
import type { MessageResponse, SendMessagePayload, Reaction } from "../types/chat.types"
import { usePageActivity } from "../utils/usePageActivity"
import { uploadFileToApi } from "../utils/uploadApi"
import EmojiPicker, { EmojiStyle, Theme, type EmojiClickData } from "emoji-picker-react"
import { parse as parseTwemoji } from "twemoji-parser"
import {
  decodeRichMessage,
  encodeRichMessage,
  makeReplyPreview,
  type RichChatMessageV1,
  type RichReplyToV1,
} from "../utils/richChatMessage"

interface User {
  _id: string
  name: string
  phone: string
}

const PAGE_SIZE = 30

const formatTimeLabel = (iso: string) => {
  const d = new Date(iso)
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(d)
}

const formatDateLabel = (iso: string) => {
  const d = new Date(iso)
  const today = new Date()
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const startOfThatDay = new Date(d.getFullYear(), d.getMonth(), d.getDate())

  const diffDays = Math.round(
    (startOfToday.getTime() - startOfThatDay.getTime()) / (24 * 60 * 60 * 1000),
  )

  if (diffDays === 0) return "Today"
  if (diffDays === 1) return "Yesterday"

  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(d)
}

const Chat = () => {
  const [users, setUsers] = useState<User[]>([])
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [messages, setMessages] = useState<MessageResponse[]>([])
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({})
  const [input, setInput] = useState("")
  const [sendError, setSendError] = useState<string | null>(null)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showGifPicker, setShowGifPicker] = useState(false)
  const [gifQuery, setGifQuery] = useState("")
  const [gifResults, setGifResults] = useState<Array<{ url: string; previewUrl?: string }>>([])
  const [gifLoading, setGifLoading] = useState(false)
  const [gifLoadingMore, setGifLoadingMore] = useState(false)
  const [gifError, setGifError] = useState<string | null>(null)
  const [selectedGifUrl, setSelectedGifUrl] = useState<string | null>(null)
  const [gifCursor, setGifCursor] = useState<
    | { provider: "tenor"; next: string }
    | { provider: "klipy"; next: string }
    | { provider: "giphy"; offset: number }
    | null
  >(null)
  const [messageMenu, setMessageMenu] = useState<
    | {
        messageId: string
        top: number
        left: number
      }
    | null
  >(null)
  const [hasMore, setHasMore] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true)
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null)
  const [replyTo, setReplyTo] = useState<
    | ({
        id: string
        sender: string
      } & ReturnType<typeof makeReplyPreview>)
    | null
  >(null)
  const [privacyMode, setPrivacyMode] = useState(false)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [isMobileLayout, setIsMobileLayout] = useState(false)
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState<string | null>(null)
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editError, setEditError] = useState<string | null>(null)
  const [editBase, setEditBase] = useState<
    | { kind: "plain"; value: string }
    | { kind: "rich"; value: RichChatMessageV1 }
    | null
  >(null)
  const [uploadTasks, setUploadTasks] = useState<
    Array<{ id: string; name: string; progress: number; error?: string }>
  >([])
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [imagePreview, setImagePreview] = useState<{ url: string; title?: string } | null>(null)
  const [imagePreviewZoom, setImagePreviewZoom] = useState(1)
  const emojiContainerRef = useRef<HTMLDivElement | null>(null)
  const [pickerTheme, setPickerTheme] = useState<Theme>(() =>
    document.documentElement.getAttribute("data-bs-theme") === "dark" ? Theme.DARK : Theme.LIGHT,
  )

  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const messagesContainerRef = useRef<HTMLDivElement | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const oldestCursorRef = useRef<string | null>(null)
  const messagesRef = useRef<MessageResponse[]>([])
  const messageElByIdRef = useRef<Record<string, HTMLDivElement | null>>({})
  const highlightTimerRef = useRef<number | null>(null)
  const gifResultsContainerRef = useRef<HTMLDivElement | null>(null)

  const sender = localStorage.getItem("userPhone") || ""
  const isPageActive = usePageActivity()
  const klipyKey = import.meta.env.VITE_KLIPY_API_KEY as string | undefined
  const giphyKey = import.meta.env.VITE_GIPHY_API_KEY as string | undefined
  const tenorKey = import.meta.env.VITE_TENOR_API_KEY as string | undefined
  const gifProvider: "klipy" | "giphy" | "tenor" | "none" = klipyKey
    ? "klipy"
    : giphyKey
      ? "giphy"
      : tenorKey
        ? "tenor"
        : "none"

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767.98px)")
    const apply = () => setIsMobileLayout(mq.matches)
    apply()
    mq.addEventListener("change", apply)
    return () => mq.removeEventListener("change", apply)
  }, [])

  useEffect(() => {
    if (!isMobileLayout) setIsDrawerOpen(false)
  }, [isMobileLayout])

  useEffect(() => {
    const phone = selectedUser?.phone ?? null
    window.__activeChatThreadPhone = phone
    window.__activeChatThreadIsActive = Boolean(phone) && isPageActive

    window.dispatchEvent(
      new CustomEvent("activeChatThreadChanged", {
        detail: { phone, isActive: Boolean(phone) && isPageActive },
      }),
    )

    return () => {
      window.__activeChatThreadPhone = null
      window.__activeChatThreadIsActive = false
      window.dispatchEvent(
        new CustomEvent("activeChatThreadChanged", {
          detail: { phone: null, isActive: false },
        }),
      )
    }
  }, [selectedUser?.phone, isPageActive])

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    window.requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior })
    })
  }, [])

  const scrollToMessage = useCallback((id: string) => {
    const el = messageElByIdRef.current[id]
    if (!el) return

    el.scrollIntoView({ behavior: "smooth", block: "center" })
    setHighlightedMessageId(id)

    if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current)
    highlightTimerRef.current = window.setTimeout(() => {
      setHighlightedMessageId((cur) => (cur === id ? null : cur))
    }, 1600)
  }, [])

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (!imagePreview) return
    setImagePreviewZoom(1)
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setImagePreview(null)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [imagePreview])

  useEffect(() => {
    if (!showEmojiPicker) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowEmojiPicker(false)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [showEmojiPicker])

  useEffect(() => {
    if (!showGifPicker) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowGifPicker(false)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [showGifPicker])

  useEffect(() => {
    const el = document.documentElement
    const apply = () => {
      const v = el.getAttribute("data-bs-theme")
      setPickerTheme(v === "dark" ? Theme.DARK : Theme.LIGHT)
    }
    apply()

    const mo = new MutationObserver(() => apply())
    mo.observe(el, { attributes: true, attributeFilter: ["data-bs-theme"] })
    return () => mo.disconnect()
  }, [])

  const renderEmojiText = useCallback((text: string) => {
    if (!text) return null
    const entities = parseTwemoji(text, { assetType: "svg" })
    if (!entities.length) return text

    const nodes: Array<React.ReactNode> = []
    let last = 0
    for (let i = 0; i < entities.length; i += 1) {
      const e = entities[i]
      const [start, end] = e.indices
      if (start > last) nodes.push(text.slice(last, start))
      nodes.push(
        <img
          key={`${e.text}-${start}-${end}`}
          src={e.url}
          alt={e.text}
          className="sl-twemoji"
          style={{ width: "1.1em", height: "1.1em", verticalAlign: "-0.18em" }}
          draggable={false}
          loading="lazy"
        />,
      )
      last = end
    }
    if (last < text.length) nodes.push(text.slice(last))
    return nodes
  }, [])

  const insertIntoInputAtCursor = useCallback(
    (toInsert: string) => {
      const el = inputRef.current
      if (!el) {
        setInput((prev) => `${prev}${toInsert}`)
        return
      }

      const start = el.selectionStart ?? el.value.length
      const end = el.selectionEnd ?? el.value.length
      setInput((prev) => {
        const before = prev.slice(0, start)
        const after = prev.slice(end)
        return `${before}${toInsert}${after}`
      })

      window.requestAnimationFrame(() => {
        try {
          const nextPos = start + toInsert.length
          el.focus()
          el.setSelectionRange(nextPos, nextPos)
        } catch {
          // ignore
        }
      })
    },
    [],
  )

  useEffect(() => {
    if (!messageMenu) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMessageMenu(null)
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [messageMenu])

  const getCopyTextForMessage = useCallback(
    (raw: string) => {
      const decoded = decodeRichMessage(raw)
      if (decoded.kind === "plain") return decoded.value

      if (decoded.value.type === "gif") {
        const parts = []
        if (decoded.value.text) parts.push(decoded.value.text)
        if (decoded.value.gifUrl) parts.push(decoded.value.gifUrl)
        return parts.join("\n")
      }

      if (decoded.value.type === "file") {
        const parts = []
        if (decoded.value.text) parts.push(decoded.value.text)
        if (decoded.value.fileUrl) parts.push(decoded.value.fileUrl)
        return parts.join("\n")
      }

      return decoded.value.text ?? ""
    },
    [],
  )

  const openMessageMenu = useCallback(
    (m: MessageResponse, isOutgoing: boolean, e: MouseEvent<HTMLDivElement>) => {
      e.preventDefault()

      const MENU_W = 300
      const MENU_H = 64

      let left = e.clientX
      left = Math.max(8, Math.min(left, window.innerWidth - MENU_W - 8))

      let top = e.clientY
      top = Math.max(8, Math.min(top, window.innerHeight - MENU_H - 8))

      setMessageMenu({ messageId: m._id, top, left })
      setShowEmojiPicker(false)
      setShowGifPicker(false)
    },
    [],
  )

  const isLikelyGifUrl = useCallback((value: string) => {
    const v = value.trim().toLowerCase()
    if (!v) return false
    if (!/^https?:\/\//.test(v)) return false
    if (v.endsWith(".gif")) return true
    if (v.includes("giphy.com/")) return true
    if (v.includes("tenor.com/")) return true
    return false
  }, [])

  useEffect(() => {
    if (!showGifPicker) return

      const controller = new AbortController()
      const run = async () => {
        if (gifProvider === "none") {
          setGifResults([])
          setGifError(null)
          setGifLoading(false)
          setGifCursor(null)
          return
        }

        const q = gifQuery.trim()
        const limit = 32

      setGifLoading(true)
      setGifError(null)
      setGifCursor(null)

        try {
          const url = new URL(
            gifProvider === "giphy"
              ? q
                ? "https://api.giphy.com/v1/gifs/search"
                : "https://api.giphy.com/v1/gifs/trending"
              : gifProvider === "klipy"
                ? q
                  ? "https://api.klipy.com/v2/search"
                  : "https://api.klipy.com/v2/featured"
                : q
                  ? "https://tenor.googleapis.com/v2/search"
                  : "https://tenor.googleapis.com/v2/featured",
          )

        if (gifProvider === "giphy") {
          url.searchParams.set("api_key", String(giphyKey ?? ""))
          url.searchParams.set("limit", String(limit))
          url.searchParams.set("offset", "0")
          if (q) url.searchParams.set("q", q)
        } else if (gifProvider === "tenor" || gifProvider === "klipy") {
          url.searchParams.set("key", String(tenorKey ?? ""))
          url.searchParams.set("client_key", "softlaunch-web")
          url.searchParams.set("limit", String(limit))
          url.searchParams.set("media_filter", "tinygif,gif")
          if (q) url.searchParams.set("q", q)
          if (gifProvider === "klipy") url.searchParams.set("key", String(klipyKey ?? ""))
        }

        const res = await fetch(url.toString(), { signal: controller.signal })
        if (!res.ok) throw new Error(`GIF search failed (${res.status})`)

        if (gifProvider === "giphy") {
          type GiphyImage = { url?: unknown }
          type GiphyGif = { images?: Record<string, GiphyImage | undefined> }
          type GiphyPagination = { count?: unknown; offset?: unknown }
          type GiphyResponse = { data?: GiphyGif[]; pagination?: GiphyPagination }

          const data = (await res.json()) as GiphyResponse
          const rows = Array.isArray(data.data) ? data.data : []
          const count = typeof data.pagination?.count === "number" ? data.pagination.count : rows.length

          const next = rows
            .map((r) => {
              const images = r.images ?? {}
              const original = images.original
              const preview = images.fixed_width_small ?? images.fixed_width ?? images.preview_gif ?? original

              const urlVal = typeof original?.url === "string" ? original.url : undefined
              const previewVal = typeof preview?.url === "string" ? preview.url : urlVal
              if (!urlVal) return null
              return { url: urlVal, previewUrl: previewVal }
            })
            .filter(Boolean) as Array<{ url: string; previewUrl?: string }>

          setGifResults(next)
          setGifCursor(count >= limit ? { provider: "giphy", offset: limit } : null)

          window.requestAnimationFrame(() => {
            gifResultsContainerRef.current?.scrollTo({ top: 0 })
          })
        } else {
          type TenorMediaFormat = { url?: unknown }
          type TenorResult = { media_formats?: Record<string, TenorMediaFormat | undefined> }
          type TenorResponse = { results?: TenorResult[]; next?: unknown }

          const data = (await res.json()) as TenorResponse
          const rows = Array.isArray(data.results) ? data.results : []
          const nextPos = typeof data.next === "string" ? data.next : null

          const next = rows
            .map((r) => {
              const media = r.media_formats ?? {}
              const gif = media.gif ?? media.mediumgif ?? media.tinygif
              const urlVal = typeof gif?.url === "string" ? gif.url : undefined
              const previewCandidate = media.tinygif ?? media.nanogif ?? gif
              const previewVal =
                typeof previewCandidate?.url === "string" ? previewCandidate.url : undefined
              if (!urlVal) return null
              return {
                url: String(urlVal),
                previewUrl: previewVal ? String(previewVal) : undefined,
              }
            })
            .filter(Boolean) as Array<{ url: string; previewUrl?: string }>

          setGifResults(next)
          setGifCursor(
            nextPos
              ? { provider: gifProvider === "klipy" ? "klipy" : "tenor", next: nextPos }
              : null,
          )

          window.requestAnimationFrame(() => {
            gifResultsContainerRef.current?.scrollTo({ top: 0 })
          })
        }
      } catch (e: unknown) {
        if (e instanceof Error && e.name === "AbortError") return
        setGifError(e instanceof Error ? e.message : "Failed to load GIFs")
      } finally {
        setGifLoading(false)
      }
    }

    const t = window.setTimeout(() => {
      void run()
    }, 250)

    return () => {
      window.clearTimeout(t)
      controller.abort()
    }
  }, [gifProvider, gifQuery, giphyKey, klipyKey, showGifPicker, tenorKey])

  const loadMoreGifs = useCallback(async () => {
    if (!showGifPicker) return
    if (gifProvider === "none") return
    if (!gifCursor) return
    if (gifLoading || gifLoadingMore) return

    const q = gifQuery.trim()
    const limit = 32

    setGifLoadingMore(true)
    setGifError(null)

    try {
      if (gifProvider === "giphy") {
        if (gifCursor.provider !== "giphy") return

        const url = new URL(
          q
            ? "https://api.giphy.com/v1/gifs/search"
            : "https://api.giphy.com/v1/gifs/trending",
        )
        url.searchParams.set("api_key", String(giphyKey ?? ""))
        url.searchParams.set("limit", String(limit))
        url.searchParams.set("offset", String(gifCursor.offset))
        if (q) url.searchParams.set("q", q)

        const res = await fetch(url.toString())
        if (!res.ok) throw new Error(`GIF search failed (${res.status})`)

        type GiphyImage = { url?: unknown }
        type GiphyGif = { images?: Record<string, GiphyImage | undefined> }
        type GiphyPagination = { count?: unknown }
        type GiphyResponse = { data?: GiphyGif[]; pagination?: GiphyPagination }

        const data = (await res.json()) as GiphyResponse
        const rows = Array.isArray(data.data) ? data.data : []
        const count = typeof data.pagination?.count === "number" ? data.pagination.count : rows.length

        const page = rows
          .map((r) => {
            const images = r.images ?? {}
            const original = images.original
            const preview = images.fixed_width_small ?? images.fixed_width ?? images.preview_gif ?? original

            const urlVal = typeof original?.url === "string" ? original.url : undefined
            const previewVal = typeof preview?.url === "string" ? preview.url : urlVal
            if (!urlVal) return null
            return { url: urlVal, previewUrl: previewVal }
          })
          .filter(Boolean) as Array<{ url: string; previewUrl?: string }>

        setGifResults((prev) => {
          const seen = new Set(prev.map((g) => g.url))
          return [...prev, ...page.filter((g) => !seen.has(g.url))]
        })
        setGifCursor(count >= limit ? { provider: "giphy", offset: gifCursor.offset + limit } : null)
      } else {
        if (gifCursor.provider !== "tenor" && gifCursor.provider !== "klipy") return

        const base =
          gifCursor.provider === "klipy" ? "https://api.klipy.com/v2" : "https://tenor.googleapis.com/v2"
        const url = new URL(q ? `${base}/search` : `${base}/featured`)
        url.searchParams.set(
          "key",
          gifCursor.provider === "klipy" ? String(klipyKey ?? "") : String(tenorKey ?? ""),
        )
        url.searchParams.set("client_key", "softlaunch-web")
        url.searchParams.set("limit", String(limit))
        url.searchParams.set("media_filter", "tinygif,gif")
        url.searchParams.set("pos", gifCursor.next)
        if (q) url.searchParams.set("q", q)

        const res = await fetch(url.toString())
        if (!res.ok) throw new Error(`GIF search failed (${res.status})`)

        type TenorMediaFormat = { url?: unknown }
        type TenorResult = { media_formats?: Record<string, TenorMediaFormat | undefined> }
        type TenorResponse = { results?: TenorResult[]; next?: unknown }

        const data = (await res.json()) as TenorResponse
        const rows = Array.isArray(data.results) ? data.results : []
        const nextPos = typeof data.next === "string" ? data.next : null

        const page = rows
          .map((r) => {
            const media = r.media_formats ?? {}
            const gif = media.gif ?? media.mediumgif ?? media.tinygif
            const urlVal = typeof gif?.url === "string" ? gif.url : undefined
            const previewCandidate = media.tinygif ?? media.nanogif ?? gif
            const previewVal =
              typeof previewCandidate?.url === "string" ? previewCandidate.url : undefined
            if (!urlVal) return null
            return {
              url: String(urlVal),
              previewUrl: previewVal ? String(previewVal) : undefined,
            }
          })
          .filter(Boolean) as Array<{ url: string; previewUrl?: string }>

        setGifResults((prev) => {
          const seen = new Set(prev.map((g) => g.url))
          return [...prev, ...page.filter((g) => !seen.has(g.url))]
        })
        setGifCursor(nextPos ? { provider: gifCursor.provider, next: nextPos } : null)
      }
    } catch (e: unknown) {
      setGifError(e instanceof Error ? e.message : "Failed to load more GIFs")
    } finally {
      setGifLoadingMore(false)
    }
  }, [
    gifCursor,
    gifLoading,
    gifLoadingMore,
    gifProvider,
    gifQuery,
    giphyKey,
    klipyKey,
    showGifPicker,
    tenorKey,
  ])

  const chatUsers = useMemo(() => {
    if (!sender) return users
    return users.filter((u) => u.phone !== sender)
  }, [users, sender])

  const filteredMessages = useMemo(() => {
    if (!selectedUser) return []

    const next = messages.filter(
      (m) =>
        !m.isDeleted &&
        ((m.sender === sender && m.receiver === selectedUser.phone) ||
          (m.sender === selectedUser.phone && m.receiver === sender)),
    )

    next.sort((a, b) => {
      const at = new Date(a.createdAt).getTime()
      const bt = new Date(b.createdAt).getTime()
      return at - bt
    })

    return next
  }, [messages, selectedUser, sender])

  const lastOutgoingMessageId = useMemo(() => {
    for (let i = filteredMessages.length - 1; i >= 0; i -= 1) {
      const m = filteredMessages[i]
      if (m.sender === sender) return m._id
    }
    return null
  }, [filteredMessages, sender])

  const startTicTacToe = async () => {
    if (!selectedUser || !sender) return
    const gameId = `t3-${Date.now()}`
    const localName =
      (localStorage.getItem("userName") ?? "").trim() ||
      users.find((u) => u.phone === sender)?.name ||
      sender
    const payload: TicTacToePayloadV1 = {
      v: 1,
      type: "tictactoe",
      gameId,
      board: ["", "", "", "", "", "", "", "", ""],
      currentTurn: "sender",
      players: {
        sender: { id: sender, name: localName },
        receiver: { id: selectedUser.phone, name: selectedUser.name },
      },
    }

    const encoded = encodeGameMessage(payload)

    // append locally as a system message so it appears in the thread immediately
    const now = new Date().toISOString()
    const systemMsg = {
      _id: gameId,
      gameId: gameId,
      sender: sender,
      receiver: selectedUser.phone,
      message: encoded,
      createdAt: now,
      updatedAt: now,
    }
    setMessages((prev) => [...prev, systemMsg as any])

    // notify server/peer — host app/socket should persist and broadcast the encoded game message
    try {
      socketService.sendMessage({ sender, receiver: selectedUser.phone, message: encoded })
    } catch (e) {
      console.error("Failed to send tic-tac-toe start", e)
    }
    window.requestAnimationFrame(() => scrollToBottom("smooth"))
  }

  const normalizeId = (v: string) => v.trim().replace(/[^\d+]/g, "")
  const toDigits = (v: string) => v.replace(/\D/g, "")
  const isSameUserId = (a: string, b: string) => {
    if (a === b) return true
    const an = normalizeId(a)
    const bn = normalizeId(b)
    if (an === bn) return true
    const ad = toDigits(an)
    const bd = toDigits(bn)
    if (ad && bd && ad === bd) return true
    if (ad.length >= 10 && bd.length >= 10 && ad.slice(-10) === bd.slice(-10)) return true
    return false
  }

  useEffect(() => {
    if (!selectedUser) return
    if (!shouldAutoScroll) return
    scrollToBottom("smooth")
  }, [filteredMessages.length, scrollToBottom, selectedUser, shouldAutoScroll])

  useEffect(() => {
    if (!sender) return

    const handleReceive = (msg: MessageResponse) => {
      // diagnostic log
      // eslint-disable-next-line no-console
      console.info("Chat.handleReceive", { id: msg._id, gameId: (msg as any).gameId, sender: msg.sender, receiver: msg.receiver, selectedUser: selectedUser?.phone })

      const isCurrentThread = Boolean(
        selectedUser &&
          ((msg.sender === sender && msg.receiver === selectedUser.phone) ||
            (msg.sender === selectedUser.phone && msg.receiver === sender)),
      )
      // eslint-disable-next-line no-console
      console.info("Chat.isCurrentThread", isCurrentThread)

      if (isCurrentThread) {
        setMessages((prev) => {
          const exists = prev.some((m) => m._id === msg._id || ((msg as any).gameId && m._id === (msg as any).gameId))
          // eslint-disable-next-line no-console
          console.info("Chat.updateMessages.exists", exists, { incomingId: msg._id, incomingGameId: (msg as any).gameId })
          if (exists) {
            // eslint-disable-next-line no-console
            console.info("Chat.updateMessages: replacing message", { matchId: msg._id || (msg as any).gameId })
            return prev.map((m) =>
              m._id === msg._id || ((msg as any).gameId && m._id === (msg as any).gameId) ? msg : m,
            )
          }
          // eslint-disable-next-line no-console
          console.info("Chat.updateMessages: appending message", { incomingId: msg._id, incomingGameId: (msg as any).gameId })
          return [...prev, msg]
        })
      }

      if (msg.receiver !== sender) return

      const from = msg.sender

      const isSelectedThread = selectedUser?.phone === from

      if (!isSelectedThread || !isPageActive) {
        setUnreadCounts((prev) => ({
          ...prev,
          [from]: (prev[from] ?? 0) + 1,
        }))
        window.dispatchEvent(new Event("unreadCountsChanged"))
        return
      }

      setUnreadCounts((prev) => ({ ...prev, [from]: 0 }))
      socketService.markSeen({ sender: from, receiver: sender })
      window.dispatchEvent(new Event("unreadCountsChanged"))
    }

    socketService.onReceiveMessage(handleReceive)
    // game-specific handlers: ensure game updates always merge into messages
    const handleGameUpdate = (msg: MessageResponse) => {
      // eslint-disable-next-line no-console
      console.info("Chat.handleGameUpdate", { id: msg._id, gameId: (msg as any).gameId })
      setMessages((prev) => {
        const exists = prev.some((m) => m._id === msg._id || ((msg as any).gameId && m._id === (msg as any).gameId))
        if (exists) return prev.map((m) => (m._id === msg._id || ((msg as any).gameId && m._id === (msg as any).gameId) ? msg : m))
        return [...prev, msg]
      })

      // Treat game updates as "new message" notifications for the other player.
      const decoded = decodeGameMessage(msg.message ?? "")
      if (decoded.kind === "game") {
        const g = decoded.value
        const isForMe =
          isSameUserId(sender ?? "", g.players.sender.id) || isSameUserId(sender ?? "", g.players.receiver.id)
        if (!isForMe) return
      }

      const other =
        decoded.kind === "game"
          ? isSameUserId(sender ?? "", decoded.value.players.sender.id)
            ? decoded.value.players.receiver.id
            : decoded.value.players.sender.id
          : msg.sender

      const isSelectedThread = isSameUserId(selectedUser?.phone ?? "", other)

      if (!isSelectedThread || !isPageActive) {
        setUnreadCounts((prev) => ({
          ...prev,
          [other]: (prev[other] ?? 0) + 1,
        }))
        window.dispatchEvent(new Event("unreadCountsChanged"))
        return
      }

      setUnreadCounts((prev) => ({ ...prev, [other]: 0 }))
      socketService.markSeen({ sender: other, receiver: sender })
      window.dispatchEvent(new Event("unreadCountsChanged"))
    }

    socketService.onGameUpdated(handleGameUpdate)
    socketService.onGameCreated(handleGameUpdate)

    return () => {
      socketService.offReceiveMessage(handleReceive)
      socketService.offGameUpdated(handleGameUpdate)
      socketService.offGameCreated(handleGameUpdate)
    }
  }, [sender, selectedUser, isPageActive])

  useEffect(() => {
    if (!sender) return

    const handler = (payload: {
      sender: string
      receiver: string
      seenAt?: string
      modifiedCount?: number
    }) => {
      if (payload.sender !== sender) return

      const seenAt = payload.seenAt ?? new Date().toISOString()
      setMessages((prev) =>
        prev.map((m) =>
          m.sender === sender && m.receiver === payload.receiver
            ? { ...m, seen: true, seenAt }
            : m,
        ),
      )
    }

    socketService.onMessagesSeen(handler)

    return () => {
      socketService.offMessagesSeen(handler)
    }
  }, [sender])

  useEffect(() => {
    if (!sender) return

    const handleMessageDeleted = (payload: { messageId: string }) => {
      setMessages((prev) => prev.filter((m) => m._id !== payload.messageId))
    }

    socketService.onMessageDeleted(handleMessageDeleted)

    return () => {
      socketService.offMessageDeleted(handleMessageDeleted)
    }
  }, [sender])

  useEffect(() => {
    if (!sender) return

    const handleMessageUpdated = (payload: { message: MessageResponse }) => {
      setMessages((prev) =>
        prev.map((m) => (m._id === payload.message._id ? { ...m, ...payload.message } : m)),
      )

      setEditingMessageId((prev) => (prev === payload.message._id ? null : prev))
      setEditError(null)
    }

    socketService.onMessageUpdated(handleMessageUpdated)

    return () => {
      socketService.offMessageUpdated(handleMessageUpdated)
    }
  }, [sender])

  useEffect(() => {
    if (!sender) return

    const handleReactionAdded = (payload: { messageId: string; emoji: string; userPhone: string }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m._id === payload.messageId
            ? (() => {
                // one reaction per user: remove from any previous emoji first
                const cleaned = (m.reactions ?? [])
                  .map((r) => ({ ...r, users: r.users.filter((u) => u !== payload.userPhone) }))
                  .filter((r) => r.users.length > 0)

                const idx = cleaned.findIndex((r) => r.emoji === payload.emoji)
                if (idx >= 0) {
                  const users = Array.from(new Set([...cleaned[idx].users, payload.userPhone]))
                  cleaned[idx] = { ...cleaned[idx], users }
                } else {
                  cleaned.push({ emoji: payload.emoji, users: [payload.userPhone] })
                }

                return { ...m, reactions: cleaned }
              })()
            : m,
        ),
      )
    }

    socketService.onReactionAdded(handleReactionAdded)

    return () => {
      socketService.offReactionAdded(handleReactionAdded)
    }
  }, [sender])

  useEffect(() => {
    if (!sender) return

    const handleReactionRemoved = (payload: { messageId: string; emoji: string; userPhone: string }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m._id === payload.messageId
            ? {
                ...m,
                reactions: (m.reactions ?? [])
                  .map((r) =>
                    r.emoji === payload.emoji
                      ? { ...r, users: r.users.filter((u) => u !== payload.userPhone) }
                      : r,
                  )
                  .filter((r) => r.users.length > 0),
              }
            : m,
        ),
      )
    }

    socketService.onReactionRemoved(handleReactionRemoved)

    return () => {
      socketService.offReactionRemoved(handleReactionRemoved)
    }
  }, [sender])

  useEffect(() => {
    const handleDocumentClick = () => {
      setReactionPickerMessageId(null)
    }
    document.addEventListener("click", handleDocumentClick)
    return () => {
      document.removeEventListener("click", handleDocumentClick)
    }
  }, [])

  const loadUsers = async () => {
    try {
      const res = await getUsers()
      setUsers(res.data)
    } catch (e) {
      console.error("Failed to load users", e)
    }
  }

  const refreshUnseenCounts = useCallback(async () => {
    if (!sender) return
    try {
      const res = await getUnseenCounts(sender)
      const next: Record<string, number> = {}

      for (const row of res.data ?? []) {
        if (!row?.sender) continue
        next[row.sender] = Number(row.count ?? 0)
      }

      setUnreadCounts(next)
      window.dispatchEvent(new Event("unreadCountsChanged"))
    } catch (e) {
      console.error("Failed to load unseen counts", e)
    }
  }, [sender])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadUsers()
    }, 0)

    return () => {
      window.clearTimeout(timer)
    }
  }, [])

  useEffect(() => {
    void refreshUnseenCounts()
  }, [refreshUnseenCounts])

  useEffect(() => {
    if (!selectedUser || !sender) return

    const loadThread = async () => {
      try {
        setIsLoadingMore(true)
        setHasMore(false)
        oldestCursorRef.current = null
        setMessages([])

        const res = await getMessages(sender, selectedUser.phone, { limit: PAGE_SIZE })
        const rows = Array.isArray(res.data) ? (res.data as MessageResponse[]) : []

        const sorted = [...rows].sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        )

        const page = sorted.length > PAGE_SIZE ? sorted.slice(sorted.length - PAGE_SIZE) : sorted

        setMessages(page)
        oldestCursorRef.current = page[0]?.createdAt ?? null
        setHasMore(sorted.length > PAGE_SIZE ? true : rows.length >= PAGE_SIZE)

        window.requestAnimationFrame(() => {
          scrollToBottom("auto")
        })
      } catch (e) {
        console.error("Failed to load messages", e)
      } finally {
        setIsLoadingMore(false)
      }
    }

    loadThread()
  }, [selectedUser, sender, scrollToBottom])

  const loadMore = useCallback(async () => {
    if (!selectedUser || !sender) return
    if (!hasMore || isLoadingMore) return
    if (!oldestCursorRef.current) return

    const container = messagesContainerRef.current
    const prevScrollHeight = container?.scrollHeight ?? 0
    const prevScrollTop = container?.scrollTop ?? 0

    setIsLoadingMore(true)
    setShouldAutoScroll(false)

    try {
      const res = await getMessages(sender, selectedUser.phone, {
        limit: PAGE_SIZE,
        before: oldestCursorRef.current,
      })
      const rows = Array.isArray(res.data) ? (res.data as MessageResponse[]) : []
      if (rows.length === 0) {
        setHasMore(false)
        return
      }

      const sorted = [...rows].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      )

      const cursorTime = new Date(oldestCursorRef.current).getTime()
      const older = sorted.filter((m) => new Date(m.createdAt).getTime() < cursorTime)
      const page =
        older.length > PAGE_SIZE ? older.slice(older.length - PAGE_SIZE) : older

      if (page.length === 0) {
        setHasMore(false)
        return
      }

      oldestCursorRef.current = page[0]?.createdAt ?? oldestCursorRef.current

      const seen = new Set(messagesRef.current.map((m) => m._id))
      const toPrepend = page.filter((m) => !seen.has(m._id))
      if (toPrepend.length === 0) {
        setHasMore(false)
        return
      }

      setMessages((prev) => {
        const merged = [...toPrepend, ...prev]
        merged.sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        )
        return merged
      })

      window.requestAnimationFrame(() => {
        const el = messagesContainerRef.current
        if (!el) return
        const newScrollHeight = el.scrollHeight
        el.scrollTop = prevScrollTop + (newScrollHeight - prevScrollHeight)
      })

      setHasMore(older.length > PAGE_SIZE || rows.length >= PAGE_SIZE)
    } catch (e) {
      console.error("Failed to load older messages", e)
    } finally {
      setIsLoadingMore(false)
    }
  }, [hasMore, isLoadingMore, selectedUser, sender])

  useEffect(() => {
    if (!selectedUser || !sender || !isPageActive) return

    const hasUnseenIncoming = filteredMessages.some(
      (m) =>
        m.sender === selectedUser.phone &&
        m.receiver === sender &&
        !m.seen,
    )
    if (!hasUnseenIncoming) return

    const seenAt = new Date().toISOString()
    socketService.markSeen({ sender: selectedUser.phone, receiver: sender })
    setUnreadCounts((prev) => ({ ...prev, [selectedUser.phone]: 0 }))
    window.dispatchEvent(new Event("unreadCountsChanged"))
    setMessages((prev) =>
      prev.map((m) =>
        m.sender === selectedUser.phone && m.receiver === sender
          ? { ...m, seen: true, seenAt }
          : m,
      ),
    )
  }, [filteredMessages, selectedUser, sender, isPageActive])

  const sendOutgoingTo = useCallback(
    (receiverPhone: string, rawMessage: string, opts?: { clearInput?: boolean }) => {
      if (!receiverPhone || !sender) return

      const payload: SendMessagePayload = {
        sender,
        receiver: receiverPhone,
        message: rawMessage,
      }

      socketService.sendMessage(payload)
      setUnreadCounts((prev) => ({ ...prev, [receiverPhone]: 0 }))
      socketService.markSeen({ sender: receiverPhone, receiver: sender })
      window.dispatchEvent(new Event("unreadCountsChanged"))

      const isCurrentThread = selectedUser?.phone === receiverPhone
      if (opts?.clearInput && isCurrentThread) setInput("")
      if (isCurrentThread) {
        setReplyTo(null)
        setSelectedGifUrl(null)
        setShowEmojiPicker(false)
        setShowGifPicker(false)
      }
      window.requestAnimationFrame(() => scrollToBottom("smooth"))
    },
    [scrollToBottom, selectedUser?.phone, sender],
  )

  const isAllowedUploadFile = useCallback((file: File) => {
    const name = file.name.toLowerCase()
    const isPdf = file.type === "application/pdf" || name.endsWith(".pdf")
    const isImage = file.type.startsWith("image/")
    const isVideo = file.type.startsWith("video/")
    return isImage || isPdf || isVideo
  }, [])

  const uploadAndSendFiles = useCallback(
    async (files: File[], opts?: { source: "picker" | "paste" }) => {
      const receiverPhone = selectedUser?.phone
      if (!receiverPhone || !sender) return
      if (!files.length) return

      setUploadError(null)

      const allowed = files.filter(isAllowedUploadFile)
      if (allowed.length === 0) {
        setUploadError("Only images, videos and PDFs are supported.")
        return
      }

      const caption = input.trim()
      const shouldUseCaption = opts?.source === "paste" || allowed.length === 1
      const replyPayload: RichReplyToV1 | undefined = replyTo
        ? {
            id: replyTo.id,
            sender: replyTo.sender,
            type: replyTo.type,
            previewText: replyTo.previewText,
            previewGifUrl: replyTo.type === "gif" ? replyTo.previewGifUrl : undefined,
            previewFileUrl: replyTo.type === "file" ? replyTo.previewFileUrl : undefined,
            previewFileMimeType: replyTo.type === "file" ? replyTo.previewFileMimeType : undefined,
          }
        : undefined

      for (let idx = 0; idx < allowed.length; idx += 1) {
        const file = allowed[idx]
        const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`
        setUploadTasks((prev) => [...prev, { id, name: file.name, progress: 0 }])

        try {
          const uploaded = await uploadFileToApi(file, {
            onProgress: (pct) => {
              setUploadTasks((prev) =>
                prev.map((t) => (t.id === id ? { ...t, progress: pct } : t)),
              )
            },
          })

          const rt = uploaded.resourceType
          const cloudinaryResourceType =
            rt === "image" || rt === "video" || rt === "raw" || rt === "auto" ? rt : undefined

          const message = encodeRichMessage({
            v: 1,
            type: "file",
            fileUrl: uploaded.url,
            fileName: uploaded.fileName ?? file.name,
            mimeType: uploaded.mimeType ?? (file.type || undefined),
            sizeBytes: uploaded.bytes ?? file.size,
            cloudinaryPublicId: uploaded.publicId,
            cloudinaryResourceType,
            text: shouldUseCaption && idx === 0 ? caption || undefined : undefined,
            replyTo: replyPayload,
          })

          sendOutgoingTo(receiverPhone, message, {
            clearInput: Boolean(shouldUseCaption && idx === 0 && caption),
          })
        } catch (err) {
          console.error("Upload failed", err)
          const message =
            err instanceof Error && err.message
              ? err.message
              : "Upload failed. Check API/Cloudinary config or try again."
          setUploadError(message)
          setUploadTasks((prev) =>
            prev.map((t) => (t.id === id ? { ...t, error: "Upload failed" } : t)),
          )
        } finally {
          setUploadTasks((prev) => prev.filter((t) => t.id !== id))
        }
      }
    },
    [input, isAllowedUploadFile, replyTo, selectedUser?.phone, sendOutgoingTo, sender],
  )

  const sendMessage = async () => {
    const trimmed = input.trim()
    if (!selectedUser || !sender) return
    if (!trimmed && !selectedGifUrl) return
    setSendError(null)

    if (editingMessageId) {
      if (!editBase) {
        setEditingMessageId(null)
        setEditError(null)
        return
      }

      if (!trimmed) {
        setEditError("Message can't be empty")
        return
      }

      const nextRaw =
        editBase.kind === "plain"
          ? trimmed
          : encodeRichMessage({
              ...editBase.value,
              text: trimmed,
            })

      try {
        const res = await updateMessage(editingMessageId, nextRaw)
        const updated = res.data as MessageResponse
        setMessages((prev) =>
          prev.map((m) => (m._id === editingMessageId ? { ...m, ...updated } : m)),
        )
        socketService.updateMessage(editingMessageId)
        setEditingMessageId(null)
        setEditBase(null)
        setEditError(null)
        setInput("")
        setReplyTo(null)
        setSelectedGifUrl(null)
        setShowEmojiPicker(false)
        setShowGifPicker(false)
        scrollToBottom("smooth")
      } catch (err) {
        console.error("Failed to edit message", err)
        setEditError("Failed to edit message")
      }

      return
    }

    const replyPayload: RichReplyToV1 | undefined = replyTo
      ? {
          id: replyTo.id,
          sender: replyTo.sender,
          type: replyTo.type,
          previewText: replyTo.previewText,
          previewGifUrl: replyTo.type === "gif" ? replyTo.previewGifUrl : undefined,
          previewFileUrl: replyTo.type === "file" ? replyTo.previewFileUrl : undefined,
          previewFileMimeType: replyTo.type === "file" ? replyTo.previewFileMimeType : undefined,
        }
      : undefined

    const outgoingMessage = selectedGifUrl || replyPayload
      ? encodeRichMessage({
          v: 1,
          type: selectedGifUrl ? "gif" : "text",
          gifUrl: selectedGifUrl ?? undefined,
          text: trimmed || undefined,
          replyTo: replyPayload,
        })
      : trimmed

    sendOutgoingTo(selectedUser.phone, outgoingMessage, { clearInput: true })

    // try {
    //   await saveMessage(payload)
    // } catch (e) {
    //   console.error("Message sent but not saved to DB", e)
    //   setSendError("Message sent, but it wasn't saved. Check API/DB logs.")
    // }
  }

  const onPickFiles = useCallback(() => {
    if (editingMessageId) return
    fileInputRef.current?.click()
  }, [editingMessageId])

  const onFileInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? [])
      e.target.value = ""
      if (!files.length) return
      void uploadAndSendFiles(files, { source: "picker" })
    },
    [uploadAndSendFiles],
  )

  const onPasteUpload = useCallback(
    (e: ClipboardEvent<HTMLTextAreaElement>) => {
      if (editingMessageId) return

      const items = e.clipboardData?.items
      if (!items) return

      const files: File[] = []
      for (const item of Array.from(items)) {
        if (item.kind !== "file") continue
        const f = item.getAsFile()
        if (f) files.push(f)
      }

      if (files.length === 0) return
      const allowed = files.filter(isAllowedUploadFile)
      if (allowed.length === 0) return

      e.preventDefault()
      void uploadAndSendFiles(allowed, { source: "paste" })
    },
    [editingMessageId, isAllowedUploadFile, uploadAndSendFiles],
  )

  const applyReactionLocally = (
    messageId: string,
    emoji: string,
    userPhone: string,
    add: boolean,
  ) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m._id !== messageId) return m
        const nextReactions = (m.reactions ?? []).slice()

        if (add) {
          // one reaction per user per message:
          // remove this user from any previous emoji first
          for (let i = nextReactions.length - 1; i >= 0; i -= 1) {
            const users = nextReactions[i].users.filter((u) => u !== userPhone)
            if (users.length === 0) nextReactions.splice(i, 1)
            else nextReactions[i] = { ...nextReactions[i], users }
          }

          const idx = nextReactions.findIndex((r) => r.emoji === emoji)
          if (idx >= 0) {
            const users = Array.from(new Set([...nextReactions[idx].users, userPhone]))
            nextReactions[idx] = { ...nextReactions[idx], users }
          } else {
            nextReactions.push({ emoji, users: [userPhone] })
          }
        } else {
          const idx = nextReactions.findIndex((r) => r.emoji === emoji)
          if (idx >= 0) {
            const users = nextReactions[idx].users.filter((u) => u !== userPhone)
            if (users.length === 0) nextReactions.splice(idx, 1)
            else nextReactions[idx] = { ...nextReactions[idx], users }
          }
        }

        return { ...m, reactions: nextReactions }
      }),
    )
  }

  const getMyReactionEmoji = useCallback((m: MessageResponse, userPhone: string) => {
    const hit = m.reactions?.find((r) => r.users.includes(userPhone))
    return hit?.emoji ?? null
  }, [])

  const messageItems = useMemo(() => {
    const items: Array<
      | { type: "date"; key: string; label: string }
      | { type: "message"; key: string; msg: MessageResponse }
    > = []

    let lastDateKey: string | null = null
    for (const m of filteredMessages) {
      const dateKey = new Date(m.createdAt).toDateString()
      if (dateKey !== lastDateKey) {
        items.push({ type: "date", key: `date:${dateKey}`, label: formatDateLabel(m.createdAt) })
        lastDateKey = dateKey
      }
      items.push({ type: "message", key: m._id, msg: m })
    }

    return items
  }, [filteredMessages])

  const selectChatUser = useCallback(
    (user: User, { closeDrawer }: { closeDrawer?: boolean } = {}) => {
      setSelectedUser(user)
      setReplyTo(null)
      setSelectedGifUrl(null)
      setShowEmojiPicker(false)
      setShowGifPicker(false)
      if (closeDrawer) setIsDrawerOpen(false)
      if (sender) {
        setUnreadCounts((prev) => ({ ...prev, [user.phone]: 0 }))
        socketService.markSeen({ sender: user.phone, receiver: sender })
        window.dispatchEvent(new Event("unreadCountsChanged"))
      }
    },
    [sender],
  )

  return (
    <div className="d-flex position-relative sl-chat">
      {imagePreview && (
        <>
          <div
            className="position-fixed top-0 start-0 w-100 h-100"
            style={{ background: "rgba(0,0,0,0.6)", zIndex: 2000 }}
            role="presentation"
            onClick={() => setImagePreview(null)}
          />
          <div
            className="position-fixed top-50 start-50 translate-middle bg-body rounded shadow"
            style={{ zIndex: 2001, width: "min(88vw, 680px)", maxHeight: "86vh" }}
            role="dialog"
            aria-modal="true"
            aria-label={imagePreview.title ?? "Image preview"}
          >
            <div className="d-flex align-items-center justify-content-between p-2 border-bottom">
              <div className="small fw-semibold text-truncate" style={{ minWidth: 0 }}>
                {imagePreview.title ?? "Preview"}
              </div>
              <div className="d-flex align-items-center gap-2">
                <div className="btn-group" role="group" aria-label="Zoom controls">
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    onClick={() =>
                      setImagePreviewZoom((z) => Math.max(1, Math.round((z - 0.25) * 100) / 100))
                    }
                    disabled={imagePreviewZoom <= 1}
                    title="Zoom out"
                    aria-label="Zoom out"
                  >
                    -
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    onClick={() => setImagePreviewZoom(1)}
                    disabled={imagePreviewZoom === 1}
                    title="Reset zoom"
                    aria-label="Reset zoom"
                  >
                    {Math.round(imagePreviewZoom * 100)}%
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    onClick={() =>
                      setImagePreviewZoom((z) => Math.min(5, Math.round((z + 0.25) * 100) / 100))
                    }
                    title="Zoom in"
                    aria-label="Zoom in"
                  >
                    +
                  </button>
                </div>
                <a
                  href={imagePreview.url}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-sm btn-outline-secondary"
                >
                  Open
                </a>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  onClick={() => setImagePreview(null)}
                  aria-label="Close preview"
                  title="Close"
                >
                  {"\u2715"}
                </button>
              </div>
            </div>
            <div
              className="p-2"
              style={{
                maxHeight: "calc(86vh - 44px)",
                overflow: "auto",
                display: "flex",
                justifyContent: "center",
              }}
              onWheel={(e) => {
                if (!e.ctrlKey) return
                e.preventDefault()
                const delta = e.deltaY > 0 ? -0.15 : 0.15
                setImagePreviewZoom((z) =>
                  Math.min(5, Math.max(1, Math.round((z + delta) * 100) / 100)),
                )
              }}
            >
              <img
                src={imagePreview.url}
                alt={imagePreview.title ?? "Image preview"}
                style={{
                  maxWidth: imagePreviewZoom === 1 ? "100%" : undefined,
                  maxHeight: imagePreviewZoom === 1 ? "78vh" : undefined,
                  borderRadius: 8,
                  transform: `scale(${imagePreviewZoom})`,
                  transformOrigin: "center center",
                  transition: "transform 0.08s ease-out",
                  cursor: imagePreviewZoom > 1 ? "zoom-out" : "zoom-in",
                }}
                onDoubleClick={() => {
                  setImagePreviewZoom((z) => (z === 1 ? 2 : 1))
                }}
                onClick={(e) => {
                  // don't close modal when clicking image itself
                  e.stopPropagation()
                  // quick toggle when zoom not changed much
                  if (imagePreviewZoom === 1) setImagePreviewZoom(2)
                }}
              />
            </div>
          </div>
        </>
      )}
      {/* Side drawer (mobile user list) */}
      {isMobileLayout && isDrawerOpen && (
        <div
          className="position-fixed top-0 start-0 w-100 h-100"
          style={{ background: "rgba(0,0,0,0.35)", zIndex: 1200 }}
          role="presentation"
          onClick={() => setIsDrawerOpen(false)}
        />
      )}
      <div
        className="position-fixed top-0 start-0 h-100 bg-body border-end d-md-none"
        style={{
          width: 320,
          maxWidth: "85vw",
          zIndex: 1201,
          transform: isDrawerOpen ? "translateX(0)" : "translateX(-105%)",
          transition: "transform 0.2s ease",
          overflowY: "auto",
        }}
        role="dialog"
        aria-label="Chats drawer"
        aria-hidden={!isDrawerOpen}
      >
        <div className="p-3 border-bottom d-flex align-items-center justify-content-between">
          <strong>Chats</strong>
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            onClick={() => setIsDrawerOpen(false)}
            aria-label="Close drawer"
            title="Close"
          >
            {"\u2715"}
          </button>
        </div>
        {chatUsers.map((user) => {
          const unread = unreadCounts[user.phone] ?? 0
          const isSelected = selectedUser?._id === user._id
          const hasUnseen = unread > 0

          return (
            <div
              key={user._id}
              className={`p-3 border-bottom cursor-pointer ${
                isSelected ? "bg-body-secondary" : hasUnseen ? "bg-warning-subtle" : ""
              }`}
              onClick={() => selectChatUser(user, { closeDrawer: true })}
              style={{ cursor: "pointer" }}
            >
              <div className="d-flex align-items-center justify-content-between">
                <strong className={hasUnseen ? "fw-semibold" : undefined}>{user.name}</strong>
                {hasUnseen && <span className="badge bg-danger">{unread}</span>}
              </div>
              <div className="text-muted small">{user.phone}</div>
            </div>
          )
        })}
      </div>
      
      {/* LEFT SIDE - USER LIST */}
      {!isMobileLayout && isSidebarOpen && (
      <div
        style={{
          width: "30%",
          borderRight: "1px solid #ddd",
          overflowY: "auto",
        }}
      >
        {chatUsers.map((user) => {
          const unread = unreadCounts[user.phone] ?? 0
          const isSelected = selectedUser?._id === user._id
          const hasUnseen = unread > 0

          return (
            <div
              key={user._id}
              className={`p-3 border-bottom cursor-pointer ${
                isSelected
                  ? "bg-body-secondary"
                  : hasUnseen
                    ? "bg-warning-subtle"
                    : ""
              }`}
              onClick={() => selectChatUser(user)}
              style={{ cursor: "pointer" }}
            >
              <div className="d-flex align-items-center justify-content-between">
                <strong className={hasUnseen ? "fw-semibold" : undefined}>
                  {user.name}
                </strong>
                {hasUnseen && <span className="badge bg-danger">{unread}</span>}
              </div>
              <div className="text-muted small">{user.phone}</div>
            </div>
          )
        })}
      </div>
      )}

      {/* RIGHT SIDE - CHAT AREA */}
      <div className="flex-grow-1 d-flex flex-column">
        
        {/* Header */}
        <div className="p-3 border-bottom bg-body d-flex align-items-center justify-content-between">
          <div className="d-flex align-items-center gap-2">
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={() => {
                if (isMobileLayout) {
                  setIsDrawerOpen(true)
                } else {
                  setIsSidebarOpen((v) => !v)
                }
              }}
              aria-label="Toggle chats"
              title="Chats"
            >
              {"\u2630"}
            </button>
            {selectedUser ? (
              <strong
              id="view-user-name"
              style={{
                  filter: privacyMode ? "blur(10px)" : undefined,
                  cursor: privacyMode ? "pointer" : undefined,
                  transition: privacyMode ? "filter 0.2s ease" : undefined,
                }}
                >{selectedUser.name}</strong>
            ) : (
              "Select a user"
            )}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              type="button"
              className="btn btn-sm btn-outline-primary"
              onClick={() => startTicTacToe()}
              title="Start Tic-Tac-Toe"
              aria-label="Start Tic-Tac-Toe"
            >
              {"\u274C"}
              {"\u2B55"}
            </button>
            <button
              type="button"
              className={`btn btn-sm ${
                privacyMode ? "btn-warning" : "btn-outline-warning"
              }`}
              onClick={() => setPrivacyMode(!privacyMode)}
              title={privacyMode ? "Privacy Mode: ON - Messages are blurred" : "Privacy Mode: OFF"}
            >
              {"\u{1F512}"} {privacyMode ? "Privacy: ON" : "Privacy: OFF"}
            </button>
          </div>
        </div>

        {/* Messages */}
        <div
          className="flex-grow-1 p-3 bg-body-tertiary"
          style={{ overflowY: "auto" }}
          ref={messagesContainerRef}
          onScroll={() => {
            setMessageMenu(null)
            const el = messagesContainerRef.current
            if (!el) return

            const distanceFromBottom = el.scrollHeight - (el.scrollTop + el.clientHeight)
            setShouldAutoScroll(distanceFromBottom < 120)

            if (el.scrollTop < 80) {
              void loadMore()
            }
          }}
        >
          {hasMore && (
            <div className="text-center small text-body-secondary mb-2">
              {isLoadingMore ? "Loading..." : "Scroll up to load older messages"}
            </div>
          )}
          {messageItems.map((item) => {
            if (item.type === "date") {
              return (
                <div key={item.key} className="d-flex justify-content-center my-2">
                  <span className="badge text-bg-light border">{item.label}</span>
                </div>
              )
            }

            const m = item.msg
            // detect inline game message
            const gameDecoded = decodeGameMessage(m.message ?? "")
            if (gameDecoded.kind === "game") {
              const g = gameDecoded.value
              const canDeleteGame =
                Boolean(sender) &&
                (isSameUserId(sender ?? "", g.players.sender.id) ||
                  isSameUserId(sender ?? "", g.players.receiver.id))
              return (
                <div key={item.key} className="d-flex justify-content-center my-2">
                  <div
                    style={{
                      filter: privacyMode ? "blur(10px)" : undefined,
                      transition: privacyMode ? "filter 0.2s ease" : undefined,
                    }}
                  >
                    <TicTacToeCard
                      gameId={g.gameId}
                      players={{ sender: { id: g.players.sender.id, name: g.players.sender.name }, receiver: { id: g.players.receiver.id, name: g.players.receiver.name } }}
                      board={g.board}
                      currentTurn={g.currentTurn}
                      onDelete={
                        canDeleteGame
                          ? async () => {
                              const ok = window.confirm("Delete this Tic-Tac-Toe game?")
                              if (!ok) return
                              try {
                                await deleteMessage(m._id)
                                socketService.deleteMessage(m._id)
                                setMessages((prev) =>
                                  prev.filter((x) => x._id !== m._id && x._id !== g.gameId),
                                )
                              } catch (e) {
                                console.error("Failed to delete game", e)
                              }
                            }
                          : undefined
                      }
                      onMove={(gameId, index) => {
                        // optimistic local update for responsiveness
                        const next: TicTacToePayloadV1 = {
                          ...g,
                          board: [...g.board],
                          currentTurn: g.currentTurn === "sender" ? "receiver" : "sender",
                        }
                        if (next.board[index] !== "") return
                        next.board[index] = g.currentTurn === "sender" ? "X" : "O"
                        const encoded = encodeGameMessage(next)
                        setMessages((prev) => prev.map((mm) => (mm._id === m._id ? { ...mm, message: encoded, updatedAt: new Date().toISOString() } : mm)))
                        try {
                          socketService.sendGameMove(gameId, index, sender)
                        } catch (e) {
                          console.error("Failed to send game move", e)
                        }
                        // Also call REST fallback to ensure DB persistence if socket fails
                        // (async () => {
                        //   try {
                        //     const res = await fetch(`/api/chat/games/${encodeURIComponent(gameId)}/move`, {
                        //       method: "POST",
                        //       headers: { "Content-Type": "application/json" },
                        //       body: JSON.stringify({ index, playerId: sender }),
                        //     })
                        //     if (res.ok) {
                        //       const updated = await res.json()
                        //       setMessages((prev) => prev.map((mm) => (mm._id === m._id || (updated.gameId && mm._id === updated.gameId) ? updated : mm)))
                        //     } else {
                        //       // eslint-disable-next-line no-console
                        //       console.warn("game move REST fallback failed", await res.text())
                        //     }
                        //   } catch (err) {
                        //     // eslint-disable-next-line no-console
                        //     console.error("game move REST fallback error", err)
                        //   }
                        // })()
                      }}
                      onRematch={(gameId) => {
                        // optimistically show reset; server will create new game instance and broadcast
                        const emptyBoard: TicTacToePayloadV1["board"] = ["", "", "", "", "", "", "", "", ""]
                        const reset: TicTacToePayloadV1 = {
                          ...g,
                          board: emptyBoard,
                          currentTurn: "sender",
                          gameId: `t3-${Date.now()}`,
                        }
                        const encoded = encodeGameMessage(reset)
                        setMessages((prev) => prev.map((mm) => (mm._id === m._id ? { ...mm, message: encoded, updatedAt: new Date().toISOString() } : mm)))
                        try {
                          socketService.sendGameRematch(gameId, sender)
                        } catch (e) {
                          console.error("Failed to send rematch", e)
                        }
                      }}
                    />
                  </div>
                </div>
              )
            }
            const isOutgoing = m.sender === sender
            const isLastOutgoing = isOutgoing && m._id === lastOutgoingMessageId
            const timeLabel = formatTimeLabel(m.createdAt)
            const decoded = decodeRichMessage(m.message)
            const isHighlighted = highlightedMessageId === m._id
                const bubble = (() => {
                  if (decoded.kind === "plain") {
                    const plain = decoded.value.trim()
                    const looksLikeSingleGifUrl = isLikelyGifUrl(plain) && !/\s/.test(plain)
                    if (looksLikeSingleGifUrl) {
                      return (
                        <span
                          className={privacyMode ? "sl-privacy-media" : undefined}
                          style={{ width: 220, borderRadius: 8 }}
                        >
                          <img
                            src={plain}
                            alt="GIF"
                            style={{ width: 220, height: "auto", borderRadius: 8 }}
                            loading="lazy"
                            role="button"
                            tabIndex={0}
                            onClick={() => setImagePreview({ url: plain, title: "GIF" })}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault()
                                setImagePreview({ url: plain, title: "GIF" })
                              }
                            }}
                          />
                          {privacyMode && <span className="sl-privacy-mask" />}
                        </span>
                      )
                    }

                return (
                  <div style={{ whiteSpace: "pre-wrap" }}>
                    {renderEmojiText(decoded.value)}
                  </div>
                )
              }

              const msg = decoded.value
              return (
                <div className="d-flex flex-column gap-2">
                  {msg.replyTo && (
                    <button
                      type="button"
                      className={`btn btn-sm text-start p-2 border rounded ${
                        isOutgoing ? "btn-outline-light" : "btn-outline-secondary"
                      }`}
                      onClick={() => scrollToMessage(msg.replyTo!.id)}
                      title="Go to replied message"
                    >
                      <div className="small fw-semibold">
                        {msg.replyTo.sender === sender
                          ? "You"
                          : selectedUser?.name ?? msg.replyTo.sender}
                      </div>
                      {msg.replyTo.type === "gif" && msg.replyTo.previewGifUrl ? (
                        <div className="d-flex align-items-center gap-2 mt-1">
                          <img
                            src={msg.replyTo.previewGifUrl}
                            alt="Replied GIF"
                            style={{
                              width: 80,
                              height: 80,
                              objectFit: "cover",
                              borderRadius: 6,
                            }}
                            loading="lazy"
                          />
                          <div className="small text-truncate">
                            {msg.replyTo.previewText ?? "GIF"}
                          </div>
                        </div>
                      ) : msg.replyTo.type === "file" &&
                        msg.replyTo.previewFileUrl &&
                        msg.replyTo.previewFileMimeType?.startsWith("image/") ? (
                        <div className="d-flex align-items-center gap-2 mt-1">
                          <img
                            src={msg.replyTo.previewFileUrl}
                            alt="Replied image"
                            style={{
                              width: 80,
                              height: 80,
                              objectFit: "cover",
                              borderRadius: 6,
                            }}
                            loading="lazy"
                          />
                          <div className="small text-truncate">
                            {msg.replyTo.previewText ?? "Image"}
                          </div>
                        </div>
                      ) : (
                        <div className="small text-truncate">{msg.replyTo.previewText ?? ""}</div>
                      )}
                    </button>
                  )}

                  {msg.type === "gif" ? (
                    <div>
                      {msg.gifUrl && (
                        <span
                          className={privacyMode ? "sl-privacy-media" : undefined}
                          style={{ width: 220, borderRadius: 8 }}
                        >
                          <img
                            src={msg.gifUrl}
                            alt="GIF"
                            style={{ width: 220, height: "auto", borderRadius: 8 }}
                            loading="lazy"
                            role="button"
                            tabIndex={0}
                            onClick={() => setImagePreview({ url: msg.gifUrl!, title: "GIF" })}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault()
                                setImagePreview({ url: msg.gifUrl!, title: "GIF" })
                              }
                            }}
                          />
                          {privacyMode && <span className="sl-privacy-mask" />}
                        </span>
                      )}
                      {msg.text && (
                        <div style={{ whiteSpace: "pre-wrap" }} className="mt-2">
                          {renderEmojiText(msg.text)}
                        </div>
                      )}
                    </div>
                  ) : msg.type === "file" ? (
                    (() => {
                      const url = msg.fileUrl
                      const isImage =
                        msg.mimeType?.startsWith("image/") ||
                        /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(url.toLowerCase())
                      const isVideo =
                        msg.mimeType?.startsWith("video/") ||
                        /\.(mp4|webm|ogg|mov|m4v|avi|mkv)$/i.test(url.toLowerCase())
                      const linkClass = isOutgoing ? "sl-bubble-link-out" : "sl-bubble-link-in"
                      return (
                        <div>
                          {isImage ? (
                            <button
                              type="button"
                              className={`btn p-0 border-0 ${linkClass}`}
                              onClick={() => setImagePreview({ url, title: msg.fileName ?? "Image" })}
                              title="Preview image"
                              aria-label="Preview image"
                              style={{
                                background: "transparent",
                                boxShadow: "none",
                                display: "inline-flex",
                              }}
                            >
                              <span
                                className={privacyMode ? "sl-privacy-media" : undefined}
                                style={{ width: 220, borderRadius: 8 }}
                              >
                                <img
                                  src={url}
                                  alt={msg.fileName ?? "Image"}
                                  style={{ width: 220, height: "auto", borderRadius: 8 }}
                                  loading="lazy"
                                />
                                {privacyMode && <span className="sl-privacy-mask" />}
                              </span>
                            </button>
                          ) : isVideo ? (
                            <span className={privacyMode ? "sl-privacy-media" : undefined} style={{ borderRadius: 8 }}>
                              <video
                                src={url}
                                controls
                                style={{ width: 240, maxWidth: "100%", borderRadius: 8 }}
                              />
                              {privacyMode && <span className="sl-privacy-mask" />}
                            </span>
                          ) : (
                            <span className={privacyMode ? "sl-privacy-media" : undefined} style={{ borderRadius: 8 }}>
                              <a
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                                className={linkClass}
                                style={{ wordBreak: "break-word" }}
                              >
                                {msg.fileName ?? "Attachment"}
                              </a>
                              {privacyMode && <span className="sl-privacy-mask" />}
                            </span>
                          )}
                          {msg.text && (
                            <div style={{ whiteSpace: "pre-wrap" }} className="mt-2">
                              {renderEmojiText(msg.text)}
                            </div>
                          )}
                        </div>
                      )
                    })()
                  ) : (
                    <div style={{ whiteSpace: "pre-wrap" }}>{renderEmojiText(msg.text ?? "")}</div>
                  )}
                </div>
              )
            })()

            return (
              <div
                key={item.key}
                className={`mb-2 d-flex ${
                  isOutgoing ? "justify-content-end" : "justify-content-start"
                }`}
                style={{ position: "relative" }}
              >
                <div
                  className={`p-2 sl-bubble ${isOutgoing ? "sl-bubble-out" : "sl-bubble-in"}`}
                  ref={(el) => {
                    messageElByIdRef.current[m._id] = el
                  }}
                  style={{
                    maxWidth: "60%",
                    position: "relative",
                    fontSize: "0.95rem",
                    paddingBottom: m.reactions && m.reactions.length > 0 ? 28 : undefined,
                    outline: isHighlighted ? "2px solid var(--bs-warning)" : undefined,
                    outlineOffset: isHighlighted ? 2 : undefined,
                    filter: privacyMode ? "blur(10px)" : undefined,
                    cursor: privacyMode ? "pointer" : undefined,
                    transition: privacyMode ? "filter 0.2s ease" : undefined,
                  }}
                  onContextMenu={(e) => openMessageMenu(m, isOutgoing, e)}
                  onMouseEnter={() => {
                    if (privacyMode) {
                      const el = messageElByIdRef.current[m._id]
                      if (el) el.style.filter = "blur(0px)"
                    }
                  }}
                  onMouseLeave={() => {
                    if (privacyMode) {
                      const el = messageElByIdRef.current[m._id]
                      if (el) el.style.filter = "blur(10px)"
                    }
                  }}
                >
                  {bubble}
                  <div
                    className={`text-end small mt-1 sl-bubble-meta ${
                      isOutgoing ? "sl-bubble-meta-out" : "sl-bubble-meta-in"
                    }`}
                  >
                    {timeLabel}
                    {m.editedAt && <span className="ms-1">· edited</span>}
                    {isLastOutgoing && (
                      <>
                        {" "}
                        - {m.seen ? "Seen" : "Sent"}
                      </>
                    )}
                  </div>

                  {m.reactions && m.reactions.length > 0 && (
                    <div
                      style={{
                        marginTop: 6,
                        width: "100%",
                        display: "flex",
                        gap: 6,
                        flexWrap: "wrap",
                        // outgoing(sender) -> bottom-left, incoming(receiver) -> bottom-right
                        justifyContent: isOutgoing ? "flex-start" : "flex-end",
                      }}
                    >
                      {m.reactions.map((reaction) => (
                        <button
                          key={reaction.emoji}
                          type="button"
                          onClick={async () => {
                            const myEmoji = getMyReactionEmoji(m, sender)
                            if (!myEmoji) return
                            const isTogglingOff = myEmoji === reaction.emoji
                            const targetEmoji = reaction.emoji

                            applyReactionLocally(
                              m._id,
                              isTogglingOff ? myEmoji ?? targetEmoji : targetEmoji,
                              sender,
                              !isTogglingOff,
                            )
                            try {
                              if (isTogglingOff) {
                                await removeReaction(m._id, targetEmoji, sender)
                                socketService.removeReaction(m._id, targetEmoji, sender)
                              } else {
                                await addReaction(m._id, targetEmoji, sender)
                                socketService.addReaction(m._id, targetEmoji, sender)
                              }
                            } catch (e) {
                              console.error("Failed to manage reaction", e)
                            }
                          }}
                          title={`${reaction.users.join(", ")} reacted`}
                          style={{
                            border: "1px solid rgba(0,0,0,0.12)",
                            background: isOutgoing
                              ? "rgba(255,255,255,0.92)"
                              : "rgba(248,249,250,0.95)",
                            color: "#212529",
                            borderRadius: 999,
                            padding: "2px 8px",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            lineHeight: 1,
                            fontSize: 13,
                            cursor: getMyReactionEmoji(m, sender) ? "pointer" : "not-allowed",
                            opacity: reaction.users.includes(sender) ? 1 : 0.7,
                            fontFamily:
                              "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji",
                          }}
                          disabled={!getMyReactionEmoji(m, sender)}
                        >
                          <span style={{ fontSize: 15, lineHeight: 1 }}>{reaction.emoji}</span>
                          <span style={{ fontSize: 12, lineHeight: 1 }}>{reaction.users.length}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {reactionPickerMessageId === m._id && (
                  <div
                    className="position-absolute bg-body border rounded shadow-sm p-2"
                    style={{
                      top: "-40px",
                      left: "50%",
                      transform: "translateX(-50%)",
                      zIndex: 1001,
                      width: 320,
                      maxWidth: "75vw",
                    }}
                  >
                    <EmojiPicker
                      height={340}
                      width="100%"
                      lazyLoadEmojis
                      emojiStyle={EmojiStyle.TWITTER}
                      searchPlaceHolder="Search emoji..."
                      theme={pickerTheme}
                      onEmojiClick={(emojiData: EmojiClickData) => {
                        const emoji = emojiData.emoji
                        void (async () => {
                          const myEmoji = getMyReactionEmoji(m, sender)
                          const isTogglingOff = myEmoji === emoji
                          applyReactionLocally(m._id, emoji, sender, !isTogglingOff)
                          try {
                            if (isTogglingOff) {
                              await removeReaction(m._id, emoji, sender)
                              socketService.removeReaction(m._id, emoji, sender)
                            } else {
                              await addReaction(m._id, emoji, sender)
                              socketService.addReaction(m._id, emoji, sender)
                            }
                          } catch (e) {
                            console.error("Failed to add reaction", e)
                          } finally {
                            setReactionPickerMessageId(null)
                          }
                        })()
                      }}
                    />
                  </div>
                )}
              </div>
            )
          })}
          <div ref={messagesEndRef} />
        </div>

        {messageMenu && (
          <>
            <div
              style={{ position: "fixed", inset: 0, zIndex: 1999 }}
              onClick={() => setMessageMenu(null)}
            />
            <div
              className="bg-body border rounded shadow-sm p-1"
              style={{
                position: "fixed",
                top: messageMenu.top,
                left: messageMenu.left,
                zIndex: 2000,
                minWidth: 220,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {(() => {
                const m = messagesRef.current.find((x) => x._id === messageMenu.messageId)
                if (!m) return null

                const decoded = decodeRichMessage(m.message)
                const plain = decoded.kind === "plain" ? decoded.value.trim() : ""
                const looksLikeSingleGifUrl =
                  decoded.kind === "plain" && isLikelyGifUrl(plain) && !/\s/.test(plain)
                const canEdit =
                  (decoded.kind === "plain" && !looksLikeSingleGifUrl) ||
                  (decoded.kind === "rich" &&
                    (decoded.value.type === "text" || decoded.value.type === "gif"))
                const canManage = m.sender === sender
                const isFileMsg = decoded.kind === "rich" && decoded.value.type === "file"

                return (
                  <>
                    <div className="d-flex align-items-center gap-1 sl-msg-menu-row">
                      <button
                        type="button"
                        className="btn btn-sm sl-menu-icon-btn"
                        title="React"
                        aria-label="React"
                        onClick={() => {
                          setReactionPickerMessageId(m._id)
                          setMessageMenu(null)
                        }}
                      >
                        {"\u263A\uFE0F"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm sl-menu-icon-btn"
                        title="Copy message"
                        aria-label="Copy message"
                        onClick={async () => {
                          const text = getCopyTextForMessage(m.message)
                          try {
                            await navigator.clipboard.writeText(text)
                          } catch (e) {
                            console.error("Copy failed", e)
                          } finally {
                            setMessageMenu(null)
                          }
                        }}
                      >
                        {"\u29C9"}
                      </button>

                      {canManage && canEdit && (
                        <button
                          type="button"
                          className="btn btn-sm sl-menu-icon-btn"
                          title="Edit message"
                          aria-label="Edit message"
                          onClick={() => {
                            setReplyTo(null)
                            setSelectedGifUrl(null)
                            setShowEmojiPicker(false)
                            setShowGifPicker(false)

                            setEditingMessageId(m._id)
                            setEditBase(
                              decoded.kind === "plain"
                                ? { kind: "plain", value: decoded.value }
                                : { kind: "rich", value: decoded.value },
                            )
                            setInput(
                              decoded.kind === "plain" ? decoded.value : decoded.value.text ?? "",
                            )
                            setEditError(null)
                            setMessageMenu(null)
                            inputRef.current?.focus()
                          }}
                        >
                          {"\u270E"}
                        </button>
                      )}

                      <button
                        type="button"
                        className="btn btn-sm sl-menu-icon-btn"
                        title="Reply"
                        aria-label="Reply"
                        onClick={() => {
                          setEditingMessageId(null)
                          setEditBase(null)
                          setEditError(null)
                          setInput("")
                          const preview = makeReplyPreview(m.message)
                          setReplyTo({ id: m._id, sender: m.sender, ...preview })
                          setMessageMenu(null)
                          inputRef.current?.focus()
                        }}
                      >
                        {"\u21A9\uFE0E"}
                      </button>

                    {canManage && (
                      <button
                        type="button"
                        className="btn btn-sm sl-menu-icon-btn"
                        title={isFileMsg ? "Delete file" : "Delete message"}
                        aria-label="Delete"
                        onClick={async () => {
                          try {
                            await deleteMessage(messageMenu.messageId)
                            socketService.deleteMessage(messageMenu.messageId)
                            setMessages((prev) =>
                              prev.filter((x) => x._id !== messageMenu.messageId),
                            )
                            setMessageMenu(null)
                          } catch (e) {
                            console.error("Failed to delete message", e)
                          }
                        }}
                      >
                        {"\u{1F5D1}\uFE0E"}
                      </button>
                    )}
                    </div>
                  </>
                )
              })()}
            </div>
          </>
        )}

        {/* Input */}
        {selectedUser && (
          <div className="p-3 border-top" style={{ position: "relative" }}>
            {sendError && (
              <div className="alert alert-warning py-2 mb-2">{sendError}</div>
            )}
            {uploadError && (
              <div className="alert alert-warning py-2 mb-2">{uploadError}</div>
            )}
            {uploadTasks.length > 0 && (
              <div className="border rounded bg-body p-2 mb-2">
                <div className="small fw-semibold">Uploading…</div>
                <div className="small text-body-secondary">
                  {uploadTasks.map((t) => `${t.name} (${t.progress}%)`).join(" · ")}
                </div>
              </div>
            )}
            {editingMessageId && (
              <div className="border rounded bg-body p-2 mb-2 d-flex align-items-start justify-content-between gap-2">
                <div style={{ minWidth: 0 }}>
                  <div className="small fw-semibold">Editing message</div>
                  <div className="small text-body-secondary text-truncate">
                    Press Enter to update, Esc to cancel
                  </div>
                  {editError && <div className="text-danger small mt-1">{editError}</div>}
                </div>
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  onClick={() => {
                    setEditingMessageId(null)
                    setEditBase(null)
                    setEditError(null)
                    setInput("")
                  }}
                  aria-label="Cancel edit"
                  title="Cancel edit"
                >
                  {"\u2715"}
                </button>
              </div>
            )}
            {!editingMessageId && replyTo && (
              <div
                className="border rounded bg-body p-2 mb-2 d-flex align-items-start justify-content-between gap-2"
                style={{
                  filter: privacyMode ? "blur(10px)" : undefined,
                  cursor: privacyMode ? "pointer" : undefined,
                  transition: privacyMode ? "filter 0.2s ease" : undefined,
                }}
                onMouseEnter={(e) => {
                  if (privacyMode) e.currentTarget.style.filter = "blur(0px)"
                }}
                onMouseLeave={(e) => {
                  if (privacyMode) e.currentTarget.style.filter = "blur(10px)"
                }}
              >
                <div
                  style={{
                    minWidth: 0,
                  }}
                >
                  <div className="small fw-semibold">
                    Replying to{" "}
                    {replyTo.sender === sender ? "You" : selectedUser?.name ?? replyTo.sender}
                  </div>
                  {replyTo.type === "gif" && replyTo.previewGifUrl ? (
                    <div className="d-flex align-items-center gap-2 mt-1">
                      <img
                        src={replyTo.previewGifUrl}
                        alt="Replied GIF"
                        style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 6 }}
                        loading="lazy"
                      />
                      <div className="small text-truncate">{replyTo.previewText ?? "GIF"}</div>
                    </div>
                  ) : replyTo.type === "file" &&
                    replyTo.previewFileUrl &&
                    replyTo.previewFileMimeType?.startsWith("image/") ? (
                    <div className="d-flex align-items-center gap-2 mt-1">
                      <img
                        src={replyTo.previewFileUrl}
                        alt="Replied image"
                        style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 6 }}
                        loading="lazy"
                      />
                      <div className="small text-truncate">
                        {replyTo.previewText ?? "Image"}
                      </div>
                    </div>
                  ) : (
                    <div className="small text-truncate">{replyTo.previewText ?? ""}</div>
                  )}
                </div>
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  onClick={() => setReplyTo(null)}
                  aria-label="Cancel reply"
                  title="Cancel reply"
                >
                  {"\u2715"}
                </button>
              </div>
            )}

            {!editingMessageId && selectedGifUrl && (
              <div className="border rounded bg-body p-2 mb-2 d-flex align-items-start justify-content-between gap-2">
                <div className="d-flex align-items-center gap-2" style={{ minWidth: 0 }}>
                  <span className={privacyMode ? "sl-privacy-media" : undefined} style={{ borderRadius: 8 }}>
                    <img
                      src={selectedGifUrl}
                      alt="Selected GIF"
                      style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 8 }}
                      loading="lazy"
                    />
                    {privacyMode && <span className="sl-privacy-mask" />}
                  </span>
                  <div className="small text-truncate">GIF selected</div>
                </div>
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  onClick={() => setSelectedGifUrl(null)}
                  aria-label="Remove GIF"
                  title="Remove GIF"
                >
                  {"\u2715"}
                </button>
              </div>
            )}
            <div className="d-flex align-items-center">
              <input
                ref={fileInputRef}
                type="file"
                className="d-none"
                accept="image/*,video/*,application/pdf"
                multiple
                onChange={onFileInputChange}
              />
              <button
                type="button"
                className="btn btn-outline-secondary me-2"
                onClick={() => {
                  setShowEmojiPicker((v) => !v)
                  setShowGifPicker(false)
                }}
                aria-label="Toggle emoji picker"
                title="Emojis"
              >
                {"\u{1F60A}"}
              </button>
              <textarea
                ref={inputRef}
                className="form-control"
                rows={3}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onPaste={onPasteUpload}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return
                  if (e.nativeEvent.isComposing) return
                  if (e.shiftKey) {
                    // allow newline insertion
                    return
                  }
                  e.preventDefault()
                  void sendMessage()
                }}
                onKeyUp={(e) => {
                  if (e.key === "Escape" && editingMessageId) {
                    setEditingMessageId(null)
                    setEditBase(null)
                    setEditError(null)
                    setInput("")
                  }
                }}
                placeholder={
                  editingMessageId
                    ? "Edit message..."
                    : selectedGifUrl
                      ? "Add a caption (optional)..."
                      : "Type a message..."
                }
              />
              <button
                type="button"
                className="btn btn-outline-secondary ms-2"
                onClick={() => {
                  if (editingMessageId) return
                  setShowGifPicker((v) => !v)
                  setShowEmojiPicker(false)
                }}
                aria-label="Toggle GIF picker"
                title="GIF"
                disabled={Boolean(editingMessageId)}
              >
                GIF
              </button>
              <button
                type="button"
                className="btn btn-outline-secondary ms-2"
                onClick={onPickFiles}
                aria-label="Upload file"
                title="Upload file"
                disabled={Boolean(editingMessageId)}
              >
                {"\u{1F4CE}"}
              </button>
              <button className="btn btn-success ms-2" onClick={sendMessage}>
                {editingMessageId ? "Update" : "Send"}
              </button>
            </div>

            {/[\\uD83C\\uD83D\\uD83E]/.test(input) && (
              <div
                className="small text-body-secondary mt-1"
                title="Emoji preview (for flags)"
                onClick={() => inputRef.current?.focus()}
                style={{ cursor: "text" }}
              >
                {renderEmojiText(input)}
              </div>
            )}

            {/* Panels below composer */}
            {showEmojiPicker && (
              <div ref={emojiContainerRef} className="border rounded shadow-sm bg-body p-2 mt-2" style={{ width: "100%" }}>
                <div className="d-flex align-items-center justify-content-between mb-2">
                  <div className="small fw-semibold text-body-secondary">Emojis</div>
                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm"
                    onClick={() => setShowEmojiPicker(false)}
                    aria-label="Close emoji picker"
                    title="Close"
                  >
                    {"\u2715"}
                  </button>
                </div>
                <EmojiPicker
                  height={isMobileLayout ? 300 : 360}
                  width="100%"
                  lazyLoadEmojis
                  emojiStyle={EmojiStyle.TWITTER}
                  searchPlaceHolder="Search emoji..."
                  theme={pickerTheme}
                  onEmojiClick={(emojiData: EmojiClickData) => {
                    insertIntoInputAtCursor(emojiData.emoji)
                  }}
                />
              </div>
            )}

            {!editingMessageId && showGifPicker && (
              <div className="border rounded shadow-sm bg-body p-2 mt-2" style={{ width: "100%" }}>
                <div className="d-flex align-items-center justify-content-between mb-2">
                  <div className="small fw-semibold text-body-secondary">GIFs</div>
                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm"
                    onClick={() => setShowGifPicker(false)}
                    aria-label="Close GIF picker"
                    title="Close"
                  >
                    {"\u2715"}
                  </button>
                </div>

                <div className="d-flex gap-2 mb-2">
                  <input
                    className="form-control"
                    value={gifQuery}
                    onChange={(e) => setGifQuery(e.target.value)}
                    placeholder={
                      gifProvider === "none"
                        ? "Set VITE_KLIPY_API_KEY (recommended) or VITE_GIPHY_API_KEY or VITE_TENOR_API_KEY"
                        : "Search GIFs..."
                    }
                    disabled={gifProvider === "none"}
                  />
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={() => {
                      setGifQuery("")
                      setGifResults([])
                      setGifError(null)
                      setGifCursor(null)
                    }}
                    title="Clear search"
                    aria-label="Clear GIF search"
                  >
                    Clear
                  </button>
                </div>

                {gifError && <div className="text-danger small mb-2">{gifError}</div>}
                {gifProvider === "none" && (
                  <div className="alert alert-warning py-2 mb-2">
                    Add `VITE_KLIPY_API_KEY` (recommended) to see Trending/search GIFs.
                  </div>
                )}
                {gifLoading && <div className="text-body-secondary small mb-2">Loading GIFs...</div>}
                {!gifLoading && !gifError && gifQuery.trim().length === 0 && (
                  <div className="text-body-secondary small mb-2">Trending</div>
                )}

                {gifResults.length > 0 && (
                  <div
                    className="d-grid gap-2"
                    style={{
                      gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                      maxHeight: 240,
                      overflowY: "auto",
                    }}
                    ref={gifResultsContainerRef}
                    onScroll={() => {
                      const el = gifResultsContainerRef.current
                      if (!el) return
                      const remaining = el.scrollHeight - (el.scrollTop + el.clientHeight)
                      if (remaining < 240) void loadMoreGifs()
                    }}
                  >
                    {gifResults.map((g) => (
                      <button
                        key={g.url}
                        type="button"
                        className="btn btn-light p-1 border"
                        onClick={() => {
                          setSelectedGifUrl(g.url)
                          setGifError(null)
                          setShowGifPicker(false)
                          inputRef.current?.focus()
                        }}
                        title="Select GIF"
                        aria-label="Select GIF"
                      >
                        <span
                          className={privacyMode ? "sl-privacy-media" : undefined}
                          style={{ width: "100%", borderRadius: 6 }}
                        >
                          <img
                            src={g.previewUrl ?? g.url}
                            alt="GIF option"
                            style={{ width: "100%", height: 72, objectFit: "cover", borderRadius: 6 }}
                            loading="lazy"
                          />
                          {privacyMode && <span className="sl-privacy-mask" />}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {gifLoadingMore && (
                  <div className="text-body-secondary small mt-2">Loading more...</div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default Chat
