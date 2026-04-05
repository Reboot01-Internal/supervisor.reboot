import { useEffect, useState } from "react";
import AdminLayout from "../components/AdminLayout";
import { apiFetch } from "../lib/api";

type SupervisorRow = {
  supervisor_user_id: number;
  full_name: string;
  email: string;
  file_id: number;
  created_at: string;
};

type BoardRow = {
  id: number;
  cards_count: number;
};

type SupervisorActivity = {
  active?: {
    count: number;
    percentage: number;
  };
  inactive?: {
    count: number;
    percentage: number;
  };
  total?: number;
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

function PieChart({ activePercent }: { activePercent: number }) {
  const pct = Math.max(0, Math.min(100, activePercent));
  const angle = (pct / 100) * 360;

  return (
    <div
      className="relative h-[220px] w-[220px] flex-none rounded-full"
      style={{
        background:
          pct <= 0
            ? "#fde2e2"
            : pct >= 100
            ? "#dff7e8"
            : `conic-gradient(#22c55e 0deg ${angle}deg, #f87171 ${angle}deg 360deg)`,
      }}
    >
      <div className="absolute inset-[28px] grid place-items-center rounded-full border border-slate-200 bg-white text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]">
        <div>
          <div className="text-[42px] font-black tracking-[-0.04em] text-slate-900">{pct}%</div>
          <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Active</div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  subtitle,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  subtitle?: string;
}) {
  return (
    <div className="rounded-[18px] border border-slate-200 bg-white p-4 shadow-[0_10px_25px_rgba(15,23,42,0.06)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-extrabold text-slate-500">{label}</div>
          <div className="mt-1.5 text-2xl font-black text-slate-900">{value}</div>
        </div>
        <div className="grid h-11 w-11 place-items-center rounded-[14px] border border-slate-200 bg-slate-50">
          {icon}
        </div>
      </div>
      {subtitle ? <div className="mt-2 text-[13px] text-slate-500">{subtitle}</div> : null}
    </div>
  );
}

export default function AdminDashboard() {
  const [supervisors, setSupervisors] = useState<SupervisorRow[]>([]);
  const [boardsCount, setBoardsCount] = useState(0);
  const [cardsCount, setCardsCount] = useState(0);
  const [statsLoading, setStatsLoading] = useState(true);
  const [studentCount, setStudentCount] = useState(0);
  const [supervisorActivity, setSupervisorActivity] = useState<SupervisorActivity | null>(null);
  const [taskCompletion, setTaskCompletion] = useState<TaskCompletionStats | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadDashboardStats() {
      setStatsLoading(true);
      try {
        const [sups, students, boards, activity, completion] = await Promise.all([
          apiFetch("/admin/supervisors"),
          apiFetch("/admin/users?role=student&q="),
          apiFetch("/admin/all-boards"),
          apiFetch("/admin/dashboard/supervisor-activity"),
          apiFetch("/admin/dashboard/task-completion"),
        ]);

        if (!mounted) return;
        setSupervisors(Array.isArray(sups) ? sups : []);
        setStudentCount(Array.isArray(students) ? students.length : 0);
        const boardRows = Array.isArray(boards) ? (boards as BoardRow[]) : [];
        setBoardsCount(boardRows.length);
        setCardsCount(boardRows.reduce((sum, board) => sum + (board.cards_count || 0), 0));
        setSupervisorActivity(activity || null);
        setTaskCompletion(completion || null);
      } catch (e) {
        console.error(e);
        if (!mounted) return;
        setSupervisors([]);
        setStudentCount(0);
        setBoardsCount(0);
        setCardsCount(0);
        setSupervisorActivity(null);
        setTaskCompletion(null);
      } finally {
        if (mounted) setStatsLoading(false);
      }
    }

    void loadDashboardStats();
    return () => {
      mounted = false;
    };
  }, []);

  const totalSupervisors = supervisors.length;
  const activeSupervisorPercent = supervisorActivity?.active?.percentage || 0;
  const taskCount = taskCompletion?.tasks?.count || 0;
  const subtaskCount = taskCompletion?.subtasks?.count || 0;
  const onTimeCount = taskCompletion?.on_time?.count || 0;
  const overdueCount = taskCompletion?.overdue?.count || 0;
  const onTimePercent = taskCompletion?.on_time?.percentage || 0;
  const totalTrackedItems = taskCompletion?.total || 0;

  return (
    <AdminLayout active="dashboard" title="Admin Dashboard" subtitle="Manage users and supervise the system.">
      <section className="grid grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Supervisors"
          value={statsLoading ? "..." : totalSupervisors}
          icon={
            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" aria-hidden="true">
              <path d="M16 20v-1.5A3.5 3.5 0 0 0 12.5 15h-5A3.5 3.5 0 0 0 4 18.5V20" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" />
              <circle cx="10" cy="8" r="3.5" stroke="#2563eb" strokeWidth="2" />
              <path d="M20 20v-1.5A3.5 3.5 0 0 0 17 15.1" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" />
              <path d="M15.5 4.7a3.5 3.5 0 0 1 0 6.6" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" />
            </svg>
          }
        />
        <StatCard
          label="Talents"
          value={statsLoading ? "..." : studentCount}
          icon={
            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" aria-hidden="true">
              <path d="M12 3l10 5-10 5L2 8l10-5Z" stroke="#10b981" strokeWidth="2" strokeLinejoin="round" />
              <path d="M6 10.5V16c0 1.5 3 3 6 3s6-1.5 6-3v-5.5" stroke="#10b981" strokeWidth="2" strokeLinejoin="round" />
              <path d="M22 8v6" stroke="#10b981" strokeWidth="2" strokeLinecap="round" />
            </svg>
          }
        />
        <StatCard
          label="Boards"
          value={statsLoading ? "..." : boardsCount}
          icon={
            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" aria-hidden="true">
              <rect x="4" y="5" width="16" height="14" rx="3" stroke="#2563eb" strokeWidth="2" />
              <path d="M8 9h8M8 13h8M8 17h5" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" />
            </svg>
          }
        />
        <StatCard
          label="Cards"
          value={statsLoading ? "..." : cardsCount}
          icon={
            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" aria-hidden="true">
              <rect x="6" y="5" width="12" height="14" rx="2.5" stroke="#f59e0b" strokeWidth="2" />
              <path d="M9 9h6M9 13h6" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
            </svg>
          }
        />
        <StatCard
          label="Admin"
          value="System"
          subtitle="You're managing the platform"
          icon={<span className="h-[18px] w-[18px] rounded-full border-2 border-slate-300 border-t-violet-500 animate-spin" />}
        />
      </section>

      <section className="mt-3.5 grid grid-cols-1 gap-3.5 xl:grid-cols-2">
        <div className="grid justify-start">
          <div className="relative h-[500px] w-[500px] max-w-full rounded-[22px] border border-slate-200 bg-white p-5 shadow-[0_10px_25px_rgba(15,23,42,0.06)] max-[760px]:h-auto">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-extrabold text-slate-500">Supervisor Activity</div>
                <div className="mt-1.5 text-[18px] font-black text-slate-900">This week</div>
              </div>
              <div className="grid h-11 w-11 place-items-center rounded-[14px] border border-slate-200 bg-slate-50">
                <span className="h-[18px] w-[18px] rounded-full bg-[conic-gradient(#22c55e_0deg_220deg,#f87171_220deg_360deg)]" />
              </div>
            </div>

            <div className="flex min-h-[360px] items-center justify-center max-[760px]:min-h-[280px]">
              <PieChart activePercent={statsLoading ? 0 : activeSupervisorPercent} />
            </div>

            <div className="absolute bottom-5 right-5 flex items-center gap-6 text-right">
              <div className="inline-flex items-center gap-2 text-[11px] font-bold text-slate-500">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                <span>Active</span>
              </div>
              <div className="inline-flex items-center gap-2 text-[11px] font-bold text-slate-500">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
                <span>Inactive</span>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-[0_10px_25px_rgba(15,23,42,0.06)]">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-extrabold text-slate-500">Task Completion</div>
              <div className="mt-1.5 text-[18px] font-black text-slate-900">Tasks and subtasks</div>
            </div>
            <div className="grid h-11 w-11 place-items-center rounded-[14px] border border-slate-200 bg-slate-50">
              <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" aria-hidden="true">
                <path d="M7 12.5l3 3 7-8" stroke="#22c55e" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                <rect x="4" y="4" width="16" height="16" rx="4" stroke="#94a3b8" strokeWidth="1.8" />
              </svg>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <StatCard
              label="Tasks"
              value={statsLoading ? "..." : taskCount}
              subtitle="All cards across boards"
              icon={
                <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" aria-hidden="true">
                  <rect x="6" y="5" width="12" height="14" rx="2.5" stroke="#2563eb" strokeWidth="2" />
                  <path d="M9 9h6M9 13h6" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" />
                </svg>
              }
            />
            <StatCard
              label="Subtasks"
              value={statsLoading ? "..." : subtaskCount}
              subtitle="Checklist items included"
              icon={
                <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" aria-hidden="true">
                  <path d="M7 8h10M7 12h10M7 16h10" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" />
                  <path d="M4.5 8h.01M4.5 12h.01M4.5 16h.01" stroke="#7c3aed" strokeWidth="3" strokeLinecap="round" />
                </svg>
              }
            />
            <StatCard
              label="On time"
              value={statsLoading ? "..." : onTimeCount}
              subtitle={`${statsLoading ? "..." : `${onTimePercent}%`} on track`}
              icon={<span className="h-3 w-3 rounded-full bg-emerald-500" />}
            />
            <StatCard
              label="Overdue"
              value={statsLoading ? "..." : overdueCount}
              subtitle="Open items past due date"
              icon={<span className="h-3 w-3 rounded-full bg-rose-500" />}
            />
          </div>

          <div className="mt-5 rounded-[18px] border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-3 text-[12px] font-bold text-slate-500">
              <span>Completion overview</span>
              <span>{statsLoading ? "..." : `${totalTrackedItems} tracked items`}</span>
            </div>
            <div className="mt-3 h-3 overflow-hidden rounded-full bg-white shadow-[inset_0_1px_2px_rgba(15,23,42,0.08)]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-emerald-500 to-emerald-600 transition-all duration-500"
                style={{ width: `${statsLoading ? 0 : onTimePercent}%` }}
              />
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 text-[12px] font-semibold text-slate-500">
              <span>On time items stay ahead of their due dates.</span>
              <span className="font-black text-slate-700">{statsLoading ? "..." : `${onTimeCount} / ${totalTrackedItems}`}</span>
            </div>
          </div>
        </div>
      </section>
    </AdminLayout>
  );
}
