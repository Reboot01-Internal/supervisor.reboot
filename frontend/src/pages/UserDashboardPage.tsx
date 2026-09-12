import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import TalentDashboard from "./TalentDashboard";
import AdminLayout from "../components/AdminLayout";
import { apiFetch } from "../lib/api";
import { useAuth } from "../lib/auth";

export type ProfileSummary = {
  user: {
    full_name: string;
    role: string;
  };
  supervisor?: {
    assigned_students_overall: number;
    boards: { id: number; name: string; students_count: number }[];
  };
  student?: {
    boards: { id: number; name: string; group?: string; supervisor?: { id: number; full_name: string } }[];
    supervisors: { id: number; full_name: string; nickname?: string; email?: string }[];
  };
  tasks: {
    total: number;
    done: number;
    left: number;
    progress_pct: number;
    assigned_cards?: {
      card_id: number;
      card_title: string;
      board_id: number;
      board_name: string;
      status: string;
      priority: string;
      due_date: string;
      subtasks_done: number;
      subtasks_all: number;
    }[];
  };
};

type TaskCompletionStats = {
  tasks?: {
    count: number;
  };
  subtasks?: {
    count: number;
  };
  on_time?: {
    count: number;
    percentage: number;
  };
  overdue?: {
    count: number;
  };
  total?: number;
};

export type MeetingRow = {
  id: number;
  board_id: number;
  board_name: string;
  title: string;
  location: string;
  status: "scheduled" | "completed" | "canceled";
  starts_at: string;
  ends_at: string;
};

function BoardsIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="5" width="16" height="14" rx="3" stroke="currentColor" strokeWidth="2" />
      <path d="M8 9h8M8 13h8M8 17h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function PeopleIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M16 20v-1.5A3.5 3.5 0 0 0 12.5 15h-5A3.5 3.5 0 0 0 4 18.5V20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="10" cy="8" r="3.5" stroke="currentColor" strokeWidth="2" />
      <path d="M20 20v-1.5A3.5 3.5 0 0 0 17 15.1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M15.5 4.7a3.5 3.5 0 0 1 0 6.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function TasksIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="5" y="4" width="14" height="16" rx="3" stroke="currentColor" strokeWidth="2" />
      <path d="M9 9h6M9 13h6M9 17h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M9 4.5h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function DoneIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2" />
      <path d="M8.5 12.5 10.8 14.8 15.8 9.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CalendarIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 3v3M17 3v3M4 9h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <rect x="4" y="5" width="16" height="15" rx="3" stroke="currentColor" strokeWidth="2" />
      <path d="M8 13h3v3H8z" fill="currentColor" />
    </svg>
  );
}

