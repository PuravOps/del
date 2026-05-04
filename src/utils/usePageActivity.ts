import { useEffect, useState } from "react"

export const usePageActivity = () => {
  const [isActive, setIsActive] = useState(() => {
    if (typeof document === "undefined") return true
    return document.visibilityState === "visible"
  })

  useEffect(() => {
    const recompute = () => {
      setIsActive(document.visibilityState === "visible")
    }

    recompute()

    document.addEventListener("visibilitychange", recompute)

    return () => {
      document.removeEventListener("visibilitychange", recompute)
    }
  }, [])

  return isActive
}
