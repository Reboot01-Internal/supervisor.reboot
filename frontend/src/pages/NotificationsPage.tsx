import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "../components/AdminLayout";
import { apiFetch } from "../lib/api";
import { useNotifications, type NotificationItem } from "../lib/notifications";
import { getNotificationTone } from "../lib/notificationTheme";

function formatDate(value: string) {
  const date = new Date(value);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDateGroup(value: string) {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (sameDay(date, today)) return "Today";
  if (sameDay(date, yesterday)) return "Yesterday";

  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

type DateFilter = "all" | "today" | "yesterday" | "last7" | "custom";

function extractActorLabel(item: NotificationItem) {
  const body = String(item.body || "");
  const byMatch = body.match(/By:\s*([^.\n]+)/i);
  if (byMatch?.[1]) {
    return byMatch[1].trim();
  }

  const userName = String(item.user_name || "").trim();
  if (userName) return userName;

  return String(item.user_login || "").trim();
}

function normalizeFilterValue(value: string) {
  return value.trim().toLowerCase();
}

type SupervisorRow = {
  supervisor_user_id: number;
  full_name: string;
  nickname: string;
  email: string;
};

function isInDateFilter(value: string, filter: DateFilter, customDate: string) {
  if (filter === "all") return true;

  const date = new Date(value);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const startOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const startOfLast7 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);

  if (filter === "today") {
    return date >= startOfToday && date < startOfTomorrow;
  }

  if (filter === "yesterday") {
    return date >= startOfYesterday && date < startOfToday;
  }

  if (filter === "custom") {
    if (!customDate) return true;
    const picked = new Date(`${customDate}T00:00:00`);
    const nextDay = new Date(picked);
    nextDay.setDate(picked.getDate() + 1);
    return date >= picked && date < nextDay;
  }

  return date >= startOfLast7 && date < startOfTomorrow;
}

function kindLabel(kind: string) {
  return kind.replaceAll("_", " ");
}

export default function NotificationsPage() {
  const nav = useNavigate();
  const { items, loading, error, isRecent } = useNotifications();
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [customDate, setCustomDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [supervisorFilter, setSupervisorFilter] = useState("all");
  const [supervisors, setSupervisors] = useState<SupervisorRow[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadSupervisors() {
      try {
        const res = await apiFetch("/admin/supervisors");
        if (!cancelled) {
          setSupervisors(Array.isArray(res) ? res : []);
        }
      } catch {
        if (!cancelled) {
          setSupervisors([]);
        }
      }
    }

    void loadSupervisors();
    return () => {
      cancelled = true;
    };
  }, []);

  const supervisorDirectory = useMemo(() => {
    const map = new Map<string, string>();
    for (const supervisor of supervisors) {
      const fullName = String(supervisor.full_name || "").trim();
      const nickname = String(supervisor.nickname || "").trim();
      const email = String(supervisor.email || "").trim();

      if (fullName) map.set(normalizeFilterValue(fullName), fullName);
      if (nickname && fullName) map.set(normalizeFilterValue(nickname), fullName);
      if (email && fullName) map.set(normalizeFilterValue(email), fullName);
    }
    return map;
  }, [supervisors]);

  const resolveSupervisorName = (item: NotificationItem) => {
    const actorLabel = extractActorLabel(item);
    const normalizedActor = normalizeFilterValue(actorLabel);
    return supervisorDirectory.get(normalizedActor) || "";
  };

  const supervisorOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const item of items) {
      const label = resolveSupervisorName(item);
      if (!label) continue;
      const key = normalizeFilterValue(label);
      if (!seen.has(key)) {
        seen.set(key, label);
      }
    }
    return Array.from(seen.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [items, supervisorDirectory]);
  const filteredItems = useMemo(
    () =>
      items.filter((item) => {
        const matchesDate = isInDateFilter(item.created_at, dateFilter, customDate);
        if (!matchesDate) return false;
        if (supervisorFilter === "all") return true;
        const resolvedSupervisor = resolveSupervisorName(item);
        if (!resolvedSupervisor) return false;
        const candidate = normalizeFilterValue(resolvedSupervisor);
        return candidate === supervisorFilter;
      }),
    [items, dateFilter, customDate, supervisorFilter, supervisorDirectory],
  );
  const groupedItems = useMemo(() => {
    const groups: Array<{ label: string; items: NotificationItem[] }> = [];
    const lookup = new Map<string, NotificationItem[]>();

    for (const item of filteredItems) {
      const label = formatDateGroup(item.created_at);
      if (!lookup.has(label)) {
        const list: NotificationItem[] = [];
        lookup.set(label, list);
        groups.push({ label, items: list });
      }
      lookup.get(label)!.push(item);
    }

    return groups;
  }, [filteredItems]);

  return (
    <AdminLayout
      active="notifications"
      title="Notifications"
      subtitle="Meeting reminders, schedule changes, and updates in one place."
    >
      {error ? (
        <div className="mb-5 rounded-[18px] border border-red-200 bg-[linear-gradient(180deg,#fff5f5,#fff0f0)] px-4 py-3 text-[13px] font-semibold text-red-700">
          {error}
        </div>
      ) : null}

      <section className="space-y-4">
        <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_16px_36px_rgba(15,23,42,0.05)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#fbfcff_100%)] px-4 py-3">
            <div>
              <div className="text-[13px] font-black text-slate-900">Recent notifications</div>
              <div className="mt-0.5 text-[11px] font-semibold text-slate-500">Everything new appears here automatically.</div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
                <span className="sr-only">Filter notifications by supervisor</span>
                <select
                  value={supervisorFilter}
                  onChange={(event) => setSupervisorFilter(event.target.value)}
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-black text-slate-700 outline-none transition hover:border-slate-300"
                >
                  <option value="all">All supervisors</option>
                  {supervisorOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
                <span className="sr-only">Filter notifications by date</span>
                <select
                  value={dateFilter}
                  onChange={(event) => setDateFilter(event.target.value as DateFilter)}
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-black text-slate-700 outline-none transition hover:border-slate-300"
                >
                  <option value="all">All dates</option>
                  <option value="today">Today</option>
                  <option value="yesterday">Yesterday</option>
                  <option value="last7">Last 7 days</option>
                  <option value="custom">Choose date</option>
                </select>
              </label>
              {dateFilter === "custom" ? (
                <label className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
                  <span className="sr-only">Pick a specific date</span>
                  <input
                    type="date"
                    value={customDate}
                    onChange={(event) => setCustomDate(event.target.value)}
                    className="rounded-full border border-slate-200 bg-white px-3 py-2 text-[11px] font-black text-slate-700 outline-none transition hover:border-slate-300"
                  />
                </label>
              ) : null}
              <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-black text-slate-600">
                {filteredItems.length} items
              </div>
            </div>
          </div>

          {loading ? (
            <div className="grid gap-2.5 px-4 py-4">
              {Array.from({ length: 4 }).map((_, idx) => (
                <div key={idx} className="h-[96px] animate-pulse rounded-[20px] border border-slate-200 bg-[linear-gradient(90deg,#fafbff,#eef2f7,#fafbff)]" />
              ))}
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="grid min-h-[340px] place-items-center px-4 py-6">
              <div className="max-w-[420px] text-center">
                <div className="mx-auto grid h-16 w-16 place-items-center rounded-[22px] border border-slate-200 bg-[radial-gradient(circle_at_top,_rgba(109,94,252,0.14),_transparent_55%),#ffffff] shadow-[0_18px_38px_rgba(15,23,42,0.08)]">
                  <svg viewBox="0 0 24 24" className="h-7 w-7 text-[#8b7fff]" fill="none" aria-hidden="true">
                    <path d="M15 17H5l1.4-1.4A2 2 0 0 0 7 14.2V10a5 5 0 1 1 10 0v4.2a2 2 0 0 0 .6 1.4L19 17h-4Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                    <path d="M10 20a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </div>
                <div className="mt-5 text-[20px] font-black text-slate-900">
                  No notifications for this date filter
                </div>
                <div className="mt-2 text-[13px] font-semibold leading-6 text-slate-500">
                  Try another supervisor or date range, or wait for more activity to come in.
                </div>
              </div>
            </div>
          ) : (
            <div className="px-3 py-3">
              {groupedItems.map((group) => (
                <section key={group.label} className="mb-4 last:mb-0">
                  <div className="sticky top-0 z-[1] mb-2 rounded-[16px] border border-slate-200 bg-slate-50/95 px-3 py-2 backdrop-blur">
                    <div className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
                      {group.label}
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    {group.items.map((item) => (
                      <NotificationCard
                        key={item.id}
                        item={item}
                        isNew={isRecent(item.id)}
                        showRecipient={false}
                        onOpen={() => nav(item.link || "/notifications")}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </section>
      </section>
    </AdminLayout>
  );
}

function NotificationCard({
  item,
  isNew,
  onOpen,
  showRecipient,
}: {
  item: NotificationItem;
  isNew: boolean;
  onOpen: () => void;
  showRecipient: boolean;
}) {
  const tone = getNotificationTone(item);

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      aria-label={item.title}
      className={`group relative overflow-hidden rounded-[20px] border px-4 py-3.5 transition ${tone.row} ${
        isNew
          ? "border-amber-200 bg-[linear-gradient(180deg,#fffdf5,#fff8e8)] shadow-[0_14px_28px_rgba(245,158,11,0.12)]"
          : item.is_read
          ? "border-transparent bg-transparent"
          : "border-slate-200 bg-[linear-gradient(180deg,#ffffff,#fbfcff)] shadow-[0_10px_22px_rgba(15,23,42,0.04)]"
      }`}
    >
      <div className={`absolute left-0 top-2.5 bottom-2.5 w-1 rounded-full ${tone.dot}`} />
      <div className="pl-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start gap-2.5">
              <div className={`mt-0.5 grid h-9 w-9 place-items-center rounded-[14px] border ${tone.iconWrap}`}>
                {tone.icon}
              </div>
              <div className="min-w-0">
                <div className="truncate text-[14px] font-black tracking-[-0.015em] text-slate-900">{item.title}</div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold text-slate-500">
                  <span>{formatDate(item.created_at)}</span>
                  {showRecipient ? (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-600">
                      {(item.user_name || "Unknown user")}{item.user_login ? ` · @${item.user_login}` : ""}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isNew ? (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-amber-700">
                New
              </span>
            ) : null}
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${tone.accent}`}>
              {tone.label}
            </span>
            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${tone.badge}`}>
              {kindLabel(item.kind)}
            </span>
          </div>
        </div>

        <div className="mt-3 pr-2 text-[12px] font-semibold leading-6 text-slate-700">
          {item.body}
        </div>
      </div>
    </article>
  );
}
