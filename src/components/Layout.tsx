import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { socketService } from "../services/socket";
import { getUnseenCounts, ping, updatePrivateNotesVault } from "../services/api";
import { clearFaviconBadge, setFaviconBadge } from "../utils/favicon";
import { decodeGameMessage } from "../utils/gameMessage";
import type { MessageResponse } from "../types/chat.types";
import type { PrivateNote } from "../types/privateNotes.types";
import { usePageActivity } from "../utils/usePageActivity";

interface Props {
  children: ReactNode;
}

type ReminderSession = {
  scopeKey: string;
  ownerPhone: string;
  targetUserPhone: string;
  notes: PrivateNote[];
};

type ReminderPopup = {
  scopeKey: string;
  noteId: string;
  heading: string;
  content: string;
  remindAt: string;
};

const NOTES_REMINDER_SYNC_EVENT = "privateNotesReminderSessionSync";
const NOTES_REMINDER_UPDATE_EVENT = "privateNotesReminderNotesUpdated";

const formatReminderDateTime = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

const getActiveReminderAt = (note: PrivateNote) =>
  note.reminderSnoozedUntil || note.reminderAt || null;

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
  const [reminderSessions, setReminderSessions] = useState<Record<string, ReminderSession>>({});
  const [activeReminderPopups, setActiveReminderPopups] = useState<ReminderPopup[]>([]);

  const location = useLocation();
  const isPageActive = usePageActivity();
  const [activeChatPhone, setActiveChatPhone] = useState<string | null>(null);
  const [isActiveChatThread, setIsActiveChatThread] = useState(false);
  const reminderTimerRef = useRef<number | null>(null);

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

  const noteReminderTotal = activeReminderPopups.length;

  const syncReminderNotesToChat = useCallback((session: ReminderSession) => {
    window.dispatchEvent(
      new CustomEvent(NOTES_REMINDER_UPDATE_EVENT, {
        detail: { scopeKey: session.scopeKey, notes: session.notes },
      }),
    );
  }, []);

  const persistReminderSession = useCallback(
    async (session: ReminderSession) => {
      await updatePrivateNotesVault(
        session.targetUserPhone,
        { notes: session.notes },
        { timeout: 10000 },
      );
      syncReminderNotesToChat(session);
    },
    [syncReminderNotesToChat],
  );

  const reminderPopupKeys = useMemo(
    () => new Set(activeReminderPopups.map((item) => `${item.scopeKey}:${item.noteId}:${item.remindAt}`)),
    [activeReminderPopups],
  );

  const dismissReminderPopup = useCallback((scopeKey: string, noteId: string) => {
    setActiveReminderPopups((prev) =>
      prev.filter((item) => !(item.scopeKey === scopeKey && item.noteId === noteId)),
    );
  }, []);

  const updateReminderSessionNote = useCallback(
    async (
      popup: ReminderPopup,
      updater: (note: PrivateNote) => PrivateNote,
    ) => {
      const session = reminderSessions[popup.scopeKey];
      if (!session) {
        dismissReminderPopup(popup.scopeKey, popup.noteId);
        return;
      }

      const nextSession: ReminderSession = {
        ...session,
        notes: session.notes.map((note) => (note.id === popup.noteId ? updater(note) : note)),
      };

      setReminderSessions((prev) => ({ ...prev, [nextSession.scopeKey]: nextSession }));
      dismissReminderPopup(popup.scopeKey, popup.noteId);

      try {
        await persistReminderSession(nextSession);
      } catch (error) {
        console.error("Failed to update reminder session", error);
      }
    },
    [dismissReminderPopup, persistReminderSession, reminderSessions],
  );

  const snoozeReminder = useCallback(
    async (popup: ReminderPopup, minutes: number) => {
      const snoozedUntil = new Date(Date.now() + minutes * 60 * 1000).toISOString();
      await updateReminderSessionNote(popup, (note) => ({
        ...note,
        reminderSnoozedUntil: snoozedUntil,
        reminderLastNotifiedAt: null,
        updatedAt: new Date().toISOString(),
      }));
    },
    [updateReminderSessionNote],
  );

  const dismissReminder = useCallback(
    async (popup: ReminderPopup) => {
      await updateReminderSessionNote(popup, (note) => ({
        ...note,
        reminderAt: null,
        reminderSnoozedUntil: null,
        reminderLastNotifiedAt: popup.remindAt,
        updatedAt: new Date().toISOString(),
      }));
    },
    [updateReminderSessionNote],
  );

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
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as ReminderSession | undefined;
      if (!detail || detail.ownerPhone !== userPhone || !detail.scopeKey) return;

      setReminderSessions((prev) => ({
        ...prev,
        [detail.scopeKey]: detail,
      }));
    };

    window.addEventListener(NOTES_REMINDER_SYNC_EVENT, handler);
    return () => {
      window.removeEventListener(NOTES_REMINDER_SYNC_EVENT, handler);
    };
  }, [userPhone]);

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
    const onConn = () => setSocketConnected(true);
    const onDisc = () => setSocketConnected(false);
    socketService.onConnect(onConn);
    socketService.onDisconnect(onDisc);

    void refreshUnseenTotal();
    void ping();

    const interval = window.setInterval(() => {
      void ping();
    }, 14 * 60 * 1000);

    return () => {
      window.clearInterval(interval);
      socketService.disconnect();
      socketService.offConnect(onConn);
      socketService.offDisconnect(onDisc);
    };
  }, [token, userPhone, refreshUnseenTotal]);

  useEffect(() => {
    if (!token || !userPhone) return;

    const emitPresence = () => {
      const isActiveChatWindow = isPageActive && location.pathname === "/chat";
      const activeThreadPhone = isActiveChatWindow ? activeChatPhone : null;
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
    if (reminderTimerRef.current) {
      window.clearTimeout(reminderTimerRef.current);
      reminderTimerRef.current = null;
    }

    const now = Date.now();
    const sessionUpdates: ReminderSession[] = [];
    const newPopups: ReminderPopup[] = [];
    let nextDueAt: number | null = null;

    for (const session of Object.values(reminderSessions)) {
      let nextNotes = session.notes;
      let changed = false;

      for (const note of session.notes) {
        const remindAt = getActiveReminderAt(note);
        if (!remindAt) continue;

        const remindTime = new Date(remindAt).getTime();
        if (Number.isNaN(remindTime)) continue;

        if (remindTime <= now) {
          const popupKey = `${session.scopeKey}:${note.id}:${remindAt}`;
          if (note.reminderLastNotifiedAt === remindAt || reminderPopupKeys.has(popupKey)) continue;

          if (!changed) {
            nextNotes = session.notes.map((item) => ({ ...item }));
            changed = true;
          }

          nextNotes = nextNotes.map((item) =>
            item.id === note.id ? { ...item, reminderLastNotifiedAt: remindAt } : item,
          );

          newPopups.push({
            scopeKey: session.scopeKey,
            noteId: note.id,
            heading: note.heading,
            content: note.content,
            remindAt,
          });
          continue;
        }

        nextDueAt = nextDueAt === null ? remindTime : Math.min(nextDueAt, remindTime);
      }

      if (changed) {
        sessionUpdates.push({ ...session, notes: nextNotes });
      }
    }

    if (sessionUpdates.length > 0) {
      setReminderSessions((prev) => {
        const next = { ...prev };
        for (const session of sessionUpdates) {
          next[session.scopeKey] = session;
        }
        return next;
      });

      setActiveReminderPopups((prev) => [...prev, ...newPopups]);

      sessionUpdates.forEach((session) => {
        void persistReminderSession(session);
      });
      return;
    }

    if (nextDueAt !== null) {
      const delay = Math.max(0, Math.min(nextDueAt - now, 2147483647));
      reminderTimerRef.current = window.setTimeout(() => {
        setReminderSessions((prev) => ({ ...prev }));
      }, delay);
    }

    return () => {
      if (reminderTimerRef.current) {
        window.clearTimeout(reminderTimerRef.current);
        reminderTimerRef.current = null;
      }
    };
  }, [persistReminderSession, reminderPopupKeys, reminderSessions]);

  useEffect(() => {
    const combined = unreadTotal + gameNotifyTotal + noteReminderTotal;
    if (combined > 0) {
      void setFaviconBadge(combined);
      return;
    }

    clearFaviconBadge();
  }, [unreadTotal, gameNotifyTotal, noteReminderTotal]);

  const logout = () => {
    socketService.disconnect();
    setReminderSessions({});
    setActiveReminderPopups([]);
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
            {noteReminderTotal > 0 && (
              <span className="badge bg-primary ms-2">
                {noteReminderTotal > 99 ? "99+" : noteReminderTotal}
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
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: 10,
              background: socketConnected ? "#0d6efd" : "#dee2e6",
            }}
            title={socketConnected ? "Connected" : "Disconnected"}
          />
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

      <div className="flex-grow-1 d-flex flex-column" style={{ minWidth: 0 }}>
        <div className="border-bottom bg-body p-2 d-flex align-items-center justify-content-between gap-2">
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm"
            onClick={toggleSidebar}
            aria-label="Toggle navigation"
            title="Menu"
          >
            {"\u2630"}
          </button>
          {noteReminderTotal > 0 && (
            <div className="d-flex align-items-center">
              <span className="badge bg-primary">
                {"\u23F0"} {noteReminderTotal > 99 ? "99+" : noteReminderTotal}
              </span>
            </div>
          )}
        </div>
        <div className="flex-grow-1 p-4 overflow-auto">{children}</div>
      </div>

      {activeReminderPopups.length > 0 && (
        <div
          className="position-fixed d-flex flex-column gap-2"
          style={{
            top: 16,
            right: 16,
            zIndex: 2200,
            width: "min(360px, calc(100vw - 32px))",
          }}
        >
          {activeReminderPopups.map((popup) => (
            <div
              key={`${popup.scopeKey}:${popup.noteId}:${popup.remindAt}`}
              className="border rounded shadow bg-body p-3"
            >
              <div className="d-flex align-items-start justify-content-between gap-2">
                <div>
                  <div className="fw-semibold">Reminder</div>
                  <div className="small text-body-secondary">
                    {formatReminderDateTime(popup.remindAt)}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  onClick={() => void dismissReminder(popup)}
                  aria-label="Dismiss reminder"
                  title="Dismiss"
                >
                  {"\u2715"}
                </button>
              </div>
              <div className="fw-semibold mt-2">{popup.heading || "Untitled note"}</div>
              <div className="small text-body-secondary mt-1" style={{ whiteSpace: "pre-wrap" }}>
                {popup.content || "No description"}
              </div>
              <div className="d-flex flex-wrap gap-2 mt-3">
                <button
                  type="button"
                  className="btn btn-sm btn-warning"
                  onClick={() => void snoozeReminder(popup, 10)}
                >
                  Snooze 10 min
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-warning"
                  onClick={() => void snoozeReminder(popup, 60)}
                >
                  Snooze 1 hour
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  onClick={() => void dismissReminder(popup)}
                >
                  Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Layout;
