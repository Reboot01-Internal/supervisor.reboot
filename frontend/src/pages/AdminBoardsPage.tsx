import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "../components/AdminLayout";
import Modal, { useEscClose } from "../components/Modal";
import UserAvatar from "../components/UserAvatar";
import { apiFetch } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useConfirm } from "../lib/useConfirm";
import { fetchRebootAvatars } from "../lib/rebootAvatars";
import { fetchRebootPhones } from "../lib/rebootPhones";

type BoardRow = {
  id: number;
  name: string;
  description: string;
  status?: "active" | "inactive";
  inactive_at?: string;
  supervisor_name: string;
  supervisor_user_id: number;
  supervisor_file_id: number;
  created_at: string;
  lists_count: number;
  cards_count: number;
};

type BoardMember = {
  user_id: number;
  full_name: string;
  nickname?: string;
  email: string;
  cohort?: string;
  role: string;
  role_in_board: string;
};

type ViewMode = "boards" | "lists";
type BoardStatusFilter = "all" | "active" | "inactive";

const ADMIN_BOARDS_STATE_KEY = "taskflow.adminBoards.state";

type AdminBoardsPageState = {
  search: string;
  viewMode: ViewMode;
  statusFilter: BoardStatusFilter;
  scrollY: number;
  membersBoardID: number | null;
};

function readAdminBoardsPageState(): AdminBoardsPageState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(ADMIN_BOARDS_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      search: String(parsed?.search || ""),
      viewMode: parsed?.viewMode === "lists" ? "lists" : "boards",
      statusFilter: parsed?.statusFilter === "active" || parsed?.statusFilter === "inactive" ? parsed.statusFilter : "all",
      scrollY: Number.isFinite(Number(parsed?.scrollY)) ? Number(parsed.scrollY) : 0,
      membersBoardID: Number.isFinite(Number(parsed?.membersBoardID)) && Number(parsed.membersBoardID) > 0 ? Number(parsed.membersBoardID) : null,
    };
  } catch {
    return null;
  }
}

function writeAdminBoardsPageState(state: AdminBoardsPageState) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(ADMIN_BOARDS_STATE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage failures.
  }
}

type SupervisorOption = {
  supervisor_user_id: number;
  full_name: string;
  email: string;
  nickname?: string;
  cohort?: string;
  file_id: number;
};

type AssignedStudentOption = {
  id: number;
  full_name: string;
  nickname?: string;
  email: string;
  cohort?: string;
};

type ProjectTrack = "go" | "js" | "rust";

const TRACK_OPTIONS: Array<{ value: ProjectTrack; label: string }> = [
  { value: "go", label: "Go" },
  { value: "js", label: "JS" },
  { value: "rust", label: "Rust" },
];

const PROJECTS_BY_TRACK: Record<ProjectTrack, string[]> = {
  go: ["go-reloaded", "ascii-art", "ascii-art-web", "groupie-tracker", "lem-in", "forum"],
  js: ["make-your-game", "real-time-forum", "graphql", "social-network", "mini-framework", "bomberman-dom"],
  rust: ["smart-road", "filler", "rt", "localhost", "multiplayer-fps", "0-shell"],
};

function formatDate(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function clampText(s: string, fallback: string) {
  const t = (s ?? "").trim();
  return t ? t : fallback;
}

function roleDisplay(role: string) {
  const normalized = String(role || "").trim().toLowerCase();
  if (normalized === "student") return "talent";
  if (normalized === "supervisor") return "supervisor";
  if (normalized === "admin") return "admin";
  return role || "-";
}

function boardStatus(board: { status?: string }) {
  return String(board.status || "active").trim().toLowerCase() === "inactive" ? "inactive" : "active";
}

function inactiveSinceDate(board: { inactive_at?: string; created_at: string }) {
  return board.inactive_at || board.created_at;
}

function BoardStatusIconButton({
  status,
  saving,
  onClick,
}: {
  status: "active" | "inactive";
  saving: boolean;
  onClick: () => void;
}) {
  const isActive = status === "active";
  return (
    <button
      type="button"
      className={[
        "board-action-status grid h-8 w-8 place-items-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-60",
        isActive
          ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
          : "border-slate-300 bg-slate-100 text-slate-500 hover:bg-slate-200",
        saving ? "opacity-70" : "hover:-translate-y-[1px]",
      ].join(" ")}
      title={`${isActive ? "Active" : "Inactive"} board. Click to mark ${isActive ? "inactive" : "active"}.`}
      aria-label={`${isActive ? "Active" : "Inactive"} board. Click to mark ${isActive ? "inactive" : "active"}.`}
      disabled={saving}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {isActive ? (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2" />
          <path d="M8.5 12.2 10.8 14.5 15.8 9.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2" />
          <path d="M8.5 15.5 15.5 8.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      )}
    </button>
  );
}

function initialsOf(name: string) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";
}

function loginOf(user: { nickname?: string; email: string }) {
  return String(user.nickname || user.email.split("@")[0] || "").trim().toLowerCase();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function nextProjectBoardNumber(boards: BoardRow[], supervisorName: string, projectSlug: string) {
  const pattern = new RegExp(`(?:^|-)${escapeRegExp(projectSlug)}(?:-(\\d+))?$`, "i");
  let max = 0;

  for (const board of boards) {
    if (String(board.supervisor_name || "").trim().toLowerCase() !== supervisorName.trim().toLowerCase()) continue;
    const match = String(board.name || "").trim().match(pattern);
    if (!match) continue;
    const parsed = Number(match[1] || "1");
    if (Number.isFinite(parsed)) max = Math.max(max, parsed);
  }

  return max + 1;
}

/* icons */
function SearchIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16Z"
        stroke="currentColor"
        strokeWidth="2"
        opacity="0.9"
      />
      <path
        d="M21 21l-4.35-4.35"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function BoardIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v13A2.5 2.5 0 0 1 17.5 21h-11A2.5 2.5 0 0 1 4 18.5v-13Z"
        stroke="currentColor"
        strokeWidth="2"
        opacity="0.9"
      />
      <path
        d="M8 8h8M8 12h8M8 16h5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.8"
      />
    </svg>
  );
}

function LayersIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3 2 8l10 5 10-5-10-5Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        opacity="0.9"
      />
      <path
        d="M2 12l10 5 10-5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        opacity="0.7"
      />
      <path
        d="M2 16l10 5 10-5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        opacity="0.5"
      />
    </svg>
  );
}

function CardStackIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 7.5A2.5 2.5 0 0 1 9.5 5h9A2.5 2.5 0 0 1 21 7.5v9A2.5 2.5 0 0 1 18.5 19h-9A2.5 2.5 0 0 1 7 16.5v-9Z"
        stroke="currentColor"
        strokeWidth="2"
        opacity="0.9"
      />
      <path
        d="M3 8v9A3 3 0 0 0 6 20h9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.55"
      />
    </svg>
  );
}

function UserIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 12a4.2 4.2 0 1 0-4.2-4.2A4.2 4.2 0 0 0 12 12Z"
        stroke="currentColor"
        strokeWidth="2"
        opacity="0.9"
      />
      <path
        d="M4.5 21a7.5 7.5 0 0 1 15 0"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.8"
      />
    </svg>
  );
}

function UsersIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M16 21v-1.6a3.6 3.6 0 0 0-3.6-3.6H7.2a3.6 3.6 0 0 0-3.6 3.6V21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="9.8" cy="8.8" r="3.6" stroke="currentColor" strokeWidth="2" />
      <path d="M20.2 21v-1.6a3.6 3.6 0 0 0-3.1-3.56" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M15.6 5.2a3.6 3.6 0 0 1 0 7.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function PencilIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 20h9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BinIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 6h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M19 6v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 10v6M14 10v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ArrowIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M9 18l6-6-6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.9"
      />
    </svg>
  );
}

function ReassignIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M8 7h9m0 0-3-3m3 3-3 3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16 17H7m0 0 3 3m-3-3 3-3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ViewBoardsIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="4" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="2" />
      <rect x="13" y="4" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="2" />
      <rect x="4" y="13" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="2" />
      <rect x="13" y="13" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function ViewListIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M8 7h12M8 12h12M8 17h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="4.5" cy="7" r="1.5" fill="currentColor" />
      <circle cx="4.5" cy="12" r="1.5" fill="currentColor" />
      <circle cx="4.5" cy="17" r="1.5" fill="currentColor" />
    </svg>
  );
}

