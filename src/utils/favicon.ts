type FaviconState = {
  originalHref: string | null
  baseHref: string | null
}

const state: FaviconState = {
  originalHref: null,
  baseHref: null,
}

const getFaviconLink = (): HTMLLinkElement | null => {
  const existing = document.querySelector<HTMLLinkElement>('link[rel~="icon"]')
  if (existing) return existing

  const link = document.createElement("link")
  link.rel = "icon"
  document.head.appendChild(link)
  return link
}

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = (e) => reject(e)
    img.src = src
  })

const drawBadgedIcon = async (baseHref: string, count: number) => {
  const size = 64
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size

  const ctx = canvas.getContext("2d")
  if (!ctx) return null

  try {
    const img = await loadImage(baseHref)
    ctx.drawImage(img, 0, 0, size, size)
  } catch {
    ctx.fillStyle = "#111827"
    ctx.fillRect(0, 0, size, size)
  }

  const label = count > 99 ? "99+" : String(count)
  const radius = 18
  const cx = size - radius
  const cy = radius

  ctx.fillStyle = "#dc2626"
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = "#ffffff"
  ctx.font = "bold 20px system-ui, -apple-system, Segoe UI, Roboto, Arial"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText(label, cx, cy + 1)

  return canvas.toDataURL("image/png")
}

export const setFaviconBadge = async (count: number) => {
  const link = getFaviconLink()
  if (!link) return

  if (!state.originalHref) state.originalHref = link.href || null
  if (!state.baseHref) state.baseHref = state.originalHref

  if (!state.baseHref) return

  const href = await drawBadgedIcon(state.baseHref, count)
  if (href) link.href = href
}

export const clearFaviconBadge = () => {
  const link = getFaviconLink()
  if (!link) return
  if (!state.originalHref) return
  link.href = state.originalHref
}

