import { useEffect, useMemo, useState } from "react"
import { deleteUser, getUsers, registerUser, updateUser } from "../services/api"
import type { User, UserFormPayload } from "../types/user.types"

type PanelMode = "create" | "edit"

const EMPTY_FORM: UserFormPayload = {
  name: "",
  phone: "",
  password: "",
}

const Users = () => {
  const [users, setUsers] = useState<User[]>([])
  const [isPanelOpen, setIsPanelOpen] = useState(false)
  const [panelMode, setPanelMode] = useState<PanelMode>("create")
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [form, setForm] = useState<UserFormPayload>(EMPTY_FORM)
  const [loading, setLoading] = useState(false)
  const [submitError, setSubmitError] = useState("")

  const selectedUser = useMemo(
    () => users.find((user) => user._id === selectedUserId) ?? null,
    [selectedUserId, users],
  )

  const loadUsers = async () => {
    const res = await getUsers()
    setUsers(Array.isArray(res.data) ? res.data : [])
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadUsers()
    }, 0)

    return () => {
      window.clearTimeout(timer)
    }
  }, [])

  const openCreatePanel = () => {
    setPanelMode("create")
    setSelectedUserId(null)
    setForm(EMPTY_FORM)
    setSubmitError("")
    setIsPanelOpen(true)
  }

  const openEditPanel = (user: User) => {
    setPanelMode("edit")
    setSelectedUserId(user._id)
    setForm({
      name: user.name,
      phone: user.phone,
      password: "",
    })
    setSubmitError("")
    setIsPanelOpen(true)
  }

  const closePanel = () => {
    setIsPanelOpen(false)
    setSelectedUserId(null)
    setForm(EMPTY_FORM)
    setSubmitError("")
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  const handleDelete = async (id: string) => {
    await deleteUser(id)
    await loadUsers()
    if (selectedUserId === id) closePanel()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!form.name.trim() || !form.phone.trim()) {
      setSubmitError("Name and phone are required.")
      return
    }

    if (panelMode === "create" && !form.password.trim()) {
      setSubmitError("Password is required for a new user.")
      return
    }

    try {
      setLoading(true)
      setSubmitError("")

      if (panelMode === "create") {
        await registerUser({
          name: form.name.trim(),
          phone: form.phone.trim(),
          password: form.password.trim(),
        })
      } else if (selectedUserId) {
        await updateUser(selectedUserId, {
          name: form.name.trim(),
          phone: form.phone.trim(),
          password: form.password.trim() || undefined,
        })
      }

      await loadUsers()
      closePanel()
    } catch (err: unknown) {
      const message =
        typeof err === "object" &&
        err !== null &&
        "response" in err &&
        typeof (err as { response?: { data?: { message?: string } } }).response?.data?.message === "string"
          ? (err as { response?: { data?: { message?: string } } }).response!.data!.message!
          : panelMode === "create"
            ? "Failed to create user."
            : "Failed to update user."
      setSubmitError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container-fluid mt-4">
      <div className="d-flex align-items-center justify-content-between mb-3">
        <div>
          <h3 className="mb-1">Users</h3>
          <div className="text-body-secondary small">
            Manage members and update details from one place.
          </div>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={openCreatePanel}
        >
          Add User
        </button>
      </div>

      <div className="row g-3">
        <div className={isPanelOpen ? "col-lg-7" : "col-12"}>
          <div className="card shadow-sm">
            <div className="card-body p-0">
              <table className="table table-hover mb-0 align-middle">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Phone</th>
                    <th style={{ width: 180 }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="text-center text-body-secondary py-4">
                        No users found.
                      </td>
                    </tr>
                  ) : (
                    users.map((user) => (
                      <tr key={user._id}>
                        <td>{user.name}</td>
                        <td>{user.phone}</td>
                        <td>
                          <div className="d-flex gap-2">
                            <button
                              type="button"
                              className="btn btn-outline-secondary btn-sm"
                              onClick={() => openEditPanel(user)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="btn btn-danger btn-sm"
                              onClick={() => void handleDelete(user._id)}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {isPanelOpen && (
          <div className="col-lg-5">
            <div className="card shadow-sm">
              <div className="card-body">
                <div className="d-flex align-items-start justify-content-between mb-3">
                  <div>
                    <h5 className="mb-1">
                      {panelMode === "create" ? "Add User" : "Edit User"}
                    </h5>
                    <div className="text-body-secondary small">
                      {panelMode === "create"
                        ? "Create a new user with a simple form."
                        : `Update ${selectedUser?.name ?? "user"} details and password.`}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm"
                    onClick={closePanel}
                  >
                    Close
                  </button>
                </div>

                {submitError && (
                  <div className="alert alert-danger py-2">{submitError}</div>
                )}

                <form onSubmit={handleSubmit}>
                  <div className="mb-3">
                    <label className="form-label">Name</label>
                    <input
                      type="text"
                      name="name"
                      className="form-control"
                      value={form.name}
                      onChange={handleChange}
                      placeholder="Enter name"
                    />
                  </div>

                  <div className="mb-3">
                    <label className="form-label">Phone</label>
                    <input
                      type="text"
                      name="phone"
                      className="form-control"
                      value={form.phone}
                      onChange={handleChange}
                      placeholder="Enter phone number"
                    />
                  </div>

                  <div className="mb-3">
                    <label className="form-label">
                      {panelMode === "create" ? "Password" : "New Password"}
                    </label>
                    <input
                      type="password"
                      name="password"
                      className="form-control"
                      value={form.password}
                      onChange={handleChange}
                      placeholder={
                        panelMode === "create"
                          ? "Enter password"
                          : "Leave blank to keep current password"
                      }
                    />
                  </div>

                  <div className="d-flex gap-2">
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={loading}
                    >
                      {loading
                        ? panelMode === "create"
                          ? "Saving..."
                          : "Updating..."
                        : panelMode === "create"
                          ? "Create User"
                          : "Save Changes"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline-secondary"
                      onClick={closePanel}
                      disabled={loading}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default Users
