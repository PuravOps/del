import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react"
import { getMessages, getUnseenCounts, getUsers } from "../services/api"
import { socketService } from "./ChatService"
import type { MessageResponse, SendMessagePayload } from "../types/chat.types"
import { usePageActivity } from "../utils/usePageActivity"
import {
  decodeRichMessage,
  encodeRichMessage,
  makeReplyPreview,
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

  const inputRef = useRef<HTMLInputElement | null>(null)
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

      return decoded.value.text ?? ""
    },
    [],
  )

  const openMessageMenu = useCallback(
    (m: MessageResponse, isOutgoing: boolean, e: MouseEvent<HTMLDivElement>) => {
      e.preventDefault()

      const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
      const MENU_W = 150
      const MENU_H = 92

      let left = isOutgoing ? rect.left - MENU_W - 8 : rect.right + 8
      left = Math.max(8, Math.min(left, window.innerWidth - MENU_W - 8))

      let top = rect.top
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
          q ? "https://api.giphy.com/v1/gifs/search" : "https://api.giphy.com/v1/gifs/trending",
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
        (m.sender === sender && m.receiver === selectedUser.phone) ||
        (m.sender === selectedUser.phone && m.receiver === sender),
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

  const emojis = useMemo(
    () => ["😀", "😁", "😂", "🤣", "😊", "😍", "😘", "😎", "🤔", "😢", "😡", "👍", "👎", "🙏", "👏", "🎉", "❤️", "🔥"],
    [],
  )

  useEffect(() => {
    if (!selectedUser) return
    if (!shouldAutoScroll) return
    scrollToBottom("smooth")
  }, [filteredMessages.length, scrollToBottom, selectedUser, shouldAutoScroll])

  useEffect(() => {
    if (!sender) return

    const handleReceive = (msg: MessageResponse) => {
      const isCurrentThread = Boolean(
        selectedUser &&
          ((msg.sender === sender && msg.receiver === selectedUser.phone) ||
            (msg.sender === selectedUser.phone && msg.receiver === sender)),
      )

      if (isCurrentThread) {
        setMessages((prev) => [...prev, msg])
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

    return () => {
      socketService.offReceiveMessage(handleReceive)
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

  const sendMessage = async () => {
    const trimmed = input.trim()
    if (!selectedUser || !sender) return
    if (!trimmed && !selectedGifUrl) return
    setSendError(null)

    const replyPayload: RichReplyToV1 | undefined = replyTo
      ? {
          id: replyTo.id,
          sender: replyTo.sender,
          type: replyTo.type,
          previewText: replyTo.previewText,
          previewGifUrl: replyTo.previewGifUrl,
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

    const payload: SendMessagePayload = {
      sender,
      receiver: selectedUser.phone,
      message: outgoingMessage,
    }

    socketService.sendMessage(payload)
    setUnreadCounts((prev) => ({ ...prev, [selectedUser.phone]: 0 }))
    socketService.markSeen({ sender: selectedUser.phone, receiver: sender })
    window.dispatchEvent(new Event("unreadCountsChanged"))
    setInput("")
    setReplyTo(null)
    setSelectedGifUrl(null)
    setShowEmojiPicker(false)
    setShowGifPicker(false)
    scrollToBottom("smooth")

    // try {
    //   await saveMessage(payload)
    // } catch (e) {
    //   console.error("Message sent but not saved to DB", e)
    //   setSendError("Message sent, but it wasn't saved. Check API/DB logs.")
    // }
  }

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

  return (
    <div className="d-flex" style={{ height: "80vh", border: "1px solid #ddd" }}>
      
      {/* LEFT SIDE - USER LIST */}
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
              onClick={() => {
                setSelectedUser(user)
                setReplyTo(null)
                setSelectedGifUrl(null)
                setShowEmojiPicker(false)
                setShowGifPicker(false)
                if (sender) {
                  setUnreadCounts((prev) => ({ ...prev, [user.phone]: 0 }))
                  socketService.markSeen({ sender: user.phone, receiver: sender })
                  window.dispatchEvent(new Event("unreadCountsChanged"))
                }
              }}
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

      {/* RIGHT SIDE - CHAT AREA */}
      <div className="flex-grow-1 d-flex flex-column">
        
        {/* Header */}
        <div className="p-3 border-bottom bg-body">
          {selectedUser ? (
            <strong>{selectedUser.name}</strong>
          ) : (
            "Select a user"
          )}
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
                    <img
                      src={plain}
                      alt="GIF"
                      style={{ maxWidth: "100%", borderRadius: 8 }}
                      loading="lazy"
                    />
                  )
                }
                return <div style={{ whiteSpace: "pre-wrap" }}>{decoded.value}</div>
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
                              width: 46,
                              height: 46,
                              objectFit: "cover",
                              borderRadius: 6,
                            }}
                            loading="lazy"
                          />
                          <div className="small text-truncate">
                            {msg.replyTo.previewText ?? "GIF"}
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
                        <img
                          src={msg.gifUrl}
                          alt="GIF"
                          style={{ maxWidth: "100%", borderRadius: 8 }}
                          loading="lazy"
                        />
                      )}
                      {msg.text && (
                        <div style={{ whiteSpace: "pre-wrap" }} className="mt-2">
                          {msg.text}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ whiteSpace: "pre-wrap" }}>{msg.text ?? ""}</div>
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
              >
                <div
                  className={`p-2 rounded ${
                    isOutgoing ? "bg-success text-white" : "bg-body border"
                  }`}
                  ref={(el) => {
                    messageElByIdRef.current[m._id] = el
                  }}
                  style={{
                    maxWidth: "60%",
                    position: "relative",
                    outline: isHighlighted ? "2px solid var(--bs-warning)" : undefined,
                    outlineOffset: isHighlighted ? 2 : undefined,
                  }}
                  onContextMenu={(e) => openMessageMenu(m, isOutgoing, e)}
                >
                  <div>{bubble}</div>
                  <div
                    className={`text-end small mt-1 ${
                      isOutgoing ? "text-white-50" : "text-body-secondary"
                    }`}
                  >
                    {timeLabel}
                    {isLastOutgoing && (
                      <>
                        {" "}
                        - {m.seen ? "Seen" : "Sent"}
                      </>
                    )}
                  </div>
                </div>
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
                minWidth: 150,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="btn btn-sm btn-light w-100 text-start"
                onClick={async () => {
                  const m = messagesRef.current.find((x) => x._id === messageMenu.messageId)
                  if (!m) {
                    setMessageMenu(null)
                    return
                  }
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
                Copy message
              </button>
              <button
                type="button"
                className="btn btn-sm btn-light w-100 text-start mt-1"
                onClick={() => {
                  const m = messagesRef.current.find((x) => x._id === messageMenu.messageId)
                  if (!m) {
                    setMessageMenu(null)
                    return
                  }
                  const preview = makeReplyPreview(m.message)
                  setReplyTo({ id: m._id, sender: m.sender, ...preview })
                  setMessageMenu(null)
                  inputRef.current?.focus()
                }}
              >
                Reply
              </button>
            </div>
          </>
        )}

        {/* Input */}
        {selectedUser && (
          <div className="p-3 border-top">
            {sendError && (
              <div className="alert alert-warning py-2 mb-2">{sendError}</div>
            )}
            {replyTo && (
              <div className="border rounded bg-body p-2 mb-2 d-flex align-items-start justify-content-between gap-2">
                <div style={{ minWidth: 0 }}>
                  <div className="small fw-semibold">
                    Replying to{" "}
                    {replyTo.sender === sender ? "You" : selectedUser?.name ?? replyTo.sender}
                  </div>
                  {replyTo.type === "gif" && replyTo.previewGifUrl ? (
                    <div className="d-flex align-items-center gap-2 mt-1">
                      <img
                        src={replyTo.previewGifUrl}
                        alt="Replied GIF"
                        style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 6 }}
                        loading="lazy"
                      />
                      <div className="small text-truncate">{replyTo.previewText ?? "GIF"}</div>
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
                  ✕
                </button>
              </div>
            )}

            {selectedGifUrl && (
              <div className="border rounded bg-body p-2 mb-2 d-flex align-items-start justify-content-between gap-2">
                <div className="d-flex align-items-center gap-2" style={{ minWidth: 0 }}>
                  <img
                    src={selectedGifUrl}
                    alt="Selected GIF"
                    style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8 }}
                    loading="lazy"
                  />
                  <div className="small text-truncate">GIF selected</div>
                </div>
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  onClick={() => setSelectedGifUrl(null)}
                  aria-label="Remove GIF"
                  title="Remove GIF"
                >
                  ✕
                </button>
              </div>
            )}
            {showEmojiPicker && (
              <div className="border rounded bg-body p-2 mb-2">
                <div className="d-flex flex-wrap gap-2">
                  {emojis.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      className="btn btn-outline-secondary btn-sm"
                      onClick={() => {
                        setInput((prev) => `${prev}${emoji}`)
                        inputRef.current?.focus()
                      }}
                      aria-label={`Insert ${emoji}`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {showGifPicker && (
              <div className="border rounded bg-body p-2 mb-2">
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
                {gifProvider === "giphy" && (
                  <div className="text-body-secondary small mb-2">Powered by GIPHY</div>
                )}
                {gifProvider === "klipy" && (
                  <div className="text-body-secondary small mb-2">Powered by KLIPY</div>
                )}

                {gifResults.length > 0 && (
                  <div
                    className="d-grid gap-2"
                  style={{
                    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                    maxHeight: 320,
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
                        <img
                          src={g.previewUrl ?? g.url}
                          alt="GIF option"
                          style={{ width: "100%", height: 70, objectFit: "cover", borderRadius: 6 }}
                          loading="lazy"
                        />
                      </button>
                    ))}
                  </div>
                )}

                {gifProvider === "none" && (
                  <div className="text-body-secondary small mt-2">
                    Tip: add `VITE_KLIPY_API_KEY` (or `VITE_GIPHY_API_KEY` / `VITE_TENOR_API_KEY`) to enable GIF search.
                  </div>
                )}

                {gifLoadingMore && (
                  <div className="text-body-secondary small mt-2">Loading more...</div>
                )}
              </div>
            )}

            <div className="d-flex align-items-center">
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
                😊
              </button>
              <button
                type="button"
                className="btn btn-outline-secondary me-2"
                onClick={() => {
                  setShowGifPicker((v) => !v)
                  setShowEmojiPicker(false)
                }}
                aria-label="Toggle GIF picker"
                title="GIF"
              >
                GIF
              </button>
              <input
                ref={inputRef}
                className="form-control me-2"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return
                  if (e.nativeEvent.isComposing) return
                  e.preventDefault()
                  void sendMessage()
                }}
                placeholder={selectedGifUrl ? "Add a caption (optional)..." : "Type a message..."}
              />
              <button className="btn btn-success" onClick={sendMessage}>
                Send
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default Chat
