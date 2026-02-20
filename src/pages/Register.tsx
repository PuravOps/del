import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { registerUser } from "../services/api"
import { RegisterPayload } from "../types/user.types"

const Register = () => {
  const navigate = useNavigate()

  const [form, setForm] = useState<RegisterPayload>({
    name: "",
    phone: "",
    password: "",
  })

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!form.name || !form.phone || !form.password) {
      setError("All fields are required")
      return
    }

    try {
      setLoading(true)
      setError("")

      await registerUser(form)

      navigate("/") // go to login
    } catch (err: any) {
      setError(err.response?.data?.message || "Registration failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container mt-5 col-md-4">
      <div className="card shadow">
        <div className="card-body">
          <h3 className="text-center mb-4">Register</h3>

          {error && (
            <div className="alert alert-danger">{error}</div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="mb-3">
              <label className="form-label">Name</label>
              <input
                type="text"
                name="name"
                className="form-control"
                placeholder="Enter name"
                value={form.name}
                onChange={handleChange}
              />
            </div>

            <div className="mb-3">
              <label className="form-label">Phone Number</label>
              <input
                type="text"
                name="phone"
                className="form-control"
                placeholder="Enter phone number"
                value={form.phone}
                onChange={handleChange}
              />
            </div>

            <div className="mb-3">
              <label className="form-label">Password</label>
              <input
                type="password"
                name="password"
                className="form-control"
                placeholder="Enter password"
                value={form.password}
                onChange={handleChange}
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary w-100"
              disabled={loading}
            >
              {loading ? "Registering..." : "Register"}
            </button>
          </form>

          <div className="text-center mt-3">
            <small>
              Already have an account?{" "}
              <span
                className="text-primary"
                style={{ cursor: "pointer" }}
                onClick={() => navigate("/")}
              >
                Login
              </span>
            </small>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Register