function StatPill({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
}) {
  return (
    <span
      className="
        inline-flex items-center gap-3
        rounded-2xl border border-[#6d5efc]/20
        bg-white shadow-[0_12px_26px_rgba(15,23,42,0.06)]
        px-3 py-2
      "
      title={label}
    >
      <span
        className="
          grid place-items-center
          h-9 w-9 rounded-2xl
          border border-[#6d5efc]/20 bg-[#6d5efc]/10 text-[#6d5efc]
        "
      >
        {icon}
      </span>

      <span className="flex flex-col leading-[1.05]">
        <span className="text-[14px] font-black text-slate-900/90">{value}</span>
        <span className="text-[12px] font-extrabold text-slate-900/50">{label}</span>
      </span>
    </span>
  );
}

function SkeletonCard() {
  return (
    <div
      className="
        relative overflow-hidden
        rounded-[18px] border border-slate-900/10
        bg-white/95 shadow-[0_14px_34px_rgba(15,23,42,0.07)]
        p-4
      "
    >
      <div className="space-y-3">
        <div className="h-3 w-3/5 rounded-full bg-slate-900/10 relative overflow-hidden">
          <div className="absolute inset-0 -translate-x-[60%] animate-[shimmer_1.2s_infinite] bg-gradient-to-r from-transparent via-white/70 to-transparent" />
        </div>
        <div className="h-3 w-2/5 rounded-full bg-slate-900/10 relative overflow-hidden">
          <div className="absolute inset-0 -translate-x-[60%] animate-[shimmer_1.2s_infinite] bg-gradient-to-r from-transparent via-white/70 to-transparent" />
        </div>

        <div className="h-3 w-[85%] rounded-full bg-slate-900/10 relative overflow-hidden mt-3">
          <div className="absolute inset-0 -translate-x-[60%] animate-[shimmer_1.2s_infinite] bg-gradient-to-r from-transparent via-white/70 to-transparent" />
        </div>
        <div className="h-3 w-[70%] rounded-full bg-slate-900/10 relative overflow-hidden">
          <div className="absolute inset-0 -translate-x-[60%] animate-[shimmer_1.2s_infinite] bg-gradient-to-r from-transparent via-white/70 to-transparent" />
        </div>

        <div className="mt-4 flex gap-3">
          <div className="h-[30px] w-[92px] rounded-full bg-slate-900/10 relative overflow-hidden">
            <div className="absolute inset-0 -translate-x-[60%] animate-[shimmer_1.2s_infinite] bg-gradient-to-r from-transparent via-white/70 to-transparent" />
          </div>
          <div className="h-[30px] w-[92px] rounded-full bg-slate-900/10 relative overflow-hidden">
            <div className="absolute inset-0 -translate-x-[60%] animate-[shimmer_1.2s_infinite] bg-gradient-to-r from-transparent via-white/70 to-transparent" />
          </div>
        </div>
      </div>

      {/* keyframes for shimmer (Tailwind arbitrary) */}
      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-60%); }
          100% { transform: translateX(160%); }
        }
      `}</style>
    </div>
  );
}

export default function AdminBoardsPage() {
  const nav = useNavigate();
  const initialPageState = useRef<AdminBoardsPageState | null>(readAdminBoardsPageState());
  const hasRestoredScroll = useRef(false);
  const hasRestoredMembersPopup = useRef(false);
  const [boards, setBoards] = useState<BoardRow[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>(initialPageState.current?.viewMode || "boards");
  const [statusFilter, setStatusFilter] = useState<BoardStatusFilter>(initialPageState.current?.statusFilter || "all");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(initialPageState.current?.search || "");
  const [err, setErr] = useState("");
  const [membersOpen, setMembersOpen] = useState(false);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersErr, setMembersErr] = useState("");
  const [members, setMembers] = useState<BoardMember[]>([]);
  const [membersByBoard, setMembersByBoard] = useState<Record<number, BoardMember[]>>({});
  const [avatarByLogin, setAvatarByLogin] = useState<Record<string, string>>({});
  const [phoneByLogin, setPhoneByLogin] = useState<Record<string, string>>({});
  const [membersBoard, setMembersBoard] = useState<BoardRow | null>(null);
  const [deletingBoardID, setDeletingBoardID] = useState<number | null>(null);
  const [statusUpdatingBoardID, setStatusUpdatingBoardID] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [creatingBoard, setCreatingBoard] = useState(false);
  const [createBoardErr, setCreateBoardErr] = useState("");
  const [supervisorOptions, setSupervisorOptions] = useState<SupervisorOption[]>([]);
  const [supervisorsLoading, setSupervisorsLoading] = useState(false);
  const [assignedStudents, setAssignedStudents] = useState<AssignedStudentOption[]>([]);
  const [assignedStudentsLoading, setAssignedStudentsLoading] = useState(false);
  const [boardName, setBoardName] = useState("");
  const [boardDescription, setBoardDescription] = useState("");
  const [selectedSupervisorID, setSelectedSupervisorID] = useState(0);
  const [selectedTrack, setSelectedTrack] = useState<ProjectTrack | "">("");
  const [selectedProject, setSelectedProject] = useState("");
  const [selectedMemberIDs, setSelectedMemberIDs] = useState<Set<number>>(new Set());
  const [reassignBoard, setReassignBoard] = useState<BoardRow | null>(null);
  const [nextSupervisorID, setNextSupervisorID] = useState(0);
  const [reassigning, setReassigning] = useState(false);
  const [previewAvatar, setPreviewAvatar] = useState<{ src: string; name: string } | null>(null);

  const { email: authEmail, isAdmin, isSupervisor, login: authLogin } = useAuth();

  useEffect(() => {
    let alive = true;

    async function loadAvatars() {
      const logins = Array.from(
        new Set(
          [...members, ...assignedStudents, ...Object.values(membersByBoard).flat()]
            .map((user) => loginOf(user))
            .filter(Boolean)
        )
      );
      if (logins.length === 0) {
        setAvatarByLogin({});
        return;
      }
      try {
        const next = await fetchRebootAvatars(logins);
        if (!alive) return;
        setAvatarByLogin(next);
      } catch {
        if (!alive) return;
        setAvatarByLogin({});
      }
    }

    async function loadPhones() {
      const logins = members.map((member) => loginOf(member)).filter(Boolean);
      if (logins.length === 0) {
        setPhoneByLogin({});
        return;
      }
      try {
        const next = await fetchRebootPhones(logins);
        if (!alive) return;
        setPhoneByLogin(next);
      } catch {
        if (!alive) return;
        setPhoneByLogin({});
      }
    }

    void loadAvatars();
    void loadPhones();
    return () => {
      alive = false;
    };
  }, [assignedStudents, members, membersByBoard]);

  useEffect(() => {
    let alive = true;

    async function loadBoardMembersPreview() {
      if (boards.length === 0) {
        setMembersByBoard({});
        return;
      }

      const results = await Promise.allSettled(
        boards.map(async (board) => {
          const res = await apiFetch(`/admin/board-members?board_id=${board.id}`);
          return [board.id, Array.isArray(res) ? (res as BoardMember[]) : []] as const;
        })
      );

      if (!alive) return;

      const next: Record<number, BoardMember[]> = {};
      for (const result of results) {
        if (result.status !== "fulfilled") continue;
        const [boardId, rows] = result.value;
        next[boardId] = rows;
      }
      setMembersByBoard(next);
    }

    void loadBoardMembersPreview();
    return () => {
      alive = false;
    };
  }, [boards]);

  useEffect(() => {
    if ((!createOpen && !reassignBoard) || (!isAdmin && !isSupervisor)) return;
    let alive = true;

    async function loadSupervisors() {
      setSupervisorsLoading(true);
      if (createOpen) setCreateBoardErr("");
      try {
        const res = await apiFetch("/admin/supervisors");
        if (!alive) return;
        setSupervisorOptions(Array.isArray(res) ? (res as SupervisorOption[]) : []);
      } catch (e: any) {
        if (!alive) return;
        setSupervisorOptions([]);
        const message = e?.message || "Failed to load supervisors";
        if (createOpen) setCreateBoardErr(message);
        else setErr(message);
      } finally {
        if (alive) setSupervisorsLoading(false);
      }
    }

    void loadSupervisors();
    return () => {
      alive = false;
    };
  }, [createOpen, isAdmin, isSupervisor, reassignBoard]);

  useEffect(() => {
    if (!createOpen || !isSupervisor || selectedSupervisorID) return;
    const email = String(authEmail || "").trim().toLowerCase();
    const login = String(authLogin || "").trim().toLowerCase().replace(/^@/, "");
    const currentSupervisor = supervisorOptions.find((supervisor) => {
      const supervisorEmail = String(supervisor.email || "").trim().toLowerCase();
      const supervisorLogin = String(supervisor.nickname || "").trim().toLowerCase().replace(/^@/, "");
      return (email && supervisorEmail === email) || (login && supervisorLogin === login);
    });
    if (currentSupervisor) {
      setSelectedSupervisorID(currentSupervisor.supervisor_user_id);
    }
  }, [authEmail, authLogin, createOpen, isSupervisor, selectedSupervisorID, supervisorOptions]);

  useEffect(() => {
    if (!createOpen || !selectedSupervisorID) {
      setAssignedStudents([]);
      setSelectedMemberIDs(new Set());
      return;
    }
    let alive = true;

    async function loadAssignedStudents() {
      setAssignedStudentsLoading(true);
      setCreateBoardErr("");
      try {
        const res = await apiFetch(`/admin/assign/list?supervisor_id=${selectedSupervisorID}`);
        if (!alive) return;
        setAssignedStudents(Array.isArray(res) ? (res as AssignedStudentOption[]) : []);
        setSelectedMemberIDs(new Set());
      } catch (e: any) {
        if (!alive) return;
        setAssignedStudents([]);
        setCreateBoardErr(e?.message || "Failed to load supervisor students");
      } finally {
        if (alive) setAssignedStudentsLoading(false);
      }
    }

    void loadAssignedStudents();
    return () => {
      alive = false;
    };
  }, [createOpen, selectedSupervisorID]);
  const { confirm, dialog: confirmDialog } = useConfirm();
  const canManageMembers = isAdmin || isSupervisor;
  const canDeleteBoards = isAdmin || isSupervisor;
  const closeMembersModal = useCallback(() => {
    setMembersOpen(false);
    writeAdminBoardsPageState({
      search,
      viewMode,
      statusFilter,
      scrollY: typeof window !== "undefined" ? window.scrollY : 0,
      membersBoardID: null,
    });
  }, [search, statusFilter, viewMode]);
  useEscClose(membersOpen && !previewAvatar, closeMembersModal);
  const closeReassignModal = useCallback(() => {
    setReassignBoard(null);
    setNextSupervisorID(0);
    setReassigning(false);
  }, []);
  useEscClose(!!reassignBoard, closeReassignModal);
  useEscClose(!!previewAvatar, () => setPreviewAvatar(null));
  const closeCreateModal = useCallback(() => {
    setCreateOpen(false);
    setCreatingBoard(false);
    setCreateBoardErr("");
    setBoardName("");
    setBoardDescription("");
    setSelectedSupervisorID(0);
    setSelectedTrack("");
    setSelectedProject("");
    setAssignedStudents([]);
    setSelectedMemberIDs(new Set());
  }, []);

  const selectedSupervisor = useMemo(
    () => supervisorOptions.find((supervisor) => supervisor.supervisor_user_id === selectedSupervisorID) || null,
    [selectedSupervisorID, supervisorOptions]
  );
  useEffect(() => {
    if (!selectedTrack) {
      setSelectedProject("");
    }
  }, [selectedTrack]);

  useEffect(() => {
    const nickname = String(selectedSupervisor?.nickname || "").trim().replace(/^@/, "");
    if (!nickname) return;

    setBoardName((prev) => {
      const current = String(prev || "").trim();
      if (selectedProject) {
        const nextNumber = nextProjectBoardNumber(boards, selectedSupervisor?.full_name || "", selectedProject);
        return `${nickname}-${selectedProject}-${nextNumber}`;
      }
      if (!current) return `${nickname}-`;
      return current;
    });
  }, [boards, selectedProject, selectedSupervisor]);
  async function load() {
    setLoading(true);
    setErr("");
    try {
      const res = await apiFetch("/admin/all-boards");
      setBoards(Array.isArray(res) ? res : []);
      if (!Array.isArray(res)) console.error("Unexpected response:", res);
    } catch (e: any) {
      console.error(e);
      setBoards([]);
      setErr(e?.message || "Failed to load boards");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    writeAdminBoardsPageState({
      search,
      viewMode,
      statusFilter,
      scrollY: typeof window !== "undefined" ? window.scrollY : 0,
      membersBoardID: membersOpen
        ? membersBoard?.id || null
        : hasRestoredMembersPopup.current
          ? null
          : initialPageState.current?.membersBoardID || null,
    });
  }, [membersBoard, membersOpen, search, statusFilter, viewMode]);

  useEffect(() => {
    function handleScroll() {
      writeAdminBoardsPageState({
        search,
        viewMode,
        statusFilter,
        scrollY: window.scrollY,
        membersBoardID: membersOpen
          ? membersBoard?.id || null
          : hasRestoredMembersPopup.current
            ? null
            : initialPageState.current?.membersBoardID || null,
      });
    }

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [membersBoard, membersOpen, search, statusFilter, viewMode]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return boards
      .filter((b) => statusFilter === "all" || boardStatus(b) === statusFilter)
      .filter((b) => {
        if (!q) return true;
        const name = (b.name ?? "").toLowerCase();
        const sup = (b.supervisor_name ?? "").toLowerCase();
        const desc = (b.description ?? "").toLowerCase();
        const memberCohorts = (membersByBoard[b.id] || [])
          .filter((member) => String(member.role || "").trim().toLowerCase() === "student")
          .map((member) => String(member.cohort || "").trim().toLowerCase())
          .filter(Boolean);
        const matchesCohort = memberCohorts.some((cohort) => {
          const cohortLabel = `cohort ${cohort}`;
          return cohort.includes(q) || cohortLabel.includes(q);
        });
        return name.includes(q) || sup.includes(q) || desc.includes(q) || matchesCohort;
      })
      .sort((a, b) => {
        const statusDelta = (boardStatus(a) === "inactive" ? 1 : 0) - (boardStatus(b) === "inactive" ? 1 : 0);
        if (statusDelta !== 0) return statusDelta;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [boards, membersByBoard, search, statusFilter]);

  useEffect(() => {
    if (loading || hasRestoredScroll.current === true) return;
    const nextScrollY = Math.max(0, Number(initialPageState.current?.scrollY || 0));
    hasRestoredScroll.current = true;
    if (nextScrollY > 0) {
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: nextScrollY, behavior: "auto" });
      });
    }
  }, [filtered.length, loading]);

  useEffect(() => {
    if (loading || hasRestoredMembersPopup.current === true) return;
    const boardID = Number(initialPageState.current?.membersBoardID || 0);
    if (!boardID) {
      hasRestoredMembersPopup.current = true;
      return;
    }
    const board = boards.find((item) => item.id === boardID);
    if (!board) {
      hasRestoredMembersPopup.current = true;
      return;
    }
    hasRestoredMembersPopup.current = true;
    void openMembers(board);
  }, [boards, loading]);

  const totals = useMemo(() => {
    const totalBoards = filtered.length;
    const totalLists = filtered.reduce((acc, b) => acc + (b.lists_count || 0), 0);
    const totalCards = filtered.reduce((acc, b) => acc + (b.cards_count || 0), 0);
    return { totalBoards, totalLists, totalCards };
  }, [filtered]);

  const availableProjects = useMemo(
    () => (selectedTrack ? PROJECTS_BY_TRACK[selectedTrack] : []),
    [selectedTrack]
  );

  function openBoard(boardID: number) {
    writeAdminBoardsPageState({
      search,
      viewMode,
      statusFilter,
      scrollY: typeof window !== "undefined" ? window.scrollY : 0,
      membersBoardID: membersOpen ? membersBoard?.id || null : null,
    });
    nav(`/admin/boards/${boardID}?from=boards`);
  }

  function renderMemberPreview(board: BoardRow, options?: { compact?: boolean }) {
    const compact = options?.compact ?? false;
    const boardMembers = membersByBoard[board.id] || [];
    const previewMembers = boardMembers.slice(0, compact ? 2 : 4);
    const remaining = boardMembers.length - previewMembers.length;

    if (boardMembers.length === 0) {
      return (
        <button
          type="button"
          className={[
            "board-action-members inline-flex items-center rounded-full border transition",
            compact
              ? "h-8 w-[90px] justify-center gap-1.5 border-emerald-200 bg-emerald-50 px-2 text-emerald-700 hover:bg-emerald-100"
              : "h-8 w-8 justify-center border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
          ].join(" ")}
          title="Board members"
          aria-label="Board members"
          onClick={(e) => {
            e.stopPropagation();
            openMembers(board);
          }}
        >
          <UsersIcon size={compact ? 13 : 14} />
        </button>
      );
    }

    return (
      <button
        type="button"
        className={[
          "board-action-members inline-flex items-center rounded-full border transition",
          compact
            ? "h-8 w-[90px] justify-start gap-1.5 border-emerald-200 bg-emerald-50 px-2 text-emerald-700 hover:bg-emerald-100"
            : "h-8 border-emerald-200 bg-emerald-50 px-1.5 text-emerald-700 hover:bg-emerald-100",
        ].join(" ")}
        title={`Board members (${boardMembers.length})`}
        aria-label={`Board members (${boardMembers.length})`}
        onClick={(e) => {
          e.stopPropagation();
          openMembers(board);
        }}
      >
        <span className="flex items-center">
          {previewMembers.map((member, index) => {
            const avatarUrl = avatarByLogin[loginOf(member)] || "";
            return (
              <span
                key={member.user_id}
                className={index === 0 ? "" : compact ? "-ml-1.5" : "-ml-2"}
              >
                <UserAvatar
                  src={avatarUrl}
                  alt={member.full_name}
                  fallback={initialsOf(member.full_name)}
                  sizeClass={compact ? "h-6 w-6" : "h-7 w-7"}
                  textClass={compact ? "text-[9px]" : "text-[10px]"}
                  className="border-white bg-white shadow-[0_4px_10px_rgba(15,23,42,0.12)]"
                />
              </span>
            );
          })}
          {remaining > 0 ? (
            <span
              className={[
                "grid place-items-center rounded-full border border-white bg-emerald-600 font-black text-white shadow-[0_4px_10px_rgba(16,185,129,0.22)]",
                compact ? "ml-1 h-6 min-w-6 px-1 text-[9px]" : "ml-0.5 h-7 min-w-7 px-1.5 text-[10px]",
              ].join(" ")}
            >
              +{remaining}
            </span>
          ) : null}
          {compact && remaining <= 0 && previewMembers.length < 2 ? (
            <span className="ml-1 h-6 w-6 rounded-full opacity-0" aria-hidden="true" />
          ) : null}
        </span>
      </button>
    );
  }

  async function openMembers(board: BoardRow) {
    setMembersBoard(board);
    setMembersOpen(true);
    setMembersErr("");
    setMembersLoading(true);
    writeAdminBoardsPageState({
      search,
      viewMode,
      statusFilter,
      scrollY: typeof window !== "undefined" ? window.scrollY : 0,
      membersBoardID: board.id,
    });
    try {
      const res = await apiFetch(`/admin/board-members?board_id=${board.id}`);
      setMembers(Array.isArray(res) ? res : []);
    } catch (e: any) {
      setMembersErr(e?.message || "Failed to load members");
      setMembers([]);
    } finally {
      setMembersLoading(false);
    }
  }

  function openMemberProfile(member: BoardMember) {
    const memberEmail = String(member.email || "").trim().toLowerCase();
    const memberLogin = String(member.nickname || "").trim().toLowerCase().replace(/^@/, "");
    const currentEmail = String(authEmail || "").trim().toLowerCase();
    const currentLogin = String(authLogin || "").trim().toLowerCase().replace(/^@/, "");
    const isSelf =
      (currentEmail && memberEmail === currentEmail) ||
      (currentLogin && memberLogin === currentLogin);

    writeAdminBoardsPageState({
      search,
      viewMode,
      statusFilter,
      scrollY: typeof window !== "undefined" ? window.scrollY : 0,
      membersBoardID: membersBoard?.id || null,
    });
    if (isSelf) {
      nav("/profile", {
        state: { backTo: "/admin/boards", preserveBoardsState: true },
      });
      return;
    }
    if (isAdmin) {
      nav(`/admin/users/${member.user_id}/profile`, {
        state: { backTo: "/admin/boards", preserveBoardsState: true },
      });
      return;
    }
    nav(`/profile/${member.user_id}`, {
      state: { backTo: "/admin/boards", preserveBoardsState: true },
    });
  }

  async function deleteBoard(board: BoardRow) {
    if (deletingBoardID === board.id) return;

    const ok = await confirm({
      title: "Delete board",
      message: `Delete "${board.name}"? This will also delete its Discord channel and cannot be undone.`,
    });
    if (!ok) return;

    setDeletingBoardID(board.id);
    setErr("");
    try {
      await apiFetch("/admin/boards/delete", {
        method: "POST",
        body: JSON.stringify({ board_id: board.id }),
      });
      setBoards((prev) => prev.filter((item) => item.id !== board.id));
      if (membersBoard?.id === board.id) {
        setMembersOpen(false);
        setMembersBoard(null);
        setMembers([]);
      }
    } catch (e: any) {
      setErr(e?.message || "Failed to delete board");
    } finally {
      setDeletingBoardID(null);
    }
  }

  async function toggleBoardStatus(board: BoardRow) {
    if (statusUpdatingBoardID === board.id) return;
    const current = boardStatus(board);
    const next = current === "active" ? "inactive" : "active";
    const optimisticInactiveAt = next === "inactive" ? new Date().toISOString() : "";
    setStatusUpdatingBoardID(board.id);
    setErr("");
    setBoards((prev) => prev.map((item) => (item.id === board.id ? { ...item, status: next, inactive_at: optimisticInactiveAt } : item)));
    try {
      const res = await apiFetch("/admin/boards/status", {
        method: "POST",
        body: JSON.stringify({ board_id: board.id, status: next }),
      });
      const inactiveAt = String(res?.inactive_at || optimisticInactiveAt);
      setBoards((prev) => prev.map((item) => (item.id === board.id ? { ...item, status: next, inactive_at: inactiveAt } : item)));
      if (membersBoard?.id === board.id) {
        setMembersBoard((prev) => (prev ? { ...prev, status: next, inactive_at: inactiveAt } : prev));
      }
    } catch (e: any) {
      setBoards((prev) => prev.map((item) => (item.id === board.id ? { ...item, status: current, inactive_at: board.inactive_at } : item)));
      setErr(e?.message || "Failed to update board status");
    } finally {
      setStatusUpdatingBoardID(null);
    }
  }

  const eligibleSupervisors = useMemo(() => {
    if (!reassignBoard) return [];
    return supervisorOptions.filter((supervisor) => supervisor.file_id !== reassignBoard.supervisor_file_id);
  }, [reassignBoard, supervisorOptions]);

  useEffect(() => {
    if (!reassignBoard || nextSupervisorID || eligibleSupervisors.length === 0) return;
    setNextSupervisorID(eligibleSupervisors[0].supervisor_user_id);
  }, [eligibleSupervisors, nextSupervisorID, reassignBoard]);

  function openReassign(board: BoardRow) {
    const firstEligible = supervisorOptions.find((supervisor) => supervisor.file_id !== board.supervisor_file_id);
    setErr("");
    setReassignBoard(board);
    setNextSupervisorID(firstEligible?.supervisor_user_id || 0);
  }

  async function submitReassign() {
    if (!reassignBoard || !nextSupervisorID || reassigning) return;

    setReassigning(true);
    setErr("");
    try {
      await apiFetch("/admin/boards/reassign", {
        method: "POST",
        body: JSON.stringify({
          board_id: reassignBoard.id,
          supervisor_user_id: nextSupervisorID,
        }),
      });
      closeReassignModal();
      await load();
    } catch (e: any) {
      setErr(e?.message || "Failed to reassign board ownership");
      setReassigning(false);
    }
  }

  function toggleSelectedMember(userID: number) {
    setSelectedMemberIDs((prev) => {
      const next = new Set(prev);
      if (next.has(userID)) next.delete(userID);
      else next.add(userID);
      return next;
    });
  }

  async function createBoard() {
    if (!selectedSupervisor || !boardName.trim() || creatingBoard) return;

    setCreatingBoard(true);
    setCreateBoardErr("");
    try {
      const created = await apiFetch("/admin/boards", {
        method: "POST",
        body: JSON.stringify({
          supervisor_file_id: selectedSupervisor.file_id,
          name: boardName.trim(),
          description: boardDescription.trim(),
        }),
      });

      const boardID = Number(created?.id || 0);
      if (!Number.isFinite(boardID) || boardID <= 0) {
        throw new Error("Board created but no board id was returned.");
      }

      if (selectedMemberIDs.size > 0) {
        await Promise.all(
          Array.from(selectedMemberIDs).map((userID) =>
            apiFetch("/admin/board-members", {
              method: "POST",
              body: JSON.stringify({ board_id: boardID, user_id: userID, role_in_board: "member" }),
            })
          )
        );
      }

      await load();
      closeCreateModal();
    } catch (e: any) {
      setCreateBoardErr(e?.message || "Failed to create board");
    } finally {
      setCreatingBoard(false);
    }
  }

  return (
    <>
    {confirmDialog}
    {reassignBoard ? (
      <div
        className="fixed inset-0 z-[80] grid place-items-center bg-slate-900/40 p-4"
        onClick={closeReassignModal}
      >
        <div
          className="workspace-reassign-popup w-full max-w-[560px] rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_22px_60px_rgba(15,23,42,0.28)]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[18px] font-black text-slate-900">Reassign Board Ownership</div>
              <div className="mt-1 text-[13px] font-semibold text-slate-500">
                Move <span className="font-black text-slate-900">{reassignBoard.name}</span> to another supervisor workspace.
              </div>
            </div>
            <button
              className="h-9 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-extrabold text-slate-700 hover:bg-slate-100"
              onClick={closeReassignModal}
              disabled={reassigning}
            >
              Close
            </button>
          </div>

          <div className="mt-4 grid gap-2">
            <label className="grid gap-2">
              <span className="text-[12px] font-extrabold text-slate-500">New owner</span>
              <select
                className="workspace-reassign-field h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 text-slate-900 outline-none transition focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-200/50"
                value={nextSupervisorID}
                onChange={(e) => setNextSupervisorID(Number(e.target.value))}
                disabled={reassigning || supervisorsLoading || eligibleSupervisors.length === 0}
              >
                <option value={0}>
                  {supervisorsLoading
                    ? "Loading supervisors..."
                    : eligibleSupervisors.length === 0
                      ? "No other supervisors available"
                      : "Select a supervisor"}
                </option>
                {eligibleSupervisors.map((supervisor) => (
                  <option key={supervisor.supervisor_user_id} value={supervisor.supervisor_user_id}>
                    {supervisor.full_name} {supervisor.nickname ? `(@${supervisor.nickname})` : ""}
                  </option>
                ))}
              </select>
            </label>

            {eligibleSupervisors.length > 0 ? (
              <div className="workspace-warning rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] font-semibold text-amber-800">
                The current owner will be removed from this board, and Discord access will sync to the new owner.
              </div>
            ) : (
              <div className="workspace-note rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] font-semibold text-slate-600">
                Add another supervisor first, then you can transfer this board.
              </div>
            )}
          </div>

          <div className="mt-4 flex items-center gap-2">
            <button
              className="h-11 rounded-xl bg-gradient-to-br from-violet-600 to-violet-400 px-4 text-sm font-black text-white shadow-[0_18px_45px_rgba(15,23,42,0.08)] disabled:cursor-not-allowed disabled:opacity-70"
              onClick={submitReassign}
              disabled={reassigning || !nextSupervisorID}
            >
              {reassigning ? "Moving..." : "Move board"}
            </button>
            <button
              className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-900 hover:bg-slate-50"
              onClick={closeReassignModal}
              disabled={reassigning}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    ) : null}
    <AdminLayout
      active="boards"
      title="Boards"
      subtitle={isSupervisor ? "Your boards and members" : "All boards across supervisors"}
      right={
        isAdmin || isSupervisor ? (
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex h-10 items-center gap-2 rounded-2xl border border-[#6d5efc]/18 bg-white/90 px-3.5 text-[13px] font-black text-[#6d5efc] shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition hover:border-[#6d5efc]/28 hover:bg-[#f7f5ff]"
          >
            <BoardIcon size={16} />
            Create board
          </button>
        ) : null
      }
    >
      <div className="boards-page w-full">
        {/* Toolbar */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="boards-search flex h-14 min-w-[300px] flex-[1_1_420px] items-center gap-3 rounded-2xl border border-slate-200/90 bg-white/90 px-4 shadow-[0_10px_24px_rgba(15,23,42,0.05)] backdrop-blur focus-within:border-[#6d5efc]/24 focus-within:ring-4 focus-within:ring-[#6d5efc]/10 max-[520px]:min-w-0">
              <span className="text-slate-400" aria-hidden="true">
                <SearchIcon />
              </span>

              <input
                className="flex-1 bg-transparent text-[14px] font-bold text-slate-900 outline-none placeholder:font-semibold placeholder:text-slate-400"
                placeholder="Search boards, supervisors, cohorts, or descriptions..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />

              {search.trim() && (
                <button
                  className="inline-flex h-8 items-center rounded-full border border-slate-200 bg-slate-50 px-3 text-[11px] font-black text-slate-500 transition hover:border-slate-300 hover:bg-white hover:text-slate-700"
                  type="button"
                  onClick={() => setSearch("")}
                >
                  Clear
                </button>
              )}
            </div>

          <div className="flex min-w-0 flex-none items-center gap-2 max-[520px]:w-full max-[520px]:flex-col max-[520px]:items-stretch">
              <label className="inline-flex h-12 min-w-0 items-center gap-2 rounded-2xl border border-slate-200 bg-white/90 px-3 shadow-[0_10px_24px_rgba(15,23,42,0.05)] max-[520px]:w-full">
                <span className="text-[11px] font-black uppercase tracking-[0.08em] text-slate-400">Status</span>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as BoardStatusFilter)}
                  className="h-9 min-w-[96px] rounded-xl border border-slate-200 bg-slate-50 px-2 text-[13px] font-black capitalize text-slate-700 outline-none focus:border-emerald-300 max-[520px]:flex-1"
                >
                  <option value="all">All</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </label>
              <div className="inline-flex min-w-0 items-center gap-1 rounded-2xl border border-slate-200 bg-white/90 p-1 shadow-[0_10px_24px_rgba(15,23,42,0.05)] max-[520px]:w-full">
                <button
                  className={[
                    "inline-flex h-10 items-center justify-center gap-2 rounded-[14px] px-3.5 text-[13px] font-black transition max-[520px]:flex-1",
                    viewMode === "boards"
                      ? "border border-[#6d5efc]/18 bg-white text-[#6d5efc] shadow-[0_8px_18px_rgba(15,23,42,0.05)]"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                  ].join(" ")}
                  type="button"
                  onClick={() => setViewMode("boards")}
                >
                  <ViewBoardsIcon />
                  Boards
                </button>
                <button
                  className={[
                    "inline-flex h-10 items-center justify-center gap-2 rounded-[14px] px-3.5 text-[13px] font-black transition max-[520px]:flex-1",
                    viewMode === "lists"
                      ? "border border-[#6d5efc]/18 bg-white text-[#6d5efc] shadow-[0_8px_18px_rgba(15,23,42,0.05)]"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                  ].join(" ")}
                  type="button"
                  onClick={() => setViewMode("lists")}
                >
                  <ViewListIcon />
                  Lists
                </button>
              </div>
            </div>

          <div className="ml-auto flex min-w-0 flex-none flex-wrap justify-end gap-2.5 max-[1180px]:ml-0 max-[1180px]:justify-start">
            <StatPill icon={<BoardIcon />} label="Boards" value={totals.totalBoards} />
            <StatPill icon={<LayersIcon />} label="Lists" value={totals.totalLists} />
            <StatPill icon={<CardStackIcon />} label="Cards" value={totals.totalCards} />
          </div>
        </div>

        {err && (
          <div
            className="
              mb-3 rounded-2xl border
              border-red-500/25 bg-red-500/5
              px-3 py-2 text-[13px]
            "
          >
            {err}
          </div>
        )}

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-3 gap-3 max-[1200px]:grid-cols-2 max-[780px]:grid-cols-1">
            {Array.from({ length: 8 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div
            className="
              grid gap-2
              rounded-[18px] border border-dashed border-slate-900/16
              bg-white/75 px-5 py-5
            "
          >
            <div
              className="
                grid place-items-center
                h-11 w-11 rounded-2xl
                border border-slate-900/10 bg-slate-900/3 text-slate-900/70
              "
            >
              <BoardIcon size={22} />
            </div>
            <div className="text-[16px] font-black text-slate-900/90">No boards found</div>
            <div className="text-[13px] font-extrabold text-slate-900/58">
              Try searching by <b>board name</b>, <b>supervisor</b>, or <b>cohort</b>.
            </div>
          </div>
        ) : viewMode === "boards" ? (
          <div className="grid grid-cols-3 gap-3 max-[1200px]:grid-cols-2 max-[780px]:grid-cols-1">
            {filtered.map((b) => {
              const desc = clampText(b.description, "No description provided.");
              const sup = clampText(b.supervisor_name, "Unknown supervisor");
              const status = boardStatus(b);

              return (
                <div
                  key={b.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openBoard(b.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openBoard(b.id);
                    }
                  }}
                  className="
                    group relative cursor-pointer
                    rounded-[18px] border border-slate-900/10
                    bg-white/95 shadow-[0_14px_34px_rgba(15,23,42,0.07)]
                    p-4 pt-5
                    transition
                    hover:-translate-y-[2px]
                    hover:border-[#6d5efc]/25
                    hover:shadow-[0_20px_44px_rgba(15,23,42,0.10)]
                    focus-visible:outline-none
                    focus-visible:ring-4 focus-visible:ring-[#6d5efc]/15
                  "
                >
                  {/* Top */}
                  <div className="flex flex-col gap-2.5">
                    <div className="flex items-start justify-between gap-2.5 min-w-0">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span
                          className="
                            grid place-items-center
                            h-10 w-10 rounded-2xl
                            border border-[#6d5efc]/20 bg-[#6d5efc]/10 text-[#6d5efc]
                            flex-none
                          "
                          aria-hidden="true"
                        >
                          <BoardIcon />
                        </span>

                        <div className="min-w-0">
                          <div
                            className="truncate text-[16px] font-black text-slate-900/92"
                            title={b.name}
                          >
                            {b.name}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-none items-center gap-2">
                        {canManageMembers ? (
                          <BoardStatusIconButton
                            status={status}
                            saving={statusUpdatingBoardID === b.id}
                            onClick={() => void toggleBoardStatus(b)}
                          />
                        ) : null}
                        {isAdmin ? (
                          <button
                            type="button"
                            className="board-action-reassign h-8 w-8 grid place-items-center rounded-full border border-amber-200 bg-amber-50 text-amber-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                            title="Reassign board"
                            aria-label="Reassign board"
                            disabled={reassigning && reassignBoard?.id === b.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              openReassign(b);
                            }}
                          >
                            <ReassignIcon size={14} />
                          </button>
                        ) : null}
                        {canDeleteBoards ? (
                          <button
                            type="button"
                            className="board-action-delete h-8 w-8 grid place-items-center rounded-full border border-red-200 bg-red-50 text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                            title={deletingBoardID === b.id ? "Deleting..." : "Delete board"}
                            aria-label={deletingBoardID === b.id ? "Deleting board" : "Delete board"}
                            disabled={deletingBoardID === b.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteBoard(b);
                            }}
                          >
                            <BinIcon size={14} />
                          </button>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <span
                        className="
                          inline-flex items-center gap-2
                          h-[30px] px-3 rounded-full
                          border border-[#6d5efc]/20 bg-[#6d5efc]/10
                          text-[12px] font-black text-slate-900/65
                        "
                        title="Supervisor"
                      >
                        <UserIcon />
                        {sup}
                      </span>
                      <span
                        className="
                          inline-flex items-center
                          h-[30px] px-3 rounded-full
                          border border-slate-200 bg-slate-50
                          text-[12px] font-black text-slate-900/65
                        "
                        title="Created"
                      >
                        {formatDate(b.created_at)}
                      </span>
                      {status === "inactive" ? (
                        <span
                          className="
                            inline-flex items-center
                            h-[30px] px-3 rounded-full
                            border border-slate-200 bg-slate-100
                            text-[12px] font-black text-slate-600
                          "
                          title="Inactive since"
                        >
                          Inactive since {formatDate(inactiveSinceDate(b))}
                        </span>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {renderMemberPreview(b)}
                    </div>
                  </div>

                  {/* Desc */}
                  <div
                    className="
                      mt-3 text-[13px] font-extrabold text-slate-900/60 leading-[1.45]
                      overflow-hidden
                    "
                    style={{
                      display: "-webkit-box",
                      WebkitLineClamp: 3 as any,
                      WebkitBoxOrient: "vertical" as any,
                      minHeight: 56,
                    }}
                  >
                    {desc}
                  </div>

                  {/* Bottom */}
                  <div className="mt-4 flex items-end justify-between gap-3">
                    <div className="flex flex-wrap gap-2">
                      <span
                        className="
                          inline-flex items-center gap-2
                          h-[30px] px-3 rounded-full
                          border border-slate-200 bg-slate-50
                          text-[12px] font-extrabold text-slate-900/70
                        "
                      >
                        <LayersIcon />
                        <b className="font-black text-slate-900/92">{b.lists_count}</b> Lists
                      </span>

                      <span
                        className="
                          inline-flex items-center gap-2
                          h-[30px] px-3 rounded-full
                          border border-slate-200 bg-slate-50
                          text-[12px] font-extrabold text-slate-900/70
                        "
                      >
                        <CardStackIcon />
                        <b className="font-black text-slate-900/92">{b.cards_count}</b> Cards
                      </span>
                    </div>

                    <span
                      className="
                        inline-flex items-center gap-2
                        text-[12px] font-black text-slate-900/62
                        transition
                        group-hover:translate-x-[2px]
                        group-hover:text-[#6d5efc]
                      "
                    >
                      Open board <ArrowIcon />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="overflow-hidden rounded-[18px] border border-slate-900/10 bg-white/95 shadow-[0_14px_34px_rgba(15,23,42,0.07)]">
            <div className="grid grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)_96px_96px_240px] gap-4 border-b border-slate-200 bg-[linear-gradient(180deg,rgba(109,94,252,0.06),rgba(109,94,252,0.02))] px-5 py-3 text-[12px] font-black uppercase tracking-[0.08em] text-slate-500 max-[920px]:hidden">
              <div>Board</div>
              <div>Supervisor</div>
              <div>Lists</div>
              <div>Cards</div>
              <div className="text-right">Actions</div>
            </div>

            <div className="divide-y divide-slate-200/90">
              {filtered.map((b) => {
                const desc = clampText(b.description, "No description provided.");
                const sup = clampText(b.supervisor_name, "Unknown supervisor");
                const status = boardStatus(b);

                return (
                  <div
                    key={b.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openBoard(b.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openBoard(b.id);
                      }
                    }}
                    className="grid grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)_96px_96px_240px] gap-4 px-5 py-4 transition hover:bg-[#faf8ff] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#6d5efc]/15 max-[920px]:grid-cols-1"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-3">
                        <span className="grid h-11 w-11 flex-none place-items-center rounded-2xl border border-[#6d5efc]/20 bg-[#6d5efc]/10 text-[#6d5efc] shadow-[0_8px_18px_rgba(109,94,252,0.08)]">
                          <BoardIcon />
                        </span>
                        <div className="min-w-0">
                          <div className="truncate text-[15px] font-black text-slate-900">{b.name}</div>
                          <div className="mt-2">{renderMemberPreview(b, { compact: true })}</div>
                          {status === "inactive" ? (
                            <div className="mt-1 text-[11px] font-black text-slate-500">
                              Inactive since {formatDate(inactiveSinceDate(b))}
                            </div>
                          ) : null}
                          <div className="mt-1 line-clamp-1 text-[12px] font-semibold text-slate-500">{desc}</div>
                        </div>
                      </div>
                    </div>

                    <div className="flex min-w-0 items-center">
                      <span className="inline-flex max-w-full items-center gap-2 rounded-full border border-[#6d5efc]/20 bg-[#6d5efc]/10 px-3 py-1.5 text-[12px] font-black text-slate-800">
                        <UserIcon />
                        <span className="truncate">{sup}</span>
                      </span>
                    </div>

                    <div className="flex items-center">
                      <span className="inline-flex min-w-[58px] items-center justify-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[12px] font-black text-slate-700">
                        {b.lists_count}
                      </span>
                    </div>

                    <div className="flex items-center">
                      <span className="inline-flex min-w-[58px] items-center justify-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[12px] font-black text-slate-700">
                        {b.cards_count}
                      </span>
                    </div>

                    <div className="flex items-center justify-end gap-2 max-[920px]:justify-start">
                      {canManageMembers ? (
                        <BoardStatusIconButton
                          status={status}
                          saving={statusUpdatingBoardID === b.id}
                          onClick={() => void toggleBoardStatus(b)}
                        />
                      ) : null}
                      {isAdmin ? (
                        <button
                          type="button"
                          className="board-action-reassign h-8 w-8 grid place-items-center rounded-full border border-amber-200 bg-amber-50 text-amber-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                          title="Reassign board"
                          aria-label="Reassign board"
                          disabled={reassigning && reassignBoard?.id === b.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            openReassign(b);
                          }}
                        >
                          <ReassignIcon size={14} />
                        </button>
                      ) : null}
                      {canDeleteBoards ? (
                        <button
                          type="button"
                          className="board-action-delete h-8 w-8 grid place-items-center rounded-full border border-red-200 bg-red-50 text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                          title={deletingBoardID === b.id ? "Deleting..." : "Delete board"}
                          aria-label={deletingBoardID === b.id ? "Deleting board" : "Delete board"}
                          disabled={deletingBoardID === b.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteBoard(b);
                          }}
                          >
                          <BinIcon size={14} />
                        </button>
                      ) : null}

                      <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-black text-slate-600 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
                        Open <ArrowIcon size={14} />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {membersOpen && (
        <div
          className="fixed inset-0 z-[80] grid place-items-center bg-slate-900/40 p-4"
          onClick={closeMembersModal}
        >
          <div
            className="board-members-popup w-full max-w-[560px] rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_22px_60px_rgba(15,23,42,0.28)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-[18px] font-black text-slate-900">Board Members</div>
                <div className="text-[12px] font-semibold text-slate-500 truncate">
                  {membersBoard?.name || "Board"}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {canManageMembers && membersBoard ? (
                  <button
                    className="board-popup-edit h-9 w-9 grid place-items-center rounded-lg border border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100"
                    title="Edit members"
                    aria-label="Edit members"
                    onClick={() => {
                      closeMembersModal();
                      nav(`/admin/boards/${membersBoard.id}/members`);
                    }}
                  >
                    <PencilIcon />
                  </button>
                ) : null}
                <button
                  className="board-popup-close h-9 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-extrabold text-slate-700 hover:bg-slate-100"
                  onClick={closeMembersModal}
                >
                  Close
                </button>
              </div>
            </div>

            {membersErr ? (
              <div className="mb-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
                {membersErr}
              </div>
            ) : null}

            {membersLoading ? (
              <div className="text-sm font-semibold text-slate-500">Loading members...</div>
            ) : members.length === 0 ? (
              <div className="text-sm font-semibold text-slate-500">No members found.</div>
            ) : (
              <div className="max-h-[52vh] space-y-2 overflow-y-auto pr-1 [scrollbar-width:thin]">
                {members.map((m) => {
                  const avatarUrl = avatarByLogin[loginOf(m)] || "";
                  return (
                  <div
                    key={m.user_id}
                    role="button"
                    tabIndex={0}
                    className="board-member-row flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2.5 transition hover:border-[#6d5efc]/25 hover:bg-white hover:shadow-[0_12px_28px_rgba(15,23,42,0.06)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#6d5efc]/15"
                    onClick={() => openMemberProfile(m)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openMemberProfile(m);
                      }
                    }}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <button
                        type="button"
                        className="rounded-full focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#6d5efc]/15"
                        title="Open member image"
                        aria-label={`Open ${m.full_name} image`}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (avatarUrl) setPreviewAvatar({ src: avatarUrl, name: m.full_name });
                        }}
                      >
                        <UserAvatar
                          src={avatarUrl}
                          alt={m.full_name}
                          fallback={initialsOf(m.full_name)}
                          sizeClass="h-10 w-10"
                          textClass="text-[12px]"
                          className="bg-white"
                        />
                      </button>
                      <div className="min-w-0">
                      <div className="truncate text-sm font-black text-slate-900">{m.full_name}</div>
                      {m.nickname ? (
                        <div className="truncate text-xs font-extrabold text-indigo-600">@{m.nickname}</div>
                      ) : null}
                      <div className="truncate text-xs font-semibold text-slate-500">
                        {isAdmin ? phoneByLogin[String(m.nickname || m.email.split("@")[0] || "").trim().toLowerCase()] || "-" : m.email || "-"}
                      </div>
                    </div>
                    </div>
                    <div className="flex flex-none items-center gap-2">
                      <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-black text-slate-700">
                        {roleDisplay(m.role)}
                      </span>
                      <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-black text-violet-700">
                        {m.role_in_board || "member"}
                      </span>
                    </div>
                  </div>
                )})}
              </div>
            )}
          </div>
        </div>
      )}
      {previewAvatar ? (
        <div
          className="fixed inset-0 z-[95] grid place-items-center bg-slate-950/70 p-4"
          onClick={() => setPreviewAvatar(null)}
        >
          <div
            className="max-w-[min(92vw,520px)] rounded-[28px] border border-white/20 bg-white p-4 shadow-[0_28px_80px_rgba(2,6,23,0.45)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="truncate text-[16px] font-black text-slate-950">{previewAvatar.name}</div>
              <button
                type="button"
                className="h-9 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-extrabold text-slate-700 hover:bg-slate-100"
                onClick={() => setPreviewAvatar(null)}
              >
                Close
              </button>
            </div>
            <img
              src={previewAvatar.src}
              alt={previewAvatar.name}
              className="max-h-[70vh] w-full rounded-[22px] object-contain"
            />
          </div>
        </div>
      ) : null}
      <Modal
        open={createOpen}
        title="Create board"
        onClose={closeCreateModal}
        footer={
          <>
            <button
              type="button"
              onClick={closeCreateModal}
              className="inline-flex h-10 items-center rounded-2xl border border-slate-200 bg-white px-4 text-[13px] font-black text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={createBoard}
              disabled={!selectedSupervisor || !boardName.trim() || creatingBoard}
              className="inline-flex h-10 items-center gap-2 rounded-2xl border border-[#6d5efc]/18 bg-white px-4 text-[13px] font-black text-[#6d5efc] shadow-[0_10px_24px_rgba(15,23,42,0.05)] transition hover:-translate-y-[1px] hover:border-[#6d5efc]/28 hover:bg-[#f7f5ff] disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
            >
              {creatingBoard ? "Creating..." : "Create board"}
            </button>
          </>
        }
      >
        <div className="grid gap-4">
          {createBoardErr ? (
            <div className="rounded-[14px] border border-red-200 bg-red-50 px-3 py-2 text-[13px] font-semibold text-red-700">
              {createBoardErr}
            </div>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-[18px] border border-slate-200 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
              <div className="mb-3 text-[15px] font-black text-slate-900">Board details</div>
              <div className="grid gap-3">
                <label className="grid gap-1.5">
                  <span className="text-[12px] font-black uppercase tracking-[0.08em] text-slate-500">Supervisor</span>
                  {isSupervisor ? (
                    <div className="flex h-11 items-center rounded-[14px] border border-[#6d5efc]/18 bg-[#f7f5ff] px-3 text-[14px] font-black text-slate-900">
                      {supervisorsLoading
                        ? "Loading your workspace..."
                        : selectedSupervisor
                          ? selectedSupervisor.nickname
                            ? `${selectedSupervisor.full_name} (@${selectedSupervisor.nickname})`
                            : selectedSupervisor.full_name
                          : "Your supervisor workspace"}
                    </div>
                  ) : (
                    <select
                      value={selectedSupervisorID || ""}
                      onChange={(e) => {
                        setSelectedSupervisorID(Number(e.target.value) || 0);
                      }}
                      disabled={supervisorsLoading}
                      className="h-11 rounded-[14px] border border-slate-200 bg-slate-50 px-3 text-[14px] font-semibold text-slate-900 outline-none focus:border-[#6d5efc]/35 focus:bg-white focus:ring-4 focus:ring-[#6d5efc]/12 disabled:opacity-60"
                    >
                      <option value="">{supervisorsLoading ? "Loading supervisors..." : "Select supervisor"}</option>
                      {supervisorOptions.map((supervisor) => (
                        <option key={supervisor.supervisor_user_id} value={supervisor.supervisor_user_id}>
                          {supervisor.nickname? `${supervisor.full_name} (@${supervisor.nickname})` : supervisor.full_name}
                        </option>
                      ))}
                    </select>
                  )}
                </label>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1.5">
                    <span className="text-[12px] font-black uppercase tracking-[0.08em] text-slate-500">Model</span>
                    <select
                      value={selectedTrack}
                      onChange={(e) => setSelectedTrack((e.target.value as ProjectTrack) || "")}
                      disabled={!selectedSupervisor}
                      className="h-11 rounded-[14px] border border-slate-200 bg-slate-50 px-3 text-[14px] font-semibold text-slate-900 outline-none focus:border-[#6d5efc]/35 focus:bg-white focus:ring-4 focus:ring-[#6d5efc]/12 disabled:opacity-60"
                    >
                      <option value="">Optional model</option>
                      {TRACK_OPTIONS.map((track) => (
                        <option key={track.value} value={track.value}>
                          {track.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="grid gap-1.5">
                    <span className="text-[12px] font-black uppercase tracking-[0.08em] text-slate-500">Project</span>
                    <select
                      value={selectedProject}
                      onChange={(e) => setSelectedProject(e.target.value)}
                      disabled={!selectedSupervisor || !selectedTrack}
                      className="h-11 rounded-[14px] border border-slate-200 bg-slate-50 px-3 text-[14px] font-semibold text-slate-900 outline-none focus:border-[#6d5efc]/35 focus:bg-white focus:ring-4 focus:ring-[#6d5efc]/12 disabled:opacity-60"
                    >
                      <option value="">Optional project</option>
                      {availableProjects.map((project) => (
                        <option key={project} value={project}>
                          {project}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {selectedSupervisor && selectedProject ? (
                  <div className="rounded-[14px] border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-[12px] font-semibold text-emerald-800">
                    Suggested name: <span className="font-black">{boardName || "-"}</span>
                  </div>
                ) : (
                  <div className="rounded-[14px] border border-slate-200 bg-slate-50/80 px-3 py-2 text-[12px] font-semibold text-slate-500">
                    Project selection is optional. Leave it empty if this board is for another purpose.
                  </div>
                )}

                <label className="grid gap-1.5">
                  <span className="text-[12px] font-black uppercase tracking-[0.08em] text-slate-500">Board name</span>
                  <input
                    value={boardName}
                    onChange={(e) => setBoardName(e.target.value)}
                    className="h-11 rounded-[14px] border border-slate-200 bg-slate-50 px-3 text-[14px] font-semibold text-slate-900 outline-none focus:border-[#6d5efc]/35 focus:bg-white focus:ring-4 focus:ring-[#6d5efc]/12"
                    placeholder="Enter board name"
                  />
                </label>

                <label className="grid gap-1.5">
                  <span className="text-[12px] font-black uppercase tracking-[0.08em] text-slate-500">Description</span>
                  <textarea
                    value={boardDescription}
                    onChange={(e) => setBoardDescription(e.target.value)}
                    rows={4}
                    className="rounded-[14px] border border-slate-200 bg-slate-50 px-3 py-2.5 text-[14px] font-semibold text-slate-900 outline-none focus:border-[#6d5efc]/35 focus:bg-white focus:ring-4 focus:ring-[#6d5efc]/12"
                    placeholder="Optional board description"
                  />
                </label>
              </div>
            </div>

            <div className="rounded-[18px] border border-slate-200 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
              <div className="mb-1 flex items-center justify-between gap-3">
                <div className="text-[15px] font-black text-slate-900">Board members</div>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-black text-slate-600">
                  {selectedMemberIDs.size} selected
                </span>
              </div>
              <div className="mb-3 text-[12px] font-semibold text-slate-500">
                Pick members from the selected supervisor&apos;s assigned students.
              </div>

              {!selectedSupervisor ? (
                <div className="rounded-[14px] border border-dashed border-slate-200 bg-slate-50/80 px-3 py-3 text-[13px] font-semibold text-slate-500">
                  Select a supervisor first.
                </div>
              ) : assignedStudentsLoading ? (
                <div className="rounded-[14px] border border-slate-200 bg-slate-50/80 px-3 py-3 text-[13px] font-semibold text-slate-500">
                  Loading assigned students...
                </div>
              ) : assignedStudents.length === 0 ? (
                <div className="rounded-[14px] border border-slate-200 bg-slate-50/80 px-3 py-3 text-[13px] font-semibold text-slate-500">
                  This supervisor has no assigned students yet.
                </div>
              ) : (
                <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1 [scrollbar-width:thin]">
                  {assignedStudents.map((student) => {
                    const checked = selectedMemberIDs.has(student.id);
                    const avatarUrl =
                      avatarByLogin[String(student.nickname || student.email.split("@")[0] || "").trim().toLowerCase()] || "";
                    return (
                      <label
                        key={student.id}
                        className={[
                          "flex cursor-pointer items-center gap-3 rounded-2xl border px-3 py-2.5 transition",
                          checked
                            ? "border-emerald-300/60 bg-emerald-50/50 shadow-[0_10px_22px_rgba(16,185,129,0.08)]"
                            : "border-slate-200/70 bg-white hover:border-slate-300/70 hover:shadow-[0_10px_18px_rgba(15,23,42,0.08)]",
                        ].join(" ")}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSelectedMember(student.id)}
                          className="h-4 w-4"
                        />
                        <UserAvatar
                          src={avatarUrl}
                          alt={student.full_name}
                          fallback={initialsOf(student.full_name)}
                          className="bg-slate-50"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[14px] font-black text-slate-900">{student.full_name}</div>
                          <div className="mt-0.5 truncate text-[12px] font-extrabold text-[#6d5efc]">
                            {(student.nickname || "").trim() ? `@${String(student.nickname).replace(/^@/, "")}` : "-"}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            {student.cohort ? (
                              <span className="inline-flex h-7 items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 text-[11px] font-extrabold text-slate-700">
                                {student.cohort}
                              </span>
                            ) : null}
                            <span className="truncate text-[12px] font-semibold text-slate-500">{student.email}</span>
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </Modal>
    </AdminLayout>
    </>
  );
}
