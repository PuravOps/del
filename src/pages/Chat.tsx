import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react"
import type { ClipboardEvent, ChangeEvent, CSSProperties, Dispatch, MutableRefObject, SetStateAction } from "react"
import {
  getMessages,
  getUnseenCounts,
  getUsers,
  deleteMessage,
  updateMessage,
  addReaction,
  removeReaction,
  getUserPresence,
  getChatMedia,
  getChatFiles,
  getChatLinks,
  setMessageStarred,
  getChatStarredMessages,
  setMessagePinned,
  getChatPinnedMessages,
  getPrivateNotesVault,
  createPrivateNotesVault,
  updatePrivateNotesVault,
} from "../services/api"
import axios from "axios"
import { socketService } from "./ChatService"
import TicTacToeCard from "../components/TicTacToeCard"
import { encodeGameMessage, decodeGameMessage, type TicTacToePayloadV1 } from "../utils/gameMessage"
import type {
  MessageResponse,
  SendMessagePayload,
  SharedContentCollection,
} from "../types/chat.types"
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
import { extractSharedContent, isGifUrl } from "../utils/chatSharedContent"
import type { User, UserPresenceResponse } from "../types/user.types"
import type { ChatEffectKind, ChatEffectPayload, PresenceUpdatePayload, TypingUpdatePayload } from "../services/socket"
import type { PrivateNote } from "../types/privateNotes.types"

const PAGE_SIZE = 30
const TYPING_STOP_DELAY_MS = 1200
const EMPTY_SHARED_CONTENT: SharedContentCollection = { media: [], files: [], links: [] }
const STARRED_STORAGE_PREFIX = "sl-starred-messages:"
const MAX_PINNED_MESSAGES = 3
const CONFETTI_COLORS = ["#ff4d6d", "#ffd166", "#06d6a0", "#118ab2", "#8338ec", "#fb8500"]
const CONFETTI_CANNON_COUNT = 36
const CONFETTI_RAIN_COUNT = 30
const PUNCH_IMPACT_COUNT = 16
const LOVE_HEART_COUNT = 34

const createChatEffectEventId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

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

const formatLastSeenLabel = (iso: string | null | undefined) => {
  if (!iso) return "Offline"

  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return "Offline"

  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfThatDay = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const diffDays = Math.round(
    (startOfToday.getTime() - startOfThatDay.getTime()) / (24 * 60 * 60 * 1000),
  )

  const time = formatTimeLabel(iso)
  if (diffDays === 0) return `Last seen today at ${time}`
  if (diffDays === 1) return `Last seen yesterday at ${time}`
  return `Last seen ${formatDateLabel(iso)} at ${time}`
}

const formatFileSize = (bytes?: number) => {
  if (!bytes || bytes <= 0) return null
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

const formatNoteDateTimeLabel = (iso: string) => {
  const d = new Date(iso)

  if (Number.isNaN(d.getTime())) return "-"

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d)
}

