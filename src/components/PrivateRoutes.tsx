import type { ReactElement } from "react"
import { Navigate } from "react-router-dom"

interface Props {
  children: ReactElement
}

const PrivateRoute = ({ children }: Props) => {
  const token = localStorage.getItem("token")

  if (!token) {
    return <Navigate to="/login" replace />
  }

  return children
}

export default PrivateRoute
