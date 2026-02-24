import { ReactNode, useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { socketService } from "../services/socket";
import { getUnseenCounts, ping } from "../services/api";
import { clearFaviconBadge, setFaviconBadge } from "../utils/favicon";
import type { MessageResponse } from "../types/chat.types";

interface Props {
  children: ReactNode;
}

const Layout = ({ children }: Props) => {
  const token = localStorage.getItem("token");
  const userPhone = localStorage.getItem("userPhone") || "";
  const userName = localStorage.getItem("userName") || "";
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    const stored = localStorage.getItem("theme");
    return stored === "light" ? "light" : "dark";
  });

  const location = useLocation();

  useEffect(() => {
    document.documentElement.setAttribute("data-bs-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  const refreshUnseenTotal = useCallback(async () => {
    if (!token || !userPhone) return;

    try {
      const res = await getUnseenCounts(userPhone);
      const rows = Array.isArray(res.data)
        ? (res.data as Array<{ sender: string; count: number }>)
        : [];
      const total = rows.reduce((acc, row) => acc + Number(row.count ?? 0), 0);
      setUnreadTotal(total);
    } catch (e) {
      console.error("Failed to load unseen counts", e);
    }
  }, [token, userPhone]);

  useEffect(() => {
    if (!token || !userPhone) return;

    socketService.connect(userPhone);

    void refreshUnseenTotal();
    void ping();

    const interval = window.setInterval(() => {
      void ping();
    }, 14 * 60 * 1000);

    return () => {
      window.clearInterval(interval);
      socketService.disconnect();
    };
  }, [token, userPhone, refreshUnseenTotal]);

  useEffect(() => {
    if (!token || !userPhone) return;

    const onReceive = (msg: MessageResponse) => {
      if (msg.receiver !== userPhone) return;
      void refreshUnseenTotal();
    };

    socketService.onReceiveMessage(onReceive);

    return () => {
      socketService.offReceiveMessage(onReceive);
    };
  }, [token, userPhone, refreshUnseenTotal]);

  useEffect(() => {
    const handler = () => {
      void refreshUnseenTotal();
    };

    window.addEventListener("unreadCountsChanged", handler);
    return () => {
      window.removeEventListener("unreadCountsChanged", handler);
    };
  }, [refreshUnseenTotal]);

  useEffect(() => {
    if (unreadTotal > 0) {
      void setFaviconBadge(unreadTotal);
      return;
    }

    clearFaviconBadge();
  }, [unreadTotal]);

  const logout = () => {
    socketService.disconnect();
    localStorage.clear();
    window.location.href = "/login";
  };

  return !token ? (
    <div className="min-vh-100 bg-body">
      <div className="d-flex justify-content-end p-3">
        <button
          type="button"
          className="btn btn-outline-secondary btn-sm"
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        >
          {theme === "dark" ? "☀️" : "🌙"}
        </button>
      </div>
      {children}
    </div>
  ) : (
    <div className="d-flex bg-body" style={{ height: "100vh" }}>
      {/* Side Drawer */}
      <div
        className="border-end p-3 bg-body-tertiary shadow-sm"
        style={{ width: "240px" }}
      >
        <div className="d-flex align-items-center justify-content-between mb-3">
          <h4 className="mb-0">My App</h4>
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
        </div>

        <button className="btn btn-danger w-100 mt-3" onClick={logout}>
          Logout
        </button>
        <div className="mt-2 small text-body-secondary">
          {userName ? userName : userPhone}
        </div>

        <ul className="nav flex-column mt-4">
          <li className="nav-item mb-2">
            <Link
              to="/users"
              className={`nav-link link-body-emphasis ${
                location.pathname === "/users"
                  ? "active fw-semibold bg-primary-subtle rounded px-2"
                  : ""
              }`}
            >
              Users
            </Link>
          </li>

          <li className="nav-item">
            <Link
              to="/chat"
              className={`nav-link link-body-emphasis ${
                location.pathname === "/chat"
                  ? "active fw-semibold bg-primary-subtle rounded px-2"
                  : ""
              }`}
            >
              Chat{" "}
              {unreadTotal > 0 && (
                <span className="badge bg-danger ms-2">
                  {unreadTotal > 99 ? "99+" : unreadTotal}
                </span>
              )}
            </Link>
          </li>
        </ul>
      </div>

      {/* Main Content */}
      <div className="flex-grow-1 p-4">{children}</div>
    </div>
  );
};

export default Layout;
