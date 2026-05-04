import { ReactNode, useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { socketService } from "../services/socket";
import { getUnseenCounts, ping } from "../services/api";
import { clearFaviconBadge, setFaviconBadge } from "../utils/favicon";
import { decodeGameMessage } from "../utils/gameMessage";
import type { MessageResponse } from "../types/chat.types";
import { usePageActivity } from "../utils/usePageActivity";

interface Props {
  children: ReactNode;
}

const Layout = ({ children }: Props) => {
  const token = localStorage.getItem("token");
  const userPhone = localStorage.getItem("userPhone") || "";
  const userName = localStorage.getItem("userName") || "";
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [gameNotifyTotal, setGameNotifyTotal] = useState(0);
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    const stored = localStorage.getItem("theme");
    return stored === "light" ? "light" : "dark";
  });
  const [isMobileLayout, setIsMobileLayout] = useState(false);
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [socketConnected, setSocketConnected] = useState(false);

  const location = useLocation();
  const isPageActive = usePageActivity();
  const [activeChatPhone, setActiveChatPhone] = useState<string | null>(null);
  const [isActiveChatThread, setIsActiveChatThread] = useState(false);

  const normalizeId = (v: string) => v.trim().replace(/[^\d+]/g, "");
  const toDigits = (v: string) => v.replace(/\D/g, "");
  const isSameUserId = (a: string, b: string) => {
    if (a === b) return true;
    const an = normalizeId(a);
    const bn = normalizeId(b);
    if (an === bn) return true;
    const ad = toDigits(an);
    const bd = toDigits(bn);
    if (ad && bd && ad === bd) return true;
    if (ad.length >= 10 && bd.length >= 10 && ad.slice(-10) === bd.slice(-10))
      return true;
    return false;
  };

  const getOtherPartyForGameMessage = (msg: MessageResponse) => {
    const decoded = decodeGameMessage(msg.message ?? "");
    if (decoded.kind === "game") {
      const g = decoded.value;
      if (isSameUserId(userPhone, g.players.sender.id)) return g.players.receiver.id;
      if (isSameUserId(userPhone, g.players.receiver.id)) return g.players.sender.id;
    }
    // fallback
    if (!isSameUserId(userPhone, msg.sender)) return msg.sender;
    return msg.receiver;
  };

  const isGameMessageForMe = (msg: MessageResponse) => {
    const decoded = decodeGameMessage(msg.message ?? "");
    if (decoded.kind === "game") {
      const g = decoded.value;
      return (
        isSameUserId(userPhone, g.players.sender.id) ||
        isSameUserId(userPhone, g.players.receiver.id)
      );
    }

    return isSameUserId(userPhone, msg.sender) || isSameUserId(userPhone, msg.receiver);
  };

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as
        | { phone: string | null; isActive: boolean }
        | undefined;
      setActiveChatPhone(detail?.phone ?? null);
      setIsActiveChatThread(Boolean(detail?.phone) && Boolean(detail?.isActive));
    };

    window.addEventListener("activeChatThreadChanged", handler);
    return () => {
      window.removeEventListener("activeChatThreadChanged", handler);
    };
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-bs-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767.98px)");
    const apply = () => setIsMobileLayout(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => {
      mq.removeEventListener("change", apply);
    };
  }, []);

  useEffect(() => {
    if (!isMobileLayout) setIsNavOpen(false);
  }, [isMobileLayout]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  const toggleSidebar = () => {
    if (isMobileLayout) {
      setIsNavOpen((v) => !v);
      return;
    }
    setIsSidebarOpen((v) => !v);
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
    const onConn = () => setSocketConnected(true)
    const onDisc = () => setSocketConnected(false)
    socketService.onConnect(onConn)
    socketService.onDisconnect(onDisc)

    void refreshUnseenTotal();
    void ping();

    const interval = window.setInterval(() => {
      void ping();
    }, 14 * 60 * 1000);

    return () => {
      window.clearInterval(interval);
      socketService.disconnect();
      socketService.offConnect(onConn)
      socketService.offDisconnect(onDisc)
    };
  }, [token, userPhone, refreshUnseenTotal]);

  useEffect(() => {
    if (!token || !userPhone) return;

    const emitPresence = () => {
      const isActiveChatWindow = isPageActive && location.pathname === "/chat";
      const activeThreadPhone =
        isActiveChatWindow ? activeChatPhone : null;
      socketService.setActiveThread({
        userPhone,
        activeThreadPhone,
        isChatActive: isActiveChatWindow,
      });
      if (isActiveChatWindow) {
        socketService.heartbeat({
          userPhone,
          activeThreadPhone,
          isChatActive: true,
        });
      }
    };

    emitPresence();

    const interval = window.setInterval(() => {
      emitPresence();
    }, 30000);

    return () => {
      window.clearInterval(interval);
    };
  }, [token, userPhone, activeChatPhone, isPageActive, location.pathname]);

  useEffect(() => {
    if (isPageActive && location.pathname === "/chat") setGameNotifyTotal(0);
  }, [isPageActive, location.pathname]);

  useEffect(() => {
    if (!token || !userPhone) return;

    const onReceive = (msg: MessageResponse) => {
      if (msg.receiver !== userPhone) return;

      if (
        isPageActive &&
        location.pathname === "/chat" &&
        isActiveChatThread &&
        activeChatPhone === msg.sender
      ) {
        return;
      }

      // Avoid badge flicker when you're actively viewing the app/thread and the chat page
      // immediately marks messages seen via socket.
      const delayMs = isPageActive ? 350 : 0;
      window.setTimeout(() => {
        void refreshUnseenTotal();
      }, delayMs);
    };

    socketService.onReceiveMessage(onReceive);

    const onGame = (msg: MessageResponse) => {
      if (!isGameMessageForMe(msg)) return;

      const other = getOtherPartyForGameMessage(msg);

      if (
        isPageActive &&
        location.pathname === "/chat" &&
        isActiveChatThread &&
        isSameUserId(activeChatPhone ?? "", other)
      ) {
        return;
      }

      setGameNotifyTotal((prev) => prev + 1);

      const delayMs = isPageActive ? 350 : 0;
      window.setTimeout(() => {
        void refreshUnseenTotal();
      }, delayMs);
    };

    socketService.onGameCreated(onGame);
    socketService.onGameUpdated(onGame);

    return () => {
      socketService.offReceiveMessage(onReceive);
      socketService.offGameCreated(onGame);
      socketService.offGameUpdated(onGame);
    };
  }, [
    token,
    userPhone,
    refreshUnseenTotal,
    isPageActive,
    location.pathname,
    isActiveChatThread,
    activeChatPhone,
  ]);

  useEffect(() => {
    const handler = () => {
      const delayMs = isPageActive && location.pathname === "/chat" ? 350 : 0;
      window.setTimeout(() => {
        void refreshUnseenTotal();
      }, delayMs);
    };

    window.addEventListener("unreadCountsChanged", handler);
    return () => {
      window.removeEventListener("unreadCountsChanged", handler);
    };
  }, [refreshUnseenTotal, isPageActive, location.pathname]);

  useEffect(() => {
    const combined = unreadTotal + gameNotifyTotal;
    if (combined > 0) {
      void setFaviconBadge(combined);
      return;
    }

    clearFaviconBadge();
  }, [unreadTotal, gameNotifyTotal]);

  const logout = () => {
    socketService.disconnect();
    localStorage.clear();
    window.location.href = "/login";
  };

  const sidebarNav = (
    <>
      <button className="btn btn-danger w-100 mt-3" onClick={logout}>
        Logout
      </button>
      <div className="mt-2 small text-body-secondary">{userName ? userName : userPhone}</div>

      <ul className="nav flex-column mt-4">
        <li className="nav-item mb-2">
          <Link
            to="/users"
            onClick={() => setIsNavOpen(false)}
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
            onClick={() => setIsNavOpen(false)}
            className={`nav-link link-body-emphasis ${
              location.pathname === "/chat"
                ? "active fw-semibold bg-primary-subtle rounded px-2"
                : ""
            }`}
          >
            Chat{" "}
            {unreadTotal + gameNotifyTotal > 0 && (
              <span className="badge bg-danger ms-2">
                {unreadTotal + gameNotifyTotal > 99 ? "99+" : unreadTotal + gameNotifyTotal}
              </span>
            )}
          </Link>
        </li>
      </ul>
    </>
  );

  return !token ? (
    <div className="min-vh-100 bg-body">
      <div className="d-flex justify-content-end p-3">
        <div style={{display:'flex', gap:8, alignItems:'center'}}>
          <div style={{width:10, height:10, borderRadius:10, background: socketConnected ? '#0d6efd' : '#dee2e6' }} title={socketConnected ? 'Connected' : 'Disconnected'} />
        <button
          type="button"
          className="btn btn-outline-secondary btn-sm"
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        >
          {theme === "dark" ? "\u2600\uFE0F" : "\u{1F319}"}
        </button>
        </div>
      </div>
      {children}
    </div>
  ) : (
    <div className="d-flex bg-body position-relative" style={{ height: "100vh" }}>
      {isMobileLayout && isNavOpen && (
        <div
          className="position-fixed top-0 start-0 w-100 h-100"
          style={{ background: "rgba(0,0,0,0.35)", zIndex: 1200 }}
          role="presentation"
          onClick={() => setIsNavOpen(false)}
        />
      )}

      {isMobileLayout ? (
        <div
          className="position-fixed top-0 start-0 h-100 border-end p-3 bg-body-tertiary shadow-sm"
          style={{
            width: "240px",
            zIndex: 1201,
            transform: isNavOpen ? "translateX(0)" : "translateX(-105%)",
            transition: "transform 0.2s ease",
            overflowY: "auto",
          }}
          role="dialog"
          aria-label="Navigation drawer"
          aria-hidden={!isNavOpen}
        >
          <div className="d-flex align-items-center justify-content-between mb-3">
            <h4 className="mb-0">Blurr</h4>
            <div className="d-flex align-items-center gap-2">
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                onClick={() => setIsNavOpen(false)}
                aria-label="Close navigation"
                title="Close"
              >
                {"\u2715"}
              </button>
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                onClick={toggleTheme}
                aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
                title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              >
                {theme === "dark" ? "\u2600\uFE0F" : "\u{1F319}"}
              </button>
            </div>
          </div>
          {sidebarNav}
        </div>
      ) : isSidebarOpen ? (
        <div className="border-end p-3 bg-body-tertiary shadow-sm" style={{ width: "240px" }}>
          <div className="d-flex align-items-center justify-content-between mb-3">
            <h4 className="mb-0">Blurr</h4>
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            >
              {theme === "dark" ? "\u2600\uFE0F" : "\u{1F319}"}
            </button>
          </div>
          {sidebarNav}
        </div>
      ) : null}

      {/* Main Content */}
      <div className="flex-grow-1 d-flex flex-column" style={{ minWidth: 0 }}>
        <div className="border-bottom bg-body p-2 d-flex align-items-center">
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm"
            onClick={toggleSidebar}
            aria-label="Toggle navigation"
            title="Menu"
          >
            {"\u2630"}
          </button>
        </div>
        <div className="flex-grow-1 p-4 overflow-auto">{children}</div>
      </div>
    </div>
  );
};

export default Layout;
