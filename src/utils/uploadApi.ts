import axios from "axios"

export type ApiUploadResult = {
  url: string
  fileName?: string
  mimeType?: string
  bytes?: number
  resourceType?: string
  publicId?: string
}

export const uploadFileToApi = async (
  file: File,
  opts?: { onProgress?: (pct: number) => void },
): Promise<ApiUploadResult> => {
  const apiBase = (import.meta.env.VITE_API_URI as string | undefined) ?? ""
  if (!apiBase) throw new Error("Missing VITE_API_URI")

  const normalized = apiBase.endsWith("/") ? apiBase.slice(0, -1) : apiBase
  const endpoint = `${normalized}/uploads`

  let res
  try {
    res = await axios.post(endpoint, file, {
      headers: {
        "Content-Type": file.type || "application/octet-stream",
        "X-File-Name": encodeURIComponent(file.name || "upload"),
      },
      onUploadProgress: (evt) => {
        if (!opts?.onProgress) return
        const total = evt.total ?? 0
        if (!total) return
        const pct = Math.max(0, Math.min(100, Math.round((evt.loaded / total) * 100)))
        opts.onProgress(pct)
      },
    })
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const msg =
        (err.response?.data as any)?.message ||
        (err.response?.data as any)?.error?.message ||
        err.message
      throw new Error(msg)
    }
    throw err
  }

  const data = (res as any).data as ApiUploadResult
  if (!data?.url) throw new Error("Upload API did not return a URL")
  return data
}
