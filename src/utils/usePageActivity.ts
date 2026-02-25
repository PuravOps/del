import { useEffect, useState } from "react"

export const usePageActivity = () => {
  const [isActive, setIsActive] = useState(() => {
    if (typeof document === "undefined") return true
    return document.visibilityState === "visible" && document.hasFocus()
  })

  useEffect(() => {
    const recompute = () => {
      setIsActive(document.visibilityState === "visible" && document.hasFocus())
    }

    recompute()

    window.addEventListener("focus", recompute)
    window.addEventListener("blur", recompute)
    document.addEventListener("visibilitychange", recompute)

    return () => {
      window.removeEventListener("focus", recompute)
      window.removeEventListener("blur", recompute)
      document.removeEventListener("visibilitychange", recompute)
    }
  }, [])

  return isActive
}

