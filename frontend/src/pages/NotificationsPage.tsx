import { useEffect, useMemo, useState } from "react";
import AdminLayout from "../components/AdminLayout";
import { apiFetch } from "../lib/api";
import { useAuth } from "../lib/auth";

type NotificationRow = {
  id: number;
  user_id: number;
  kind: string;
  title: string;
  body: string;
  link: string;
  is_read: boolean;
  created_at: string;
};

function formatDate(value: string) {
  const date = new Date(value);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function NotificationsPage() {
  const { isAdmin } = useAuth();
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch("/admin/notifications");
      setItems(Array.isArray(res) ? res : []);
    } catch (e: any) {
      setError(e?.message || "Failed to load notifications");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const unreadCount = useMemo(() => items.filter((item) => !item.is_read).length, [items]);

  async function markRead(id: number) {
    try {
      await apiFetch("/admin/notifications/read", {
        method: "POST",
        body: JSON.stringify({ notification_id: id }),
      });
      setItems((prev) => prev.map((item) => (item.id === id ? { ...item, is_read: true } : item)));
    } catch (e: any) {
      setError(e?.message || "Failed to mark notification");
    }
  }

  async function markAllRead() {
    try {
      await apiFetch("/admin/notifications/read-all", { method: "POST" });
      setItems((prev) => prev.map((item) => ({ ...item, is_read: true })));
    } catch (e: any) {
      setError(e?.message || "Failed to mark all notifications");
    }
  }

  return (
    <AdminLayout
      active={isAdmin ? "notifications" : "boards"}
      title="Notifications"
      subtitle="Meeting reminders, schedule changes, and updates in one place."
      right={
        <button
          type="button"
          onClick={markAllRead}
          className="h-10 rounded-[14px] border border-slate-200 bg-white px-4 text-[13px] font-black text-slate-700 shadow-sm"
        >
          Mark All Read
        </button>
      }
    >
      {error ? (
        <div className="mb-4 rounded-[16px] border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-semibold text-red-700">
          {error}
        </div>
      ) : null}

      <section className="mb-4 grid gap-3 md:grid-cols-3">
        <StatCard label="All" value={items.length} tone="slate" />
        <StatCard label="Unread" value={unreadCount} tone="amber" />
        <StatCard label="Read" value={items.length - unreadCount} tone="emerald" />
      </section>

      <section className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
        {loading ? (
          <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-8 text-center text-[14px] font-semibold text-slate-500">
            Loading notifications...
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-[22px] border border-dashed border-slate-200 bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.12),_transparent_50%),#f8fafc] px-5 py-12 text-center">
            <div className="text-[18px] font-black text-slate-700">No notifications yet</div>
            <div className="mt-1 text-[12px] font-semibold text-slate-500">Meeting reminders and schedule changes will appear here.</div>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <article
                key={item.id}
                className={`rounded-[20px] border p-4 transition ${item.is_read ? "border-slate-200 bg-slate-50/70" : "border-amber-200 bg-[linear-gradient(180deg,#fffdf7,#fff7e7)] shadow-[0_16px_32px_rgba(245,158,11,0.08)]"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[15px] font-black text-slate-900">{item.title}</div>
                    <div className="mt-1 text-[12px] font-semibold text-slate-500">{formatDate(item.created_at)}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] ${item.is_read ? "border-slate-200 bg-white text-slate-500" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
                      {item.kind.replaceAll("_", " ")}
                    </span>
                    {!item.is_read ? (
                      <button
                        type="button"
                        onClick={() => markRead(item.id)}
                        className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-black text-slate-700"
                      >
                        Mark read
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="mt-3 text-[13px] font-semibold leading-6 text-slate-600">{item.body}</div>
              </article>
            ))}
          </div>
        )}
      </section>
    </AdminLayout>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: "slate" | "amber" | "emerald" }) {
  const toneClass =
    tone === "amber"
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : tone === "emerald"
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : "border-slate-200 bg-slate-50 text-slate-700";
  return (
    <div className={`rounded-[20px] border px-4 py-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)] ${toneClass}`}>
      <div className="text-[11px] font-black uppercase tracking-[0.12em]">{label}</div>
      <div className="mt-2 text-[28px] font-black tracking-[-0.04em]">{value}</div>
    </div>
  );
}
