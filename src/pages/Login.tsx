import { useState } from "react"
import { loginUser } from "../services/api"
import { useNavigate } from "react-router-dom"

const Login = () => {
  const navigate = useNavigate()

  const [phone, setPhone] = useState("")
  const [password, setPassword] = useState("")

  const handleLogin = async () => {
    const res = await loginUser({ phone, password })
    localStorage.setItem("token", res.data.token)
    localStorage.setItem("userPhone", res.data.user?.phone ?? phone)
    navigate("/users")
  }

  return (
    <div className="container mt-5 col-md-4">
      <h3>Login</h3>
      <input
        className="form-control mb-2"
        placeholder="Phone"
        onChange={(e) => setPhone(e.target.value)}
      />
      <input
        type="password"
        className="form-control mb-2"
        placeholder="Password"
        onChange={(e) => setPassword(e.target.value)}
      />
      <button className="btn btn-primary w-100" onClick={handleLogin}>
        Login
      </button>
    </div>
  )
}

export default Login
