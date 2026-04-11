import { useEffect, useMemo, useState, type ReactNode } from "react";
import AdminLayout from "../components/AdminLayout";
import { apiFetch } from "../lib/api";

type BoardRow = {
  id: number;
  name: string;
  description: string;
  supervisor_name: string;
  created_at: string;
  lists_count: number;
  cards_count: number;
};

type BoardFull = {
  board_id: number;
  name: string;
  lists: { id: number; title: string }[];
  cards: {
    id: number;
    title: string;
    status: string;
    priority: string;
    due_date: string;
    list_id: number;
  }[];
};

type UserRow = {
  id: number;
  full_name: string;
  role: "student" | "supervisor";
  cohort?: string;
  assigned_boards?: string[];
};

type SupervisorRow = {
  supervisor_user_id: number;
  full_name: string;
};

type MeetingRow = {
  id: number;
  board_id: number;
  board_name: string;
  supervisor_id: number;
  supervisor_name: string;
  created_by: number;
  created_by_name: string;
  title: string;
  location: string;
  notes: string;
  status: "scheduled" | "completed" | "canceled";
  outcome_notes: string;
  starts_at: string;
  ends_at: string;
  created_at: string;
};

type OverdueCard = {
  boardID: number;
  boardName: string;
  supervisor: string;
  cardID: number;
  cardTitle: string;
  dueDate: string;
  daysOverdue: number;
  priority: string;
};

type SupervisorStats = {
  supervisor: string;
  boards: number;
  cards: number;
  done: number;
  overdue: number;
  completionPct: number;
};

type ComplianceRow = {
  supervisor: string;
  meetings: number;
  status: "on_track" | "missing";
};

const PROJECT_MODULES = [
  {
    module: "Go",
    projects: ["go-reloaded", "ascii-art", "ascii-art-web", "groupie-tracker", "lem-in", "forum"],
  },
  {
    module: "JavaScript",
    projects: ["make-your-game", "real-time-forum", "graphql", "social-network", "mini-framework", "bomberman-dom"],
  },
  {
    module: "Rust",
    projects: ["smart-road", "filler", "rt", "localhost", "multiplayer-fps", "0-shell"],
  },
];

const PROJECT_LOOKUP = PROJECT_MODULES.flatMap((group) =>
  group.projects.map((project) => ({ module: group.module, project }))
).sort((a, b) => b.project.length - a.project.length);

function normalizeCohort(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return "No cohort";
  const match = raw.match(/(\d+)/);
  if (match) return `Cohort ${Number(match[1])}`;
  return raw;
}

function projectLabel(project: string) {
  return project
    .split("-")
    .map((part) => (part.length <= 2 ? part.toUpperCase() : part[0].toUpperCase() + part.slice(1)))
    .join(" ");
}