const toDateTimeLocalValue = (iso: string | null | undefined) => {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""

  const pad = (n: number) => String(n).padStart(2, "0")
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}T${pad(local.getHours())}:${pad(local.getMinutes())}`
}

const getActiveReminderAt = (note: PrivateNote) => note.reminderSnoozedUntil || note.reminderAt || null
const NOTES_REMINDER_SYNC_EVENT = "privateNotesReminderSessionSync"
const NOTES_REMINDER_UPDATE_EVENT = "privateNotesReminderNotesUpdated"

const dispatchUnreadCountsChanged = (
  detail?: { kind?: "seen" | "refresh"; sender?: string | null; receiver?: string | null },
) => {
  window.dispatchEvent(new CustomEvent("unreadCountsChanged", { detail }))
}

const getErrorStatus = (error: unknown) => {
  const status = (error as { response?: { status?: unknown } } | null)?.response?.status
  return typeof status === "number" ? status : null
}

const getErrorMessage = (error: unknown, fallback: string) => {
  const message = (error as { response?: { data?: { message?: unknown } } } | null)?.response?.data
    ?.message
  return typeof message === "string" && message.trim() ? message : fallback
}

const isRequestTimeoutError = (error: unknown) =>
  axios.isAxiosError(error) && (error.code === "ECONNABORTED" || error.code === "ERR_CANCELED")

const mergeSharedCollections = (
  primary: SharedContentCollection,
  fallback: SharedContentCollection,
): SharedContentCollection => {
  const media = new Map<string, SharedContentCollection["media"][number]>()
  const files = new Map<string, SharedContentCollection["files"][number]>()
  const links = new Map<string, SharedContentCollection["links"][number]>()

  for (const item of [...primary.media, ...fallback.media]) {
    media.set(`${item.messageId}:${item.url}`, item)
  }
  for (const item of [...primary.files, ...fallback.files]) {
    files.set(`${item.messageId}:${item.url}`, item)
  }
  for (const item of [...primary.links, ...fallback.links]) {
    links.set(`${item.messageId}:${item.url}`, item)
  }

  return {
    media: [...media.values()].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    ),
    files: [...files.values()].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    ),
    links: [...links.values()].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    ),
  }
}

const extractUrlsFromText = (value: string) => value.match(/https?:\/\/[^\s<>"'`]+/gi) ?? []

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
  const [privacyMode, setPrivacyMode] = useState(true)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
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
  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false)
  const [isSharedPanelOpen, setIsSharedPanelOpen] = useState(false)
  const [sharedPanelTab, setSharedPanelTab] = useState<"media" | "files" | "links">("media")
  const [sharedContent, setSharedContent] = useState<SharedContentCollection>(EMPTY_SHARED_CONTENT)
  const [sharedContentLoading, setSharedContentLoading] = useState(false)
  const [sharedContentNotice, setSharedContentNotice] = useState<string | null>(null)
  const [isStarredPanelOpen, setIsStarredPanelOpen] = useState(false)
  const [starredMessageIds, setStarredMessageIds] = useState<string[]>([])
  const [starredMessages, setStarredMessages] = useState<MessageResponse[]>([])
  const [starredMessagesLoading, setStarredMessagesLoading] = useState(false)
  const [starredMessagesNotice, setStarredMessagesNotice] = useState<string | null>(null)
  const [pinnedMessageIds, setPinnedMessageIds] = useState<string[]>([])
  const [pinnedMessages, setPinnedMessages] = useState<MessageResponse[]>([])
  const [pinnedMessagesNotice, setPinnedMessagesNotice] = useState<string | null>(null)
  const [selectedUserPresence, setSelectedUserPresence] = useState<UserPresenceResponse | null>(null)
  const [isNotesOpen, setIsNotesOpen] = useState(false)
  const [notesVaultStatus, setNotesVaultStatus] = useState<"idle" | "loading" | "ready">("idle")
  const [notesLoadAttempt, setNotesLoadAttempt] = useState(0)
  const [notesLoadError, setNotesLoadError] = useState<string | null>(null)
  const [privateNotes, setPrivateNotes] = useState<PrivateNote[]>([])
  const [notesSearchQuery, setNotesSearchQuery] = useState("")
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [noteHeadingInput, setNoteHeadingInput] = useState("")
  const [noteContentInput, setNoteContentInput] = useState("")
  const [noteReminderInput, setNoteReminderInput] = useState("")
  const [notesSaveError, setNotesSaveError] = useState<string | null>(null)
  const [notesPersisting, setNotesPersisting] = useState(false)
  const [isRefreshingChat, setIsRefreshingChat] = useState(false)
  const [confettiRunId, setConfettiRunId] = useState(0)
  const [punchRunId, setPunchRunId] = useState(0)
  const [loveRunId, setLoveRunId] = useState(0)
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
  const typingStopTimerRef = useRef<number | null>(null)
  const typingActiveTargetRef = useRef<string | null>(null)
  const lastHeartbeatAtRef = useRef(0)
  const confettiTimerRef = useRef<number | null>(null)
  const punchTimerRef = useRef<number | null>(null)
  const loveTimerRef = useRef<number | null>(null)
  const localChatEffectEventIdsRef = useRef<Set<string>>(new Set())
  const didAutoSelectInitialUserRef = useRef(false)

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

  const emitPresenceHeartbeat = useCallback(
    (activeThreadPhone?: string | null) => {
      if (!sender) return
      if (!isPageActive) return

      const now = Date.now()
      if (now - lastHeartbeatAtRef.current < 4000) return

      lastHeartbeatAtRef.current = now
      socketService.heartbeat({
        userPhone: sender,
        activeThreadPhone: activeThreadPhone ?? selectedUser?.phone ?? null,
        isChatActive: true,
      })
    },
    [isPageActive, selectedUser?.phone, sender],
  )

  const stopTypingIndicator = useCallback(
    (targetUserPhone?: string | null) => {
      const target = targetUserPhone ?? typingActiveTargetRef.current
      if (!sender || !target) return

      socketService.stopTyping({ userPhone: sender, targetUserPhone: target })
      typingActiveTargetRef.current = null
      if (typingStopTimerRef.current) {
        window.clearTimeout(typingStopTimerRef.current)
        typingStopTimerRef.current = null
      }
    },
    [sender],
  )

  const scheduleTypingStop = useCallback(
    (targetUserPhone: string) => {
      if (typingStopTimerRef.current) window.clearTimeout(typingStopTimerRef.current)
      typingStopTimerRef.current = window.setTimeout(() => {
        stopTypingIndicator(targetUserPhone)
      }, TYPING_STOP_DELAY_MS)
    },
    [stopTypingIndicator],
  )

  const startTypingIndicator = useCallback(
    (targetUserPhone: string) => {
      if (!sender || !targetUserPhone) return
      if (typingActiveTargetRef.current !== targetUserPhone) {
        socketService.startTyping({ userPhone: sender, targetUserPhone })
      }
      typingActiveTargetRef.current = targetUserPhone
      scheduleTypingStop(targetUserPhone)
    },
    [scheduleTypingStop, sender],
  )

  const presenceLabel = useMemo(() => {
    if (!selectedUserPresence) return ""
    if (selectedUserPresence.isTyping) return "Typing..."
    if (selectedUserPresence.status === "online") return "Online"
    if (selectedUserPresence.status === "away") {
      return formatLastSeenLabel(selectedUserPresence.lastActiveAt)
    }
    return formatLastSeenLabel(selectedUserPresence.lastActiveAt)
  }, [selectedUserPresence])

  const resetNotesEditor = useCallback(() => {
    setEditingNoteId(null)
    setNoteHeadingInput("")
    setNoteContentInput("")
    setNoteReminderInput("")
    setNotesSaveError(null)
  }, [])

  const lockNotes = useCallback(() => {
    setPrivateNotes([])
    setNotesSearchQuery("")
    setNotesLoadError(null)
    setNotesPersisting(false)
    resetNotesEditor()
  }, [resetNotesEditor])

  const filteredPrivateNotes = useMemo(() => {
    const query = notesSearchQuery.trim().toLowerCase()
    const source = [...privateNotes].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    )

    if (!query) return source

    return source.filter((note) => {
      const heading = note.heading.toLowerCase()
      const content = note.content.toLowerCase()
      return heading.includes(query) || content.includes(query)
    })
  }, [notesSearchQuery, privateNotes])

  const persistPrivateNotes = useCallback(
    async (nextNotes: PrivateNote[]) => {
      if (!selectedUser || !sender) {
        throw new Error("Open a chat before saving notes.")
      }

      const response =
        notesVaultStatus === "idle"
          ? await createPrivateNotesVault(selectedUser.phone, { notes: nextNotes }, { timeout: 10000 })
          : await updatePrivateNotesVault(selectedUser.phone, { notes: nextNotes }, { timeout: 10000 })

      setPrivateNotes(Array.isArray(response.data?.notes) ? response.data.notes : nextNotes)
      setNotesVaultStatus("ready")
    },
    [notesVaultStatus, selectedUser, sender],
  )

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

  useEffect(() => {
    if (!sender) return

    const activeThreadPhone = isPageActive ? selectedUser?.phone ?? null : null
    socketService.setActiveThread({
      userPhone: sender,
      activeThreadPhone,
      isChatActive: isPageActive,
    })
    emitPresenceHeartbeat(activeThreadPhone)

    if (!activeThreadPhone) {
      stopTypingIndicator()
    }
  }, [emitPresenceHeartbeat, isPageActive, selectedUser?.phone, sender, stopTypingIndicator])

  useEffect(() => {
    if (!selectedUser || !sender) {
      setSelectedUserPresence(null)
      return
    }

    let cancelled = false

    const loadPresence = async () => {
      try {
        const res = await getUserPresence(selectedUser.phone, sender)
        if (cancelled) return
        setSelectedUserPresence(res.data)
      } catch (e) {
        if (!cancelled) {
          console.error("Failed to load user presence", e)
          setSelectedUserPresence({
            phone: selectedUser.phone,
            status: "offline",
            lastActiveAt: selectedUser.lastActiveAt ?? null,
            isTyping: false,
          })
        }
      }
    }

    void loadPresence()

    return () => {
      cancelled = true
    }
  }, [selectedUser, sender])

  useEffect(() => {
    if (!sender) return

    const handlePresenceUpdate = (payload: PresenceUpdatePayload) => {
      if (payload.userPhone !== selectedUser?.phone) return

      setSelectedUserPresence((prev) => ({
        phone: payload.userPhone,
        status: payload.status,
        lastActiveAt: payload.lastActiveAt ?? prev?.lastActiveAt ?? null,
        isTyping: prev?.isTyping ?? false,
      }))
    }

    const handleTypingUpdate = (payload: TypingUpdatePayload) => {
      if (payload.userPhone !== selectedUser?.phone) return
      if (payload.targetUserPhone !== sender) return

      setSelectedUserPresence((prev) => ({
        phone: payload.userPhone,
        status: prev?.status ?? "offline",
        lastActiveAt: prev?.lastActiveAt ?? null,
        isTyping: payload.isTyping,
      }))
    }

    socketService.onPresenceUpdate(handlePresenceUpdate)
    socketService.onTypingUpdate(handleTypingUpdate)

    return () => {
      socketService.offPresenceUpdate(handlePresenceUpdate)
      socketService.offTypingUpdate(handleTypingUpdate)
    }
  }, [selectedUser?.phone, sender])

  useEffect(() => {
    setIsNotesOpen(false)
    setNotesVaultStatus("idle")
    lockNotes()
  }, [lockNotes, selectedUser?.phone])

  useEffect(() => {
    if (!isNotesOpen) {
      lockNotes()
      return
    }
    if (!selectedUser || !sender) return

    let cancelled = false
    const controller = new AbortController()

    const loadNotesVault = async () => {
      setNotesVaultStatus("loading")
      setNotesLoadError(null)

      try {
        const response = await getPrivateNotesVault(selectedUser.phone, {
          signal: controller.signal,
          timeout: 8000,
        })
        if (cancelled) return
        setPrivateNotes(Array.isArray(response.data?.notes) ? response.data.notes : [])
        setNotesVaultStatus("ready")
      } catch (error: unknown) {
        if (cancelled) return

        if (isRequestTimeoutError(error)) {
          setNotesVaultStatus("idle")
          setNotesLoadError("Notes request timed out. Check the API endpoint and try again.")
          return
        }

        if (getErrorStatus(error) === 404) {
          setPrivateNotes([])
          setNotesVaultStatus("idle")
          return
        }

        setPrivateNotes([])
        setNotesVaultStatus("idle")
        setNotesLoadError(getErrorMessage(error, "Failed to load notes."))
      }
    }

    void loadNotesVault()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [isNotesOpen, lockNotes, notesLoadAttempt, selectedUser?.phone, sender])

  useEffect(() => {
    if (!isNotesOpen) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsNotesOpen(false)
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [isNotesOpen])

  useEffect(() => {
    if (!isNotesOpen || notesVaultStatus !== "ready" || !sender || !selectedUser) return

    window.dispatchEvent(
      new CustomEvent(NOTES_REMINDER_SYNC_EVENT, {
        detail: {
          scopeKey: `${sender}:${selectedUser.phone}`,
          ownerPhone: sender,
          targetUserPhone: selectedUser.phone,
          notes: privateNotes,
        },
      }),
    )
  }, [isNotesOpen, notesVaultStatus, privateNotes, selectedUser?.phone, sender])

  useEffect(() => {
    if (!sender || !selectedUser) return

    const scopeKey = `${sender}:${selectedUser.phone}`
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as
        | { scopeKey?: string; notes?: PrivateNote[] }
        | undefined

      if (!detail || detail.scopeKey !== scopeKey || !Array.isArray(detail.notes)) return
      setPrivateNotes(detail.notes)
    }

    window.addEventListener(NOTES_REMINDER_UPDATE_EVENT, handler)
    return () => window.removeEventListener(NOTES_REMINDER_UPDATE_EVENT, handler)
  }, [selectedUser?.phone, sender])

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

  const triggerChatEffect = useCallback((
    setRunId: Dispatch<SetStateAction<number>>,
    timerRef: MutableRefObject<number | null>,
    durationMs: number,
  ) => {
    setRunId((prev) => prev + 1)
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      setRunId(0)
      timerRef.current = null
    }, durationMs)
  }, [])

  const playChatEffect = useCallback((effect: ChatEffectKind) => {
    if (effect === "confetti") {
      triggerChatEffect(setConfettiRunId, confettiTimerRef, 2600)
      return
    }
    if (effect === "punch") {
      triggerChatEffect(setPunchRunId, punchTimerRef, 1200)
      return
    }
    triggerChatEffect(setLoveRunId, loveTimerRef, 2600)
  }, [triggerChatEffect])

  const sendChatEffect = useCallback(
    (effect: ChatEffectKind) => {
      if (!sender || !selectedUser) return

      const eventId = createChatEffectEventId()
      localChatEffectEventIdsRef.current.add(eventId)
      window.setTimeout(() => {
        localChatEffectEventIdsRef.current.delete(eventId)
      }, 5000)

      playChatEffect(effect)
      socketService.sendChatEffect({
        sender,
        receiver: selectedUser.phone,
        effect,
        eventId,
      })
    },
    [playChatEffect, selectedUser, sender],
  )

  const triggerConfetti = useCallback(() => {
    sendChatEffect("confetti")
  }, [sendChatEffect])

  const triggerPunch = useCallback(() => {
    sendChatEffect("punch")
  }, [sendChatEffect])

  const triggerLove = useCallback(() => {
    sendChatEffect("love")
  }, [sendChatEffect])

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current)
      if (typingStopTimerRef.current) window.clearTimeout(typingStopTimerRef.current)
      if (confettiTimerRef.current) window.clearTimeout(confettiTimerRef.current)
      if (punchTimerRef.current) window.clearTimeout(punchTimerRef.current)
      if (loveTimerRef.current) window.clearTimeout(loveTimerRef.current)
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

  useEffect(() => {
    if (!isHeaderMenuOpen) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsHeaderMenuOpen(false)
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [isHeaderMenuOpen])

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
    (m: MessageResponse, isOutgoing: boolean, e: MouseEvent<HTMLElement>) => {
      e.preventDefault()
      e.stopPropagation()
      e.nativeEvent.stopImmediatePropagation()

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

  const handleMessageSecondaryClick = useCallback(
    (_m: MessageResponse, _isOutgoing: boolean, e: MouseEvent<HTMLElement>) => {
      if (e.button !== 2) return
      e.preventDefault()
      e.stopPropagation()
      e.nativeEvent.stopImmediatePropagation()
    },
    [],
  )

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

  useEffect(() => {
    if (didAutoSelectInitialUserRef.current || selectedUser || chatUsers.length === 0) return

    didAutoSelectInitialUserRef.current = true
    setSelectedUser(chatUsers[0])
    setIsDrawerOpen(false)
    setIsSidebarOpen(false)
  }, [chatUsers, selectedUser])

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

  const starredStorageKey = useMemo(
    () => (sender ? `${STARRED_STORAGE_PREFIX}${sender}` : null),
    [sender],
  )

  const starredIdSet = useMemo(() => new Set(starredMessageIds), [starredMessageIds])
  const pinnedIdSet = useMemo(() => new Set(pinnedMessageIds), [pinnedMessageIds])

  const isMessagePinned = useCallback(
    (message: MessageResponse) => Boolean(message.pinned || pinnedIdSet.has(message._id)),
    [pinnedIdSet],
  )

  const visiblePinnedMessages = useMemo(() => {
    const unique = new Map<string, MessageResponse>()
    for (const message of pinnedMessages) {
      if (!message.isDeleted && isMessagePinned(message)) unique.set(message._id, message)
    }
    for (const message of filteredMessages) {
      if (!message.isDeleted && isMessagePinned(message)) unique.set(message._id, message)
    }

    return Array.from(unique.values())
      .sort((a, b) => {
        const at = new Date(a.pinnedAt ?? a.createdAt).getTime()
        const bt = new Date(b.pinnedAt ?? b.createdAt).getTime()
        return bt - at
      })
      .slice(0, MAX_PINNED_MESSAGES)
  }, [filteredMessages, isMessagePinned, pinnedMessages])

  const applyPinnedMessageToCurrentThread = useCallback((message: MessageResponse) => {
    setPinnedMessageIds((prev) => {
      if (message.pinned) {
        return prev.includes(message._id)
          ? prev
          : [message._id, ...prev].slice(0, MAX_PINNED_MESSAGES)
      }
      return prev.filter((id) => id !== message._id)
    })

    setPinnedMessages((prev) => {
      if (message.pinned && !message.isDeleted) {
        const next = [message, ...prev.filter((item) => item._id !== message._id)]
        next.sort((a, b) => {
          const at = new Date(a.pinnedAt ?? a.createdAt).getTime()
          const bt = new Date(b.pinnedAt ?? b.createdAt).getTime()
          return bt - at
        })
        return next.slice(0, MAX_PINNED_MESSAGES)
      }

      return prev.filter((item) => item._id !== message._id)
    })
  }, [])

  const derivedSharedContent = useMemo(
    () => extractSharedContent(filteredMessages),
    [filteredMessages],
  )

  const lastOutgoingMessageId = useMemo(() => {
    for (let i = filteredMessages.length - 1; i >= 0; i -= 1) {
      const m = filteredMessages[i]
      if (m.sender === sender) return m._id
    }
    return null
  }, [filteredMessages, sender])

  const loadFullThreadMessages = useCallback(async () => {
    if (!selectedUser || !sender) return []

    const all = [...filteredMessages]
    const seen = new Set(all.map((m) => m._id))
    let before =
      oldestCursorRef.current ??
      [...filteredMessages]
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0]
        ?.createdAt ??
      null
    let pages = 0

    while (pages < 25) {
      const res = await getMessages(sender, selectedUser.phone, {
        limit: PAGE_SIZE,
        before: before ?? undefined,
      })
      const rows = Array.isArray(res.data) ? (res.data as MessageResponse[]) : []
      const older = rows.filter(
        (m) =>
          !seen.has(m._id) &&
          !m.isDeleted &&
          ((m.sender === sender && m.receiver === selectedUser.phone) ||
            (m.sender === selectedUser.phone && m.receiver === sender)),
      )

      if (older.length === 0) break

      older.forEach((m) => {
        seen.add(m._id)
        all.push(m)
      })

      older.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      before = older[0]?.createdAt ?? null
      pages += 1

      if (rows.length < PAGE_SIZE) break
    }

    all.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    return all
  }, [filteredMessages, selectedUser, sender])

  const openPinnedMessage = useCallback(
    async (message: MessageResponse) => {
      if (!messageElByIdRef.current[message._id]) {
        try {
          const fullThread = await loadFullThreadMessages()
          setMessages((prev) => {
            const unique = new Map(prev.map((item) => [item._id, item]))
            fullThread.forEach((item) => unique.set(item._id, item))
            return Array.from(unique.values())
          })
        } catch {
          setPinnedMessagesNotice("Could not load the pinned message.")
          return
        }
      }

      window.requestAnimationFrame(() => {
        scrollToMessage(message._id)
      })
    },
    [loadFullThreadMessages, scrollToMessage],
  )

  const isMessageStarred = useCallback(
    (message: MessageResponse) => Boolean(message.starred || starredIdSet.has(message._id)),
    [starredIdSet],
  )

  const starredSections = useMemo(() => {
    const textMessages: MessageResponse[] = []
    const mediaAndLinks: MessageResponse[] = []

    for (const message of starredMessages) {
      const decoded = decodeRichMessage(message.message)
      if (decoded.kind === "plain") {
        if (extractUrlsFromText(decoded.value).length > 0 || isGifUrl(decoded.value.trim())) {
          mediaAndLinks.push(message)
        } else {
          textMessages.push(message)
        }
        continue
      }

      if (decoded.value.type === "file" || decoded.value.type === "gif") {
        mediaAndLinks.push(message)
        continue
      }

      if (extractUrlsFromText(decoded.value.text ?? "").length > 0) {
        mediaAndLinks.push(message)
        continue
      }

      textMessages.push(message)
    }

    return { textMessages, mediaAndLinks }
  }, [starredMessages])

  useEffect(() => {
    if (!starredStorageKey) {
      setStarredMessageIds([])
      return
    }

    try {
      const raw = localStorage.getItem(starredStorageKey)
      const parsed = raw ? (JSON.parse(raw) as unknown) : []
      setStarredMessageIds(Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [])
    } catch {
      setStarredMessageIds([])
    }
  }, [starredStorageKey])

  useEffect(() => {
    if (!starredStorageKey) return
    localStorage.setItem(starredStorageKey, JSON.stringify(starredMessageIds))
  }, [starredMessageIds, starredStorageKey])

  useEffect(() => {
    if (!selectedUser || !sender) {
      setPinnedMessageIds([])
      setPinnedMessages([])
      setPinnedMessagesNotice(null)
      return
    }

    let cancelled = false
    const chatId = [sender, selectedUser.phone].sort().join("_")

    const loadPinnedMessages = async () => {
      try {
        const res = await getChatPinnedMessages(chatId, {
          user1: sender,
          user2: selectedUser.phone,
        })
        if (cancelled) return

        const rows = Array.isArray(res.data) ? (res.data as MessageResponse[]) : []
        const pinnedRows = rows.filter((message) => message.pinned && !message.isDeleted)
        setPinnedMessages(pinnedRows)
        setPinnedMessageIds(pinnedRows.map((message) => message._id))
        setPinnedMessagesNotice(null)
      } catch {
        if (!cancelled) {
          setPinnedMessages([])
          setPinnedMessageIds([])
          setPinnedMessagesNotice("Pinned messages are unavailable until the API is updated.")
        }
      }
    }

    void loadPinnedMessages()

    return () => {
      cancelled = true
    }
  }, [selectedUser, sender])

  useEffect(() => {
    if (!selectedUser) {
      setSharedContent(EMPTY_SHARED_CONTENT)
      setSharedContentNotice(null)
      setSharedPanelTab("media")
      setStarredMessages([])
      setStarredMessagesNotice(null)
      return
    }

    setSharedContent(derivedSharedContent)
  }, [derivedSharedContent, selectedUser])

  useEffect(() => {
    if (!isSharedPanelOpen || !selectedUser || !sender) return

    let cancelled = false

    const loadSharedContent = async () => {
      setSharedContentLoading(true)
      setSharedContentNotice(null)

      const params = { user1: sender, user2: selectedUser.phone }
      const chatId = selectedUser._id || selectedUser.phone

      try {
        const [mediaRes, filesRes, linksRes] = await Promise.allSettled([
          getChatMedia(chatId, params),
          getChatFiles(chatId, params),
          getChatLinks(chatId, params),
        ])

        if (cancelled) return

        const endpointContent: SharedContentCollection = {
          media:
            mediaRes.status === "fulfilled" && Array.isArray(mediaRes.value.data)
              ? mediaRes.value.data
              : [],
          files:
            filesRes.status === "fulfilled" && Array.isArray(filesRes.value.data)
              ? filesRes.value.data
              : [],
          links:
            linksRes.status === "fulfilled" && Array.isArray(linksRes.value.data)
              ? linksRes.value.data
              : [],
        }

        const shouldLoadThreadFallback =
          mediaRes.status === "rejected" ||
          filesRes.status === "rejected" ||
          linksRes.status === "rejected" ||
          (endpointContent.media.length === 0 &&
            endpointContent.files.length === 0 &&
            endpointContent.links.length === 0)

        if (shouldLoadThreadFallback) {
          const fullThreadMessages = await loadFullThreadMessages()
          if (cancelled) return
          const fallbackContent = extractSharedContent(fullThreadMessages)
          setSharedContent(mergeSharedCollections(endpointContent, fallbackContent))
          setSharedContentNotice(
            "Showing results derived from chat history because the media endpoints are empty or unavailable.",
          )
          return
        }

        setSharedContent(mergeSharedCollections(endpointContent, derivedSharedContent))
        setSharedContentNotice(null)
      } catch {
        if (cancelled) return
        try {
          const fullThreadMessages = await loadFullThreadMessages()
          if (cancelled) return
          setSharedContent(extractSharedContent(fullThreadMessages))
          setSharedContentNotice("Showing results derived from full chat history until the media endpoints are available.")
        } catch {
          if (cancelled) return
          setSharedContent(derivedSharedContent)
          setSharedContentNotice("Showing results derived from loaded messages only.")
        }
      } finally {
        if (!cancelled) setSharedContentLoading(false)
      }
    }

    void loadSharedContent()

    return () => {
      cancelled = true
    }
  }, [derivedSharedContent, isSharedPanelOpen, loadFullThreadMessages, selectedUser, sender])

  useEffect(() => {
    if (!isStarredPanelOpen || !selectedUser || !sender) return

    let cancelled = false

    const loadStarredMessages = async () => {
      setStarredMessagesLoading(true)
      setStarredMessagesNotice(null)

      const chatId = selectedUser._id || selectedUser.phone
      const params = { user1: sender, user2: selectedUser.phone }

      try {
        const res = await getChatStarredMessages(chatId, params)
        if (cancelled) return

        const apiRows = Array.isArray(res.data) ? (res.data as MessageResponse[]) : []
        const fullThread = await loadFullThreadMessages()
        if (cancelled) return

        const merged = [...apiRows, ...fullThread.filter((message) => isMessageStarred(message))]
        const unique = new Map<string, MessageResponse>()
        for (const message of merged) {
          unique.set(message._id, { ...message, starred: true })
        }

        const next = [...unique.values()].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        )
        setStarredMessages(next)
        if (apiRows.length === 0 && next.length > 0) {
          setStarredMessagesNotice("Showing locally starred messages because the starred endpoint returned no results.")
        }
      } catch {
        if (cancelled) return
        const fullThread = await loadFullThreadMessages()
        if (cancelled) return
        const next = fullThread
          .filter((message) => isMessageStarred(message))
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .map((message) => ({ ...message, starred: true }))
        setStarredMessages(next)
        setStarredMessagesNotice("Showing locally starred messages until the starred endpoint is available.")
      } finally {
        if (!cancelled) setStarredMessagesLoading(false)
      }
    }

    void loadStarredMessages()

    return () => {
      cancelled = true
    }
  }, [isMessageStarred, isStarredPanelOpen, loadFullThreadMessages, selectedUser, sender])

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
          ((isSameUserId(msg.sender, sender) && isSameUserId(msg.receiver, selectedUser.phone)) ||
            (isSameUserId(msg.sender, selectedUser.phone) && isSameUserId(msg.receiver, sender))),
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

      if (!isSameUserId(msg.receiver, sender)) return

      const from = msg.sender

      const isSelectedThread = isSameUserId(selectedUser?.phone ?? "", from)

      if (!isSelectedThread || !isPageActive) {
        setUnreadCounts((prev) => ({
          ...prev,
          [from]: (prev[from] ?? 0) + 1,
        }))
        dispatchUnreadCountsChanged({ kind: "refresh", sender: from, receiver: sender })
        return
      }

      setUnreadCounts((prev) => ({ ...prev, [from]: 0 }))
      socketService.markSeen({ sender: from, receiver: sender })
      dispatchUnreadCountsChanged({ kind: "seen", sender: from, receiver: sender })
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
        dispatchUnreadCountsChanged({ kind: "refresh", sender: other, receiver: sender })
        return
      }

      setUnreadCounts((prev) => ({ ...prev, [other]: 0 }))
      socketService.markSeen({ sender: other, receiver: sender })
      dispatchUnreadCountsChanged({ kind: "seen", sender: other, receiver: sender })
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

    const handleChatEffect = (payload: ChatEffectPayload) => {
      if (!selectedUser) return
      if (payload.eventId && localChatEffectEventIdsRef.current.has(payload.eventId)) return

      const isCurrentThread =
        (isSameUserId(payload.sender, sender) && isSameUserId(payload.receiver, selectedUser.phone)) ||
        (isSameUserId(payload.sender, selectedUser.phone) && isSameUserId(payload.receiver, sender)) ||
        (isSameUserId(payload.receiver, sender) && isSameUserId(payload.sender, selectedUser.phone))

      if (!isCurrentThread) {
        console.info("Ignoring chatEffect for inactive thread", {
          payload,
          sender,
          selectedUserPhone: selectedUser.phone,
        })
        return
      }
      playChatEffect(payload.effect)
    }

    socketService.onChatEffect(handleChatEffect)

    return () => {
      socketService.offChatEffect(handleChatEffect)
    }
  }, [playChatEffect, selectedUser, sender])

  useEffect(() => {
    if (!sender) return

    const handleMessageDeleted = (payload: { messageId: string }) => {
      setMessages((prev) => prev.filter((m) => m._id !== payload.messageId))
      setPinnedMessageIds((prev) => prev.filter((id) => id !== payload.messageId))
      setPinnedMessages((prev) => prev.filter((message) => message._id !== payload.messageId))
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

    const handleMessagePinned = (payload: { message: MessageResponse }) => {
      const message = payload.message
      setMessages((prev) =>
        prev.map((item) => (item._id === message._id ? { ...item, ...message } : item)),
      )

      if (!selectedUser) return
      const isCurrentThread =
        (message.sender === sender && message.receiver === selectedUser.phone) ||
        (message.sender === selectedUser.phone && message.receiver === sender)

      if (isCurrentThread) {
        applyPinnedMessageToCurrentThread(message)
        setPinnedMessagesNotice(null)
      }
    }

    socketService.onMessagePinned(handleMessagePinned)

    return () => {
      socketService.offMessagePinned(handleMessagePinned)
    }
  }, [applyPinnedMessageToCurrentThread, selectedUser, sender])

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

  const handleInputChange = useCallback(
    (nextValue: string) => {
      setInput(nextValue)
      emitPresenceHeartbeat()

      if (!selectedUser || editingMessageId) {
        stopTypingIndicator()
        return
      }

      if (!nextValue.trim()) {
        stopTypingIndicator(selectedUser.phone)
        return
      }

      if (!isPageActive) {
        stopTypingIndicator(selectedUser.phone)
        return
      }

      startTypingIndicator(selectedUser.phone)
    },
    [
      editingMessageId,
      emitPresenceHeartbeat,
      isPageActive,
      selectedUser,
      startTypingIndicator,
      stopTypingIndicator,
    ],
  )

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
      dispatchUnreadCountsChanged({ kind: "refresh", receiver: sender })
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

  const reloadSelectedThread = useCallback(async () => {
    if (!selectedUser || !sender) return

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
  }, [selectedUser, sender, scrollToBottom])

  useEffect(() => {
    void reloadSelectedThread()
  }, [reloadSelectedThread])

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
    dispatchUnreadCountsChanged({ kind: "seen", sender: selectedUser.phone, receiver: sender })
    setMessages((prev) =>
      prev.map((m) =>
        m.sender === selectedUser.phone && m.receiver === sender
          ? { ...m, seen: true, seenAt }
          : m,
      ),
    )
  }, [filteredMessages, selectedUser, sender, isPageActive])

  useEffect(() => {
    if (selectedUser && input.trim() && isPageActive && !editingMessageId) return
    stopTypingIndicator(selectedUser?.phone ?? null)
  }, [editingMessageId, input, isPageActive, selectedUser?.phone, stopTypingIndicator])

  const sendOutgoingTo = useCallback(
    (receiverPhone: string, rawMessage: string, opts?: { clearInput?: boolean }) => {
      if (!receiverPhone || !sender) return

      const payload: SendMessagePayload = {
        sender,
        receiver: receiverPhone,
        message: rawMessage,
      }

      emitPresenceHeartbeat(receiverPhone)
      stopTypingIndicator(receiverPhone)
      socketService.sendMessage(payload)
      setUnreadCounts((prev) => ({ ...prev, [receiverPhone]: 0 }))
      socketService.markSeen({ sender: receiverPhone, receiver: sender })
      dispatchUnreadCountsChanged({ kind: "seen", sender: receiverPhone, receiver: sender })

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
    [emitPresenceHeartbeat, scrollToBottom, selectedUser?.phone, sender, stopTypingIndicator],
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
    stopTypingIndicator(selectedUser.phone)

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

  const toggleStarMessage = useCallback(
    async (message: MessageResponse) => {
      const nextStarred = !isMessageStarred(message)

      setStarredMessageIds((prev) => {
        if (nextStarred) {
          return prev.includes(message._id) ? prev : [...prev, message._id]
        }
        return prev.filter((id) => id !== message._id)
      })

      setMessages((prev) =>
        prev.map((item) =>
          item._id === message._id ? { ...item, starred: nextStarred } : item,
        ),
      )

      setStarredMessages((prev) => {
        if (nextStarred) {
          const next = [{ ...message, starred: true }, ...prev.filter((item) => item._id !== message._id)]
          next.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          return next
        }
        return prev.filter((item) => item._id !== message._id)
      })

      try {
        await setMessageStarred(message._id, nextStarred)
      } catch {
        setStarredMessagesNotice(
          nextStarred
            ? "Star saved locally until the starred endpoint is available."
            : "Unstar saved locally until the starred endpoint is available.",
        )
      }
    },
    [isMessageStarred],
  )

  const togglePinMessage = useCallback(
    async (message: MessageResponse) => {
      if (!sender) return

      const nextPinned = !isMessagePinned(message)
      if (nextPinned && visiblePinnedMessages.length >= MAX_PINNED_MESSAGES) {
        setPinnedMessagesNotice(`You can pin up to ${MAX_PINNED_MESSAGES} messages in this chat.`)
        return
      }

      const optimisticMessage: MessageResponse = {
        ...message,
        pinned: nextPinned,
        pinnedAt: nextPinned ? new Date().toISOString() : null,
        pinnedBy: nextPinned ? sender : null,
      }

      setMessages((prev) =>
        prev.map((item) =>
          item._id === optimisticMessage._id ? { ...item, ...optimisticMessage } : item,
        ),
      )
      applyPinnedMessageToCurrentThread(optimisticMessage)
      setPinnedMessagesNotice(null)

      try {
        const res = await setMessagePinned(message._id, nextPinned, sender)
        const updated = res.data as MessageResponse
        setMessages((prev) =>
          prev.map((item) => (item._id === updated._id ? { ...item, ...updated } : item)),
        )
        applyPinnedMessageToCurrentThread(updated)
        socketService.pinMessage(updated._id)
      } catch (error) {
        setMessages((prev) =>
          prev.map((item) => (item._id === message._id ? { ...item, ...message } : item)),
        )
        applyPinnedMessageToCurrentThread(message)

        let notice = "Could not update pinned message."
        if (axios.isAxiosError(error)) {
          const apiMessage = (error.response?.data as { message?: string } | undefined)?.message
          if (apiMessage) notice = apiMessage
        }
        setPinnedMessagesNotice(notice)
      }
    },
    [applyPinnedMessageToCurrentThread, isMessagePinned, sender, visiblePinnedMessages.length],
  )

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

  const openNotesForSelectedUser = useCallback(() => {
    if (!selectedUser) return
    setIsHeaderMenuOpen(false)
    setNotesVaultStatus("idle")
    setNotesLoadError(null)
    setNotesLoadAttempt((v) => v + 1)
    setIsNotesOpen(true)
  }, [selectedUser])

  const closeNotesPanel = useCallback(() => {
    setIsNotesOpen(false)
  }, [])

  const retryNotesVaultLoad = useCallback(() => {
    setNotesVaultStatus("idle")
    setNotesLoadError(null)
    setNotesLoadAttempt((v) => v + 1)
  }, [])

  const refreshChatState = useCallback(async () => {
    setIsRefreshingChat(true)
    try {
      await Promise.all([
        loadUsers(),
        refreshUnseenCounts(),
        selectedUser ? reloadSelectedThread() : Promise.resolve(),
      ])
      dispatchUnreadCountsChanged({ kind: "refresh", receiver: sender })
    } finally {
      setIsRefreshingChat(false)
    }
  }, [refreshUnseenCounts, reloadSelectedThread, selectedUser, sender])

  const handleSaveNote = useCallback(async () => {
    const heading = noteHeadingInput.trim()
    const content = noteContentInput.trim()
    const reminderAt = noteReminderInput ? new Date(noteReminderInput).toISOString() : null

    if (!heading) {
      setNotesSaveError("Heading is required.")
      return
    }
    if (!content) {
      setNotesSaveError("Content is required.")
      return
    }

    const now = new Date().toISOString()
    const nextNotes = editingNoteId
      ? privateNotes.map((note) =>
          note.id === editingNoteId
            ? {
                ...note,
                heading,
                content,
                reminderAt,
                reminderSnoozedUntil: null,
                reminderLastNotifiedAt: null,
                updatedAt: now,
              }
            : note,
        )
      : [
          {
            id: crypto.randomUUID(),
            heading,
            content,
            createdAt: now,
            updatedAt: now,
            reminderAt,
            reminderSnoozedUntil: null,
            reminderLastNotifiedAt: null,
          },
          ...privateNotes,
        ]

    setNotesPersisting(true)
    setNotesSaveError(null)

    try {
      await persistPrivateNotes(nextNotes)
      setPrivateNotes(nextNotes)
      resetNotesEditor()
    } catch (error: unknown) {
      setNotesSaveError(
        getErrorMessage(
          error,
          error instanceof Error && error.message ? error.message : "Failed to save note.",
        ),
      )
    } finally {
      setNotesPersisting(false)
    }
  }, [
    editingNoteId,
    noteContentInput,
    noteHeadingInput,
    noteReminderInput,
    persistPrivateNotes,
    privateNotes,
    resetNotesEditor,
  ])

  const beginEditNote = useCallback((note: PrivateNote) => {
    setEditingNoteId(note.id)
    setNoteHeadingInput(note.heading)
    setNoteContentInput(note.content)
    setNoteReminderInput(toDateTimeLocalValue(getActiveReminderAt(note) || note.reminderAt))
    setNotesSaveError(null)
  }, [])

  const handleDeleteNote = useCallback(async (noteId: string) => {
    const nextNotes = privateNotes.filter((note) => note.id !== noteId)
    setNotesPersisting(true)
    setNotesSaveError(null)

    try {
      await persistPrivateNotes(nextNotes)
      setPrivateNotes(nextNotes)
      if (editingNoteId === noteId) {
        resetNotesEditor()
      }
    } catch (error: unknown) {
      setNotesSaveError(getErrorMessage(error, "Failed to delete note."))
    } finally {
      setNotesPersisting(false)
    }
  }, [editingNoteId, persistPrivateNotes, privateNotes, resetNotesEditor])

  const selectChatUser = useCallback(
    (user: User, _options: { closeDrawer?: boolean } = {}) => {
      stopTypingIndicator()
      setIsHeaderMenuOpen(false)
      setSelectedUser(user)
      setReplyTo(null)
      setSelectedGifUrl(null)
      setShowEmojiPicker(false)
      setShowGifPicker(false)
      setIsDrawerOpen(false)
      setIsSidebarOpen(false)
      if (sender) {
        setUnreadCounts((prev) => ({ ...prev, [user.phone]: 0 }))
        socketService.markSeen({ sender: user.phone, receiver: sender })
        dispatchUnreadCountsChanged({ kind: "seen", sender: user.phone, receiver: sender })
      }
    },
    [sender, stopTypingIndicator],
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
      {selectedUser && isNotesOpen && (
        <>
          <div
            className="position-fixed top-0 start-0 w-100 h-100"
            style={{ background: "rgba(0,0,0,0.45)", zIndex: 2050 }}
            role="presentation"
            onClick={closeNotesPanel}
          />
          <div
            className="position-fixed top-50 start-50 translate-middle bg-body rounded shadow d-flex flex-column"
            style={{
              zIndex: 2051,
              width: "min(92vw, 1080px)",
              maxHeight: "88vh",
              overflow: "hidden",
            }}
            role="dialog"
            aria-modal="true"
            aria-label={`Private notes for ${selectedUser.name}`}
          >
            <div className="p-3 border-bottom d-flex align-items-start justify-content-between gap-3">
              <div>
                <div className="fw-semibold">Private Notes</div>
                <div className="small text-body-secondary">
                  Encrypted notes for {selectedUser.name}
                </div>
              </div>
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={closeNotesPanel}
                aria-label="Close notes"
                title="Close"
              >
                {"\u2715"}
              </button>
            </div>

            {notesVaultStatus === "loading" ? (
              <div className="p-4 text-body-secondary">Loading notes...</div>
            ) : (
              <div
                className="d-flex flex-column flex-md-row"
                style={{ minHeight: 0, flex: 1, overflow: "hidden" }}
              >
                <div
                  className="border-end p-3"
                  style={{
                    width: isMobileLayout ? "100%" : "38%",
                    minWidth: 0,
                    overflowY: "auto",
                  }}
                >
                  <div className="d-flex align-items-center justify-content-between gap-2 mb-3">
                    <div className="fw-semibold">
                      Notes ({filteredPrivateNotes.length})
                    </div>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary"
                      onClick={resetNotesEditor}
                    >
                      New
                    </button>
                  </div>
                  <div className="mb-3">
                    <input
                      type="search"
                      className="form-control"
                      value={notesSearchQuery}
                      onChange={(e) => setNotesSearchQuery(e.target.value)}
                      placeholder="Search by heading or content"
                    />
                  </div>
                  {notesLoadError && (
                    <div className="alert alert-danger py-2 mb-3">
                      <div>{notesLoadError}</div>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-danger mt-2"
                        onClick={retryNotesVaultLoad}
                      >
                        Retry
                      </button>
                    </div>
                  )}

                  {filteredPrivateNotes.length === 0 ? (
                    <div className="text-body-secondary small">
                      {privateNotes.length === 0
                        ? "No notes yet. Create your first private note."
                        : "No notes match your search."}
                    </div>
                  ) : (
                    <div className="d-flex flex-column gap-2">
                      {filteredPrivateNotes.map((note) => (
                        <button
                          key={note.id}
                          type="button"
                          className="btn text-start border rounded p-3"
                          onClick={() => beginEditNote(note)}
                          style={{
                            background:
                              editingNoteId === note.id
                                ? "var(--bs-primary-bg-subtle)"
                                : "var(--bs-tertiary-bg)",
                            borderColor:
                              editingNoteId === note.id
                                ? "var(--bs-primary-border-subtle)"
                                : "var(--bs-border-color)",
                            color:
                              editingNoteId === note.id
                                ? "var(--bs-primary-text-emphasis)"
                                : "var(--bs-body-color)",
                          }}
                        >
                          <div className="fw-semibold text-truncate">{note.heading}</div>
                          <div
                            className="small mt-1"
                            style={{
                              display: "-webkit-box",
                              WebkitLineClamp: 3,
                              WebkitBoxOrient: "vertical",
                              overflow: "hidden",
                              color:
                                editingNoteId === note.id
                                  ? "var(--bs-primary-text-emphasis)"
                                  : "var(--bs-secondary-color)",
                              opacity: editingNoteId === note.id ? 0.82 : 1,
                            }}
                          >
                            {note.content}
                          </div>
                          <div
                            className="small mt-2"
                            style={{
                              color:
                                editingNoteId === note.id
                                  ? "var(--bs-primary-text-emphasis)"
                                  : "var(--bs-secondary-color)",
                              opacity: editingNoteId === note.id ? 0.76 : 1,
                            }}
                          >
                            Created {formatNoteDateTimeLabel(note.createdAt)}
                          </div>
                          <div
                            className="small"
                            style={{
                              color:
                                editingNoteId === note.id
                                  ? "var(--bs-primary-text-emphasis)"
                                  : "var(--bs-secondary-color)",
                              opacity: editingNoteId === note.id ? 0.76 : 1,
                            }}
                          >
                            Updated {formatNoteDateTimeLabel(note.updatedAt)}
                          </div>
                          {getActiveReminderAt(note) && (
                            <div
                              className="small mt-1"
                              style={{
                                color:
                                  editingNoteId === note.id
                                    ? "var(--bs-primary-text-emphasis)"
                                    : "var(--bs-info-text-emphasis)",
                                opacity: editingNoteId === note.id ? 0.84 : 1,
                              }}
                            >
                              Reminder {formatNoteDateTimeLabel(getActiveReminderAt(note) || "")}
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex-grow-1 p-3 d-flex flex-column" style={{ minWidth: 0 }}>
                  <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
                    <div className="fw-semibold">
                      {editingNoteId ? "Edit note" : "Add note"}
                    </div>
                    <div className="d-flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => void handleSaveNote()}
                        disabled={notesPersisting}
                      >
                        {notesPersisting ? "Saving..." : editingNoteId ? "Update note" : "Save note"}
                      </button>
                      {editingNoteId && (
                        <button
                          type="button"
                          className="btn btn-outline-danger"
                          onClick={() => void handleDeleteNote(editingNoteId)}
                          disabled={notesPersisting}
                        >
                          Delete
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn-outline-secondary"
                        onClick={resetNotesEditor}
                        disabled={notesPersisting}
                      >
                        {editingNoteId ? "Cancel edit" : "Clear"}
                      </button>
                    </div>
                  </div>

                  {notesSaveError && <div className="alert alert-danger py-2">{notesSaveError}</div>}

                  <div className="mb-3">
                    <label className="form-label">Heading</label>
                    <input
                      type="text"
                      className="form-control"
                      value={noteHeadingInput}
                      onChange={(e) => setNoteHeadingInput(e.target.value)}
                      placeholder="Note heading"
                    />
                  </div>

                  <div className="mb-3">
                    <label className="form-label">Reminder</label>
                    <input
                      type="datetime-local"
                      className="form-control"
                      value={noteReminderInput}
                      onChange={(e) => setNoteReminderInput(e.target.value)}
                    />
                    <div className="form-text">
                      Set a date and time for a reminder popup. Leave empty for no reminder.
                    </div>
                  </div>

                  <div className="mb-3 flex-grow-1 d-flex flex-column">
                    <label className="form-label">Content</label>
                    <textarea
                      className="form-control flex-grow-1"
                      value={noteContentInput}
                      onChange={(e) => setNoteContentInput(e.target.value)}
                      placeholder="Write your private note"
                      style={{ minHeight: 240, resize: "vertical" }}
                    />
                  </div>
                </div>
              </div>
            )}
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
      <div className="flex-grow-1 d-flex flex-column position-relative">
        {confettiRunId > 0 && (
          <div className="sl-confetti-layer" aria-hidden="true" key={confettiRunId}>
            {Array.from({ length: CONFETTI_CANNON_COUNT }).map((_, index) => {
              const fromLeft = index % 2 === 0
              const spread = 12 + (index % 9) * 6
              const rise = 36 + (index % 7) * 7
              return (
                <span
                  key={`cannon-${index}`}
                  className={`sl-confetti-piece sl-confetti-cannon ${
                    fromLeft ? "sl-confetti-cannon-left" : "sl-confetti-cannon-right"
                  }`}
                  style={
                    {
                      "--sl-confetti-delay": `${(index % 10) * 0.025}s`,
                      "--sl-confetti-duration": `${1.25 + (index % 6) * 0.12}s`,
                      "--sl-confetti-x": `${fromLeft ? spread : -spread}vw`,
                      "--sl-confetti-rise": `-${rise}vh`,
                      "--sl-confetti-rotate": `${(index * 47) % 360}deg`,
                      "--sl-confetti-color": CONFETTI_COLORS[index % CONFETTI_COLORS.length],
                    } as CSSProperties
                  }
                />
              )
            })}
            {Array.from({ length: CONFETTI_RAIN_COUNT }).map((_, index) => (
              <span
                key={`rain-${index}`}
                className="sl-confetti-piece sl-confetti-rain"
                style={
                  {
                    "--sl-confetti-left": `${(index * 17) % 100}%`,
                    "--sl-confetti-delay": `${0.35 + (index % 12) * 0.07}s`,
                    "--sl-confetti-duration": `${1.45 + (index % 7) * 0.14}s`,
                    "--sl-confetti-rotate": `${(index * 47) % 360}deg`,
                    "--sl-confetti-color": CONFETTI_COLORS[(index + 2) % CONFETTI_COLORS.length],
                  } as CSSProperties
                }
              />
            ))}
          </div>
        )}
        {punchRunId > 0 && (
          <div className="sl-punch-layer" aria-hidden="true" key={punchRunId}>
            <div className="sl-punch-fist">{"\u{1F44A}"}</div>
            <div className="sl-punch-impact">{"\u{1F4A5}"}</div>
            {Array.from({ length: PUNCH_IMPACT_COUNT }).map((_, index) => (
              <span
                key={index}
                className="sl-punch-spark"
                style={
                  {
                    "--sl-punch-angle": `${(index * 360) / PUNCH_IMPACT_COUNT}deg`,
                    "--sl-punch-distance": `${34 + (index % 5) * 8}px`,
                    "--sl-punch-delay": `${(index % 4) * 0.025}s`,
                  } as CSSProperties
                }
              />
            ))}
          </div>
        )}
        {loveRunId > 0 && (
          <div className="sl-love-layer" aria-hidden="true" key={loveRunId}>
            {Array.from({ length: LOVE_HEART_COUNT }).map((_, index) => (
              <span
                key={index}
                className="sl-love-heart"
                style={
                  {
                    "--sl-love-left": `${6 + (index * 19) % 88}%`,
                    "--sl-love-start": `${18 + (index * 11) % 68}%`,
                    "--sl-love-drift": `${index % 2 === 0 ? 1 : -1}`,
                    "--sl-love-delay": `${(index % 14) * 0.08}s`,
                    "--sl-love-duration": `${1.7 + (index % 7) * 0.13}s`,
                    "--sl-love-size": `${18 + (index % 6) * 4}px`,
                  } as CSSProperties
                }
              >
                {index % 5 === 0 ? "\u2728" : index % 3 === 0 ? "\u{1F496}" : "\u2764\uFE0F"}
              </span>
            ))}
          </div>
        )}
        
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
              <div>
                <strong
                  id="view-user-name"
                  style={{
                  filter: privacyMode ? "blur(10px)" : undefined,
                  cursor: privacyMode ? "pointer" : undefined,
                  transition: privacyMode ? "filter 0.2s ease" : undefined,
                  }}
                >
                  {selectedUser.name}
                </strong>
                <div
                  className="small text-body-secondary"
                  style={{
                    filter: privacyMode ? "blur(10px)" : undefined,
                    cursor: privacyMode ? "pointer" : undefined,
                    transition: privacyMode ? "filter 0.2s ease" : undefined,
                  }}
                >
                  {presenceLabel || "Offline"}
                </div>
              </div>
            ) : (
              "Select a user"
            )}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", position: "relative" }}>
            <button
              type="button"
              className="btn btn-sm btn-outline-success"
              onClick={triggerConfetti}
              title="Confetti"
              aria-label="Confetti"
              disabled={!selectedUser}
            >
              {"\u{1F389}"}
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline-danger"
              onClick={triggerPunch}
              title="Punch"
              aria-label="Punch"
              disabled={!selectedUser}
            >
              {"\u{1F44A}"}
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline-danger"
              onClick={triggerLove}
              title="Love"
              aria-label="Love"
              disabled={!selectedUser}
            >
              {"\u2764\uFE0F"}
            </button>
            <span
              aria-hidden="true"
              style={{
                width: 1,
                height: 28,
                background: "var(--bs-border-color)",
                margin: "0 4px",
              }}
            />
            <button
              type="button"
              className={`btn btn-sm ${
                privacyMode ? "btn-warning" : "btn-outline-warning"
              }`}
              onClick={() => setPrivacyMode(!privacyMode)}
              title={privacyMode ? "Privacy mode on" : "Privacy mode off"}
              aria-label={privacyMode ? "Privacy mode on" : "Privacy mode off"}
            >
              {"\u{1F512}"}
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline-primary"
              onClick={() => void refreshChatState()}
              title="Refresh chats and notifications"
              aria-label="Refresh chats and notifications"
              disabled={isRefreshingChat}
            >
              {isRefreshingChat ? "..." : "\u21BB"}
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={() => setIsHeaderMenuOpen((v) => !v)}
              title="More actions"
              aria-label="More actions"
              disabled={!selectedUser}
            >
              {"\u22EF"}
            </button>
            {isHeaderMenuOpen && selectedUser && (
              <>
                <div
                  style={{ position: "fixed", inset: 0, zIndex: 1499 }}
                  onClick={() => setIsHeaderMenuOpen(false)}
                />
                <div
                  className="bg-body border rounded shadow-sm p-2"
                  style={{
                    position: "absolute",
                    top: "calc(100% + 8px)",
                    right: 0,
                    zIndex: 1500,
                    minWidth: 190,
                  }}
                >
                  <div className="d-grid gap-2">
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-info"
                      onClick={() => {
                        setIsHeaderMenuOpen(false)
                        openNotesForSelectedUser()
                      }}
                    >
                      {"\u{1F4DD}"} Notes
                    </button>
                    <button
                      type="button"
                      className={`btn btn-sm ${
                        isStarredPanelOpen ? "btn-warning" : "btn-outline-warning"
                      }`}
                      onClick={() => {
                        setIsHeaderMenuOpen(false)
                        setIsStarredPanelOpen((v) => !v)
                      }}
                    >
                      Starred
                    </button>
                    <button
                      type="button"
                      className={`btn btn-sm ${
                        isSharedPanelOpen ? "btn-primary" : "btn-outline-primary"
                      }`}
                      onClick={() => {
                        setIsHeaderMenuOpen(false)
                        setIsSharedPanelOpen((v) => !v)
                      }}
                    >
                      Media & Files
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-primary"
                      onClick={() => {
                        setIsHeaderMenuOpen(false)
                        void startTicTacToe()
                      }}
                    >
                      {"\u274C"}
                      {"\u2B55"} Game
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {selectedUser && isStarredPanelOpen && (
          <>
            <div
              className="position-absolute top-0 start-0 w-100 h-100"
              style={{ background: "rgba(0,0,0,0.35)", zIndex: 1450 }}
              role="presentation"
              onClick={() => setIsStarredPanelOpen(false)}
            />
            <div
              className="position-absolute top-0 end-0 h-100 bg-body border-start shadow-lg d-flex flex-column"
              style={{
                width: isMobileLayout ? "100%" : "min(460px, 44vw)",
                zIndex: 1451,
              }}
              role="dialog"
              aria-modal="true"
              aria-label="Starred messages viewer"
            >
              <div className="p-3 border-bottom d-flex align-items-start justify-content-between gap-3">
                <div>
                  <div className="fw-semibold">Starred Messages</div>
                  <div className="small text-body-secondary">
                    Important messages saved in this chat
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  onClick={() => setIsStarredPanelOpen(false)}
                  aria-label="Close starred messages panel"
                  title="Close"
                >
                  {"\u2715"}
                </button>
              </div>
              <div className="p-3 flex-grow-1" style={{ overflowY: "auto" }}>
                {starredMessagesLoading && (
                  <div className="small text-body-secondary mb-3">Loading starred messages...</div>
                )}
                {starredMessagesNotice && (
                  <div className="alert alert-secondary py-2 mb-3">{starredMessagesNotice}</div>
                )}

                <div className="mb-4">
                  <div className="fw-semibold mb-2">
                    Messages ({starredSections.textMessages.length})
                  </div>
                  {starredSections.textMessages.length > 0 ? (
                    <div className="d-flex flex-column gap-2">
                      {starredSections.textMessages.map((message) => {
                        const decoded = decodeRichMessage(message.message)
                        const text =
                          decoded.kind === "plain"
                            ? decoded.value
                            : decoded.value.text ?? ""

                        return (
                          <div key={message._id} className="border rounded p-3 bg-body-tertiary">
                            <div className="small text-body-secondary mb-1">
                              {message.sender === sender ? "You" : selectedUser.name} ·{" "}
                              {formatDateLabel(message.createdAt)} · {formatTimeLabel(message.createdAt)}
                            </div>
                            <div style={{ whiteSpace: "pre-wrap" }}>{renderEmojiText(text)}</div>
                            <div className="d-flex align-items-center justify-content-between mt-2">
                              <button
                                type="button"
                                className="btn btn-link btn-sm px-0"
                                onClick={() => {
                                  scrollToMessage(message._id)
                                  setIsStarredPanelOpen(false)
                                }}
                              >
                                View in chat
                              </button>
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-warning"
                                onClick={() => void toggleStarMessage(message)}
                              >
                                Unstar
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="text-body-secondary small">No starred text messages yet.</div>
                  )}
                </div>

                <div>
                  <div className="fw-semibold mb-2">
                    Media / Links ({starredSections.mediaAndLinks.length})
                  </div>
                  {starredSections.mediaAndLinks.length > 0 ? (
                    <div className="d-flex flex-column gap-2">
                      {starredSections.mediaAndLinks.map((message) => {
                        const decoded = decodeRichMessage(message.message)
                        const plain = decoded.kind === "plain" ? decoded.value.trim() : ""
                        const plainUrls = decoded.kind === "plain" ? extractUrlsFromText(plain) : []

                        return (
                          <div key={message._id} className="border rounded p-3 bg-body-tertiary">
                            <div className="small text-body-secondary mb-2">
                              {message.sender === sender ? "You" : selectedUser.name} ·{" "}
                              {formatDateLabel(message.createdAt)} · {formatTimeLabel(message.createdAt)}
                            </div>

                            {decoded.kind === "rich" && decoded.value.type === "gif" && decoded.value.gifUrl && (
                              <img
                                src={decoded.value.gifUrl}
                                alt={decoded.value.text ?? "GIF"}
                                style={{ width: 120, height: 120, objectFit: "cover", borderRadius: 8 }}
                              />
                            )}

                            {decoded.kind === "rich" && decoded.value.type === "file" && (
                              <div className="d-flex flex-column gap-2">
                                {(decoded.value.mimeType?.startsWith("image/") ||
                                  /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(decoded.value.fileUrl.toLowerCase())) && (
                                  <img
                                    src={decoded.value.fileUrl}
                                    alt={decoded.value.fileName ?? "Image"}
                                    style={{ width: 120, height: 120, objectFit: "cover", borderRadius: 8 }}
                                  />
                                )}
                                {(decoded.value.mimeType?.startsWith("video/") ||
                                  /\.(mp4|webm|ogg|mov|m4v|avi|mkv)$/i.test(decoded.value.fileUrl.toLowerCase())) && (
                                  <video
                                    src={decoded.value.fileUrl}
                                    controls
                                    style={{ width: "100%", maxWidth: 220, borderRadius: 8 }}
                                  />
                                )}
                                <a
                                  href={decoded.value.fileUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  style={{ wordBreak: "break-word" }}
                                >
                                  {decoded.value.fileName ?? "Attachment"}
                                </a>
                              </div>
                            )}

                            {decoded.kind === "plain" && plainUrls.length > 0 && (
                              <div className="d-flex flex-column gap-1">
                                {plainUrls.map((url) => (
                                  <a key={url} href={url} target="_blank" rel="noreferrer" style={{ wordBreak: "break-word" }}>
                                    {url}
                                  </a>
                                ))}
                              </div>
                            )}

                            {decoded.kind === "rich" && decoded.value.type === "text" && decoded.value.text && (
                              <div className="d-flex flex-column gap-1">
                                {extractUrlsFromText(decoded.value.text).map((url) => (
                                  <a key={url} href={url} target="_blank" rel="noreferrer" style={{ wordBreak: "break-word" }}>
                                    {url}
                                  </a>
                                ))}
                              </div>
                            )}

                            {((decoded.kind === "plain" && !plainUrls.length) ||
                              (decoded.kind === "rich" && decoded.value.text)) && (
                              <div className="small text-body-secondary mt-2" style={{ whiteSpace: "pre-wrap" }}>
                                {decoded.kind === "plain" ? plain : decoded.value.text ?? ""}
                              </div>
                            )}

                            <div className="d-flex align-items-center justify-content-between mt-2">
                              <button
                                type="button"
                                className="btn btn-link btn-sm px-0"
                                onClick={() => {
                                  scrollToMessage(message._id)
                                  setIsStarredPanelOpen(false)
                                }}
                              >
                                View in chat
                              </button>
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-warning"
                                onClick={() => void toggleStarMessage(message)}
                              >
                                Unstar
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="text-body-secondary small">No starred media or links yet.</div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {selectedUser && isSharedPanelOpen && (
          <>
            <div
              className="position-absolute top-0 start-0 w-100 h-100"
              style={{ background: "rgba(0,0,0,0.35)", zIndex: 1400 }}
              role="presentation"
              onClick={() => setIsSharedPanelOpen(false)}
            />
            <div
              className="position-absolute top-0 end-0 h-100 bg-body border-start shadow-lg d-flex flex-column"
              style={{
                width: isMobileLayout ? "100%" : "min(440px, 42vw)",
                zIndex: 1401,
              }}
              role="dialog"
              aria-modal="true"
              aria-label="Media and files viewer"
            >
              <div className="p-3 border-bottom d-flex align-items-start justify-content-between gap-3">
                <div>
                  <div className="fw-semibold">Media & Files</div>
                  <div className="small text-body-secondary">
                    Browse everything shared in this chat
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  onClick={() => setIsSharedPanelOpen(false)}
                  aria-label="Close media and files panel"
                  title="Close"
                >
                  {"\u2715"}
                </button>
              </div>
              <div className="p-3 border-bottom">
                <div className="btn-group w-100" role="tablist" aria-label="Shared content tabs">
                  <button
                    type="button"
                    className={`btn btn-sm ${
                      sharedPanelTab === "media" ? "btn-primary" : "btn-outline-primary"
                    }`}
                    onClick={() => setSharedPanelTab("media")}
                  >
                    Media ({sharedContent.media.length})
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${
                      sharedPanelTab === "files" ? "btn-primary" : "btn-outline-primary"
                    }`}
                    onClick={() => setSharedPanelTab("files")}
                  >
                    Files ({sharedContent.files.length})
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${
                      sharedPanelTab === "links" ? "btn-primary" : "btn-outline-primary"
                    }`}
                    onClick={() => setSharedPanelTab("links")}
                  >
                    Links ({sharedContent.links.length})
                  </button>
                </div>
              </div>
              <div className="p-3 flex-grow-1" style={{ overflowY: "auto" }}>
                {sharedContentLoading && (
                  <div className="small text-body-secondary mb-3">Loading shared content...</div>
                )}
                {sharedContentNotice && (
                  <div className="alert alert-secondary py-2 mb-3">{sharedContentNotice}</div>
                )}

                {sharedPanelTab === "media" && (
                  sharedContent.media.length > 0 ? (
                    <div
                      className="d-grid gap-3"
                      style={{
                        gridTemplateColumns: isMobileLayout
                          ? "repeat(2, minmax(0, 1fr))"
                          : "repeat(2, minmax(0, 1fr))",
                      }}
                    >
                      {sharedContent.media.map((item) => (
                        <div key={item.id} className="border rounded p-2 bg-body-tertiary">
                          {item.mediaType === "video" ? (
                            <video
                              src={item.url}
                              controls
                              preload="metadata"
                              style={{ width: "100%", aspectRatio: "1 / 1", borderRadius: 8, objectFit: "cover" }}
                            />
                          ) : (
                            <button
                              type="button"
                              className="btn p-0 border-0 w-100"
                              onClick={() => setImagePreview({ url: item.url, title: item.title })}
                              title={`Preview ${item.title}`}
                              aria-label={`Preview ${item.title}`}
                              style={{ background: "transparent", boxShadow: "none" }}
                            >
                              <img
                                src={item.url}
                                alt={item.title}
                                style={{ width: "100%", aspectRatio: "1 / 1", borderRadius: 8, objectFit: "cover" }}
                                loading="lazy"
                              />
                            </button>
                          )}
                          <div className="mt-2 small fw-semibold text-truncate">{item.title}</div>
                          <div className="small text-body-secondary">
                            {formatDateLabel(item.createdAt)} · {formatTimeLabel(item.createdAt)}
                          </div>
                          {item.text && (
                            <div className="small text-body-secondary mt-1 text-truncate">
                              {item.text}
                            </div>
                          )}
                          <button
                            type="button"
                            className="btn btn-link btn-sm px-0 mt-1"
                            onClick={() => scrollToMessage(item.messageId)}
                          >
                            View message
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-body-secondary small">No media shared in this chat yet.</div>
                  )
                )}

                {sharedPanelTab === "files" && (
                  sharedContent.files.length > 0 ? (
                    <div className="d-flex flex-column gap-2">
                      {sharedContent.files.map((item) => (
                        <div
                          key={item.id}
                          className="border rounded p-3 bg-body-tertiary d-flex align-items-start justify-content-between gap-3"
                        >
                          <div style={{ minWidth: 0 }}>
                            <div className="fw-semibold text-truncate">{item.fileName}</div>
                            <div className="small text-body-secondary">
                              {[item.mimeType, formatFileSize(item.sizeBytes), formatDateLabel(item.createdAt)]
                                .filter(Boolean)
                                .join(" · ")}
                            </div>
                            {item.text && (
                              <div className="small text-body-secondary mt-1" style={{ whiteSpace: "pre-wrap" }}>
                                {item.text}
                              </div>
                            )}
                          </div>
                          <div className="d-flex flex-column align-items-end gap-2">
                            <a
                              href={item.url}
                              download={item.fileName}
                              target="_blank"
                              rel="noreferrer"
                              className="btn btn-sm btn-outline-primary"
                            >
                              Download
                            </a>
                            <button
                              type="button"
                              className="btn btn-sm btn-link p-0"
                              onClick={() => scrollToMessage(item.messageId)}
                            >
                              View message
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-body-secondary small">No documents shared in this chat yet.</div>
                  )
                )}

                {sharedPanelTab === "links" && (
                  sharedContent.links.length > 0 ? (
                    <div className="d-flex flex-column gap-2">
                      {sharedContent.links.map((item) => (
                        <div
                          key={item.id}
                          className="border rounded p-3 bg-body-tertiary d-flex align-items-start justify-content-between gap-3"
                        >
                          <div style={{ minWidth: 0 }}>
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noreferrer"
                              className="fw-semibold"
                              style={{ wordBreak: "break-word" }}
                            >
                              {item.label}
                            </a>
                            <div className="small text-body-secondary" style={{ wordBreak: "break-word" }}>
                              {item.url}
                            </div>
                            <div className="small text-body-secondary mt-1">
                              {formatDateLabel(item.createdAt)} · {formatTimeLabel(item.createdAt)}
                            </div>
                            {item.text && item.text !== item.url && (
                              <div className="small text-body-secondary mt-1" style={{ whiteSpace: "pre-wrap" }}>
                                {item.text}
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            className="btn btn-sm btn-link p-0"
                            onClick={() => scrollToMessage(item.messageId)}
                          >
                            View message
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-body-secondary small">No links shared in this chat yet.</div>
                  )
                )}
              </div>
            </div>
          </>
        )}

        {selectedUser && (visiblePinnedMessages.length > 0 || pinnedMessagesNotice) && (
          <div className="border-bottom bg-body px-3 py-2">
            <div className="d-flex align-items-center justify-content-between gap-2 mb-2">
              <div className="small fw-semibold">
                {"\u{1F4CC}"} Pinned ({visiblePinnedMessages.length}/{MAX_PINNED_MESSAGES})
              </div>
              {pinnedMessagesNotice && (
                <div className="small text-warning text-end">{pinnedMessagesNotice}</div>
              )}
            </div>
            {visiblePinnedMessages.length > 0 && (
              <div className="d-flex gap-2 overflow-auto pb-1">
                {visiblePinnedMessages.map((message) => {
                  const preview = getCopyTextForMessage(message.message).trim() || "Message"
                  return (
                    <div
                      key={message._id}
                      className="border rounded bg-body-tertiary d-flex align-items-center gap-2 px-2 py-1"
                      style={{ minWidth: 180, maxWidth: 280 }}
                    >
                      <button
                        type="button"
                        className="btn btn-link btn-sm text-start p-0 flex-grow-1 text-decoration-none"
                        onClick={() => void openPinnedMessage(message)}
                        title={preview}
                        style={{ minWidth: 0 }}
                      >
                        <div className="small text-body-emphasis text-truncate">
                          {preview}
                        </div>
                        <div className="small text-body-secondary text-truncate">
                          {formatDateLabel(message.createdAt)} · {formatTimeLabel(message.createdAt)}
                        </div>
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary py-0 px-1"
                        onClick={() => togglePinMessage(message)}
                        title="Unpin message"
                        aria-label="Unpin message"
                      >
                        {"\u2715"}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

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
                                setPinnedMessageIds((prev) =>
                                  prev.filter((id) => id !== m._id && id !== g.gameId),
                                )
                                setPinnedMessages((prev) =>
                                  prev.filter((message) => message._id !== m._id && message._id !== g.gameId),
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
            const isPinned = isMessagePinned(m)
                const bubble = (() => {
                  if (decoded.kind === "plain") {
                    const plain = decoded.value.trim()
                    const looksLikeSingleGifUrl = isGifUrl(plain) && !/\s/.test(plain)
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
                  onMouseDownCapture={(e) => handleMessageSecondaryClick(m, isOutgoing, e)}
                  onContextMenuCapture={(e) => openMessageMenu(m, isOutgoing, e)}
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
                    {isPinned && <span className="ms-1">· {"\u{1F4CC}"}</span>}
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
                    onClick={(e) => e.stopPropagation()}
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
                  decoded.kind === "plain" && isGifUrl(plain) && !/\s/.test(plain)
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
                      <button
                        type="button"
                        className="btn btn-sm sl-menu-icon-btn"
                        title={isMessageStarred(m) ? "Unstar message" : "Star message"}
                        aria-label={isMessageStarred(m) ? "Unstar message" : "Star message"}
                        onClick={() => {
                          void toggleStarMessage(m)
                          setMessageMenu(null)
                        }}
                      >
                        {isMessageStarred(m) ? "\u2605" : "\u2606"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm sl-menu-icon-btn"
                        title={isMessagePinned(m) ? "Unpin message" : "Pin message"}
                        aria-label={isMessagePinned(m) ? "Unpin message" : "Pin message"}
                        onClick={() => {
                          togglePinMessage(m)
                          setMessageMenu(null)
                        }}
                      >
                        {isMessagePinned(m) ? "\u{1F4CC}" : "\u{1F4CD}"}
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
                            setPinnedMessageIds((prev) =>
                              prev.filter((id) => id !== messageMenu.messageId),
                            )
                            setPinnedMessages((prev) =>
                              prev.filter((message) => message._id !== messageMenu.messageId),
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
                onChange={(e) => handleInputChange(e.target.value)}
                onPaste={onPasteUpload}
                onFocus={() => emitPresenceHeartbeat()}
                onBlur={() => stopTypingIndicator(selectedUser?.phone ?? null)}
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
                    stopTypingIndicator(selectedUser?.phone ?? null)
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
                            style={{ width: "100%", height: 108, objectFit: "cover", borderRadius: 6 }}
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
