export type RichMessageType = "text" | "gif" | "file"

export type RichReplyToV1 = {
  id: string
  sender: string
  type: RichMessageType
  previewText?: string
  previewGifUrl?: string
  previewFileUrl?: string
  previewFileMimeType?: string
}

export type RichChatMessageV1 =
  | {
      v: 1
      type: "text"
      text?: string
      replyTo?: RichReplyToV1
    }
  | {
      v: 1
      type: "gif"
      text?: string
      gifUrl?: string
      replyTo?: RichReplyToV1
    }
  | {
      v: 1
      type: "file"
      text?: string
      fileUrl: string
      fileName?: string
      mimeType?: string
      sizeBytes?: number
      cloudinaryPublicId?: string
      cloudinaryResourceType?: "image" | "video" | "raw" | "auto"
      replyTo?: RichReplyToV1
    }

const PREFIX = "__SLRICH__:"

export const encodeRichMessage = (msg: RichChatMessageV1) => `${PREFIX}${JSON.stringify(msg)}`

export const decodeRichMessage = (
  raw: string,
): { kind: "rich"; value: RichChatMessageV1 } | { kind: "plain"; value: string } => {
  if (!raw.startsWith(PREFIX)) return { kind: "plain", value: raw }
  const json = raw.slice(PREFIX.length)
  try {
    const parsed = JSON.parse(json) as RichChatMessageV1
    if (!parsed || parsed.v !== 1) return { kind: "plain", value: raw }
    if (parsed.type !== "text" && parsed.type !== "gif" && parsed.type !== "file") {
      return { kind: "plain", value: raw }
    }
    if (parsed.type === "file") {
      if (!("fileUrl" in parsed) || typeof parsed.fileUrl !== "string" || !parsed.fileUrl.trim()) {
        return { kind: "plain", value: raw }
      }
    }
    return { kind: "rich", value: parsed }
  } catch {
    return { kind: "plain", value: raw }
  }
}

export const makeReplyPreview = (raw: string) => {
  const decoded = decodeRichMessage(raw)
  if (decoded.kind === "plain") {
    const t = decoded.value.trim()
    return { type: "text" as const, previewText: t.slice(0, 120) }
  }

  if (decoded.value.type === "gif") {
    const caption = decoded.value.text?.trim()
    return {
      type: "gif" as const,
      previewText: caption ? caption.slice(0, 120) : "GIF",
      previewGifUrl: decoded.value.gifUrl,
    }
  }

  if (decoded.value.type === "file") {
    const name = decoded.value.fileName?.trim()
    const caption = decoded.value.text?.trim()
    const previewText =
      caption?.slice(0, 120) ??
      name?.slice(0, 120) ??
      (decoded.value.mimeType?.startsWith("image/") ? "Image" : "Attachment")
    return {
      type: "file" as const,
      previewText,
      previewFileUrl: decoded.value.mimeType?.startsWith("image/") ? decoded.value.fileUrl : undefined,
      previewFileMimeType: decoded.value.mimeType,
    }
  }

  const t = decoded.value.text?.trim() ?? ""
  return { type: "text" as const, previewText: t.slice(0, 120) }
}