function inferProject(boardName: string) {
  const normalized = String(boardName || "").trim().toLowerCase();
  if (!normalized) return null;
  return PROJECT_LOOKUP.find(({ project }) => {
    const escaped = project.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|-)${escaped}($|-)`).test(normalized);
  }) || null;
}

function toDateOnly(v: string) {
  if (!v) return null;
  const s = String(v).trim();
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysBetween(a: Date, b: Date) {
  const ms = a.getTime() - b.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function formatDate(v: string) {
  const d = toDateOnly(v);
  if (!d) return "No date";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
}

function formatMeetingTime(startISO: string, endISO: string) {
  const start = new Date(startISO);
  const end = new Date(endISO);
  return `${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })} • ${start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} - ${end.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

function normalizePriority(v: string) {
  const p = String(v || "").trim().toLowerCase();
  if (p === "urgent" || p === "high" || p === "medium" || p === "low") return p;
  return "medium";
}

export default function AdminReportsPage() {
  const [boards, setBoards] = useState<BoardRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [supervisors, setSupervisors] = useState<SupervisorRow[]>([]);
  const [meetings, setMeetings] = useState<MeetingRow[]>([]);
  const [boardDetails, setBoardDetails] = useState<Record<number, BoardFull>>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [meetingFilter, setMeetingFilter] = useState({
    boardId: "all",
    supervisor: "all",
    dateFrom: "",
    dateTo: "",
  });
  const [projectFilter, setProjectFilter] = useState({
    cohort: "all",
    module: "all",
    project: "all",
  });

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const [boardsRes, usersRes, supsRes, meetingsRes] = await Promise.all([
        apiFetch("/admin/all-boards"),
        apiFetch("/admin/users?role=all&q="),
        apiFetch("/admin/supervisors"),
        apiFetch("/admin/meetings"),
      ]);

      const boardRows: BoardRow[] = Array.isArray(boardsRes) ? boardsRes : [];
      setBoards(boardRows);
      setUsers(Array.isArray(usersRes) ? usersRes : []);
      setSupervisors(Array.isArray(supsRes) ? supsRes : []);
      setMeetings(Array.isArray(meetingsRes) ? meetingsRes : []);

      const fullRes = await Promise.all(
        boardRows.map(async (b) => {
          const full = await apiFetch(`/admin/board?board_id=${b.id}`);
          return [b.id, full] as const;
        })
      );
      const nextDetails: Record<number, BoardFull> = {};
      for (const [id, full] of fullRes) nextDetails[id] = full;
      setBoardDetails(nextDetails);
    } catch (e: any) {
      setErr(e?.message || "Failed to load reports data");
      setBoards([]);
      setUsers([]);
      setSupervisors([]);
      setMeetings([]);
      setBoardDetails({});
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const analytics = useMemo(() => {
    const allCards = boards.flatMap((b) => boardDetails[b.id]?.cards || []);
    const allLists = boards.flatMap((b) => boardDetails[b.id]?.lists || []);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let done = 0;
    let open = 0;
    const overdueCards: OverdueCard[] = [];
    const priority = { urgent: 0, high: 0, medium: 0, low: 0 };

    for (const board of boards) {
      const cards = boardDetails[board.id]?.cards || [];
      for (const c of cards) {
        const status = String(c.status || "").toLowerCase();
        if (status === "done") done += 1;
        else open += 1;
        priority[normalizePriority(c.priority)] += 1;

        const due = toDateOnly(c.due_date);
        if (due && status !== "done" && due < today) {
          overdueCards.push({
            boardID: board.id,
            boardName: board.name,
            supervisor: board.supervisor_name,
            cardID: c.id,
            cardTitle: c.title,
            dueDate: c.due_date,
            daysOverdue: Math.max(1, daysBetween(today, due)),
            priority: normalizePriority(c.priority),
          });
        }
      }
    }

    const supervisorStatsMap = new Map<string, SupervisorStats>();
    for (const board of boards) {
      const key = board.supervisor_name || "Unknown";
      if (!supervisorStatsMap.has(key)) {
        supervisorStatsMap.set(key, {
          supervisor: key,
          boards: 0,
          cards: 0,
          done: 0,
          overdue: 0,
          completionPct: 0,
        });
      }
      const row = supervisorStatsMap.get(key)!;
      row.boards += 1;
      const cards = boardDetails[board.id]?.cards || [];
      row.cards += cards.length;
      for (const c of cards) {
        const status = String(c.status || "").toLowerCase();
        if (status === "done") row.done += 1;
        const due = toDateOnly(c.due_date);
        if (due && status !== "done" && due < today) row.overdue += 1;
      }
    }

    const supervisorStats = [...supervisorStatsMap.values()]
      .map((s) => ({
        ...s,
        completionPct: s.cards > 0 ? Math.round((s.done / s.cards) * 100) : 0,
      }))
      .sort((a, b) => b.overdue - a.overdue || b.cards - a.cards);

    const students = users.filter((u) => u.role === "student").length;
    const supervisorsCount = users.filter((u) => u.role === "supervisor").length || supervisors.length;
    const cardsTotal = allCards.length;
    const listsTotal = allLists.length;
    const completionPct = cardsTotal > 0 ? Math.round((done / cardsTotal) * 100) : 0;

    const lowActivityBoards = boards
      .map((b) => {
        const cards = boardDetails[b.id]?.cards || [];
        const activeCards = cards.filter((c) => String(c.status || "").toLowerCase() !== "done").length;
        return {
          ...b,
          activeCards,
          cardsTotal: cards.length,
        };
      })
      .sort((a, b) => a.activeCards - b.activeCards || a.cardsTotal - b.cardsTotal)
      .slice(0, 5);

    overdueCards.sort((a, b) => b.daysOverdue - a.daysOverdue || (b.priority === "urgent" ? 1 : 0));

    return {
      boardsTotal: boards.length,
      listsTotal,
      cardsTotal,
      done,
      open,
      overdue: overdueCards.length,
      completionPct,
      students,
      supervisors: supervisorsCount,
      priority,
      overdueCards: overdueCards.slice(0, 8),
      supervisorStats: supervisorStats.slice(0, 8),
      lowActivityBoards,
    };
  }, [boards, boardDetails, users, supervisors.length]);

  const filteredMeetings = useMemo(() => {
    return meetings.filter((meeting) => {
      if (meetingFilter.boardId !== "all" && String(meeting.board_id) !== meetingFilter.boardId) return false;
      if (meetingFilter.supervisor !== "all" && meeting.supervisor_name !== meetingFilter.supervisor) return false;
      const start = new Date(meeting.starts_at);
      if (meetingFilter.dateFrom) {
        const from = new Date(`${meetingFilter.dateFrom}T00:00:00`);
        if (start < from) return false;
      }
      if (meetingFilter.dateTo) {
        const to = new Date(`${meetingFilter.dateTo}T23:59:59`);
        if (start > to) return false;
      }
      return true;
    });
  }, [meetings, meetingFilter]);

  const meetingAnalytics = useMemo(() => {
    const now = new Date();
    const todayKey = now.toDateString();
    const roomCounts = new Map<string, number>();

    let scheduled = 0;
    let completed = 0;
    let canceled = 0;
    let today = 0;
    let upcoming = 0;

    for (const meeting of filteredMeetings) {
      const startsAt = new Date(meeting.starts_at);
      if (meeting.status === "scheduled") scheduled += 1;
      if (meeting.status === "completed") completed += 1;
      if (meeting.status === "canceled") canceled += 1;
      if (startsAt.toDateString() === todayKey) today += 1;
      if (meeting.status === "scheduled" && startsAt >= now) upcoming += 1;
      const room = (meeting.location || "Unknown").trim();
      roomCounts.set(room, (roomCounts.get(room) || 0) + 1);
    }

    const mostUsedRooms = [...roomCounts.entries()]
      .map(([room, count]) => ({ room, count }))
      .sort((a, b) => b.count - a.count || a.room.localeCompare(b.room))
      .slice(0, 5);

    const supervisorsInScope = [...new Set(
      boards
        .filter((board) => meetingFilter.boardId === "all" || String(board.id) === meetingFilter.boardId)
        .map((board) => board.supervisor_name)
        .filter(Boolean)
    )];

    const complianceSource = filteredMeetings.filter((meeting) => {
      if (meetingFilter.dateFrom || meetingFilter.dateTo) return true;
      const date = new Date(meeting.starts_at);
      return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    });

    const meetingsPerSupervisor = new Map<string, number>();
    for (const meeting of complianceSource) {
      if (meeting.status === "canceled") continue;
      meetingsPerSupervisor.set(meeting.supervisor_name, (meetingsPerSupervisor.get(meeting.supervisor_name) || 0) + 1);
    }

    const compliance: ComplianceRow[] = supervisorsInScope
      .map((supervisor) => {
        const meetingsCount = meetingsPerSupervisor.get(supervisor) || 0;
        return {
          supervisor,
          meetings: meetingsCount,
          status: (meetingsCount > 0 ? "on_track" : "missing") as ComplianceRow["status"],
        };
      })
      .sort((a, b) => a.meetings - b.meetings || a.supervisor.localeCompare(b.supervisor));

    return {
      total: filteredMeetings.length,
      scheduled,
      completed,
      canceled,
      today,
      upcoming,
      mostUsedRooms,
      compliance,
      recent: filteredMeetings
        .slice()
        .sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime())
        .slice(0, 6),
    };
  }, [filteredMeetings, boards, meetingFilter]);

  const projectAnalytics = useMemo(() => {
    const studentRows = users.filter((user) => String(user.role || "").toLowerCase() === "student");
    const counts = new Map<string, Map<string, { count: number; module: string; project: string }>>();
    const seenStudentProject = new Set<string>();

    for (const student of studentRows) {
      const cohort = normalizeCohort(student.cohort || "");
      for (const boardName of student.assigned_boards || []) {
        const inferred = inferProject(boardName);
        if (!inferred) continue;
        if (projectFilter.cohort !== "all" && cohort !== projectFilter.cohort) continue;
        if (projectFilter.module !== "all" && inferred.module !== projectFilter.module) continue;
        if (projectFilter.project !== "all" && inferred.project !== projectFilter.project) continue;

        const uniqueKey = `${student.id}:${cohort}:${inferred.project}`;
        if (seenStudentProject.has(uniqueKey)) continue;
        seenStudentProject.add(uniqueKey);

        if (!counts.has(cohort)) counts.set(cohort, new Map());
        const cohortMap = counts.get(cohort)!;
        const current = cohortMap.get(inferred.project) || { count: 0, module: inferred.module, project: inferred.project };
        current.count += 1;
        cohortMap.set(inferred.project, current);
      }
    }

    const rows = Array.from(counts.entries())
      .map(([cohort, projectMap]) => {
        const projects = Array.from(projectMap.values()).sort((a, b) => b.count - a.count || a.project.localeCompare(b.project));
        return {
          cohort,
          projects,
          total: projects.reduce((sum, item) => sum + item.count, 0),
        };
      })
      .sort((a, b) => {
        const aNum = Number(a.cohort.match(/\d+/)?.[0] || Number.MAX_SAFE_INTEGER);
        const bNum = Number(b.cohort.match(/\d+/)?.[0] || Number.MAX_SAFE_INTEGER);
        return aNum - bNum || a.cohort.localeCompare(b.cohort);
      });

    const cohortOptions = Array.from(new Set(studentRows.map((student) => normalizeCohort(student.cohort || "")))).sort((a, b) => {
      const aNum = Number(a.match(/\d+/)?.[0] || Number.MAX_SAFE_INTEGER);
      const bNum = Number(b.match(/\d+/)?.[0] || Number.MAX_SAFE_INTEGER);
      return aNum - bNum || a.localeCompare(b);
    });
    const moduleOptions = PROJECT_MODULES.map((group) => group.module);
    const projectOptions = PROJECT_MODULES
      .filter((group) => projectFilter.module === "all" || group.module === projectFilter.module)
      .flatMap((group) => group.projects.map((project) => ({ module: group.module, project })));
    const maxCount = Math.max(1, ...rows.flatMap((row) => row.projects.map((project) => project.count)));
    const activeProjects = rows.reduce((sum, row) => sum + row.projects.length, 0);

    return {
      rows,
      cohortOptions,
      moduleOptions,
      projectOptions,
      maxCount,
      activeProjects,
      trackedTalents: seenStudentProject.size,
    };
  }, [projectFilter, users]);

  return (
    <AdminLayout
      active="reports"
      title="Reports"
      subtitle="Workspace analytics, meeting compliance, and operational clarity."
      right={
        <button
          type="button"
          onClick={load}
          className="h-10 rounded-[14px] border border-slate-200 bg-slate-50 px-3 font-extrabold text-slate-900 transition hover:border-[#6d5efc]/25 hover:bg-[#f2f5ff]"
        >
          Refresh
        </button>
      }
    >
      {err ? (
        <div className="mb-3 rounded-[14px] border border-red-200 bg-red-50 px-3 py-2 text-[13px] font-semibold text-red-700">
          {err}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-[18px] border border-slate-200 bg-white p-4 text-[14px] font-semibold text-slate-500">
          Building reports...
        </div>
      ) : (
        <div className="reports-page grid gap-4">
          <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.16),_transparent_34%),radial-gradient(circle_at_80%_20%,_rgba(16,185,129,0.15),_transparent_30%),linear-gradient(180deg,_#ffffff_0%,_#f8fbff_100%)] p-5 shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <SectionEyebrow label="Cohort Project Graph" />
                <h2 className="mt-2 text-[30px] font-black tracking-[-0.04em] text-slate-950 sm:text-[38px]">
                  See which cohorts are carrying each module and project.
                </h2>
                <p className="mt-2 max-w-3xl text-[14px] font-semibold leading-7 text-slate-600">
                  Counts are built from talent board assignments, so you can quickly spot where projects like RT,
                  GraphQL, or Mini Framework are active by cohort.
                </p>
              </div>
              <div className="grid min-w-[260px] gap-2 rounded-[22px] border border-white/70 bg-white/85 p-3 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur">
                <InsightRow label="Cohorts shown" value={projectAnalytics.rows.length} />
                <InsightRow label="Project cells" value={projectAnalytics.activeProjects} />
                <InsightRow label="Talent-project links" value={projectAnalytics.trackedTalents} />
              </div>
            </div>

            <div className="mt-5 grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
              <div className="rounded-[22px] border border-slate-200 bg-white/90 p-4 shadow-[0_14px_34px_rgba(15,23,42,0.06)]">
                <div className="text-[16px] font-black text-slate-950">Filters</div>
                <div className="mt-4 grid gap-3">
                  <ReportField label="Cohort">
                    <select
                      value={projectFilter.cohort}
                      onChange={(e) => setProjectFilter((prev) => ({ ...prev, cohort: e.target.value }))}
                      className="h-11 rounded-[16px] border border-slate-200 bg-slate-50 px-3 text-[13px] font-bold text-slate-800 outline-none transition focus:border-[#6d5efc]/30 focus:bg-white"
                    >
                      <option value="all">All cohorts</option>
                      {projectAnalytics.cohortOptions.map((cohort) => (
                        <option key={cohort} value={cohort}>{cohort}</option>
                      ))}
                    </select>
                  </ReportField>

                  <ReportField label="Module">
                    <select
                      value={projectFilter.module}
                      onChange={(e) => setProjectFilter((prev) => ({ ...prev, module: e.target.value, project: "all" }))}
                      className="h-11 rounded-[16px] border border-slate-200 bg-slate-50 px-3 text-[13px] font-bold text-slate-800 outline-none transition focus:border-[#6d5efc]/30 focus:bg-white"
                    >
                      <option value="all">All modules</option>
                      {projectAnalytics.moduleOptions.map((module) => (
                        <option key={module} value={module}>{module}</option>
                      ))}
                    </select>
                  </ReportField>

                  <ReportField label="Project">
                    <select
                      value={projectFilter.project}
                      onChange={(e) => setProjectFilter((prev) => ({ ...prev, project: e.target.value }))}
                      className="h-11 rounded-[16px] border border-slate-200 bg-slate-50 px-3 text-[13px] font-bold text-slate-800 outline-none transition focus:border-[#6d5efc]/30 focus:bg-white"
                    >
                      <option value="all">All projects</option>
                      {projectAnalytics.projectOptions.map((item) => (
                        <option key={`${item.module}:${item.project}`} value={item.project}>
                          {projectLabel(item.project)} ({item.module})
                        </option>
                      ))}
                    </select>
                  </ReportField>

                  <button
                    type="button"
                    onClick={() => setProjectFilter({ cohort: "all", module: "all", project: "all" })}
                    className="h-10 rounded-[14px] border border-slate-200 bg-white px-3 text-[12px] font-black text-slate-700 transition hover:border-[#6d5efc]/25 hover:bg-[#f2f5ff]"
                  >
                    Reset graph filters
                  </button>
                </div>
              </div>

              <div className="rounded-[22px] border border-slate-200 bg-white/90 p-4 shadow-[0_14px_34px_rgba(15,23,42,0.06)]">
                {projectAnalytics.rows.length === 0 ? (
                  <div className="grid min-h-[280px] place-items-center rounded-[18px] border border-dashed border-slate-200 bg-slate-50 px-4 text-center">
                    <div>
                      <div className="text-[18px] font-black text-slate-950">No project data for this filter.</div>
                      <div className="mt-1 text-[13px] font-semibold text-slate-500">
                        Try another cohort, module, or project.
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {projectAnalytics.rows.map((row) => (
                      <div key={row.cohort} className="rounded-[18px] border border-slate-200 bg-[linear-gradient(180deg,#f8fbff_0%,#ffffff_100%)] p-3.5">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <div className="text-[15px] font-black text-slate-950">{row.cohort}</div>
                            <div className="text-[11px] font-semibold text-slate-500">{row.total} talent-project assignment{row.total === 1 ? "" : "s"}</div>
                          </div>
                          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-slate-600">
                            {row.projects.length} project{row.projects.length === 1 ? "" : "s"}
                          </span>
                        </div>
                        <div className="grid gap-2">
                          {row.projects.map((project) => (
                            <ProjectGraphBar
                              key={`${row.cohort}:${project.project}`}
                              count={project.count}
                              max={projectAnalytics.maxCount}
                              module={project.module}
                              project={project.project}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_16px_45px_rgba(15,23,42,0.06)]">
              <SectionEyebrow label="Workspace Pulse" />
              <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <div className="text-[24px] font-black tracking-[-0.03em] text-slate-950">Card progress and delivery balance</div>
                  <div className="mt-1 text-[13px] font-semibold text-slate-500">A quick read of done vs open work, plus who is carrying the largest overdue load.</div>
                </div>
                <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-slate-600">
                  {analytics.completionPct}% completion
                </div>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
                <div className="rounded-[20px] border border-slate-200 bg-[linear-gradient(180deg,#f8fbff_0%,#ffffff_100%)] p-4">
                  <div className="flex items-center justify-between text-[12px] font-bold text-slate-500">
                    <span>Execution split</span>
                    <span>{analytics.done} done / {analytics.open} open</span>
                  </div>
                  <div className="mt-4 h-4 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-gradient-to-r from-[#6d5efc] via-[#7e72ff] to-[#8f83ff] transition-all duration-500" style={{ width: `${analytics.completionPct}%` }} />
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <Mini label="Lists" value={analytics.listsTotal} />
                    <Mini label="Cards" value={analytics.cardsTotal} />
                    <Mini label="Supervisors" value={analytics.supervisors} />
                    <Mini label="Talents" value={analytics.students} />
                  </div>
                </div>

                <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
                  <div className="text-[13px] font-black uppercase tracking-[0.14em] text-slate-500">Priority distribution</div>
                  <div className="mt-4 space-y-3">
                    <PriorityBar label="Urgent" value={analytics.priority.urgent} tone="urgent" total={analytics.cardsTotal} />
                    <PriorityBar label="High" value={analytics.priority.high} tone="high" total={analytics.cardsTotal} />
                    <PriorityBar label="Medium" value={analytics.priority.medium} tone="medium" total={analytics.cardsTotal} />
                    <PriorityBar label="Low" value={analytics.priority.low} tone="low" total={analytics.cardsTotal} />
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_16px_45px_rgba(15,23,42,0.06)]">
              <SectionEyebrow label="Meeting Filters" />
              <div className="mt-2 text-[24px] font-black tracking-[-0.03em] text-slate-950">Operations control panel</div>
              <div className="mt-1 text-[13px] font-semibold text-slate-500">Change the report lens by board, supervisor, and date range.</div>

              <div className="mt-5 grid gap-3">
                <ReportField label="Board">
                  <select
                    value={meetingFilter.boardId}
                    onChange={(e) => setMeetingFilter((prev) => ({ ...prev, boardId: e.target.value }))}
                    className="h-11 rounded-[16px] border border-slate-200 bg-slate-50 px-3 text-[13px] font-bold text-slate-800 outline-none transition focus:border-[#6d5efc]/30 focus:bg-white"
                  >
                    <option value="all">All boards</option>
                    {boards.map((board) => <option key={board.id} value={board.id}>{board.name}</option>)}
                  </select>
                </ReportField>
                <ReportField label="Supervisor">
                  <select
                    value={meetingFilter.supervisor}
                    onChange={(e) => setMeetingFilter((prev) => ({ ...prev, supervisor: e.target.value }))}
                    className="h-11 rounded-[16px] border border-slate-200 bg-slate-50 px-3 text-[13px] font-bold text-slate-800 outline-none transition focus:border-[#6d5efc]/30 focus:bg-white"
                  >
                    <option value="all">All supervisors</option>
                    {[...new Set(boards.map((board) => board.supervisor_name).filter(Boolean))].sort().map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </ReportField>
                <div className="grid gap-3 sm:grid-cols-2">
                  <ReportField label="From">
                    <input
                      type="date"
                      value={meetingFilter.dateFrom}
                      onChange={(e) => setMeetingFilter((prev) => ({ ...prev, dateFrom: e.target.value }))}
                      className="h-11 rounded-[16px] border border-slate-200 bg-slate-50 px-3 text-[13px] font-bold text-slate-800 outline-none transition focus:border-[#6d5efc]/30 focus:bg-white"
                    />
                  </ReportField>
                  <ReportField label="To">
                    <input
                      type="date"
                      value={meetingFilter.dateTo}
                      onChange={(e) => setMeetingFilter((prev) => ({ ...prev, dateTo: e.target.value }))}
                      className="h-11 rounded-[16px] border border-slate-200 bg-slate-50 px-3 text-[13px] font-bold text-slate-800 outline-none transition focus:border-[#6d5efc]/30 focus:bg-white"
                    />
                  </ReportField>
                </div>
                <div className="rounded-[18px] border border-[#6d5efc]/12 bg-[linear-gradient(180deg,rgba(109,94,252,0.06),rgba(109,94,252,0.02))] p-4">
                  <div className="text-[11px] font-black uppercase tracking-[0.16em] text-[#5b50d6]">Filter impact</div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <InsightRow label="Meetings in scope" value={meetingAnalytics.total} />
                    <InsightRow label="Rooms active" value={meetingAnalytics.mostUsedRooms.length} />
                    <InsightRow label="Scheduled now" value={meetingAnalytics.scheduled} />
                    <InsightRow label="Completed" value={meetingAnalytics.completed} />
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_16px_45px_rgba(15,23,42,0.06)]">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <SectionEyebrow label="Meeting Overview" />
                <div className="mt-2 text-[24px] font-black tracking-[-0.03em] text-slate-950">Attendance, completion, and room usage at a glance</div>
                <div className="mt-1 text-[13px] font-semibold text-slate-500">This block turns the current filters into an operational snapshot.</div>
              </div>
              <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-slate-600">
                Updated from live meeting records
              </div>
            </div>

            <div className="mt-5 rounded-[20px] border border-slate-200 bg-[linear-gradient(180deg,#f8fbff_0%,#ffffff_100%)] p-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
                <CompactKpi label="Meetings" value={meetingAnalytics.total} />
                <CompactKpi label="Scheduled" value={meetingAnalytics.scheduled} />
                <CompactKpi label="Completed" value={meetingAnalytics.completed} tone="good" />
                <CompactKpi label="Canceled" value={meetingAnalytics.canceled} tone={meetingAnalytics.canceled > 0 ? "danger" : "default"} />
                <CompactKpi label="Today" value={meetingAnalytics.today} />
                <CompactKpi label="Upcoming" value={meetingAnalytics.upcoming} tone="good" />
              </div>
              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
                  <span>Meeting mix</span>
                  <span>{meetingAnalytics.total} records</span>
                </div>
                <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">
                  <SegmentBar value={meetingAnalytics.scheduled} total={Math.max(meetingAnalytics.total, 1)} className="bg-[#8f83ff]" />
                  <SegmentBar value={meetingAnalytics.completed} total={Math.max(meetingAnalytics.total, 1)} className="bg-emerald-400" />
                  <SegmentBar value={meetingAnalytics.canceled} total={Math.max(meetingAnalytics.total, 1)} className="bg-rose-400" />
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
              <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[18px] font-black text-slate-900">Supervisor Compliance</div>
                    <div className="mt-1 text-[12px] font-semibold text-slate-500">Expected meeting activity within the selected scope.</div>
                  </div>
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-slate-600">
                    {meetingAnalytics.compliance.length} tracked
                  </span>
                </div>
                <div className="mt-3 space-y-2">
                  {meetingAnalytics.compliance.length === 0 ? (
                    <div className="text-[13px] font-semibold text-slate-500">No supervisors in this scope.</div>
                  ) : meetingAnalytics.compliance.map((row) => (
                    <div key={row.supervisor} className="group rounded-[16px] border border-slate-200 bg-white px-3 py-3 transition hover:-translate-y-0.5 hover:border-[#6d5efc]/20 hover:shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-[13px] font-black text-slate-900">{row.supervisor}</div>
                          <div className="text-[11px] font-semibold text-slate-500">{row.meetings} meeting{row.meetings === 1 ? "" : "s"}</div>
                        </div>
                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] ${row.status === "on_track" ? "border border-emerald-200 bg-emerald-50 text-emerald-700" : "border border-red-200 bg-red-50 text-red-700"}`}>
                          {row.status === "on_track" ? "On track" : "Missing"}
                        </span>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${row.status === "on_track" ? "bg-gradient-to-r from-emerald-400 to-emerald-500" : "bg-gradient-to-r from-rose-300 to-rose-400"}`}
                          style={{ width: `${Math.max(16, Math.min(100, row.meetings * 20 || 16))}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-4">
                <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[18px] font-black text-slate-900">Most Used Rooms</div>
                      <div className="mt-1 text-[12px] font-semibold text-slate-500">Useful for spotting room pressure and recurring location demand.</div>
                    </div>
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-slate-600">
                      Top 5
                    </span>
                  </div>
                  <div className="mt-3 space-y-2.5">
                    {meetingAnalytics.mostUsedRooms.length === 0 ? (
                      <div className="text-[13px] font-semibold text-slate-500">No room usage yet.</div>
                    ) : meetingAnalytics.mostUsedRooms.map((row, index) => {
                      const width = Math.max(18, Math.round((row.count / Math.max(meetingAnalytics.mostUsedRooms[0]?.count || 1, 1)) * 100));
                      return (
                        <div key={row.room} className="rounded-[16px] border border-slate-200 bg-white p-3 transition hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-[10px] font-black text-white">
                                {index + 1}
                              </span>
                              <div>
                                <div className="text-[12px] font-black text-slate-900">{row.room}</div>
                                <div className="text-[11px] font-semibold text-slate-500">{row.count} bookings</div>
                              </div>
                            </div>
                            <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">usage</div>
                          </div>
                          <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-slate-100">
                            <div className="h-full rounded-full bg-gradient-to-r from-[#6d5efc] to-[#8f83ff] transition-all duration-500" style={{ width: `${width}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
                  <div className="text-[18px] font-black text-slate-900">Recent Meeting Activity</div>
                  <div className="mt-1 text-[12px] font-semibold text-slate-500">The latest meeting records presented as a cleaner activity stream.</div>
                  <div className="mt-4 space-y-2.5">
                    {meetingAnalytics.recent.length === 0 ? (
                      <div className="text-[13px] font-semibold text-slate-500">No meetings found for the current filters.</div>
                    ) : meetingAnalytics.recent.map((meeting) => (
                      <div key={meeting.id} className="relative overflow-hidden rounded-[18px] border border-slate-200 bg-white p-3.5 transition hover:-translate-y-0.5 hover:border-[#6d5efc]/20 hover:shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
                        <div className="absolute inset-y-0 left-0 w-1 rounded-full bg-gradient-to-b from-[#6d5efc] to-[#8f83ff]" />
                        <div className="flex items-start justify-between gap-2 pl-2">
                          <div>
                            <div className="text-[13px] font-black text-slate-900">{meeting.title}</div>
                            <div className="mt-0.5 text-[12px] font-semibold text-slate-500">{meeting.board_name} • {meeting.supervisor_name}</div>
                          </div>
                          <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] ${meeting.status === "completed" ? "border border-emerald-200 bg-emerald-50 text-emerald-700" : meeting.status === "canceled" ? "border border-red-200 bg-red-50 text-red-700" : "border border-slate-200 bg-slate-50 text-slate-600"}`}>
                            {meeting.status}
                          </span>
                        </div>
                        <div className="mt-3 grid gap-2 pl-2 sm:grid-cols-2">
                          <Mini label="When" value={formatMeetingTime(meeting.starts_at, meeting.ends_at)} />
                          <Mini label="Location" value={meeting.location || "No room"} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-[1.05fr_1.1fr_0.9fr]">
              <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_16px_45px_rgba(15,23,42,0.06)]">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <SectionEyebrow label="Risk Radar" />
                    <div className="mt-2 text-[24px] font-black tracking-[-0.03em] text-slate-950">Overdue cards most likely to block progress</div>
                  </div>
                </div>
                <div className="space-y-2.5">
                  {analytics.overdueCards.length === 0 ? (
                    <div className="rounded-[18px] border border-emerald-200 bg-emerald-50 px-4 py-4 text-[13px] font-semibold text-emerald-700">
                      No overdue cards right now.
                    </div>
                  ) : (
                    analytics.overdueCards.map((c) => (
                      <div key={c.cardID} className="rounded-[18px] border border-slate-200 bg-slate-50 p-3.5 transition hover:-translate-y-0.5 hover:border-red-200 hover:bg-white hover:shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-[13px] font-black text-slate-950">{c.cardTitle}</div>
                            <div className="mt-1 truncate text-[12px] font-semibold text-slate-500">{c.boardName} • {c.supervisor}</div>
                          </div>
                          <span className="rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-red-700">
                            {c.daysOverdue}d late
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-extrabold">
                          <span className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-slate-700">{formatDate(c.dueDate)}</span>
                          <span className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-slate-700">{c.priority}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_16px_45px_rgba(15,23,42,0.06)]">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <SectionEyebrow label="Workload Balance" />
                    <div className="mt-2 text-[24px] font-black tracking-[-0.03em] text-slate-950">Supervisor workload and completion</div>
                  </div>
                </div>
                <div className="space-y-2.5">
                  {analytics.supervisorStats.length === 0 ? (
                    <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-4 text-[13px] font-semibold text-slate-600">
                      No supervisor data yet.
                    </div>
                  ) : (
                    analytics.supervisorStats.map((s) => (
                      <div key={s.supervisor} className="rounded-[18px] border border-slate-200 bg-[linear-gradient(180deg,#f8fbff_0%,#ffffff_100%)] p-3.5 transition hover:-translate-y-0.5 hover:border-[#6d5efc]/20 hover:bg-white hover:shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
                        <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
                          <div className="min-w-0">
                            <div className="truncate text-[13px] font-black text-slate-950">{s.supervisor}</div>
                            <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] font-extrabold text-slate-600">
                              <MetricPill label="Boards" value={s.boards} />
                              <MetricPill label="Cards" value={s.cards} />
                              <MetricPill label="Done" value={s.done} />
                              <MetricPill label="Overdue" value={s.overdue} tone={s.overdue > 0 ? "danger" : "default"} />
                            </div>
                          </div>
                          <div className="rounded-[16px] border border-slate-200 bg-white p-3 shadow-[0_8px_22px_rgba(15,23,42,0.04)]">
                            <div className="flex items-end justify-between gap-3">
                              <div>
                                <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Completion</div>
                                <div className="mt-1 text-[22px] font-black tracking-[-0.03em] text-slate-950">{s.completionPct}%</div>
                              </div>
                              <div className="text-right text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
                                {s.done}/{s.cards || 0} done
                              </div>
                            </div>
                            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-200">
                              <div className="h-full rounded-full bg-gradient-to-r from-[#6d5efc] to-[#8f83ff] transition-all duration-500" style={{ width: `${s.completionPct}%` }} />
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

            <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_16px_45px_rgba(15,23,42,0.06)]">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <SectionEyebrow label="Board Coverage" />
                  <div className="mt-2 text-[24px] font-black tracking-[-0.03em] text-slate-950">Low-activity boards worth checking</div>
                </div>
              </div>
              <div className="space-y-2.5">
                {analytics.lowActivityBoards.map((b) => (
                  <div key={b.id} className="rounded-[18px] border border-slate-200 bg-slate-50 p-3.5 transition hover:-translate-y-0.5 hover:border-[#6d5efc]/20 hover:bg-white hover:shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
                    <div className="truncate text-[13px] font-black text-slate-950">{b.name}</div>
                    <div className="mt-1 truncate text-[12px] font-semibold text-slate-500">{b.supervisor_name}</div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <MetricPill label="Active" value={b.activeCards} />
                      <MetricPill label="Total" value={b.cardsTotal} />
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#111827] to-[#475569] transition-all duration-500"
                        style={{ width: `${Math.max(12, Math.min(100, b.cardsTotal > 0 ? Math.round((b.activeCards / b.cardsTotal) * 100) : 12))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      )}
    </AdminLayout>
  );
}

function CompactKpi({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string | number;
  tone?: "default" | "good" | "danger";
}) {
  const toneClass =
    tone === "good"
      ? "border-emerald-200 bg-emerald-50/80"
      : tone === "danger"
        ? "border-red-200 bg-red-50/80"
        : "border-slate-200 bg-white";

  return (
    <div className={`rounded-[16px] border px-3 py-3 ${toneClass}`}>
      <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">{label}</div>
      <div className="mt-1 text-[20px] font-black tracking-[-0.03em] text-slate-950">{value}</div>
    </div>
  );
}

function ProjectGraphBar({
  count,
  max,
  module,
  project,
}: {
  count: number;
  max: number;
  module: string;
  project: string;
}) {
  const width = Math.max(10, Math.round((count / Math.max(max, 1)) * 100));
  const moduleClass =
    module === "Rust"
      ? "from-orange-500 to-amber-400 text-orange-700 border-orange-200 bg-orange-50"
      : module === "JavaScript"
        ? "from-sky-500 to-cyan-400 text-sky-700 border-sky-200 bg-sky-50"
        : "from-emerald-500 to-teal-400 text-emerald-700 border-emerald-200 bg-emerald-50";

  return (
    <div className="grid gap-2 rounded-[16px] border border-slate-200 bg-white p-3 sm:grid-cols-[180px_minmax(0,1fr)_56px] sm:items-center">
      <div className="min-w-0">
        <div className="truncate text-[13px] font-black text-slate-950">{projectLabel(project)}</div>
        <div className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] ${moduleClass}`}>
          {module}
        </div>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${moduleClass.split(" ").slice(0, 2).join(" ")} transition-all duration-500`}
          style={{ width: `${width}%` }}
        />
      </div>
      <div className="text-right text-[20px] font-black tracking-[-0.03em] text-slate-950">{count}</div>
    </div>
  );
}

function SegmentBar({ value, total, className }: { value: number; total: number; className: string }) {
  const width = total > 0 ? `${(value / total) * 100}%` : "0%";
  return <div className={`${className} h-full transition-all duration-500`} style={{ width }} />;
}

function Mini({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-[16px] border border-slate-200 bg-white px-3 py-3">
      <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">{label}</div>
      <div className="mt-1 text-[14px] font-black text-slate-900">{value}</div>
    </div>
  );
}

function PriorityBar({
  label,
  value,
  tone,
  total,
}: {
  label: string;
  value: number;
  tone: "urgent" | "high" | "medium" | "low";
  total: number;
}) {
  const toneClass =
    tone === "urgent"
      ? "text-red-700"
      : tone === "high"
        ? "text-orange-700"
        : tone === "medium"
          ? "text-[#4f46e5]"
          : "text-emerald-700";
  const barClass =
    tone === "urgent"
      ? "from-red-500 to-red-400"
      : tone === "high"
        ? "from-orange-500 to-amber-400"
        : tone === "medium"
          ? "from-[#6d5efc] to-[#8f83ff]"
          : "from-emerald-500 to-emerald-400";
  const width = total > 0 ? Math.max(8, Math.round((value / total) * 100)) : 8;

  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-[12px] font-black">
        <span className={toneClass}>{label}</span>
        <span className="text-slate-500">{value}</span>
      </div>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white">
        <div className={`h-full rounded-full bg-gradient-to-r ${barClass} transition-all duration-500`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function InsightRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[14px] border border-slate-200 bg-white px-3 py-2">
      <span className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">{label}</span>
      <span className="truncate text-right text-[12px] font-black text-slate-900">{value}</span>
    </div>
  );
}

function MetricPill({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string | number;
  tone?: "default" | "danger";
}) {
  return (
    <div className={`rounded-[14px] border px-3 py-2 ${tone === "danger" ? "border-red-200 bg-red-50" : "border-slate-200 bg-white"}`}>
      <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">{label}</div>
      <div className={`mt-1 text-[13px] font-black ${tone === "danger" ? "text-red-700" : "text-slate-900"}`}>{value}</div>
    </div>
  );
}

function SectionEyebrow({ label }: { label: string }) {
  return (
    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-[#5b50d6]">
      {label}
    </div>
  );
}

function ReportField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</span>
      {children}
    </label>
  );
}
