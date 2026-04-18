import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import AdminLayout from "../components/AdminLayout";
import BackButton from "../components/BackButton";
import { SkeletonBlock } from "../components/Skeleton";
import UserAvatar from "../components/UserAvatar";
import { apiFetch } from "../lib/api";
import { useAuth } from "../lib/auth";
import { fetchRebootAvatar, fetchRebootAvatars } from "../lib/rebootAvatars";
import { fetchRebootPhones } from "../lib/rebootPhones";

const GQL_URL = "https://learn.reboot01.com/api/graphql-engine/v1/graphql";
const BAHRAIN_TIMEZONE = "Asia/Bahrain";

type LocalProfile = {
  user: {
    id: number;
    full_name: string;
    email: string;
    nickname: string;
    cohort: string;
    role: "admin" | "supervisor" | "student";
  };
  supervisor?: {
    assigned_students_overall: number;
    assigned_students: {
      id: number;
      full_name: string;
      nickname: string;
      email: string;
      boards: { id: number; name: string }[];
    }[];
    boards: { id: number; name: string; students_count: number }[];
  };
  student?: {
    supervisors: { id: number; full_name: string; nickname: string; email: string }[];
    boards: {
      id: number;
      name: string;
      group: string;
      supervisor: { id: number; full_name: string; nickname: string; email: string };
    }[];
  };
  tasks: {
    total: number;
    done: number;
    left: number;
    progress_pct: number;
    assigned_cards: {
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

type RebootProfile = {
  user?: {
    email?: string;
    firstName?: string;
    lastName?: string;
    login?: string;
    gender?: string;
    number?: string;
    avatarUrl?: string;
    auditRatio?: number;
    totalUp?: number;
    totalDown?: number;
  };
  level: number | null;
  xp: number | null;
};
type BoardMember = {
  user_id: number;
  full_name: string;
  nickname: string;
  email: string;
  role: string;
  role_in_board: string;
};

type AssignCandidate = {
  id: number;
  full_name: string;
  nickname: string;
  email: string;
  cohort: string;
  role?: string;
};

type SupervisorOption = {
  supervisor_user_id: number;
  full_name: string;
  email: string;
  nickname?: string;
  cohort?: string;
  file_id: number;
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

type StudentPrivateNote = {
  id: number;
  student_id: number;
  author_user_id: number;
  author_name: string;
  author_role: string;
  body: string;
  created_at: string;
  updated_at: string;
};

function num(value: number | null | undefined, digits = 2) {
  if (typeof value !== "number" || Number.isNaN(value)) return "-";
  return value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function withAt(v: string) {
  const t = (v || "").trim();
  if (!t) return "-";
  return t.startsWith("@") ? t : `@${t}`;
}

function initials(v: string) {
  const p = String(v || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (p.length === 0) return "?";
  return p.map((x) => x[0]?.toUpperCase() || "").join("");
}

function loginKey(value: string | undefined) {
  return String(value || "").trim().toLowerCase();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function nextProjectBoardNumber(boards: { name: string }[], projectSlug: string) {
  const pattern = new RegExp(`(?:^|-)${escapeRegExp(projectSlug)}(?:-(\\d+))?$`, "i");
  let max = 0;

  for (const board of boards) {
    const match = String(board.name || "").trim().match(pattern);
    if (!match) continue;
    const parsed = Number(match[1] || "1");
    if (Number.isFinite(parsed)) max = Math.max(max, parsed);
  }

  return max + 1;
}

function normalizeGender(v: string) {
  const g = String(v || "").trim().toLowerCase();
  if (g.includes("female") || g === "f" || g === "woman" || g === "girl") return "female";
  if (g.includes("male") || g === "m" || g === "man" || g === "boy") return "male";
  return "unspecified";
}

function normalizeCohort(value: string) {
  const cohort = String(value || "").trim();
  if (!cohort) return "";
  if (cohort.toLowerCase() === "unknown cohort") return "";
  return cohort;
}

function roleDisplay(role: string) {
  const normalized = String(role || "").trim().toLowerCase();
  if (normalized === "student") return "Talent";
  if (normalized === "supervisor") return "Supervisor";
  if (normalized === "admin") return "Admin";
  return role || "-";
}

function formatBahrainDateTime(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return "-";
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)
    ? raw.replace(" ", "T") + "Z"
    : raw;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString(undefined, {
    timeZone: BAHRAIN_TIMEZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

async function loadRebootProfile(login: string, jwt: string): Promise<RebootProfile> {
  const query = `
    query Profile($login: String!) {
      user(where: { login: { _eq: $login } }, limit: 1) {
        email
        firstName
        lastName
        login
        auditRatio
        totalUp
        totalDown
        number: attrs(path: "PhoneNumber")
        attrs
      }
      event_user(where: { eventId: { _in: [72, 20, 250, 763] }, userLogin: { _eq: $login } }) {
        level
        user {
          number: attrs(path: "PhoneNumber")
          attrs
        }
      }
      transaction_aggregate(
        where: {
          event: { path: { _eq: "/bahrain/bh-module" } }
          type: { _eq: "xp" }
          userLogin: { _eq: $login }
        }
      ) {
        aggregate {
          sum {
            amount
          }
        }
      }
    }
  `;

  const res = await fetch(GQL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables: { login } }),
  });

  const json = await res.json();
  if (!res.ok || json?.errors?.length) {
    throw new Error(json?.errors?.[0]?.message || "Failed to load Reboot profile");
  }

  const user = (json?.data?.user?.[0] ?? {}) as RebootProfile["user"];
  const eventUsers = Array.isArray(json?.data?.event_user) ? json.data.event_user : [];
  const levels = eventUsers
    .map((e: any) => Number(e?.level))
    .filter((n: number) => Number.isFinite(n));
  const level = levels.length ? Math.max(...levels) : null;
  const xpRaw = Number(json?.data?.transaction_aggregate?.aggregate?.sum?.amount);

  const gender = await loadRebootGender(login, jwt);
  const avatarUrl = jwt ? await fetchRebootAvatar(login) : "";
  const number =
    eventUsers
      .map((e: any) => String(e?.user?.number || "").trim() || pickPhoneFromAttrs(e?.user?.attrs))
      .find((value: string) => value.length > 0) ||
    String(user?.number || "").trim() ||
    pickPhoneFromAttrs((json?.data?.user?.[0] as any)?.attrs);

  const mergedUser = {
    ...user,
    ...(gender ? { gender } : {}),
    ...(number ? { number } : {}),
    ...(avatarUrl ? { avatarUrl } : {}),
  };
  return {
    user: mergedUser,
    level,
    xp: Number.isFinite(xpRaw) ? xpRaw : null,
  };
}

function pickGenderFromAttrs(attrs: any): string {
  if (!attrs) return "";
  let source = attrs;
  if (typeof source === "string") {
    try {
      source = JSON.parse(source);
    } catch {
      return "";
    }
  }
  const scan = (value: any, key = ""): string => {
    if (typeof value === "string") {
      const normalizedKey = key.toLowerCase();
      if ((normalizedKey.includes("gender") || normalizedKey.includes("sex")) && value.trim()) {
        return value.trim();
      }
      return "";
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = scan(item, key);
        if (found) return found;
      }
      return "";
    }
    if (value && typeof value === "object") {
      for (const [nextKey, nextValue] of Object.entries(value)) {
        const found = scan(nextValue, String(nextKey));
        if (found) return found;
      }
    }
    return "";
  };

  if (typeof source === "object" && !Array.isArray(source)) {
    const candidates = [
      source.genders,
      source.gender,
      source.Gender,
      source.sex,
      source.Sex,
      source.profileGender,
    ];
    const found = candidates.find((v) => typeof v === "string" && v.trim());
    if (found) return String(found).trim();
  }
  return scan(source);
}

function pickPhoneFromAttrs(attrs: any): string {
  if (!attrs) return "";
  let source = attrs;
  if (typeof source === "string") {
    try {
      source = JSON.parse(source);
    } catch {
      return "";
    }
  }
  if (typeof source === "object" && !Array.isArray(source)) {
    const candidates = [source.PhoneNumber, source.phoneNumber, source.phone, source.Phone];
    const found = candidates.find((v) => typeof v === "string" && v.trim());
    if (found) return String(found).trim();
  }
  return "";
}

async function loadRebootGender(login: string, jwt: string): Promise<string> {
  // Try direct `gender` field first.
  try {
    const genderQ = `
      query ProfileGender($login: String!) {
        user(where: { login: { _eq: $login } }, limit: 1) {
          gender
        }
      }
    `;
    const res = await fetch(GQL_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: genderQ, variables: { login } }),
    });
    const json = await res.json().catch(() => null);
    const g = String(json?.data?.user?.[0]?.gender || "").trim();
    if (g) return g;
  } catch {
    // Continue fallback.
  }

  // Fallback for schemas exposing gender inside attrs JSON.
  try {
    const attrsQ = `
      query ProfileAttrs($login: String!) {
        user(where: { login: { _eq: $login } }, limit: 1) {
          attrs
        }
      }
    `;
    const res = await fetch(GQL_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: attrsQ, variables: { login } }),
    });
    const json = await res.json().catch(() => null);
    return pickGenderFromAttrs(json?.data?.user?.[0]?.attrs);
  } catch {
    return "";
  }
}