function formatMeetingDay(value: string) {
  const date = new Date(value);
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function formatMeetingTimeRange(startISO: string, endISO: string) {
  const start = new Date(startISO);
  const end = new Date(endISO);
  return `${start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} - ${end.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

function formatDueDate(value: string) {
  if (!value) return "No due date";
  const date = new Date(`${value}T12:00:00`);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function normalizeStatus(value: string) {
  return String(value || "todo").replace(/[_-]/g, " ");
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function UserDashboardPage() {
  const { isSupervisor } = useAuth();
  const [data, setData] = useState<ProfileSummary | null>(null);
  const [taskCompletion, setTaskCompletion] = useState<TaskCompletionStats | null>(null);
  const [weekMeetings, setWeekMeetings] = useState<MeetingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [meetingsError, setMeetingsError] = useState("");
  const [taskCompletionError, setTaskCompletionError] = useState("");

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      setError("");
      setMeetingsError("");
      setTaskCompletionError("");
      try {
        const summaryRes = await apiFetch("/admin/profile/summary");
        if (!alive) return;
        setData(summaryRes);

        const requests: Promise<unknown>[] = [apiFetch("/admin/meetings")];
        if (isSupervisor) requests.unshift(apiFetch("/admin/dashboard/task-completion"));
        const results = await Promise.allSettled(requests);
        if (!alive) return;

        const meetingsRes = results[isSupervisor ? 1 : 0];
        if (isSupervisor) {
          const completionRes = results[0];
          if (completionRes.status === "fulfilled") {
            setTaskCompletion((completionRes.value as TaskCompletionStats | null) || null);
          } else {
            setTaskCompletion(null);
            setTaskCompletionError(errorMessage(completionRes.reason, "Failed to load task completion."));
          }
        }

        if (meetingsRes.status === "fulfilled") {
          setWeekMeetings(Array.isArray(meetingsRes.value) ? meetingsRes.value : []);
        } else {
          setWeekMeetings([]);
          setMeetingsError(errorMessage(meetingsRes.reason, "Failed to load meetings."));
        }
      } catch (e: unknown) {
        if (!alive) return;
        setError(`Failed to load dashboard summary: ${errorMessage(e, "unknown error")}`);
        setTaskCompletion(null);
        setWeekMeetings([]);
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, [isSupervisor]);

  const upcomingMeetings = useMemo(() => {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setDate(end.getDate() + 7);

    return weekMeetings
      .filter((meeting) => {
        const startsAt = new Date(meeting.starts_at);
        return (
          meeting.status !== "canceled" &&
          Number.isFinite(startsAt.getTime()) &&
          startsAt >= start &&
          startsAt < end
        );
      })
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
      .slice(0, 4);
  }, [weekMeetings]);

  const cards = useMemo(() => {
    const boardsCount = isSupervisor ? data?.supervisor?.boards?.length || 0 : data?.student?.boards?.length || 0;
    const peopleCount = isSupervisor ? data?.supervisor?.assigned_students_overall || 0 : data?.student?.supervisors?.length || 0;
    return [
      { label: "Boards", value: boardsCount, tone: "border-[#6d5efc]/20 bg-[#f3f1ff] text-[#6d5efc]", accent: "user-dashboard-accent-blue", icon: <BoardsIcon size={15} /> },
      { label: isSupervisor ? "Talents" : "Supervisors", value: peopleCount, tone: "border-sky-200 bg-sky-50 text-sky-700", accent: "user-dashboard-accent-green", icon: <PeopleIcon size={15} /> },
      { label: "Tasks", value: data?.tasks?.total || 0, tone: "border-amber-200 bg-amber-50 text-amber-700", accent: "user-dashboard-accent-blue", icon: <TasksIcon size={15} /> },
      { label: "Done", value: data?.tasks?.done || 0, tone: "border-emerald-200 bg-emerald-50 text-emerald-700", accent: "user-dashboard-accent-amber", icon: <DoneIcon size={15} /> },
    ];
  }, [data, isSupervisor]);

  const taskCount = taskCompletion?.tasks?.count || 0;
  const subtaskCount = taskCompletion?.subtasks?.count || 0;
  const onTimeCount = taskCompletion?.on_time?.count || 0;
  const overdueCount = taskCompletion?.overdue?.count || 0;
  const onTimePercent = taskCompletion?.on_time?.percentage || 0;
  const totalTrackedItems = taskCompletion?.total || 0;
  const progressPct = clampPercent(data?.tasks?.progress_pct || 0);
  const assignedCards = useMemo(() => {
    return [...(data?.tasks?.assigned_cards || [])]
      .filter((card) => normalizeStatus(card.status).toLowerCase() !== "done")
      .sort((a, b) => {
        if (!a.due_date && !b.due_date) return a.card_id - b.card_id;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return a.due_date.localeCompare(b.due_date);
      })
      .slice(0, 5);
  }, [data]);
  const studentBoards = data?.student?.boards || [];
  const studentSupervisors = data?.student?.supervisors || [];
  const nextMeeting = upcomingMeetings[0];
  if (!isSupervisor) return <TalentDashboard data={data} loading={loading} error={error} meetings={weekMeetings} meetingsError={meetingsError} />;
  return (
    <AdminLayout active="dashboard" title="Dashboard" subtitle="A quick overview of your workspace and progress.">
      {error ? (
        <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="user-dashboard-page grid gap-4">
        {/* Welcome hero intentionally hidden to keep the dashboard compact.
        <section className="dashboard-hero relative overflow-hidden rounded-[28px] border border-[#6d5efc]/20 p-6 sm:p-7">
          <div className="dashboard-hero-orb dashboard-hero-orb-one" />
          <div className="dashboard-hero-orb dashboard-hero-orb-two" />
          <div className="relative z-10 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div className="max-w-[680px]">
              <div className="dashboard-live-pill inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.14em]">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                {new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(new Date())}
              </div>
              <h2 className="mt-5 text-[30px] font-black leading-[1.08] tracking-[-0.045em] text-white sm:text-[38px]">
                {loading ? "Preparing your workspace..." : `Good to see you, ${data?.user?.full_name?.split(" ")[0] || "there"}.`}
              </h2>
              <p className="mt-3 max-w-[560px] text-[14px] font-semibold leading-6 text-slate-300 sm:text-[15px]">
                {isSupervisor
                  ? "Keep your teams aligned, follow progress, and move every board forward from one focused workspace."
                  : data?.tasks?.left
                    ? `You have ${data.tasks.left} active task${data.tasks.left === 1 ? "" : "s"} waiting for your attention.`
                    : "Everything is on track. Your workspace is ready for what comes next."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2.5">
              <Link to="/admin/boards" className="dashboard-hero-button dashboard-hero-button-primary inline-flex items-center gap-2 rounded-[14px] px-4 py-3 text-[13px] font-black">
                <BoardsIcon size={16} /> Open workspace
              </Link>
              <Link to="/calendar" className="dashboard-hero-button inline-flex items-center gap-2 rounded-[14px] px-4 py-3 text-[13px] font-black">
                <CalendarIcon size={16} /> View schedule
              </Link>
            </div>
          </div>
        </section>
        */}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => (
            <div key={card.label} className="user-dashboard-stat-card rounded-[22px] border border-slate-200 bg-white p-4 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-extrabold text-slate-500">{card.label}</div>
                  <div className="mt-1.5 text-2xl font-black text-slate-900">{loading ? "..." : card.value}</div>
                </div>
                <div className={`user-dashboard-stat-icon ${card.accent} inline-flex h-11 w-11 items-center justify-center rounded-[14px] border ${card.tone}`}>
                  {card.icon}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* <div className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
          <div className="text-[20px] font-black tracking-[-0.03em] text-slate-900">
            {loading ? "Loading..." : `Welcome, ${data?.user?.full_name || "there"}`}
          </div>
          <div className="mt-2 text-[14px] font-semibold text-slate-500">
            {isSupervisor
              ? "The most important numbers in your workspace, all in one place."
              : "A simple overview of your boards, supervisors, and task progress."}
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {focusItems.map((item) => (
              <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <div className="text-[12px] font-black uppercase tracking-[0.14em] text-slate-400">{item.label}</div>
                <div className="mt-2 text-[24px] font-black tracking-[-0.03em] text-slate-900">
                  {loading ? "..." : item.value}
                </div>
              </div>
            ))}
          </div>
        </div> */}

        {!isSupervisor ? (
          <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
            <section className="user-dashboard-panel overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
              <div className="grid gap-5 p-5 lg:grid-cols-[0.85fr_1.15fr]">
                <div className="user-dashboard-surface rounded-[18px] border border-slate-200 bg-slate-50 p-5">
                  <div className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-400">Today</div>
                  <div className="mt-2 text-[24px] font-black tracking-[-0.03em] text-slate-900">
                    {loading ? "Loading..." : `Hi, ${data?.user?.full_name || "there"}`}
                  </div>
                  <div className="mt-2 text-[14px] font-semibold leading-6 text-slate-500">
                    {data?.tasks?.left
                      ? `${data.tasks.left} task${data.tasks.left === 1 ? "" : "s"} left to move forward.`
                      : "Your task list is clear right now."}
                  </div>

                  <div className="mt-5 flex items-end gap-4">
                    <div
                      className="grid h-[132px] w-[132px] flex-none place-items-center rounded-full"
                      style={{
                        background: `conic-gradient(#14b8a6 0deg ${progressPct * 3.6}deg, #e2e8f0 ${progressPct * 3.6}deg 360deg)`,
                      }}
                    >
                      <div className="grid h-[98px] w-[98px] place-items-center rounded-full border border-slate-200 bg-white text-center">
                        <div>
                          <div className="text-[28px] font-black text-slate-900">{loading ? "..." : `${progressPct}%`}</div>
                          <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Done</div>
                        </div>
                      </div>
                    </div>
                    <div className="min-w-0 pb-2">
                      <div className="text-[13px] font-bold text-slate-500">Completed</div>
                      <div className="mt-1 text-[22px] font-black text-slate-900">{loading ? "..." : `${data?.tasks?.done || 0} / ${data?.tasks?.total || 0}`}</div>
                      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white shadow-[inset_0_1px_2px_rgba(15,23,42,0.08)]">
                        <div className="h-full rounded-full bg-gradient-to-r from-teal-400 to-sky-500" style={{ width: `${loading ? 0 : progressPct}%` }} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <Link to="/admin/boards" className="user-dashboard-surface rounded-[18px] border border-slate-200 bg-slate-50 p-4 transition hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_12px_28px_rgba(15,23,42,0.08)]">
                    <div className="user-dashboard-panel-icon user-dashboard-accent-blue grid h-10 w-10 place-items-center rounded-[14px] border border-slate-200 bg-white text-[#6d5efc]">
                      <BoardsIcon size={17} />
                    </div>
                    <div className="mt-4 text-[15px] font-black text-slate-900">Open boards</div>
                    <div className="mt-1 text-[12px] font-semibold text-slate-500">Check your group work</div>
                  </Link>
                  <Link to="/calendar" className="user-dashboard-surface rounded-[18px] border border-slate-200 bg-slate-50 p-4 transition hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_12px_28px_rgba(15,23,42,0.08)]">
                    <div className="user-dashboard-panel-icon user-dashboard-accent-green grid h-10 w-10 place-items-center rounded-[14px] border border-slate-200 bg-white text-emerald-600">
                      <CalendarIcon size={17} />
                    </div>
                    <div className="mt-4 text-[15px] font-black text-slate-900">Meetings</div>
                    <div className="mt-1 text-[12px] font-semibold text-slate-500">See your schedule</div>
                  </Link>
                  <Link to="/notifications" className="user-dashboard-surface rounded-[18px] border border-slate-200 bg-slate-50 p-4 transition hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_12px_28px_rgba(15,23,42,0.08)]">
                    <div className="user-dashboard-panel-icon user-dashboard-accent-amber grid h-10 w-10 place-items-center rounded-[14px] border border-slate-200 bg-white text-amber-600">
                      <svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" fill="none" aria-hidden="true">
                        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M10 21h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    </div>
                    <div className="mt-4 text-[15px] font-black text-slate-900">Alerts</div>
                    <div className="mt-1 text-[12px] font-semibold text-slate-500">Catch updates fast</div>
                  </Link>
                </div>
              </div>
            </section>

            <section className="user-dashboard-panel rounded-[22px] border border-slate-200 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
              <div className="mb-5 flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-extrabold text-slate-500">Next Up</div>
                  <div className="mt-1.5 text-[18px] font-black text-slate-900">Tasks to focus on</div>
                </div>
                <div className="user-dashboard-panel-icon user-dashboard-accent-amber grid h-11 w-11 place-items-center rounded-[14px] border border-slate-200 bg-slate-50 text-amber-600">
                  <TasksIcon size={18} />
                </div>
              </div>

              {loading ? (
                <div className="user-dashboard-surface rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-6 text-[13px] font-semibold text-slate-500">
                  Loading tasks...
                </div>
              ) : assignedCards.length === 0 ? (
                <div className="user-dashboard-surface rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-6 text-[13px] font-semibold text-slate-500">
                  No open assigned tasks right now.
                </div>
              ) : (
                <div className="space-y-3">
                  {assignedCards.map((card) => (
                    <Link key={card.card_id} to={`/admin/boards/${card.board_id}`} className="user-dashboard-surface block rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-4 transition hover:bg-white hover:shadow-[0_12px_28px_rgba(15,23,42,0.08)]">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-[15px] font-black text-slate-900">{card.card_title}</div>
                          <div className="mt-1 text-[13px] font-semibold text-slate-500">{card.board_name}</div>
                        </div>
                        <span className="user-dashboard-chip inline-flex h-7 items-center rounded-full border border-slate-200 bg-white px-2.5 text-[11px] font-extrabold capitalize text-slate-700">
                          {normalizeStatus(card.status)}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] font-semibold text-slate-500">
                        <span>{formatDueDate(card.due_date)}</span>
                        <span className="text-slate-300">-</span>
                        <span>{card.subtasks_done || 0}/{card.subtasks_all || 0} subtasks</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            <section className="user-dashboard-panel rounded-[22px] border border-slate-200 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
              <div className="mb-5 flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-extrabold text-slate-500">My Boards</div>
                  <div className="mt-1.5 text-[18px] font-black text-slate-900">Spaces you belong to</div>
                </div>
                <div className="user-dashboard-panel-icon user-dashboard-accent-blue grid h-11 w-11 place-items-center rounded-[14px] border border-slate-200 bg-slate-50 text-[#6d5efc]">
                  <BoardsIcon size={18} />
                </div>
              </div>

              <div className="space-y-3">
                {loading ? (
                  <div className="user-dashboard-surface rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-6 text-[13px] font-semibold text-slate-500">Loading boards...</div>
                ) : studentBoards.length === 0 ? (
                  <div className="user-dashboard-surface rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-6 text-[13px] font-semibold text-slate-500">No boards assigned yet.</div>
                ) : (
                  studentBoards.slice(0, 4).map((board) => (
                    <Link key={board.id} to={`/admin/boards/${board.id}`} className="user-dashboard-surface flex items-center justify-between gap-3 rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-4 transition hover:bg-white">
                      <div className="min-w-0">
                        <div className="truncate text-[15px] font-black text-slate-900">{board.name}</div>
                        <div className="mt-1 text-[12px] font-semibold text-slate-500">{board.group || board.supervisor?.full_name || "Project board"}</div>
                      </div>
                      <span className="text-[18px] font-black text-slate-300">&rsaquo;</span>
                    </Link>
                  ))
                )}
              </div>
            </section>

            <section className="user-dashboard-panel rounded-[22px] border border-slate-200 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
              <div className="mb-5 flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-extrabold text-slate-500">Support</div>
                  <div className="mt-1.5 text-[18px] font-black text-slate-900">Supervisors and meetings</div>
                </div>
                <div className="user-dashboard-panel-icon user-dashboard-accent-green grid h-11 w-11 place-items-center rounded-[14px] border border-slate-200 bg-slate-50 text-emerald-600">
                  <PeopleIcon size={18} />
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
                <div className="user-dashboard-surface rounded-[18px] border border-slate-200 bg-slate-50 p-4">
                  <div className="text-[12px] font-black uppercase tracking-[0.14em] text-slate-400">Next meeting</div>
                  {meetingsError ? (
                    <div className="mt-3 text-[13px] font-semibold text-rose-600">{meetingsError}</div>
                  ) : nextMeeting ? (
                    <div className="mt-3">
                      <div className="truncate text-[15px] font-black text-slate-900">{nextMeeting.title}</div>
                      <div className="mt-1 text-[13px] font-semibold text-slate-500">{formatMeetingDay(nextMeeting.starts_at)} - {formatMeetingTimeRange(nextMeeting.starts_at, nextMeeting.ends_at)}</div>
                    </div>
                  ) : (
                    <div className="mt-3 text-[13px] font-semibold text-slate-500">No meetings in the next 7 days.</div>
                  )}
                </div>

                <div className="user-dashboard-surface rounded-[18px] border border-slate-200 bg-slate-50 p-4">
                  <div className="text-[12px] font-black uppercase tracking-[0.14em] text-slate-400">Supervisors</div>
                  <div className="mt-3 space-y-2">
                    {loading ? (
                      <div className="text-[13px] font-semibold text-slate-500">Loading supervisors...</div>
                    ) : studentSupervisors.length === 0 ? (
                      <div className="text-[13px] font-semibold text-slate-500">No supervisor assigned yet.</div>
                    ) : (
                      studentSupervisors.slice(0, 3).map((supervisor) => (
                        <div key={supervisor.id} className="flex items-center gap-3">
                          <div className="grid h-9 w-9 flex-none place-items-center rounded-full border border-slate-200 bg-white text-[12px] font-black text-slate-700">
                            {(supervisor.full_name || "?").trim().charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-[13px] font-black text-slate-900">{supervisor.full_name}</div>
                            <div className="truncate text-[12px] font-semibold text-slate-500">{supervisor.nickname || supervisor.email || "Supervisor"}</div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </section>
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <section className="user-dashboard-panel rounded-[22px] border border-slate-200 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
              <div className="mb-5 flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-extrabold text-slate-500">Upcoming Meetings</div>
                  <div className="mt-1.5 text-[18px] font-black text-slate-900">This week</div>
                </div>
                <div className="user-dashboard-panel-icon user-dashboard-accent-blue grid h-11 w-11 place-items-center rounded-[14px] border border-slate-200 bg-slate-50 text-[#6d5efc]">
                  <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" aria-hidden="true">
                    <path d="M7 3v3M17 3v3M4 9h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <rect x="4" y="5" width="16" height="15" rx="3" stroke="currentColor" strokeWidth="2" />
                    <path d="M8 13h3v3H8z" fill="currentColor" />
                  </svg>
                </div>
              </div>

              {loading ? (
                <div className="user-dashboard-surface rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-6 text-[13px] font-semibold text-slate-500">
                  Loading meetings...
                </div>
              ) : meetingsError ? (
                <div className="rounded-[18px] border border-rose-200 bg-rose-50 px-4 py-6 text-[13px] font-semibold text-rose-700">
                  {meetingsError}
                </div>
              ) : upcomingMeetings.length === 0 ? (
                <div className="user-dashboard-surface rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-6 text-[13px] font-semibold text-slate-500">
                  No meetings scheduled for the next 7 days.
                </div>
              ) : (
                <div className="space-y-3">
                  {upcomingMeetings.map((meeting) => (
                    <div key={meeting.id} className="user-dashboard-surface rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-[15px] font-black text-slate-900">{meeting.title}</div>
                          <div className="mt-1 text-[13px] font-semibold text-slate-500">{meeting.board_name}</div>
                        </div>
                        <span className="user-dashboard-chip inline-flex h-7 items-center rounded-full border border-slate-200 bg-white px-2.5 text-[11px] font-extrabold text-slate-700">
                          {meeting.location || "TBA"}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] font-semibold text-slate-500">
                        <span>{formatMeetingDay(meeting.starts_at)}</span>
                        <span className="text-slate-300">•</span>
                        <span>{formatMeetingTimeRange(meeting.starts_at, meeting.ends_at)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="user-dashboard-panel rounded-[22px] border border-slate-200 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
              <div className="mb-5 flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-extrabold text-slate-500">Task Completion</div>
                  <div className="mt-1.5 text-[18px] font-black text-slate-900">Tasks and subtasks</div>
                </div>
                <div className="user-dashboard-panel-icon user-dashboard-accent-green grid h-11 w-11 place-items-center rounded-[14px] border border-slate-200 bg-slate-50">
                  <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" aria-hidden="true">
                    <path d="M7 12.5l3 3 7-8" stroke="#22c55e" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                    <rect x="4" y="4" width="16" height="16" rx="4" stroke="#94a3b8" strokeWidth="1.8" />
                  </svg>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {taskCompletionError ? (
                  <div className="col-span-2 rounded-[18px] border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] font-semibold text-rose-700">
                    {taskCompletionError}
                  </div>
                ) : null}
                <div className="user-dashboard-metric-card rounded-[18px] border border-slate-200 bg-white p-4 shadow-[0_10px_25px_rgba(15,23,42,0.06)]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-extrabold text-slate-500">Tasks</div>
                      <div className="mt-1.5 text-2xl font-black text-slate-900">{loading ? "..." : taskCount}</div>
                    </div>
                    <div className="user-dashboard-panel-icon user-dashboard-accent-blue grid h-11 w-11 place-items-center rounded-[14px] border border-slate-200 bg-slate-50">
                      <TasksIcon size={18} />
                    </div>
                  </div>
                  <div className="mt-2 text-[13px] text-slate-500">All cards across your boards</div>
                </div>
                <div className="user-dashboard-metric-card rounded-[18px] border border-slate-200 bg-white p-4 shadow-[0_10px_25px_rgba(15,23,42,0.06)]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-extrabold text-slate-500">Subtasks</div>
                      <div className="mt-1.5 text-2xl font-black text-slate-900">{loading ? "..." : subtaskCount}</div>
                    </div>
                    <div className="user-dashboard-panel-icon user-dashboard-accent-purple grid h-11 w-11 place-items-center rounded-[14px] border border-slate-200 bg-slate-50 text-violet-600">
                      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" aria-hidden="true">
                        <path d="M7 8h10M7 12h10M7 16h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        <path d="M4.5 8h.01M4.5 12h.01M4.5 16h.01" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                      </svg>
                    </div>
                  </div>
                  <div className="mt-2 text-[13px] text-slate-500">Checklist items included</div>
                </div>
                <div className="user-dashboard-metric-card rounded-[18px] border border-slate-200 bg-white p-4 shadow-[0_10px_25px_rgba(15,23,42,0.06)]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-extrabold text-slate-500">On time</div>
                      <div className="mt-1.5 text-2xl font-black text-slate-900">{loading ? "..." : onTimeCount}</div>
                    </div>
                    <div className="user-dashboard-panel-icon user-dashboard-accent-green grid h-11 w-11 place-items-center rounded-[14px] border border-slate-200 bg-slate-50">
                      <span className="h-3 w-3 rounded-full bg-emerald-500" />
                    </div>
                  </div>
                  <div className="mt-2 text-[13px] text-slate-500">{loading ? "..." : `${onTimePercent}%`} on track</div>
                </div>
                <div className="user-dashboard-metric-card rounded-[18px] border border-slate-200 bg-white p-4 shadow-[0_10px_25px_rgba(15,23,42,0.06)]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-extrabold text-slate-500">Overdue</div>
                      <div className="mt-1.5 text-2xl font-black text-slate-900">{loading ? "..." : overdueCount}</div>
                    </div>
                    <div className="user-dashboard-panel-icon user-dashboard-accent-red grid h-11 w-11 place-items-center rounded-[14px] border border-slate-200 bg-slate-50">
                      <span className="h-3 w-3 rounded-full bg-rose-500" />
                    </div>
                  </div>
                  <div className="mt-2 text-[13px] text-slate-500">Open items past due date</div>
                </div>
              </div>

              <div className="user-dashboard-surface mt-5 rounded-[18px] border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3 text-[12px] font-bold text-slate-500">
                  <span>Completion overview</span>
                  <span>{loading ? "..." : `${totalTrackedItems} tracked items`}</span>
                </div>
                <div className="user-dashboard-progress-track mt-3 h-3 overflow-hidden rounded-full bg-white shadow-[inset_0_1px_2px_rgba(15,23,42,0.08)]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-emerald-500 to-emerald-600 transition-all duration-500"
                    style={{ width: `${loading ? 0 : onTimePercent}%` }}
                  />
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 text-[12px] font-semibold text-slate-500">
                  <span>On time items stay ahead of their due dates.</span>
                  <span className="font-black text-slate-700">{loading ? "..." : `${onTimeCount} / ${totalTrackedItems}`}</span>
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
