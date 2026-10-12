import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { API_URL, apiFetch } from "./api";
import { useAuth } from "./auth";
import NotificationToast from "../components/NotificationToast";

export type NotificationItem = {
  id: number;
  user_id: number;
  user_name: string;
  user_login: string;
  kind: string;
  title: string;
  body: string;
  link: string;
  is_read: boolean;
  created_at: string;
};

type NotificationsContextValue = {
  items: NotificationItem[];
  loading: boolean;
  error: string;
  unreadCount: number;
  hasUnread: boolean;
  isRecent: (id: number) => boolean;
  reload: () => Promise<void>;
  markAllRead: () => Promise<void>;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

function wsUrl(email: string, login: string, role: string) {
  const base = API_URL.replace(/^http/i, "ws");
  const query = new URLSearchParams();
  if (email) query.set("email", email);
  if (login) query.set("login", login);
  if (role) query.set("role", role);
  const suffix = query.toString();
  return `${base}/admin/notifications/stream${suffix ? `?${suffix}` : ""}`;
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { authenticated, email, login, role, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const recentIdsRef = useRef<Set<number>>(new Set());
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const pollTimerRef = useRef<number | null>(null);
  const failureCountRef = useRef(0);
  const loadRef = useRef<() => Promise<void>>(async () => {});
  const isNotificationsPage = /^\/(?:admin\/)?notifications(?:\/|$)/.test(location.pathname);
  const seenKey = `notifications:last-seen:${login || email}`;
  const [lastSeen, setLastSeen] = useState(() => Number(localStorage.getItem(seenKey)) || 0);
  useEffect(() => { setLastSeen(Number(localStorage.getItem(seenKey)) || 0); }, [seenKey]);
  useEffect(() => {
    if (!authenticated || !isNotificationsPage || !items.length) return;
    const latest = Math.max(...items.map(item => item.id));
    setLastSeen(previous => Math.max(previous, latest));
    localStorage.setItem(seenKey, String(Math.max(Number(localStorage.getItem(seenKey)) || 0, latest)));
  }, [authenticated, isNotificationsPage, items, seenKey]);

  async function load() {
    if (!authenticated) {
      setItems([]);
      setLoading(false);
      setError("");
      recentIdsRef.current.clear();
      return;
    }

    setLoading(true);
    setError("");
    try {
      const res = await apiFetch(isAdmin && isNotificationsPage ? "/admin/notifications?scope=all" : "/admin/notifications");
      const nextItems = Array.isArray(res) ? res : [];
      for (const item of nextItems) {
        if (!item.is_read) {
          recentIdsRef.current.add(item.id);
        }
      }
      setItems(nextItems);
    } catch (e: any) {
      setError(e?.message || "Failed to load notifications");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  async function markAllRead() {
    if (!authenticated) return;
    await apiFetch("/admin/notifications/read-all", { method: "POST" });
    setItems((prev) => prev.map((item) => ({ ...item, is_read: true })));
  }

  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    void load();
  }, [authenticated, isAdmin, isNotificationsPage, login]);

  useEffect(() => {
    if (!authenticated) return;
    if (!isNotificationsPage || isAdmin) return;
    if (!items.some((item) => !item.is_read)) return;

    markAllRead().catch((e: any) => {
      setError(e?.message || "Failed to mark all notifications");
    });
  }, [authenticated, isAdmin, isNotificationsPage, items]);

  useEffect(() => {
    if (!authenticated) return undefined;

    let cancelled = false;

    const stopPolling = () => {
      if (pollTimerRef.current !== null) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };

    const ensurePolling = () => {
      if (pollTimerRef.current !== null) return;
      pollTimerRef.current = window.setInterval(() => {
        void loadRef.current();
      }, 15000);
    };

    const connect = () => {
      const socket = new WebSocket(wsUrl(email, login, role));
      socketRef.current = socket;

      socket.onopen = () => {
        failureCountRef.current = 0;
        stopPolling();
      };

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data || "{}");
          const item = payload?.notification as NotificationItem | undefined;
          if (!item?.id) return;

          recentIdsRef.current.add(item.id);
          setItems((prev) => {
            const rest = prev.filter((existing) => existing.id !== item.id);
            const nextItem = isNotificationsPage ? { ...item, is_read: true } : item;
            return [nextItem, ...rest];
          });

          toast(
            <NotificationToast item={item}/>,
            {
            toastId: `notification-${item.id}`,
            autoClose: 4000,
            className: "notification-popup-shell",
            icon: false,
            onClick: () => navigate(item.link || "/notifications"),
            },
          );

          if (isNotificationsPage) {
            markAllRead().catch(() => {});
          }
        } catch {
          // Ignore malformed realtime payloads.
        }
      };

      socket.onerror = () => {
        socket.close();
      };

      socket.onclose = () => {
        if (cancelled) return;
        failureCountRef.current += 1;
        if (failureCountRef.current >= 3) {
          void loadRef.current();
          ensurePolling();
        }

        const delay = Math.min(2500 * 2 ** Math.max(0, failureCountRef.current - 1), 30000);
        reconnectTimerRef.current = window.setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
      }
      stopPolling();
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [authenticated, email, login, role, isAdmin, isNotificationsPage, navigate]);

  const value = useMemo<NotificationsContextValue>(() => {
    const unreadCount = items.filter((item) => !item.is_read && item.id > lastSeen).length;
    return {
      items,
      loading,
      error,
      unreadCount,
      hasUnread: unreadCount > 0,
      isRecent: (id: number) => recentIdsRef.current.has(id),
      reload: load,
      markAllRead,
    };
  }, [items, loading, error, lastSeen]);

  return (
    <NotificationsContext.Provider value={value}>
      {children}
      <ToastContainer position="top-right" newestOnTop closeOnClick pauseOnFocusLoss={false} hideProgressBar />
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications must be used within NotificationsProvider");
  return ctx;
}
