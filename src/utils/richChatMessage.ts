export type RichMessageType = "text" | "gif"

export type RichReplyToV1 = {
  id: string
  sender: string
  type: RichMessageType
  previewText?: string
  previewGifUrl?: string
}

export type RichChatMessageV1 = {
  v: 1
  type: RichMessageType
  text?: string
  gifUrl?: string
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
    if (parsed.type !== "text" && parsed.type !== "gif") return { kind: "plain", value: raw }
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

  const t = decoded.value.text?.trim() ?? ""
  return { type: "text" as const, previewText: t.slice(0, 120) }
}