export default function ProfilePage() {
  const nav = useNavigate();
  const location = useLocation();
  const params = useParams<{ userId?: string }>();
  const { role, login: ownLogin, jwt } = useAuth();
  const targetUserID = Number(params.userId || 0);
  const isTargetUserView =
    Number.isFinite(targetUserID) && targetUserID > 0 && (role === "admin" || role === "supervisor");
  const isAdminViewingUser = role === "admin" && isTargetUserView;
  const isSupervisorViewingStudent = role === "supervisor" && isTargetUserView;
  const profileLocationState = (location.state as { backTo?: string; preserveListState?: boolean; preserveBoardsState?: boolean } | null) || null;
  const currentProfileBackTo = `${location.pathname}${location.search}`;
  const ownBackTo = !isTargetUserView ? String(profileLocationState?.backTo || "") : "";
  const shouldRestoreOwnBoardsState = !isTargetUserView && ownBackTo === "/admin/boards" && !!profileLocationState?.preserveBoardsState;
  const adminLocationState = profileLocationState;
  const adminBackTo = isAdminViewingUser
    ? String(adminLocationState?.backTo || "/admin/users")
    : "";
  const shouldRestoreAdminUsersState =
    isAdminViewingUser && adminBackTo === "/admin/users" && !!adminLocationState?.preserveListState;
  const shouldRestoreAdminBoardsState =
    isAdminViewingUser && adminBackTo === "/admin/boards" && !!adminLocationState?.preserveBoardsState;
  const supervisorBackTo = isSupervisorViewingStudent
    ? String((location.state as { backTo?: string; preserveBoardsState?: boolean } | null)?.backTo || "/users")
    : "";
  const activeSection = isAdminViewingUser
    ? (adminBackTo === "/profile" ? "profile" : adminBackTo === "/admin/boards" ? "boards" : "users")
    : isSupervisorViewingStudent && supervisorBackTo === "/users"
    ? "users"
    : isSupervisorViewingStudent && supervisorBackTo === "/admin/boards"
    ? "boards"
    : shouldRestoreOwnBoardsState
    ? "boards"
    : "profile";

  const [localProfile, setLocalProfile] = useState<LocalProfile | null>(null);
  const [rebootProfile, setRebootProfile] = useState<RebootProfile | null>(null);
  const [phoneByLogin, setPhoneByLogin] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [membersByBoard, setMembersByBoard] = useState<Record<number, BoardMember[]>>({});
  const [membersOpen, setMembersOpen] = useState<Record<number, boolean>>({});
  const [membersLoading, setMembersLoading] = useState<Record<number, boolean>>({});
  const [avatarByLogin, setAvatarByLogin] = useState<Record<string, string>>({});
  const [talentPickerOpen, setTalentPickerOpen] = useState(false);
  const [talentSearch, setTalentSearch] = useState("");
  const [talentResults, setTalentResults] = useState<AssignCandidate[]>([]);
  const [selectedTalentIDs, setSelectedTalentIDs] = useState<Set<number>>(new Set());
  const [talentCohortFilter, setTalentCohortFilter] = useState("all");
  const [talentsLoading, setTalentsLoading] = useState(false);
  const [assignTalentErr, setAssignTalentErr] = useState("");
  const [assigningTalents, setAssigningTalents] = useState(false);
  const [createBoardOpen, setCreateBoardOpen] = useState(false);
  const [supervisorOptions, setSupervisorOptions] = useState<SupervisorOption[]>([]);
  const [supervisorsLoading, setSupervisorsLoading] = useState(false);
  const [boardName, setBoardName] = useState("");
  const [boardDescription, setBoardDescription] = useState("");
  const [selectedTrack, setSelectedTrack] = useState<ProjectTrack | "">("");
  const [selectedProject, setSelectedProject] = useState("");
  const [selectedBoardMemberIDs, setSelectedBoardMemberIDs] = useState<Set<number>>(new Set());
  const [creatingBoard, setCreatingBoard] = useState(false);
  const [createBoardErr, setCreateBoardErr] = useState("");
  const [privateNotes, setPrivateNotes] = useState<StudentPrivateNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  const loadProfileData = useCallback(async () => {
    const local = await apiFetch(
      isTargetUserView ? `/admin/profile/summary?user_id=${targetUserID}` : "/admin/profile/summary"
    );
    const targetLogin =
      String(local?.user?.nickname || "").trim() || (isTargetUserView ? "" : ownLogin);
    const reboot = targetLogin && jwt ? await loadRebootProfile(targetLogin, jwt) : null;
    return { local: local as LocalProfile, reboot };
  }, [isTargetUserView, jwt, ownLogin, targetUserID]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setErr("");
      try {
        const { local, reboot } = await loadProfileData();
        if (!mounted) return;
        setLocalProfile(local);
        setRebootProfile(reboot);
      } catch (e: any) {
        if (!mounted) return;
        setErr(e?.message || "Failed to load profile");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [loadProfileData]);

  const displayName = useMemo(() => {
    if (rebootProfile?.user?.firstName || rebootProfile?.user?.lastName) {
      return `${rebootProfile?.user?.firstName || ""} ${rebootProfile?.user?.lastName || ""}`.trim();
    }
    return localProfile?.user?.full_name || "Profile";
  }, [localProfile?.user?.full_name, rebootProfile?.user?.firstName, rebootProfile?.user?.lastName]);
  const roleLabel = roleDisplay(localProfile?.user?.role || role);
  const genderRaw = rebootProfile?.user?.gender || "";
  const genderNormalized = normalizeGender(genderRaw);
  const boardRows =
    localProfile?.user?.role === "student"
      ? (localProfile.student?.boards || []).map((b) => ({
          id: b.id,
          name: b.name,
          subtitle: `Supervisor: ${b.supervisor.full_name} (${withAt(b.supervisor.nickname)})`,
          group: b.group || "member",
        }))
      : (localProfile?.supervisor?.boards || []).map((b) => ({
          id: b.id,
          name: b.name,
          subtitle: `${b.students_count} talents`,
          group: "",
        }));
  const loadedProfileMatchesTarget = !isTargetUserView || localProfile?.user?.id === targetUserID;
  const canViewPrivateNotes =
    isTargetUserView &&
    loadedProfileMatchesTarget &&
    (role === "admin" || role === "supervisor") &&
    localProfile?.user?.role === "student";
  const canManageAssignedTalents =
    loadedProfileMatchesTarget && role === "admin" && localProfile?.user?.role === "supervisor";
  const canCreateProfileBoard =
    loadedProfileMatchesTarget &&
    localProfile?.user?.role === "supervisor" &&
    (role === "admin" || (!isTargetUserView && role === "supervisor"));
  const selectedProfileSupervisor = useMemo(
    () =>
      supervisorOptions.find((supervisor) => supervisor.supervisor_user_id === localProfile?.user?.id) ||
      null,
    [localProfile?.user?.id, supervisorOptions]
  );
  const talentCohorts = useMemo(() => {
    const cohorts = new Set<string>();
    talentResults.forEach((student) => {
      const cohort = normalizeCohort(student.cohort);
      if (cohort) cohorts.add(cohort);
    });
    return Array.from(cohorts).sort((a, b) => a.localeCompare(b));
  }, [talentResults]);
  const visibleTalentResults = useMemo(() => {
    if (talentCohortFilter === "all") return talentResults;
    return talentResults.filter((student) => normalizeCohort(student.cohort) === talentCohortFilter);
  }, [talentCohortFilter, talentResults]);
  const availableProjects = selectedTrack ? PROJECTS_BY_TRACK[selectedTrack] : [];

  useEffect(() => {
    let cancelled = false;

    async function loadPrivateNotes() {
      if (!canViewPrivateNotes || !targetUserID) {
        setPrivateNotes([]);
        setNoteDraft("");
        setNotesLoading(false);
        return;
      }

      setNotesLoading(true);
      try {
        const res = await apiFetch(`/admin/profile/notes?user_id=${targetUserID}`);
        if (!cancelled) {
          setPrivateNotes(Array.isArray(res) ? res : []);
        }
      } catch (e: any) {
        if (!cancelled) {
          setPrivateNotes([]);
          setErr((prev) => prev || e?.message || "Failed to load private notes");
        }
      } finally {
        if (!cancelled) setNotesLoading(false);
      }
    }

    void loadPrivateNotes();
    return () => {
      cancelled = true;
    };
  }, [canViewPrivateNotes, targetUserID]);

  useEffect(() => {
    let cancelled = false;

    async function loadPhones() {
      if (role !== "admin") {
        setPhoneByLogin({});
        return;
      }
      const logins = [
        localProfile?.user?.nickname,
        ...(localProfile?.supervisor?.assigned_students || []).map((student) => student.nickname),
        ...(Object.values(membersByBoard).flat() || []).map((member) => member.nickname),
      ].filter(Boolean) as string[];
      if (logins.length === 0) {
        setPhoneByLogin({});
        return;
      }
      try {
        const next = await fetchRebootPhones(logins);
        if (!cancelled) setPhoneByLogin(next);
      } catch {
        if (!cancelled) setPhoneByLogin({});
      }
    }

    void loadPhones();
    return () => {
      cancelled = true;
    };
  }, [localProfile, membersByBoard, role]);

  useEffect(() => {
    let cancelled = false;

    async function loadAvatars() {
      const logins = [
        localProfile?.user?.nickname,
        ...(localProfile?.supervisor?.assigned_students || []).map((student) => student.nickname),
        ...(localProfile?.student?.supervisors || []).map((supervisor) => supervisor.nickname),
        ...(Object.values(membersByBoard).flat() || []).map((member) => member.nickname || member.email.split("@")[0]),
        ...talentResults.map((student) => student.nickname || student.email.split("@")[0]),
      ].filter(Boolean) as string[];
      if (logins.length === 0) {
        setAvatarByLogin({});
        return;
      }
      try {
        const next = await fetchRebootAvatars(logins);
        if (!cancelled) setAvatarByLogin(next);
      } catch {
        if (!cancelled) setAvatarByLogin({});
      }
    }

    void loadAvatars();
    return () => {
      cancelled = true;
    };
  }, [localProfile, membersByBoard, talentResults]);

  useEffect(() => {
    let cancelled = false;

    async function loadAvailableTalents() {
      if (!canManageAssignedTalents || !talentPickerOpen) {
        setTalentResults([]);
        setTalentsLoading(false);
        setAssignTalentErr("");
        return;
      }

      setTalentsLoading(true);
      setAssignTalentErr("");
      try {
        const query = talentSearch.trim();
        const rows = await apiFetch(`/admin/assign/students?q=${encodeURIComponent(query)}`);
        const assignedIDs = new Set((localProfile?.supervisor?.assigned_students || []).map((student) => student.id));
        const available = (Array.isArray(rows) ? rows : []).filter((student: AssignCandidate) => !assignedIDs.has(student.id));
        if (!cancelled) setTalentResults(available);
      } catch (e: any) {
        if (!cancelled) {
          setTalentResults([]);
          setAssignTalentErr(e?.message || "Failed to load available talents");
        }
      } finally {
        if (!cancelled) setTalentsLoading(false);
      }
    }

    void loadAvailableTalents();
    return () => {
      cancelled = true;
    };
  }, [canManageAssignedTalents, localProfile?.supervisor?.assigned_students, talentPickerOpen, talentSearch]);

  useEffect(() => {
    if (!talentPickerOpen) {
      setSelectedTalentIDs(new Set());
      setTalentCohortFilter("all");
      setTalentSearch("");
      setAssignTalentErr("");
    }
  }, [talentPickerOpen]);

  useEffect(() => {
    if (talentCohortFilter !== "all" && !talentCohorts.includes(talentCohortFilter)) {
      setTalentCohortFilter("all");
    }
  }, [talentCohortFilter, talentCohorts]);

  useEffect(() => {
    if (!canCreateProfileBoard || !createBoardOpen) return;
    let cancelled = false;

    async function loadSupervisors() {
      setSupervisorsLoading(true);
      setCreateBoardErr("");
      try {
        const res = await apiFetch("/admin/supervisors");
        if (!cancelled) setSupervisorOptions(Array.isArray(res) ? (res as SupervisorOption[]) : []);
      } catch (e: any) {
        if (!cancelled) {
          setSupervisorOptions([]);
          setCreateBoardErr(e?.message || "Failed to load supervisor workspace");
        }
      } finally {
        if (!cancelled) setSupervisorsLoading(false);
      }
    }

    void loadSupervisors();
    return () => {
      cancelled = true;
    };
  }, [canCreateProfileBoard, createBoardOpen]);

  useEffect(() => {
    if (!selectedTrack) {
      setSelectedProject("");
    }
  }, [selectedTrack]);

  useEffect(() => {
    if (!createBoardOpen) return;
    const nickname = String(selectedProfileSupervisor?.nickname || localProfile?.user?.nickname || "")
      .trim()
      .replace(/^@/, "");
    if (!nickname) return;

    setBoardName((prev) => {
      const current = String(prev || "").trim();
      if (selectedProject) {
        const nextNumber = nextProjectBoardNumber(boardRows, selectedProject);
        return `${nickname}-${selectedProject}-${nextNumber}`;
      }
      if (!current) return `${nickname}-`;
      return current;
    });
  }, [boardRows, createBoardOpen, localProfile?.user?.nickname, selectedProfileSupervisor, selectedProject]);

  useEffect(() => {
    if (!createBoardOpen) {
      setBoardName("");
      setBoardDescription("");
      setSelectedTrack("");
      setSelectedProject("");
      setSelectedBoardMemberIDs(new Set());
      setCreateBoardErr("");
      setCreatingBoard(false);
    }
  }, [createBoardOpen]);

  function toggleSelectedTalent(studentID: number) {
    setSelectedTalentIDs((prev) => {
      const next = new Set(prev);
      if (next.has(studentID)) next.delete(studentID);
      else next.add(studentID);
      return next;
    });
  }

  function setVisibleTalentSelection(checked: boolean) {
    setSelectedTalentIDs((prev) => {
      const next = new Set(prev);
      visibleTalentResults.forEach((student) => {
        if (checked) next.add(student.id);
        else next.delete(student.id);
      });
      return next;
    });
  }

  function toggleSelectedBoardMember(userID: number) {
    setSelectedBoardMemberIDs((prev) => {
      const next = new Set(prev);
      if (next.has(userID)) next.delete(userID);
      else next.add(userID);
      return next;
    });
  }

  async function assignSelectedTalents() {
    if (!canManageAssignedTalents || !localProfile?.user?.id) return;
    const ids = Array.from(selectedTalentIDs);
    if (ids.length === 0) return;
    setAssigningTalents(true);
    setAssignTalentErr("");
    try {
      await Promise.all(
        ids.map((studentID) =>
          apiFetch("/admin/assign", {
            method: "POST",
            body: JSON.stringify({ supervisor_id: localProfile.user.id, student_id: studentID }),
          })
        )
      );
      const { local, reboot } = await loadProfileData();
      setLocalProfile(local);
      setRebootProfile(reboot);
      setTalentSearch("");
      setTalentPickerOpen(false);
      setTalentResults([]);
      setSelectedTalentIDs(new Set());
    } catch (e: any) {
      setAssignTalentErr(e?.message || "Failed to assign talent");
    } finally {
      setAssigningTalents(false);
    }
  }

  async function createProfileBoard() {
    if (!canCreateProfileBoard || !boardName.trim() || creatingBoard) return;
    if (!selectedProfileSupervisor?.file_id) {
      setCreateBoardErr(supervisorsLoading ? "Loading supervisor workspace..." : "Supervisor workspace was not found");
      return;
    }

    setCreatingBoard(true);
    setCreateBoardErr("");
    try {
      const created = await apiFetch("/admin/boards", {
        method: "POST",
        body: JSON.stringify({
          supervisor_file_id: selectedProfileSupervisor.file_id,
          name: boardName.trim(),
          description: boardDescription.trim(),
        }),
      });
      const boardID = Number(created?.id || 0);
      if (!Number.isFinite(boardID) || boardID <= 0) {
        throw new Error("Board created but no board id was returned.");
      }
      if (selectedBoardMemberIDs.size > 0) {
        await Promise.all(
          Array.from(selectedBoardMemberIDs).map((userID) =>
            apiFetch("/admin/board-members", {
              method: "POST",
              body: JSON.stringify({ board_id: boardID, user_id: userID, role_in_board: "member" }),
            })
          )
        );
      }
      const { local, reboot } = await loadProfileData();
      setLocalProfile(local);
      setRebootProfile(reboot);
      setCreateBoardOpen(false);
      setBoardName("");
      setBoardDescription("");
      setSelectedTrack("");
      setSelectedProject("");
      setSelectedBoardMemberIDs(new Set());
    } catch (e: any) {
      setCreateBoardErr(e?.message || "Failed to create board");
    } finally {
      setCreatingBoard(false);
    }
  }

  async function addPrivateNote() {
    if (!canViewPrivateNotes || !targetUserID || !noteDraft.trim()) return;
    setSavingNote(true);
    setErr("");
    try {
      await apiFetch("/admin/profile/notes", {
        method: "POST",
        body: JSON.stringify({ user_id: targetUserID, body: noteDraft.trim() }),
      });
      const res = await apiFetch(`/admin/profile/notes?user_id=${targetUserID}`);
      setPrivateNotes(Array.isArray(res) ? res : []);
      setNoteDraft("");
    } catch (e: any) {
      setErr(e?.message || "Failed to save private note");
    } finally {
      setSavingNote(false);
    }
  }

  async function toggleMembers(boardID: number) {
    const isOpen = !!membersOpen[boardID];
    if (isOpen) {
      setMembersOpen((prev) => ({ ...prev, [boardID]: false }));
      return;
    }
    setMembersOpen((prev) => ({ ...prev, [boardID]: true }));
    if (membersByBoard[boardID]) return;
    setMembersLoading((prev) => ({ ...prev, [boardID]: true }));
    try {
      const rows = await apiFetch(`/admin/board-members?board_id=${boardID}`);
      setMembersByBoard((prev) => ({ ...prev, [boardID]: Array.isArray(rows) ? rows : [] }));
    } catch {
      setMembersByBoard((prev) => ({ ...prev, [boardID]: [] }));
    } finally {
      setMembersLoading((prev) => ({ ...prev, [boardID]: false }));
    }
  }

  function openBoard(boardID: number) {
    nav(`/admin/boards/${boardID}?from=boards`);
  }

  if (!isTargetUserView && role !== "admin" && role !== "supervisor" && role !== "student") {
    return <Navigate to="/login" replace />;
  }
  if (role === "student" && isTargetUserView) return <Navigate to="/profile" replace />;

  return (
    <AdminLayout
      active={activeSection}
      title={isTargetUserView ? "User Profile" : "My Profile"}
      subtitle={
        isTargetUserView
          ? "User details, role information, and assignment overview."
          : "Personal info, role details, and assignment overview."
      }
      right={
        isAdminViewingUser ? (
          <BackButton onClick={() => (shouldRestoreAdminUsersState || shouldRestoreAdminBoardsState ? nav(-1) : nav(adminBackTo))} />
        ) : isSupervisorViewingStudent ? (
          <BackButton onClick={() => nav(supervisorBackTo)} />
        ) : shouldRestoreOwnBoardsState ? (
          <BackButton onClick={() => nav(-1)} />
        ) : null
      }
    >
      {err ? (
        <div className="mb-3 rounded-[14px] border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-slate-800">
          {err}
        </div>
      ) : null}

      {loading ? (
        <div className="mx-auto grid max-w-[1280px] gap-3">
          <SkeletonBlock lines={3} />
          <SkeletonBlock lines={5} />
        </div>
      ) : null}

      {!loading && localProfile ? (
        <div className="mx-auto grid max-w-[1280px] gap-3 [animation:pfFade_.32s_ease]">
          <style>{`@keyframes pfFade{from{opacity:.2;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>

          <section className="rounded-[18px] border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
            <div className="grid gap-3 lg:grid-cols-[auto_minmax(0,1fr)]">
              <AvatarPlaceholder name={displayName} gender={genderNormalized} avatarUrl={rebootProfile?.user?.avatarUrl} />
              <div className="min-w-0">
                <div className="truncate text-[26px] font-black tracking-[-0.02em] text-slate-900">{displayName}</div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12px] font-bold text-slate-600">
                  <span className="rounded-full border border-[#6d5efc]/20 bg-[#6d5efc]/10 px-2.5 py-1">
                    {withAt(localProfile.user.nickname)}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 capitalize">
                    {roleLabel}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                    {normalizeCohort(localProfile.user.cohort) || "No cohort"}
                  </span>
                </div>
              </div>
            </div>

            <div className={`mt-3 grid gap-2 sm:grid-cols-2 ${role === "admin" ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}>
              <Info label="Email" value={rebootProfile?.user?.email || localProfile.user.email} />
              {role === "admin" ? <Info label="Phone" value={rebootProfile?.user?.number || "-"} /> : null}
              <Info
                label="Gender"
                value={genderNormalized === "female" ? "Female" : genderNormalized === "male" ? "Male" : "-"}
                icon={<GenderIcon gender={genderNormalized} />}
              />
              <Info label="Level" value={num(rebootProfile?.level, 0)} />
              <Info label="Audit ratio" value={num(rebootProfile?.user?.auditRatio)} />
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <SnapshotItem label="Boards" value={String(boardRows.length)} />
              {localProfile.student ? (
                <SnapshotItem label="Supervisors" value={String(localProfile.student?.supervisors?.length || 0)} />
              ) : null}
              <SnapshotItem label="Assigned Tasks" value={String(localProfile.tasks?.total || 0)} />
              <SnapshotItem label="Completed" value={String(localProfile.tasks?.done || 0)} />
            </div>
          </section>

          <div className="grid gap-3 lg:grid-cols-2 lg:[grid-auto-rows:minmax(0,1fr)]">
            <section className="rounded-[18px] border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)] lg:min-h-[450px]">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="text-[18px] font-black text-slate-900">Boards</div>
                <div className="flex items-center gap-2">
                  {canCreateProfileBoard ? (
                    <button
                      type="button"
                      onClick={() => setCreateBoardOpen(true)}
                      className="inline-flex h-10 items-center gap-2 rounded-2xl border border-[#6d5efc]/18 bg-white/90 px-3.5 text-[13px] font-black text-[#6d5efc] shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition hover:border-[#6d5efc]/28 hover:bg-[#f7f5ff]"
                    >
                      <BoardIcon size={16} />
                      Create board
                    </button>
                  ) : null}
                  <span className="inline-flex h-7 items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 text-[11px] font-black text-slate-700">
                    {boardRows.length} boards
                  </span>
                </div>
              </div>
              <div className="space-y-2 overflow-y-auto pr-1 lg:max-h-[360px]">
                {boardRows.length === 0 ? (
                  <div className="text-[13px] font-semibold text-slate-500">No boards yet.</div>
                ) : (
                  boardRows.map((b) => (
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
                      className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-left transition hover:border-[#6d5efc]/25 hover:bg-[#f6f4ff] focus:outline-none focus:ring-4 focus:ring-[#6d5efc]/12"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-[13px] font-black text-slate-900">{b.name}</div>
                          <div className="mt-0.5 text-[12px] font-semibold text-slate-500">{b.subtitle}</div>
                          {"group" in b && b.group ? (
                            <div className="mt-1.5">
                              <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-black capitalize text-amber-800">
                                Group: {b.group}
                              </span>
                            </div>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void toggleMembers(b.id);
                          }}
                          aria-label={membersOpen[b.id] ? "Hide members" : "Show members"}
                          title={membersOpen[b.id] ? "Hide members" : "Show members"}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200/80 bg-slate-50 text-slate-600 transition hover:border-[#6d5efc]/25 hover:bg-[#f6f4ff] hover:text-[#6d5efc]"
                        >
                          {membersOpen[b.id] ? (
                            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
                              <path d="M6 15l6-6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                            </svg>
                          ) : (
                            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
                              <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                            </svg>
                          )}
                        </button>
                      </div>

                      {membersOpen[b.id] ? (
                        <div className="mt-2 rounded-lg border border-slate-200 bg-white p-2.5">
                          {membersLoading[b.id] ? (
                            <div className="text-[12px] font-semibold text-slate-500">Loading members...</div>
                          ) : (membersByBoard[b.id] || []).length === 0 ? (
                            <div className="text-[12px] font-semibold text-slate-500">No members found.</div>
                          ) : (
                            <div className="space-y-1.5">
                              {(membersByBoard[b.id] || []).map((m) => {
                                const memberLogin = loginKey(m.nickname || m.email.split("@")[0]);
                                return (
                                  <div
                                    key={`${b.id}-${m.user_id}`}
                                    className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12px]"
                                  >
                                    <div className="flex min-w-0 items-center gap-2">
                                      <UserAvatar
                                        src={avatarByLogin[memberLogin] || ""}
                                        alt={m.full_name}
                                        fallback={initials(m.full_name)}
                                        sizeClass="h-8 w-8"
                                        textClass="text-[10px]"
                                        className="shrink-0 border border-white bg-gradient-to-br from-[#eef2ff] to-[#f8fafc] shadow-sm"
                                        previewable
                                      />
                                      <div className="min-w-0">
                                        <div className="truncate font-extrabold text-slate-800">{m.full_name}</div>
                                        <div className="truncate text-[11px] font-bold text-slate-500">{withAt(m.nickname)}</div>
                                      </div>
                                    </div>
                                    <span className="shrink-0 text-[11px] font-extrabold text-[#6d5efc]">
                                      {role === "admin" ? phoneByLogin[memberLogin] || "-" : roleDisplay(m.role)}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </section>

            {localProfile.supervisor ? (
              <section className="rounded-[18px] border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)] lg:min-h-[450px]">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="text-[18px] font-black text-slate-900">Assigned Talents</div>
                  <div className="flex items-center gap-2">
                    {canManageAssignedTalents ? (
                      <button
                        type="button"
                        onClick={() => setTalentPickerOpen(true)}
                        className="inline-flex h-10 items-center gap-2 rounded-2xl border border-[#6d5efc]/18 bg-white/90 px-3.5 text-[13px] font-black text-[#6d5efc] shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition hover:-translate-y-[1px] hover:border-[#6d5efc]/28 hover:bg-[#f7f5ff]"
                      >
                        <AddTalentIcon size={15} />
                        Add talents
                      </button>
                    ) : null}
                    <span className="inline-flex h-7 items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 text-[11px] font-black text-slate-700">
                      {localProfile.supervisor?.assigned_students_overall || 0} total
                    </span>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-2 flex items-center justify-between text-[12px] font-bold text-slate-600">
                    <span>{localProfile.supervisor?.assigned_students_overall || 0} assigned</span>
                    <span>{boardRows.length} boards</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-200">
                    <div
                      className="h-2 rounded-full bg-gradient-to-r from-[#6d5efc] to-[#8f83ff]"
                      style={{
                        width: `${Math.max(
                          0,
                          Math.min(
                            100,
                            boardRows.length > 0
                              ? Math.round(
                                  (((localProfile.supervisor?.assigned_students || []).filter(
                                    (s) => (s.boards || []).length > 0
                                  ).length || 0) /
                                    Math.max(1, localProfile.supervisor?.assigned_students_overall || 1)) *
                                    100
                                )
                              : 0
                          )
                        )}%`,
                      }}
                    />
                  </div>
                  <div className="mt-1 text-right text-[11px] font-extrabold text-slate-600">
                    {(localProfile.supervisor?.assigned_students || []).filter((s) => (s.boards || []).length > 0).length}{" "}
                    linked to boards
                  </div>
                </div>

                <div className="mt-3 space-y-2 overflow-y-auto pr-1 lg:max-h-[300px]">
                  {(localProfile.supervisor?.assigned_students || []).length === 0 ? (
                    <div className="text-[13px] font-semibold text-slate-500">No assigned talents yet.</div>
                  ) : (
                    (localProfile.supervisor?.assigned_students || []).map((s) => {
                      const studentLogin = loginKey(s.nickname || s.email.split("@")[0]);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            if (role === "admin") nav(`/admin/users/${s.id}/profile`, { state: { backTo: currentProfileBackTo } });
                            else if (role === "supervisor") nav(`/profile/${s.id}`, { state: { backTo: currentProfileBackTo } });
                          }}
                          className={[
                            "w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-left transition",
                            role === "admin" || role === "supervisor"
                              ? "cursor-pointer hover:border-[#6d5efc]/30 hover:bg-[#f7f5ff]"
                              : "cursor-default",
                          ].join(" ")}
                          title={role === "admin" || role === "supervisor" ? "Open talent profile" : undefined}
                        >
                          <div className="flex min-w-0 items-start gap-2.5">
                            <UserAvatar
                              src={avatarByLogin[studentLogin] || ""}
                              alt={s.full_name}
                              fallback={initials(s.full_name)}
                              sizeClass="h-10 w-10"
                              textClass="text-[12px]"
                              className="shrink-0 border border-white bg-gradient-to-br from-[#eef2ff] to-[#f8fafc] shadow-sm"
                              previewable
                            />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[13px] font-black text-slate-900">{s.full_name}</div>
                              <div className="mt-0.5 truncate text-[12px] font-semibold text-slate-500">
                                {withAt(s.nickname)} • {role === "admin" ? phoneByLogin[studentLogin] || "-" : s.email}
                              </div>
                              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
                                {(s.boards || []).length === 0 ? (
                                  <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-slate-700">
                                    no board yet
                                  </span>
                                ) : (
                                  (s.boards || []).map((b) => (
                                    <span
                                      key={`${s.id}-${b.id}`}
                                      role="button"
                                      tabIndex={0}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openBoard(b.id);
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter" || e.key === " ") {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          openBoard(b.id);
                                        }
                                      }}
                                      className="rounded-full border border-[#6d5efc]/20 bg-[#6d5efc]/10 px-2 py-0.5 text-slate-700 transition hover:border-[#6d5efc]/35 hover:bg-[#6d5efc]/15 focus:outline-none focus:ring-2 focus:ring-[#6d5efc]/20"
                                    >
                                      {b.name}
                                    </span>
                                  ))
                                )}
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </section>
            ) : (
              <section className="rounded-[18px] border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)] lg:min-h-[450px]">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="text-[18px] font-black text-slate-900">Assigned Tasks</div>
                  <span className="inline-flex h-7 items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 text-[11px] font-black text-slate-700">
                    {localProfile.tasks?.total || 0} total
                  </span>
                </div>

                {(localProfile.student?.supervisors || []).length > 0 ? (
                  <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="mb-2 text-[13px] font-black text-slate-900">Supervisors</div>
                    <div className="flex flex-wrap gap-2">
                      {(localProfile.student?.supervisors || []).map((s) => (
                        <span
                          key={s.id}
                          className="inline-flex items-center gap-2 rounded-full border border-[#6d5efc]/20 bg-[#6d5efc]/10 px-2.5 py-1 text-[11px] font-black text-slate-800"
                        >
                          <span>{s.full_name}</span>
                          <span className="text-slate-500">{withAt(s.nickname)}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-2 flex items-center justify-between text-[12px] font-bold text-slate-600">
                    <span>{localProfile.tasks?.done || 0} done</span>
                    <span>{localProfile.tasks?.left || 0} left</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-200">
                    <div
                      className="h-2 rounded-full bg-gradient-to-r from-[#6d5efc] to-[#8f83ff]"
                      style={{ width: `${Math.max(0, Math.min(100, localProfile.tasks?.progress_pct || 0))}%` }}
                    />
                  </div>
                  <div className="mt-1 text-right text-[11px] font-extrabold text-slate-600">
                    {localProfile.tasks?.progress_pct || 0}% complete
                  </div>
                </div>

                <div className="mt-3 space-y-2 overflow-y-auto pr-1 lg:max-h-[300px]">
                  {(localProfile.tasks?.assigned_cards || []).length === 0 ? (
                    <div className="text-[13px] font-semibold text-slate-500">No assigned tasks yet.</div>
                  ) : (
                    (localProfile.tasks?.assigned_cards || []).map((t) => (
                      <div key={t.card_id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <div className="truncate text-[13px] font-black text-slate-900">{t.card_title}</div>
                        <div className="mt-0.5 text-[12px] font-semibold text-slate-500">{t.board_name}</div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
                          <span
                            className={
                              t.status === "done"
                                ? "rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-emerald-700"
                                : "rounded-full border border-slate-300 bg-white px-2 py-0.5 text-slate-700"
                            }
                          >
                            {t.status || "open"}
                          </span>
                          <span className="rounded-full border border-[#6d5efc]/20 bg-[#6d5efc]/10 px-2 py-0.5 text-slate-700">
                            {t.priority || "medium"}
                          </span>
                          <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-slate-700">
                            {t.subtasks_all > 0 ? `${t.subtasks_done}/${t.subtasks_all}` : "no checklist"}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            )}
          </div>

          {canViewPrivateNotes ? (
            <section className="rounded-[18px] border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-[18px] font-black text-slate-900">Private Supervisor Notes</div>
                  <div className="mt-1 text-[12px] font-bold text-slate-500">
                    Only supervisors and admins can see these notes. Talents cannot access them.
                  </div>
                </div>
                <span className="inline-flex h-7 items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 text-[11px] font-black text-slate-700">
                  {privateNotes.length} notes
                </span>
              </div>

              <div className="grid gap-3 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
                <div className="rounded-xl border border-[#6d5efc]/15 bg-[linear-gradient(180deg,#faf8ff_0%,#f6f7ff_100%)] p-3">
                  <div className="text-[12px] font-black uppercase tracking-[0.12em] text-[#6d5efc]">
                    Notes
                  </div>
                  <textarea
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    className="mt-3 min-h-[180px] w-full rounded-[14px] border border-slate-200 bg-white px-3 py-3 text-[13px] font-semibold text-slate-800 outline-none focus:border-[#6d5efc]/35 focus:ring-4 focus:ring-[#6d5efc]/10"
                    placeholder="Add a note about this talent."
                  />
                  <div className="mt-3 flex flex-wrap items-end justify-between gap-3 sm:flex-nowrap">
                    <div className="max-w-[220px] text-[11px] font-bold leading-5 text-slate-500">
                    </div>
                    <button
                      type="button"
                      onClick={addPrivateNote}
                      disabled={savingNote || !noteDraft.trim()}
                      className="inline-flex h-11 min-w-[136px] shrink-0 items-center justify-center whitespace-nowrap rounded-[14px] border border-[#6d5efc]/20 bg-[#6d5efc] px-5 text-[13px] font-black text-white transition hover:bg-[#5f50f6] disabled:opacity-60"
                    >
                      {savingNote ? "Saving..." : "Save note"}
                    </button>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div className="text-[13px] font-black uppercase tracking-[0.12em] text-slate-500">
                      Note history
                    </div>
                  </div>

                  {notesLoading ? (
                    <div className="text-[13px] font-semibold text-slate-500">Loading notes...</div>
                  ) : privateNotes.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-[13px] font-semibold text-slate-500">
                      No private notes yet for this talent.
                    </div>
                  ) : (
                    <div className="space-y-2 overflow-y-auto pr-1 lg:max-h-[320px]">
                      {privateNotes.map((note) => (
                        <div key={note.id} className="rounded-xl border border-slate-200 bg-white p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate text-[13px] font-black text-slate-900">{note.author_name}</div>
                              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-500">
                                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 capitalize">
                                  {roleDisplay(note.author_role || "staff")}
                                </span>
                                <span>{formatBahrainDateTime(note.created_at)}</span>
                              </div>
                            </div>
                          </div>
                          <div className="mt-3 whitespace-pre-wrap text-[13px] font-semibold leading-6 text-slate-700">
                            {note.body}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>
          ) : null}

          {canManageAssignedTalents && talentPickerOpen ? (
            <div
              className="fixed inset-0 z-[90] grid place-items-center bg-slate-900/40 p-4"
              onClick={() => setTalentPickerOpen(false)}
            >
              <div
                className="w-full max-w-[620px] rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_22px_60px_rgba(15,23,42,0.28)]"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[20px] font-black text-slate-900">Add talents</div>
                    <div className="mt-1 text-[12px] font-bold text-slate-500">
                      Only talents without a supervisor are shown.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTalentPickerOpen(false)}
                    className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-[13px] font-extrabold text-slate-700 transition hover:bg-slate-100"
                  >
                    Close
                  </button>
                </div>

                <div className="rounded-xl border border-[#6d5efc]/20 bg-[#f8f7ff] p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="text-[12px] font-black uppercase tracking-[0.1em] text-[#6d5efc]">
                      Available talents
                    </div>
                    <span className="rounded-full border border-white bg-white px-2.5 py-1 text-[11px] font-black text-slate-600">
                      {visibleTalentResults.length} shown
                    </span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_180px]">
                    <input
                      autoFocus
                      value={talentSearch}
                      onChange={(e) => setTalentSearch(e.target.value)}
                      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-bold text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-[#6d5efc]/35 focus:ring-4 focus:ring-[#6d5efc]/10"
                      placeholder="Search available talents..."
                    />
                    <select
                      value={talentCohortFilter}
                      onChange={(e) => setTalentCohortFilter(e.target.value)}
                      className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-bold text-slate-800 outline-none transition focus:border-[#6d5efc]/35 focus:ring-4 focus:ring-[#6d5efc]/10"
                    >
                      <option value="all">All cohorts</option>
                      {talentCohorts.map((cohort) => (
                        <option key={cohort} value={cohort}>
                          {cohort}
                        </option>
                      ))}
                    </select>
                  </div>
                  {assignTalentErr ? (
                    <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-bold text-red-700">
                      {assignTalentErr}
                    </div>
                  ) : null}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setVisibleTalentSelection(visibleTalentResults.some((student) => !selectedTalentIDs.has(student.id)))}
                      disabled={visibleTalentResults.length === 0}
                      className="inline-flex h-9 items-center rounded-xl border border-slate-200 bg-white px-3 text-[12px] font-black text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {visibleTalentResults.length > 0 && visibleTalentResults.every((student) => selectedTalentIDs.has(student.id))
                        ? "Clear shown"
                        : "Select shown"}
                    </button>
                    <div className="text-[12px] font-black text-slate-600">
                      {selectedTalentIDs.size} selected
                    </div>
                  </div>
                  <div className="mt-3 max-h-[360px] space-y-2 overflow-y-auto pr-1">
                    {talentsLoading ? (
                      <div className="rounded-xl border border-slate-200 bg-white px-3 py-4 text-[13px] font-bold text-slate-500">
                        Loading talents...
                      </div>
                    ) : visibleTalentResults.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-300 bg-white px-3 py-6 text-center text-[13px] font-bold text-slate-500">
                        No available talents found.
                      </div>
                    ) : (
                      visibleTalentResults.map((student) => {
                        const studentLogin = loginKey(student.nickname || student.email.split("@")[0]);
                        const checked = selectedTalentIDs.has(student.id);
                        return (
                          <button
                            key={student.id}
                            type="button"
                            onClick={() => toggleSelectedTalent(student.id)}
                            className={[
                              "flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition",
                              checked
                                ? "border-[#6d5efc]/35 bg-white shadow-[0_10px_24px_rgba(109,94,252,0.10)]"
                                : "border-slate-200 bg-white hover:border-[#6d5efc]/30",
                            ].join(" ")}
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <span
                                className={[
                                  "grid h-5 w-5 shrink-0 place-items-center rounded-md border text-white transition",
                                  checked ? "border-[#6d5efc] bg-[#6d5efc]" : "border-slate-300 bg-white",
                                ].join(" ")}
                                aria-hidden="true"
                              >
                                {checked ? (
                                  <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none">
                                    <path d="M4.5 10.5 8 14l7.5-8" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                ) : null}
                              </span>
                              <UserAvatar
                                src={avatarByLogin[studentLogin] || ""}
                                alt={student.full_name}
                                fallback={initials(student.full_name)}
                                sizeClass="h-10 w-10"
                                textClass="text-[12px]"
                                className="shrink-0 border border-white bg-gradient-to-br from-[#eef2ff] to-[#f8fafc] shadow-sm"
                                previewable
                              />
                              <div className="min-w-0">
                                <div className="truncate text-[14px] font-black text-slate-900">{student.full_name}</div>
                                <div className="truncate text-[12px] font-semibold text-slate-500">
                                  {withAt(student.nickname)} • {normalizeCohort(student.cohort) || "No cohort"}
                                </div>
                              </div>
                            </div>
                            <span className="shrink-0 rounded-full border border-[#6d5efc]/20 bg-[#6d5efc]/10 px-3 py-1 text-[12px] font-black text-[#6d5efc]">
                              {checked ? "Selected" : "Select"}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={assignSelectedTalents}
                      disabled={selectedTalentIDs.size === 0 || assigningTalents}
                      className="inline-flex h-10 items-center gap-2 rounded-2xl border border-[#6d5efc]/18 bg-white px-4 text-[13px] font-black text-[#6d5efc] shadow-[0_10px_24px_rgba(15,23,42,0.05)] transition hover:-translate-y-[1px] hover:border-[#6d5efc]/28 hover:bg-[#f7f5ff] disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                    >
                      {assigningTalents ? "Adding..." : `Add ${selectedTalentIDs.size || ""} talents`}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {canCreateProfileBoard && createBoardOpen ? (
            <div
              className="fixed inset-0 z-[90] grid place-items-center bg-slate-900/40 p-4"
              onClick={() => setCreateBoardOpen(false)}
            >
              <div
                className="w-full max-w-[980px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_22px_60px_rgba(15,23,42,0.28)]"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
                  <div className="text-[16px] font-black text-slate-900">Create board</div>
                  <button
                    type="button"
                    onClick={() => setCreateBoardOpen(false)}
                    className="h-10 rounded-2xl border border-slate-200 bg-white px-4 text-[13px] font-black text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
                  >
                    Close
                  </button>
                </div>

                <div className="grid gap-4 p-5">
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
                          <div className="flex h-11 items-center rounded-[14px] border border-[#6d5efc]/18 bg-[#f7f5ff] px-3 text-[14px] font-black text-slate-900">
                            {supervisorsLoading
                              ? "Loading workspace..."
                              : selectedProfileSupervisor?.nickname
                                ? `${selectedProfileSupervisor.full_name} (@${selectedProfileSupervisor.nickname})`
                                : selectedProfileSupervisor?.full_name || "Supervisor workspace"}
                          </div>
                        </label>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="grid gap-1.5">
                            <span className="text-[12px] font-black uppercase tracking-[0.08em] text-slate-500">Model</span>
                            <select
                              value={selectedTrack}
                              onChange={(e) => setSelectedTrack((e.target.value as ProjectTrack) || "")}
                              disabled={!selectedProfileSupervisor}
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
                              disabled={!selectedProfileSupervisor || !selectedTrack}
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

                        {selectedProfileSupervisor && selectedProject ? (
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
                            autoFocus
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
                          {selectedBoardMemberIDs.size} selected
                        </span>
                      </div>
                      <div className="mb-3 text-[12px] font-semibold text-slate-500">
                        Pick members from the selected supervisor&apos;s assigned students.
                      </div>

                      {(localProfile.supervisor?.assigned_students || []).length === 0 ? (
                        <div className="rounded-[14px] border border-slate-200 bg-slate-50/80 px-3 py-3 text-[13px] font-semibold text-slate-500">
                          This supervisor has no assigned students yet.
                        </div>
                      ) : (
                        <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1 [scrollbar-width:thin]">
                          {(localProfile.supervisor?.assigned_students || []).map((student) => {
                            const checked = selectedBoardMemberIDs.has(student.id);
                            const studentLogin = loginKey(student.nickname || student.email.split("@")[0]);
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
                                  onChange={() => toggleSelectedBoardMember(student.id)}
                                  className="h-4 w-4"
                                />
                                <UserAvatar
                                  src={avatarByLogin[studentLogin] || ""}
                                  alt={student.full_name}
                                  fallback={initials(student.full_name)}
                                  className="bg-slate-50"
                                  previewable
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-[14px] font-black text-slate-900">{student.full_name}</div>
                                  <div className="mt-0.5 truncate text-[12px] font-extrabold text-[#6d5efc]">
                                    {withAt(student.nickname)}
                                  </div>
                                  <div className="mt-1 flex flex-wrap items-center gap-2">
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

                <div className="flex justify-end gap-2 border-t border-slate-200 bg-white px-5 py-3">
                  <button
                    type="button"
                    onClick={() => setCreateBoardOpen(false)}
                    className="inline-flex h-10 items-center rounded-2xl border border-slate-200 bg-white px-4 text-[13px] font-black text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={createProfileBoard}
                    disabled={!selectedProfileSupervisor || !boardName.trim() || creatingBoard}
                    className="inline-flex h-10 items-center gap-2 rounded-2xl border border-[#6d5efc]/18 bg-white px-4 text-[13px] font-black text-[#6d5efc] shadow-[0_10px_24px_rgba(15,23,42,0.05)] transition hover:-translate-y-[1px] hover:border-[#6d5efc]/28 hover:bg-[#f7f5ff] disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    {creatingBoard ? "Creating..." : "Create board"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </AdminLayout>
  );
}

function AddTalentIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M15 19a6 6 0 0 0-12 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" stroke="currentColor" strokeWidth="2" />
      <path d="M19 8v6M16 11h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function BoardIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="3" stroke="currentColor" strokeWidth="2" />
      <path d="M8 8h8M8 12h5M8 16h7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function Info({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-[12px] border border-slate-200 bg-slate-50 px-3 py-2.5">
      <div className="text-[10px] font-black uppercase tracking-[0.09em] text-slate-500">{label}</div>
      <div className="mt-1 flex items-center gap-1.5 truncate text-[13px] font-black text-slate-900">
        {icon}
        <span className="truncate">{value}</span>
      </div>
    </div>
  );
}

function SnapshotItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <div className="text-[11px] font-black uppercase tracking-[0.07em] text-slate-500">{label}</div>
      <div className="mt-1 text-[18px] font-black tracking-[-0.02em] text-slate-900">{value}</div>
    </div>
  );
}

function AvatarPlaceholder({
  name,
  gender,
  avatarUrl,
}: {
  name: string;
  gender: "male" | "female" | "unspecified";
  avatarUrl?: string;
}) {
  const isFemale = gender === "female";
  const tone = isFemale
    ? "from-[#ffe4ef] via-[#f0e6ff] to-[#e2e8ff]"
    : "from-[#dff2ff] via-[#e8ecff] to-[#ecf3ff]";

  return (
    <div className={`relative grid h-20 w-20 flex-none place-items-center rounded-full border border-slate-200 bg-gradient-to-br ${tone}`}>
      <UserAvatar
        src={avatarUrl}
        alt={name}
        fallback={initials(name)}
        sizeClass="h-full w-full"
        textClass="text-[22px]"
        className={`border-0 bg-gradient-to-br ${tone}`}
        previewable
      />
      <div className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full border border-white bg-white shadow-sm">
        <GenderIcon gender={gender} />
      </div>
    </div>
  );
}

function GenderIcon({ gender }: { gender: "male" | "female" | "unspecified" }) {
  const common = "h-4 w-4";
  if (gender === "female") {
    return (
      <svg viewBox="0 0 24 24" className={common} fill="none" aria-hidden="true">
        <circle cx="12" cy="8" r="4.5" stroke="#7c3aed" strokeWidth="2" />
        <path d="M12 12.5V21M8 17h8" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  if (gender === "male") {
    return (
      <svg viewBox="0 0 24 24" className={common} fill="none" aria-hidden="true">
        <circle cx="9" cy="15" r="4.5" stroke="#2563eb" strokeWidth="2" />
        <path d="M13 11l6-6M14.5 5H19v4.5" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={common} fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="5" stroke="#64748b" strokeWidth="2" />
      <path d="M12 7v10M7 12h10" stroke="#64748b" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
