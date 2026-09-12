import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "../components/AdminLayout";
import { useAuth } from "../lib/auth";
import { apiFetch } from "../lib/api";
import { useNotifications, type NotificationItem } from "../lib/notifications";
import UserAvatar from "../components/UserAvatar";
import { fetchRebootAvatars } from "../lib/rebootAvatars";
import { Search, ArrowUpRight, Inbox, X } from "lucide-react";
import "./NotificationsPage.css";
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
  const { isSupervisor } = useAuth();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const { items, loading, error, isRecent } = useNotifications();
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [customDate, setCustomDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [supervisorFilter, setSupervisorFilter] = useState("all");
  const [avatars, setAvatars] = useState<Record<string,string>>({});
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

  useEffect(() => {
    let alive = true;
    fetchRebootAvatars(supervisors.map(s => s.nickname || s.email?.split("@")[0]).filter(Boolean)).then(result => { if (alive) setAvatars(result); });
    return () => { alive = false; };
  }, [supervisors]);
  const relatedSupervisor = (item: NotificationItem) => {
    const actor = item.body.match(/By:\s*([^.\n]+)/i)?.[1]?.trim().toLowerCase();
    if (!actor) return undefined;
    return supervisors.find(s => [s.full_name,s.nickname,s.email].some(value => value?.trim().toLowerCase() === actor));
  };

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
        if (query.trim() && !`${item.title} ${item.body}`.toLowerCase().includes(query.trim().toLowerCase())) return false;
        if (category !== "all" && item.kind !== category) return false;
        const matchesDate = isInDateFilter(item.created_at, dateFilter, customDate);
        if (!matchesDate) return false;
        if (isSupervisor || supervisorFilter === "all") return true;
        const resolvedSupervisor = resolveSupervisorName(item);
        if (!resolvedSupervisor) return false;
        const candidate = normalizeFilterValue(resolvedSupervisor);
        return candidate === supervisorFilter;
      }),
    [items, dateFilter, customDate, supervisorFilter, supervisorDirectory, query, category, isSupervisor],
  );
  const groupedItems = useMemo(() => {
    const groups: Array<{ label: string; items: NotificationItem[] }> = [];
    const lookup = new Map<string, NotificationItem[]>();

    for (const item of [...filteredItems].sort((a,b)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime())) {
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

  const hasFilters = Boolean(query || category !== "all" || dateFilter !== "all" || (!isSupervisor && supervisorFilter !== "all"));
  const resetFilters = () => { setQuery(""); setCategory("all"); setDateFilter("all"); setSupervisorFilter("all"); };
  const kinds = [...new Set(items.map(item => item.kind))];
  return <AdminLayout active="notifications" title="Notifications" subtitle="Stay close to what’s happening across your workspace.">
    <section className="activity-inbox">
      <div className="inbox-toolbar">
        <label className="inbox-search"><Search size={18}/><input aria-label="Search notifications" placeholder="Find an update, meeting, or project…" value={query} onChange={e=>setQuery(e.target.value)}/>{query && <button type="button" aria-label="Clear search" onClick={()=>setQuery("")}><X size={16}/></button>}</label>
        {!isSupervisor && <label className="inbox-filter"><span>Supervisor</span><select value={supervisorFilter} onChange={e=>setSupervisorFilter(e.target.value)}><option value="all">Everyone</option>{supervisorOptions.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select></label>}
        <label className="inbox-filter"><span>When</span><select value={dateFilter} onChange={e=>setDateFilter(e.target.value as DateFilter)}><option value="all">Any time</option><option value="today">Today</option><option value="yesterday">Yesterday</option><option value="last7">Last 7 days</option><option value="custom">Choose date</option></select></label>
        {dateFilter === "custom" && <label className="inbox-filter"><span>Date</span><input aria-label="Notification date" type="date" value={customDate} onChange={e=>setCustomDate(e.target.value)}/></label>}
      </div>
      <div className="inbox-surface">
        <div className="inbox-navigation"><div className="inbox-tabs" aria-label="Notification type"><button type="button" aria-pressed={category === "all"} onClick={()=>setCategory("all")}>All updates <span>{items.length}</span></button>{kinds.map(kind=><button type="button" key={kind} aria-pressed={category === kind} onClick={()=>setCategory(kind)}>{kindLabel(kind)}</button>)}</div>{hasFilters && <button className="inbox-reset" type="button" onClick={resetFilters}>Reset filters <X size={13}/></button>}</div>
        {error && <p className="inbox-error" role="alert">{error}</p>}
        {loading ? <div className="inbox-empty" role="status">Loading your updates…</div> : !filteredItems.length ? <div className="inbox-empty"><Inbox size={32}/><h2>{hasFilters ? "No matching updates" : "You’re all caught up"}</h2><p>{hasFilters ? "Try a different search or clear the filters." : "Meeting reminders and workspace changes will appear here."}</p>{hasFilters && <button type="button" onClick={resetFilters}>Clear filters</button>}</div> : <div className="inbox-feed">
          <div className="inbox-result-count" aria-live="polite">{filteredItems.length} updates · newest first</div>
          {groupedItems.map(group=><section className="inbox-day" key={group.label}><h2>{group.label}<span>{group.items.length}</span></h2><div>{group.items.map(item=><NotificationCard key={item.id} item={item} supervisor={relatedSupervisor(item)} avatars={avatars} isNew={isRecent(item.id)} onOpen={()=>nav(item.link || "/notifications")}/>)}</div></section>)}
        </div>}
      </div>
    </section>
  </AdminLayout>;
}

function NotificationCard({item,isNew,onOpen,supervisor,avatars}:{item:NotificationItem;isNew:boolean;onOpen:()=>void;supervisor?:SupervisorRow;avatars:Record<string,string>}) {
 const tone = getNotificationTone(item);
 const content = <>{supervisor ? <UserAvatar src={avatars[(supervisor.nickname || supervisor.email.split("@")[0]).toLowerCase()]} alt={supervisor.full_name} fallback={supervisor.full_name.slice(0,2)} sizeClass="h-10 w-10"/> : <span className="inbox-event-icon" aria-hidden="true">{tone.icon}</span>}<span className="inbox-event-content"><span className="inbox-event-meta"><span>{tone.label}</span>{isNew && <span className="inbox-new">New</span>}<time dateTime={item.created_at}>{formatDate(item.created_at)}</time></span>{supervisor && <span className="inbox-supervisor">{supervisor.full_name} <small>Supervisor</small></span>}<span className="inbox-event-title">{item.title}</span><span className="inbox-event-body">{item.body}</span></span>{item.link && <ArrowUpRight className="inbox-event-arrow" size={18} aria-hidden="true"/>}</>;
 return item.link ? <button type="button" className={`inbox-event ${isNew ? "is-new" : ""}`} onClick={onOpen}>{content}</button> : <article className={`inbox-event ${isNew ? "is-new" : ""}`}>{content}</article>;
}
