import type {
  MessageResponse,
  SharedContentCollection,
  SharedFileItem,
  SharedLinkItem,
  SharedMediaItem,
} from "../types/chat.types"
import { decodeRichMessage } from "./richChatMessage"

const URL_REGEX = /https?:\/\/[^\s<>"'`]+/gi

const cleanUrl = (url: string) => url.replace(/[),.!?;:]+$/g, "")

export const isGifUrl = (value: string) => {
  const v = value.trim().toLowerCase()
  if (!v) return false
  if (!/^https?:\/\//.test(v)) return false
  if (v.endsWith(".gif")) return true
  if (v.includes("giphy.com/")) return true
  if (v.includes("tenor.com/")) return true
  return false
}

export const isImageUrl = (value: string) =>
  /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(value.split("?")[0] ?? "")

export const isVideoUrl = (value: string) =>
  /\.(mp4|webm|ogg|mov|m4v|avi|mkv)$/i.test(value.split("?")[0] ?? "")

const extractUrls = (value: string | undefined) => {
  if (!value) return []
  const matches = value.match(URL_REGEX) ?? []
  return matches.map(cleanUrl).filter(Boolean)
}

const makeMediaId = (messageId: string, suffix: string) => `${messageId}:media:${suffix}`
const makeFileId = (messageId: string, suffix: string) => `${messageId}:file:${suffix}`
const makeLinkId = (messageId: string, suffix: string) => `${messageId}:link:${suffix}`

const makeLinkLabel = (url: string) => {
  try {
    const parsed = new URL(url)
    const path = parsed.pathname === "/" ? "" : parsed.pathname
    return `${parsed.hostname}${path}`.slice(0, 120)
  } catch {
    return url.slice(0, 120)
  }
}

export const extractSharedContent = (messages: MessageResponse[]): SharedContentCollection => {
  const media: SharedMediaItem[] = []
  const files: SharedFileItem[] = []
  const links: SharedLinkItem[] = []
  const seenMedia = new Set<string>()
  const seenFiles = new Set<string>()
  const seenLinks = new Set<string>()

  for (const message of messages) {
    const decoded = decodeRichMessage(message.message)

    const pushMedia = (item: SharedMediaItem) => {
      const key = `${item.messageId}:${item.url}`
      if (seenMedia.has(key)) return
      seenMedia.add(key)
      media.push(item)
    }

    const pushFile = (item: SharedFileItem) => {
      const key = `${item.messageId}:${item.url}`
      if (seenFiles.has(key)) return
      seenFiles.add(key)
      files.push(item)
    }

    const pushLink = (item: SharedLinkItem) => {
      const key = `${item.messageId}:${item.url}`
      if (seenLinks.has(key)) return
      seenLinks.add(key)
      links.push(item)
    }

    const classifyTextUrls = (value: string | undefined) => {
      const urls = extractUrls(value)
      urls.forEach((url, index) => {
        if (isGifUrl(url)) {
          pushMedia({
            id: makeMediaId(message._id, `text-gif-${index}`),
            messageId: message._id,
            sender: message.sender,
            createdAt: message.createdAt,
            url,
            title: "GIF",
            mediaType: "gif",
            text: value?.trim() || undefined,
          })
          return
        }

        if (isImageUrl(url)) {
          pushMedia({
            id: makeMediaId(message._id, `text-image-${index}`),
            messageId: message._id,
            sender: message.sender,
            createdAt: message.createdAt,
            url,
            title: "Image",
            mediaType: "image",
            text: value?.trim() || undefined,
          })
          return
        }

        if (isVideoUrl(url)) {
          pushMedia({
            id: makeMediaId(message._id, `text-video-${index}`),
            messageId: message._id,
            sender: message.sender,
            createdAt: message.createdAt,
            url,
            title: "Video",
            mediaType: "video",
            text: value?.trim() || undefined,
          })
          return
        }

        pushLink({
          id: makeLinkId(message._id, String(index)),
          messageId: message._id,
          sender: message.sender,
          createdAt: message.createdAt,
          url,
          label: makeLinkLabel(url),
          text: value?.trim() || undefined,
        })
      })
    }

    if (decoded.kind === "plain") {
      classifyTextUrls(decoded.value)
      continue
    }

    const rich = decoded.value
    classifyTextUrls(rich.text)

    if (rich.type === "gif" && rich.gifUrl) {
      pushMedia({
        id: makeMediaId(message._id, "gif"),
        messageId: message._id,
        sender: message.sender,
        createdAt: message.createdAt,
        url: rich.gifUrl,
        title: rich.text?.trim() || "GIF",
        mediaType: "gif",
        text: rich.text?.trim() || undefined,
      })
      continue
    }

    if (rich.type !== "file") continue

    const url = rich.fileUrl
    const title = rich.fileName?.trim() || rich.text?.trim() || "Attachment"
    const sharedBase = {
      messageId: message._id,
      sender: message.sender,
      createdAt: message.createdAt,
      url,
      mimeType: rich.mimeType,
      text: rich.text?.trim() || undefined,
    }

    if (rich.mimeType?.startsWith("image/") || isImageUrl(url)) {
      pushMedia({
        id: makeMediaId(message._id, "file-image"),
        title,
        mediaType: "image",
        ...sharedBase,
      })
      continue
    }

    if (rich.mimeType?.startsWith("video/") || isVideoUrl(url)) {
      pushMedia({
        id: makeMediaId(message._id, "file-video"),
        title,
        mediaType: "video",
        ...sharedBase,
      })
      continue
    }

    pushFile({
      id: makeFileId(message._id, "file"),
      fileName: rich.fileName?.trim() || "Attachment",
      sizeBytes: rich.sizeBytes,
      ...sharedBase,
    })
  }

  media.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  files.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  links.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  return { media, files, links }
}
