import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import AdminLayout from "../components/AdminLayout";
import UserAvatar from "../components/UserAvatar";
import { apiFetch } from "../lib/api";
import { useAuth } from "../lib/auth";
import { fetchRebootAvatars } from "../lib/rebootAvatars";
import { useConfirm } from "../lib/useConfirm";

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

type MeetingParticipant = {
  meeting_id: number;
  user_id: number;
  full_name: string;
  nickname: string;
  email: string;
  role: string;
  role_in_board: string;
  rsvp_status: "pending" | "going" | "maybe" | "cant";
  attendance_status: "pending" | "attended" | "late" | "missed";
  updated_at: string;
};

type BoardRow = {
  id: number;
  name: string;
  description: string;
  supervisor_name: string;
  supervisor_user_id: number;
};

type BoardMember = {
  user_id: number;
  full_name: string;
  nickname: string;
  email: string;
  role: string;
  role_in_board: string;
};

type SupervisorRow = {
  supervisor_user_id: number;
  full_name: string;
  email: string;
  nickname?: string;
  file_id: number;
  created_at: string;
};

type SupervisorOption = {
  id: number;
  name: string;
};

type ProfileSummary = {
  user?: {
    id?: number;
    role?: string;
  };
};

type CalendarConnection = {
  id: number;
  user_id: number;
  provider: "google" | "microsoft";
  external_email: string;
  calendar_id: string;
  calendar_name: string;
  status: string;
  last_synced_at: string;
  last_conflict_at: string;
  last_error: string;
  created_at: string;
  updated_at: string;
};

const MEETING_LOCATIONS = ["Online", "Sandbox", "Quest", "Pixel", "Bim", "Snap", "Other"] as const;

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message || fallback : fallback;
}

function normalizeMeetingLocation(value: string) {
  return MEETING_LOCATIONS.includes(value as (typeof MEETING_LOCATIONS)[number]) ? value : "Online";
}

function initialsOf(name: string) {
  return String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "U";
}

function loginOf(user: { nickname?: string; email?: string }) {
  const nickname = String(user.nickname || "").trim().replace(/^@/, "");
  if (nickname) return nickname.toLowerCase();
  return String(user.email || "").split("@")[0]?.trim().toLowerCase() || "";
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function toLocalDateInput(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function monthLabel(date: Date) {
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function dayLabel(date: Date) {
  return date.toLocaleDateString(undefined, { weekday: "short" });
}

function formatTimeRange(startISO: string, endISO: string) {
  const start = new Date(startISO);
  const end = new Date(endISO);
  return `${start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} - ${end.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function sameMonth(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function titleForRole(role: string) {
  if (role === "admin") return "Meetings";
  if (role === "supervisor") return "My Meetings";
  return "My Calendar";
}

function subtitleForRole(role: string) {
  if (role === "admin") return "Track bookings, attendance, RSVP, and meeting outcomes.";
  if (role === "supervisor") return "Schedule meetings, manage attendance, and capture outcomes.";
  return "See your meeting schedule and confirm attendance.";
}

function PencilIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 20h9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BinIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 6h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M19 6v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 10v6M14 10v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function CircleCheckIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M8 12.5 10.8 15 16.2 9.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SlashCircleIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M8.5 15.5 15.5 8.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ChevronDownIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function MeetingsCalendarPage() {
  const nav = useNavigate();
  const location = useLocation();
  const { role, email, login } = useAuth();
  const [resolvedRole, setResolvedRole] = useState<string>(role);
  const effectiveRole = resolvedRole || role;
  const isEffectiveAdmin = effectiveRole === "admin";
  const isEffectiveSupervisor = effectiveRole === "supervisor";
  const canCreate = isEffectiveAdmin || isEffectiveSupervisor;
  const canManage = isEffectiveAdmin || isEffectiveSupervisor;
  const actorRole = effectiveRole;
  const { confirm, dialog: confirmDialog } = useConfirm();
  const currentBackTo = `${location.pathname}${location.search}`;

  const [meetings, setMeetings] = useState<MeetingRow[]>([]);
  const [boards, setBoards] = useState<BoardRow[]>([]);
  const [supervisors, setSupervisors] = useState<SupervisorRow[]>([]);
  const [participantsByMeeting, setParticipantsByMeeting] = useState<Record<number, MeetingParticipant[]>>({});
  const [participantsLoading, setParticipantsLoading] = useState<Record<number, boolean>>({});
  const [boardMembersByBoard, setBoardMembersByBoard] = useState<Record<number, BoardMember[]>>({});
  const [boardMembersLoading, setBoardMembersLoading] = useState<Record<number, boolean>>({});
  const [avatarByLogin, setAvatarByLogin] = useState<Record<string, string>>({});
  const [currentUserID, setCurrentUserID] = useState(0);
  const [calendarConnections, setCalendarConnections] = useState<CalendarConnection[]>([]);
  const [selectedBoardFilter, setSelectedBoardFilter] = useState("all");
  const [selectedSupervisorFilter, setSelectedSupervisorFilter] = useState("all");
  const [composerSupervisorID, setComposerSupervisorID] = useState("");
  const [selectedDate, setSelectedDate] = useState(toLocalDateInput());
  const [selectedMeetingID, setSelectedMeetingID] = useState<number | null>(null);
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingMeetingID, setDeletingMeetingID] = useState<number | null>(null);
  const [showComposer, setShowComposer] = useState(false);
  const [editingMeetingID, setEditingMeetingID] = useState<number | null>(null);
  const [savingParticipantKey, setSavingParticipantKey] = useState("");
  const [savingOutcome, setSavingOutcome] = useState(false);
  const [showCalendarLinker, setShowCalendarLinker] = useState(false);
  const [calendarEmail, setCalendarEmail] = useState(email || "");
  const [connectingProvider, setConnectingProvider] = useState<"" | "google" | "microsoft">("");
  const [disconnectingProvider, setDisconnectingProvider] = useState<"" | "google" | "microsoft">("");
  const [calendarNotice, setCalendarNotice] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    board_id: "",
    title: "",
    location: "Online",
    notes: "",
    date: toLocalDateInput(),
    start_time: "10:00",
    end_time: "11:00",
  });
  const [outcomeDraft, setOutcomeDraft] = useState("");

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [meetingsRes, boardsRes, supervisorsRes, profileRes, connectionsRes] = await Promise.all([
        apiFetch("/admin/meetings"),
        apiFetch("/admin/all-boards"),
        apiFetch("/admin/supervisors"),
        apiFetch("/admin/profile/summary"),
        apiFetch("/admin/calendar/connections"),
      ]);
      const nextMeetings = Array.isArray(meetingsRes) ? meetingsRes : [];
      setMeetings(nextMeetings);
      setBoards(Array.isArray(boardsRes) ? boardsRes : []);
      setSupervisors(Array.isArray(supervisorsRes) ? supervisorsRes : []);
      const nextRole = String((profileRes as ProfileSummary)?.user?.role || role).trim().toLowerCase();
      setResolvedRole(nextRole || role);
      setCurrentUserID(Number((profileRes as ProfileSummary)?.user?.id || 0));
      setCalendarConnections(Array.isArray(connectionsRes) ? connectionsRes : []);
    } catch (e: unknown) {
      setError(errorMessage(e, "Failed to load meetings"));
      setMeetings([]);
      setBoards([]);
      setSupervisors([]);
      setResolvedRole(role);
      setCurrentUserID(0);
      setCalendarConnections([]);
    } finally {
      setLoading(false);
    }
  }, [role]);

  const loadParticipants = useCallback(async (meetingID: number) => {
    setParticipantsLoading((prev) => ({ ...prev, [meetingID]: true }));
    try {
      const res = await apiFetch(`/admin/meeting-participants?meeting_id=${meetingID}`);
      setParticipantsByMeeting((prev) => ({ ...prev, [meetingID]: Array.isArray(res) ? res : [] }));
    } catch {
      setParticipantsByMeeting((prev) => ({ ...prev, [meetingID]: [] }));
    } finally {
      setParticipantsLoading((prev) => ({ ...prev, [meetingID]: false }));
    }
  }, []);

  const loadBoardMembers = useCallback(async (boardID: number) => {
    if (!boardID || boardMembersByBoard[boardID] || boardMembersLoading[boardID]) return;
    setBoardMembersLoading((prev) => ({ ...prev, [boardID]: true }));
    try {
      const res = await apiFetch(`/admin/board-members?board_id=${boardID}`);
      setBoardMembersByBoard((prev) => ({ ...prev, [boardID]: Array.isArray(res) ? res : [] }));
    } catch {
      setBoardMembersByBoard((prev) => ({ ...prev, [boardID]: [] }));
    } finally {
      setBoardMembersLoading((prev) => ({ ...prev, [boardID]: false }));
    }
  }, [boardMembersByBoard, boardMembersLoading]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    function handleCalendarLinkMessage(event: MessageEvent) {
      const payload = event.data as { type?: string; status?: string; message?: string } | null;
      if (!payload || payload.type !== "taskflow:calendar-link") return;
      if (payload.status === "success") {
        setCalendarNotice(payload.message || "Calendar linked.");
        setError("");
        setShowCalendarLinker(false);
        void loadAll();
      } else {
        setError(payload.message || "Failed to link calendar");
      }
      setConnectingProvider("");
    }

    window.addEventListener("message", handleCalendarLinkMessage);
    return () => window.removeEventListener("message", handleCalendarLinkMessage);
  }, [loadAll]);

  const boardOptions = useMemo(() => {
    const seen = new Map<number, BoardRow>();
    boards.forEach((board) => seen.set(board.id, board));
    meetings.forEach((meeting) => {
      if (!seen.has(meeting.board_id)) {
        seen.set(meeting.board_id, {
          id: meeting.board_id,
          name: meeting.board_name,
          description: "",
          supervisor_name: meeting.supervisor_name,
          supervisor_user_id: meeting.supervisor_id,
        });
      }
    });
    return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [boards, meetings]);

  const composerBoardOptions = useMemo(() => {
    if (isEffectiveSupervisor) return boardOptions;
    if (!composerSupervisorID) return [];
    return boardOptions.filter((board) => String(board.supervisor_user_id) === composerSupervisorID);
  }, [boardOptions, composerSupervisorID, isEffectiveSupervisor]);

  const selectedBoardMembers = useMemo(() => {
    const boardID = Number(form.board_id);
    if (!boardID) return [];
    return (boardMembersByBoard[boardID] || []).filter((member) => (member.role || "").toLowerCase() !== "supervisor");
  }, [boardMembersByBoard, form.board_id]);

  useEffect(() => {
    const boardID = Number(form.board_id);
    if (showComposer && boardID) {
      void loadBoardMembers(boardID);
    }
  }, [form.board_id, loadBoardMembers, showComposer]);

  const supervisorOptions = useMemo(() => {
    const seen = new Map<number, SupervisorOption>();
    supervisors.forEach((supervisor) => {
      if (!seen.has(supervisor.supervisor_user_id)) {
        seen.set(supervisor.supervisor_user_id, {
          id: supervisor.supervisor_user_id,
          name: supervisor.full_name,
        });
      }
    });
    meetings.forEach((meeting) => {
      if (!seen.has(meeting.supervisor_id)) {
        seen.set(meeting.supervisor_id, {
          id: meeting.supervisor_id,
          name: meeting.supervisor_name,
        });
      }
    });
    return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [meetings, supervisors]);

  const defaultComposerSupervisorID = useCallback(() => {
    if (!isEffectiveAdmin) return "";
    if (currentUserID > 0 && supervisorOptions.some((supervisor) => supervisor.id === currentUserID)) {
      return String(currentUserID);
    }
    const byLogin = supervisorOptions.find((supervisor) => {
      const row = supervisors.find((item) => item.supervisor_user_id === supervisor.id);
      const rowEmail = String(row?.email || "").trim().toLowerCase();
      const rowLogin = String(row?.nickname || "").trim().replace(/^@/, "").toLowerCase();
      return (email && rowEmail === email.toLowerCase()) || (login && rowLogin === login.toLowerCase());
    });
    return byLogin ? String(byLogin.id) : "";
  }, [currentUserID, email, isEffectiveAdmin, login, supervisorOptions, supervisors]);

  const filteredBoardOptions = useMemo(() => {
    if (selectedSupervisorFilter === "all") {
      return boardOptions;
    }

    const selectedSupervisor = supervisorOptions.find(
      (supervisor) => String(supervisor.id) === selectedSupervisorFilter
    );
    const selectedName = (selectedSupervisor?.name || "").trim().toLowerCase();
    const allowedBoardIDs = new Set(
      meetings
        .filter((meeting) => String(meeting.supervisor_id) === selectedSupervisorFilter)
        .map((meeting) => meeting.board_id)
    );

    return boardOptions.filter((board) => {
      if (allowedBoardIDs.has(board.id)) return true;
      return selectedName !== "" && board.supervisor_name.trim().toLowerCase() === selectedName;
    });
  }, [boardOptions, meetings, selectedSupervisorFilter, supervisorOptions]);

  useEffect(() => {
    if (selectedBoardFilter === "all") return;
    const stillVisible = filteredBoardOptions.some(
      (board) => String(board.id) === selectedBoardFilter
    );
    if (!stillVisible) {
      setSelectedBoardFilter("all");
    }
  }, [filteredBoardOptions, selectedBoardFilter]);

  const filteredMeetings = useMemo(() => {
    return meetings
      .filter((meeting) => selectedSupervisorFilter === "all" || String(meeting.supervisor_id) === selectedSupervisorFilter)
      .filter((meeting) => selectedBoardFilter === "all" || String(meeting.board_id) === selectedBoardFilter)
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  }, [meetings, selectedBoardFilter, selectedSupervisorFilter]);

  const meetingsByDay = useMemo(() => {
    const map = new Map<string, MeetingRow[]>();
    filteredMeetings.forEach((meeting) => {
      const key = dateKey(new Date(meeting.starts_at));
      const bucket = map.get(key) || [];
      bucket.push(meeting);
      map.set(key, bucket);
    });
    return map;
  }, [filteredMeetings]);

  const selectedDayMeetings = useMemo(() => meetingsByDay.get(selectedDate) || [], [meetingsByDay, selectedDate]);

  const selectedMeeting = useMemo(
    () => selectedMeetingID ? filteredMeetings.find((meeting) => meeting.id === selectedMeetingID) || null : null,
    [filteredMeetings, selectedMeetingID]
  );

  const selectedMeetingParticipants = useMemo(() => {
    const rows = selectedMeeting ? participantsByMeeting[selectedMeeting.id] || [] : [];
    return rows;
  }, [participantsByMeeting, selectedMeeting]);

  const selectedDayParticipants = useMemo(() => {
    return selectedDayMeetings.flatMap((meeting) => participantsByMeeting[meeting.id] || []);
  }, [participantsByMeeting, selectedDayMeetings]);

  useEffect(() => {
    selectedDayMeetings.forEach((meeting) => {
      if (!participantsByMeeting[meeting.id] && !participantsLoading[meeting.id]) {
        void loadParticipants(meeting.id);
      }
    });
  }, [loadParticipants, participantsByMeeting, participantsLoading, selectedDayMeetings]);

  useEffect(() => {
    let alive = true;
    const logins = Array.from(
      new Set(
        [...selectedMeetingParticipants, ...selectedDayParticipants, ...selectedBoardMembers]
          .map((user) => loginOf(user))
          .filter(Boolean)
      )
    );
    if (logins.length === 0) return;
    fetchRebootAvatars(logins)
      .then((next) => {
        if (alive) setAvatarByLogin((prev) => ({ ...prev, ...next }));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [selectedBoardMembers, selectedDayParticipants, selectedMeetingParticipants]);

  useEffect(() => {
    if (!selectedMeeting) {
      setOutcomeDraft("");
      return;
    }
    setOutcomeDraft(selectedMeeting.outcome_notes || "");
    if (!participantsByMeeting[selectedMeeting.id]) {
      loadParticipants(selectedMeeting.id);
    }
  }, [loadParticipants, participantsByMeeting, selectedMeeting]);

  const monthDays = useMemo(() => {
    const first = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    const start = new Date(first);
    start.setDate(first.getDate() - first.getDay());
    const days: Date[] = [];
    for (let i = 0; i < 42; i += 1) {
      const next = new Date(start);
      next.setDate(start.getDate() + i);
      days.push(next);
    }
    return days;
  }, [currentMonth]);

  const stats = useMemo(() => {
    const now = Date.now();
    const upcoming = filteredMeetings.filter((meeting) => meeting.status === "scheduled" && new Date(meeting.ends_at).getTime() >= now).length;
    const thisMonth = filteredMeetings.filter((meeting) => sameMonth(new Date(meeting.starts_at), currentMonth)).length;
    const conflicts = filteredMeetings.filter((meeting) => meeting.status === "canceled").length;
    return { total: filteredMeetings.length, upcoming, thisMonth, conflicts };
  }, [filteredMeetings, currentMonth]);

  const linkedCalendarProviders = useMemo(
    () => calendarConnections.map((connection) => connection.provider),
    [calendarConnections]
  );

  async function submitMeeting(e: FormEvent) {
    e.preventDefault();
    if (!form.board_id) {
      setError("Choose a board first.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const startsAt = new Date(`${form.date}T${form.start_time}`);
      const endsAt = new Date(`${form.date}T${form.end_time}`);
      await apiFetch(editingMeetingID ? "/admin/meetings/update" : "/admin/meetings", {
        method: "POST",
        body: JSON.stringify({
          meeting_id: editingMeetingID,
          board_id: Number(form.board_id),
          title: form.title.trim(),
          location: form.location.trim(),
          notes: form.notes.trim(),
          starts_at: startsAt.toISOString(),
          ends_at: endsAt.toISOString(),
        }),
      });
      closeComposer();
      setSelectedDate(form.date);
      setCurrentMonth(new Date(`${form.date}T00:00:00`));
      await loadAll();
    } catch (e: unknown) {
      setError(errorMessage(e, "Failed to save meeting"));
    } finally {
      setSaving(false);
    }
  }

  function startCreateMeeting() {
    setEditingMeetingID(null);
    setComposerSupervisorID(defaultComposerSupervisorID());
    setForm({
      board_id: "",
      title: "",
      location: "Online",
      notes: "",
      date: selectedDate,
      start_time: "10:00",
      end_time: "11:00",
    });
    setShowComposer(true);
  }

  function startEditMeeting(meeting: MeetingRow) {
    const start = new Date(meeting.starts_at);
    const end = new Date(meeting.ends_at);
    setEditingMeetingID(meeting.id);
    setSelectedMeetingID(null);
    setComposerSupervisorID(String(meeting.supervisor_id || ""));
    setForm({
      board_id: String(meeting.board_id),
      title: meeting.title,
      location: normalizeMeetingLocation(meeting.location),
      notes: meeting.notes || "",
      date: toLocalDateInput(start),
      start_time: `${pad(start.getHours())}:${pad(start.getMinutes())}`,
      end_time: `${pad(end.getHours())}:${pad(end.getMinutes())}`,
    });
    setShowComposer(true);
  }

  function closeComposer() {
    setShowComposer(false);
    setEditingMeetingID(null);
  }

  async function deleteMeeting(meeting: MeetingRow) {
    if (deletingMeetingID !== null) return;
    const ok = await confirm({
      title: "Delete meeting",
      message: `Delete "${meeting.title}"? This cannot be undone.`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;

    setDeletingMeetingID(meeting.id);
    setError("");
    try {
      await apiFetch("/admin/meetings/delete", {
        method: "POST",
        body: JSON.stringify({ meeting_id: meeting.id }),
      });
      await loadAll();
    } catch (e: unknown) {
      setError(errorMessage(e, "Failed to delete meeting"));
    } finally {
      setDeletingMeetingID(null);
    }
  }

  async function updateMeetingStatus(meeting: MeetingRow, status: "scheduled" | "completed" | "canceled") {
    setSavingOutcome(true);
    setError("");
    try {
      await apiFetch("/admin/meetings/status", {
        method: "POST",
        body: JSON.stringify({
          meeting_id: meeting.id,
          status,
          outcome_notes: outcomeDraft.trim(),
        }),
      });
      await loadAll();
    } catch (e: unknown) {
      setError(errorMessage(e, "Failed to update meeting status"));
    } finally {
      setSavingOutcome(false);
    }
  }

  async function saveParticipant(meetingID: number, participant: MeetingParticipant, nextRSVP: string, nextAttendance: string) {
    const key = `${meetingID}:${participant.user_id}`;
    setSavingParticipantKey(key);
    setError("");
    try {
      await apiFetch("/admin/meeting-participants/update", {
        method: "POST",
        body: JSON.stringify({
          meeting_id: meetingID,
          user_id: participant.user_id,
          rsvp_status: nextRSVP,
          attendance_status: nextAttendance,
        }),
      });
      await loadParticipants(meetingID);
    } catch (e: unknown) {
      setError(errorMessage(e, "Failed to update participant"));
    } finally {
      setSavingParticipantKey("");
    }
  }

  function openUserProfile(userID: number) {
    if (!userID) return;
    if (isEffectiveAdmin) {
      nav(`/admin/users/${userID}/profile`, { state: { backTo: currentBackTo } });
      return;
    }
    if (isEffectiveSupervisor) {
      nav(`/profile/${userID}`, { state: { backTo: currentBackTo } });
    }
  }

  async function startCalendarLink(provider: "google" | "microsoft") {
    setConnectingProvider(provider);
    setError("");
    try {
      const res = await apiFetch("/admin/calendar/connections/start", {
        method: "POST",
        body: JSON.stringify({
          provider,
          email: calendarEmail.trim(),
        }),
      });
      const authURL = String((res as { auth_url?: string }).auth_url || "");
      if (!authURL) {
        throw new Error("Failed to start calendar linking");
      }
      const popup = window.open(authURL, "taskflow-calendar-link", "popup=yes,width=620,height=760");
      if (!popup) {
        window.location.href = authURL;
      }
    } catch (e: unknown) {
      setError(errorMessage(e, "Failed to start calendar linking"));
    } finally {
      setConnectingProvider("");
    }
  }

  async function disconnectCalendar(provider: "google" | "microsoft") {
    setDisconnectingProvider(provider);
    setError("");
    try {
      await apiFetch("/admin/calendar/connections/disconnect", {
        method: "POST",
        body: JSON.stringify({ provider }),
      });
      setCalendarNotice(`${provider === "google" ? "Google Calendar" : "Outlook Calendar"} disconnected.`);
      await loadAll();
    } catch (e: unknown) {
      setError(errorMessage(e, "Failed to disconnect calendar"));
    } finally {
      setDisconnectingProvider("");
    }
  }

  return (
    <>
      {confirmDialog}
      <AdminLayout
        active="meetings"
        title={titleForRole(effectiveRole)}
        subtitle={subtitleForRole(effectiveRole)}
        right={
          canCreate ? (
            <button
              type="button"
              onClick={startCreateMeeting}
              className="h-10 rounded-[14px] border border-amber-300 bg-gradient-to-br from-amber-400 to-orange-400 px-4 text-[13px] font-black text-white shadow-[0_14px_34px_rgba(245,158,11,0.24)] transition hover:-translate-y-[1px]"
            >
              Book Meeting
            </button>
          ) : null
        }
      >
        {error ? (
          <div className="mb-4 rounded-[16px] border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-semibold text-red-700">
            {error}
          </div>
        ) : null}
        {!error && calendarNotice ? (
          <div className="mb-4 rounded-[16px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] font-semibold text-emerald-700">
            {calendarNotice}
          </div>
        ) : null}

        <div className="meetings-page">
        <section className="mb-4 flex min-w-0 flex-wrap items-center gap-2.5">
          <select
            value={selectedSupervisorFilter}
            onChange={(e) => setSelectedSupervisorFilter(e.target.value)}
            className="h-12 min-w-0 flex-1 rounded-2xl border border-slate-200/90 bg-white/90 px-4 text-[14px] font-bold text-slate-800 shadow-[0_10px_24px_rgba(15,23,42,0.05)] outline-none backdrop-blur focus:border-[#6d5efc]/24 focus:ring-4 focus:ring-[#6d5efc]/10 sm:w-[200px] sm:flex-none"
          >
            <option value="all">All supervisors</option>
            {supervisorOptions.map((supervisor) => (
              <option key={supervisor.id} value={supervisor.id}>{supervisor.name}</option>
            ))}
          </select>
          <select
            value={selectedBoardFilter}
            onChange={(e) => setSelectedBoardFilter(e.target.value)}
            className="h-12 min-w-0 flex-1 rounded-2xl border border-slate-200/90 bg-white/90 px-4 text-[14px] font-bold text-slate-800 shadow-[0_10px_24px_rgba(15,23,42,0.05)] outline-none backdrop-blur focus:border-[#6d5efc]/24 focus:ring-4 focus:ring-[#6d5efc]/10 sm:w-[200px] sm:flex-none"
          >
            <option value="all">All boards</option>
            {filteredBoardOptions.map((board) => (
              <option key={board.id} value={board.id}>{board.name}</option>
            ))}
          </select>
          {/* <div className="rounded-[14px] border border-slate-200 bg-white px-4 py-3 text-[13px] font-semibold text-slate-600">
            {isEffectiveSupervisor ? "You can schedule, reschedule, cancel, and manage attendance for your boards." : isEffectiveAdmin ? "Admin sees all meeting attendance and outcomes." : "Update your RSVP so supervisors can plan around attendance."}
          </div> */}
          <button
            type="button"
            onClick={() => {
              setCalendarEmail(email || "");
              setCalendarNotice("");
              setShowCalendarLinker(true);
            }}
            className="h-12 rounded-2xl border border-slate-200/90 bg-white/90 px-4 text-[14px] font-black text-slate-700 shadow-[0_10px_24px_rgba(15,23,42,0.05)] backdrop-blur transition hover:border-slate-300 hover:bg-white max-[520px]:w-full"
          >
            {calendarConnections.length ? "Manage Calendar Links" : "Connect Calendar"}
          </button>
          {calendarConnections.length ? (
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-emerald-100 bg-emerald-50/80 px-3 py-2 text-[11px] font-black text-emerald-700">
              {linkedCalendarProviders.includes("google") ? <span className="rounded-full border border-emerald-200 bg-white px-2.5 py-1">Google linked</span> : null}
              {linkedCalendarProviders.includes("microsoft") ? <span className="rounded-full border border-emerald-200 bg-white px-2.5 py-1">Outlook linked</span> : null}
            </div>
          ) : null}
          <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1.5 rounded-2xl border border-slate-200/80 bg-white/70 p-1 shadow-[0_10px_24px_rgba(15,23,42,0.04)] backdrop-blur max-[1180px]:ml-0 max-[1180px]:justify-start max-[520px]:w-full">
            <MiniStat label="Total" value={stats.total} tone="amber" />
            <MiniStat label="Upcoming" value={stats.upcoming} tone="emerald" />
            <MiniStat label="This month" value={stats.thisMonth} tone="violet" />
            <MiniStat label="Canceled" value={stats.conflicts} tone="rose" />
          </div>
          {/* {canCreate ? (
            <button
              type="button"
              onClick={startCreateMeeting}
              className="h-11 rounded-[14px] border border-amber-300 bg-gradient-to-br from-amber-400 to-orange-400 px-4 text-[13px] font-black text-white shadow-[0_14px_34px_rgba(245,158,11,0.24)] transition hover:-translate-y-[1px]"
            >
              Book Meeting
            </button>
          ) : null} */}
        </section>

        <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(620px,760px)_minmax(420px,1fr)]">
          <div className="min-w-0 self-start rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_18px_40px_rgba(15,23,42,0.06)] xl:h-[612px] max-[520px]:rounded-[18px] max-[520px]:p-2.5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="text-[24px] font-black tracking-[-0.03em] text-slate-900 max-[520px]:text-[20px]">{monthLabel(currentMonth)}</div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))} className="h-9 w-9 rounded-full border border-slate-200 bg-white text-lg font-black text-slate-700">‹</button>
                <button type="button" onClick={() => {
                  const now = new Date();
                  setCurrentMonth(new Date(now.getFullYear(), now.getMonth(), 1));
                  setSelectedDate(toLocalDateInput(now));
                  setSelectedMeetingID(null);
                }} className="h-9 rounded-full border border-slate-200 bg-white px-4 text-[12px] font-black text-slate-700">Today</button>
                <button type="button" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))} className="h-9 w-9 rounded-full border border-slate-200 bg-white text-lg font-black text-slate-700">›</button>
              </div>
            </div>
            <div className="mb-2 grid grid-cols-7 gap-2 max-[520px]:mb-1.5 max-[520px]:gap-1">
              {monthDays.slice(0, 7).map((day) => (
                <div key={day.toISOString()} className="px-2 py-1 text-[12px] font-black uppercase tracking-[0.12em] text-slate-400 max-[520px]:px-0 max-[520px]:text-center max-[520px]:text-[9px] max-[520px]:tracking-[0.04em]">{dayLabel(day)}</div>
              ))}
            </div>
            {loading ? (
              <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-8 text-center text-[14px] font-semibold text-slate-500">Loading calendar...</div>
            ) : (
              <div className="grid min-w-0 grid-cols-7 gap-2 max-[520px]:gap-1">
                {monthDays.map((day) => {
                  const key = dateKey(day);
                  const dayMeetings = meetingsByDay.get(key) || [];
                  const isCurrent = key === selectedDate;
                  const isInMonth = sameMonth(day, currentMonth);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setSelectedDate(key);
                        setSelectedMeetingID(null);
                      }}
                      className={[
                        "flex h-[76px] min-w-0 flex-col rounded-[14px] border p-2 text-left transition",
                        "max-[520px]:h-[50px] max-[520px]:rounded-[12px] max-[520px]:p-1.5",
                        isCurrent ? "border-amber-300 bg-amber-50 shadow-[0_14px_34px_rgba(245,158,11,0.16)]" : "border-slate-200 bg-slate-50 hover:border-amber-200 hover:bg-white",
                        isInMonth ? "text-slate-900" : "text-slate-400 opacity-70",
                      ].join(" ")}
                    >
                      <div className="flex items-center justify-between gap-2 max-[520px]:gap-1">
                        <span className="text-[13px] font-black max-[520px]:text-[11px]">{day.getDate()}</span>
                        {dayMeetings.length ? <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-black text-white max-[520px]:px-1.5 max-[520px]:text-[8px]">{dayMeetings.length}</span> : null}
                      </div>
                      {dayMeetings.length ? (
                        <div className="mt-auto min-w-0">
                          <div className="flex flex-wrap gap-1" aria-hidden="true">
                            {dayMeetings.slice(0, 5).map((meeting) => (
                              <span
                                key={meeting.id}
                                className={[
                                  "h-1.5 w-4 rounded-full max-[520px]:h-1.5 max-[520px]:w-1.5",
                                  meeting.status === "completed" ? "bg-emerald-500" : meeting.status === "canceled" ? "bg-rose-400" : "bg-amber-400",
                                ].join(" ")}
                              />
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="min-w-0">
            <div className="flex min-w-0 flex-col rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_18px_40px_rgba(15,23,42,0.06)] xl:h-[612px] max-[520px]:rounded-[18px]">
              <div className="flex items-start justify-between gap-3 max-[520px]:flex-col">
                <div className="min-w-0">
                  <div className="text-[12px] font-black uppercase tracking-[0.14em] text-slate-400">Selected day</div>
                  <div className="mt-1 text-[22px] font-black tracking-[-0.03em] text-slate-900 max-[520px]:text-[18px]">{new Date(`${selectedDate}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</div>
                </div>
                <input type="date" value={selectedDate} onChange={(e) => {
                  setSelectedDate(e.target.value);
                  setSelectedMeetingID(null);
                  setCurrentMonth(new Date(`${e.target.value}T00:00:00`));
                }} className="h-10 rounded-[12px] border border-slate-200 bg-slate-50 px-3 text-[12px] font-bold text-slate-700 max-[520px]:w-full" />
              </div>

              <div className="mt-4 min-h-0 flex-1 space-y-3">
                {selectedDayMeetings.length === 0 ? (
                  <div className="rounded-[22px] border border-dashed border-slate-200 bg-[radial-gradient(circle_at_top,_rgba(148,163,184,0.1),_transparent_50%),#f8fafc] px-5 py-8 text-center">
                    <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-slate-200 bg-white text-slate-400 shadow-sm">
                      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
                        <rect x="4" y="5" width="16" height="15" rx="3" stroke="currentColor" strokeWidth="2" />
                        <path d="M8 3v4M16 3v4M4 9h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    </div>
                    <div className="mt-4 text-[16px] font-black text-slate-700">No meetings on this day</div>
                    <div className="mt-1 text-[12px] font-semibold text-slate-500">{canCreate ? "Open Book Meeting to schedule one." : "Check another board or date."}</div>
                  </div>
                ) : (
                  <div className="grid max-h-full gap-3 overflow-y-auto pr-1">
                    {selectedDayMeetings.map((meeting) => {
                      const meetingParticipants = participantsByMeeting[meeting.id] || [];
                      return (
                        <button key={meeting.id} type="button" onClick={() => setSelectedMeetingID(meeting.id)} className={`grid w-full grid-cols-[74px_minmax(0,1fr)] gap-3 rounded-[18px] border p-3 text-left transition max-[520px]:grid-cols-1 ${selectedMeetingID === meeting.id ? "border-amber-300 bg-amber-50 shadow-[0_16px_32px_rgba(245,158,11,0.12)]" : `${meetingSurfaceClass(meeting.status)} hover:border-slate-300`}`}>
                          <div className="rounded-[14px] border border-slate-200 bg-white px-2 py-2 text-center shadow-sm max-[520px]:text-left">
                            <div className="text-[12px] font-black text-slate-900">{new Date(meeting.starts_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</div>
                            <div className="mt-1 text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">{new Date(meeting.ends_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</div>
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate text-[15px] font-black text-slate-900">{meeting.title}</div>
                                <div className="mt-1 truncate text-[12px] font-semibold text-slate-500">{meeting.board_name}</div>
                              </div>
                              <StatusPill status={meeting.status} />
                            </div>
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-black text-slate-600">{meeting.location || "No location"}</span>
                              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-black text-slate-600">{formatTimeRange(meeting.starts_at, meeting.ends_at)}</span>
                              <MeetingAvatarStack participants={meetingParticipants} avatarByLogin={avatarByLogin} />
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {showCalendarLinker ? (
          <div className="fixed inset-0 z-[94] grid place-items-center bg-slate-950/45 p-4 max-[520px]:items-start max-[520px]:p-3" onClick={() => setShowCalendarLinker(false)}>
            <div className="w-full max-w-[640px] rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_30px_80px_rgba(15,23,42,0.35)] max-[520px]:rounded-[18px] max-[520px]:p-4" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[24px] font-black tracking-[-0.03em] text-slate-900">Connect Calendar</div>
                  <div className="mt-1 text-[13px] font-semibold text-slate-500">Link Google or Outlook so TaskFlow can block busy slots and push booked meetings into that calendar.</div>
                </div>
                <button type="button" onClick={() => setShowCalendarLinker(false)} className="h-10 rounded-[12px] border border-slate-200 bg-slate-50 px-3 text-[13px] font-black text-slate-700">Close</button>
              </div>

              <label className="mt-4 grid gap-1.5">
                <span className="text-[12px] font-black uppercase tracking-[0.12em] text-slate-500">Email for the calendar account</span>
                <input
                  type="email"
                  value={calendarEmail}
                  onChange={(e) => setCalendarEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-[14px] font-semibold text-slate-800 outline-none focus:border-amber-300"
                />
              </label>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => startCalendarLink("google")}
                  disabled={connectingProvider !== ""}
                  className="rounded-[20px] border border-slate-200 bg-[linear-gradient(135deg,#ffffff,#f8fafc)] p-4 text-left shadow-[0_10px_24px_rgba(15,23,42,0.05)] transition hover:-translate-y-0.5 hover:border-slate-300 disabled:opacity-60"
                >
                  <div className="text-[16px] font-black text-slate-900">Google Calendar</div>
                  <div className="mt-1 text-[12px] font-semibold text-slate-500">Use Google sign-in, check availability, and add the event automatically.</div>
                  <div className="mt-4 text-[12px] font-black text-amber-600">{connectingProvider === "google" ? "Opening Google..." : "Connect Google"}</div>
                </button>
                <button
                  type="button"
                  onClick={() => startCalendarLink("microsoft")}
                  disabled={connectingProvider !== ""}
                  className="rounded-[20px] border border-slate-200 bg-[linear-gradient(135deg,#ffffff,#f8fafc)] p-4 text-left shadow-[0_10px_24px_rgba(15,23,42,0.05)] transition hover:-translate-y-0.5 hover:border-slate-300 disabled:opacity-60"
                >
                  <div className="text-[16px] font-black text-slate-900">Outlook Calendar</div>
                  <div className="mt-1 text-[12px] font-semibold text-slate-500">Use Microsoft sign-in, check availability, and mirror the meeting in Outlook.</div>
                  <div className="mt-4 text-[12px] font-black text-amber-600">{connectingProvider === "microsoft" ? "Opening Outlook..." : "Connect Outlook"}</div>
                </button>
              </div>

              <div className="mt-5 rounded-[20px] border border-slate-200 bg-slate-50 p-4">
                <div className="text-[12px] font-black uppercase tracking-[0.12em] text-slate-400">Current links</div>
                <div className="mt-3 space-y-3">
                  {calendarConnections.length === 0 ? (
                    <div className="rounded-[16px] border border-dashed border-slate-200 bg-white px-4 py-5 text-[13px] font-semibold text-slate-500">No calendar linked yet. Once you connect one, TaskFlow will check busy times before saving a meeting.</div>
                  ) : (
                    calendarConnections.map((connection) => (
                      <div key={connection.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] border border-slate-200 bg-white px-4 py-3">
                        <div className="min-w-0">
                          <div className="text-[14px] font-black text-slate-900">{connection.provider === "google" ? "Google Calendar" : "Outlook Calendar"}</div>
                          <div className="mt-1 text-[12px] font-semibold text-slate-500">{connection.external_email || connection.calendar_name || "Primary calendar"}</div>
                          {connection.last_error ? <div className="mt-1 text-[11px] font-bold text-amber-700">{connection.last_error}</div> : null}
                        </div>
                        <button
                          type="button"
                          onClick={() => disconnectCalendar(connection.provider)}
                          disabled={disconnectingProvider === connection.provider}
                          className="h-10 rounded-[12px] border border-rose-200 bg-rose-50 px-3 text-[12px] font-black text-rose-700 disabled:opacity-60"
                        >
                          {disconnectingProvider === connection.provider ? "Disconnecting..." : "Disconnect"}
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {selectedMeeting ? (
          <div className="fixed inset-0 z-[95] grid place-items-center bg-slate-950/45 p-4 max-[520px]:items-start max-[520px]:p-3" onClick={() => setSelectedMeetingID(null)}>
            <div className="flex max-h-[calc(100dvh-32px)] w-full max-w-[920px] flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_30px_80px_rgba(15,23,42,0.35)] max-[520px]:max-h-[calc(100dvh-24px)] max-[520px]:rounded-[18px] max-[520px]:p-4" onClick={(e) => e.stopPropagation()}>
              <div className="mb-4 flex shrink-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill status={selectedMeeting.status} />
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-black text-slate-600">{selectedMeeting.location || "No location"}</span>
                  </div>
                  <div className="mt-3 text-[26px] font-black tracking-[-0.03em] text-slate-900 max-[520px]:text-[21px]">{selectedMeeting.title}</div>
                  <div className="mt-1 truncate text-[13px] font-bold text-slate-500">{selectedMeeting.board_name}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {canManage ? (
                    <>
                      <button type="button" onClick={() => startEditMeeting(selectedMeeting)} title="Reschedule meeting" className="grid h-10 w-10 place-items-center rounded-full border border-blue-200 bg-blue-50 text-blue-700 transition hover:bg-blue-100"><PencilIcon /></button>
                      <button type="button" onClick={() => deleteMeeting(selectedMeeting)} disabled={deletingMeetingID === selectedMeeting.id} title="Delete meeting" className="grid h-10 w-10 place-items-center rounded-full border border-red-200 bg-red-50 text-red-700 transition hover:bg-red-100 disabled:opacity-60"><BinIcon /></button>
                    </>
                  ) : null}
                  <button type="button" onClick={() => setSelectedMeetingID(null)} className="h-10 rounded-[12px] border border-slate-200 bg-slate-50 px-3 text-[13px] font-black text-slate-700">Close</button>
                </div>
              </div>

              <div className="min-h-0 overflow-y-auto pr-1">
                <div className="grid overflow-hidden rounded-[16px] border border-slate-200 bg-white sm:grid-cols-4">
                  <SummaryCell label="Date" value={new Date(selectedMeeting.starts_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} />
                  <SummaryCell label="Time" value={formatTimeRange(selectedMeeting.starts_at, selectedMeeting.ends_at)} />
                  <SummaryCell label="Booked by" value={selectedMeeting.created_by_name} />
                  <SummaryCell label="Room" value={selectedMeeting.location || "No location"} />
                </div>

                {selectedMeeting.notes ? (
                  <div className="mt-4 rounded-[16px] border border-amber-200 bg-amber-50/70 px-4 py-3">
                    <div className="text-[11px] font-black uppercase tracking-[0.12em] text-amber-700">Agenda</div>
                    <div className="mt-1 text-[13px] font-semibold leading-5 text-slate-700">{selectedMeeting.notes}</div>
                  </div>
                ) : null}

                {canManage ? (
                  <div className="mt-4 rounded-[18px] border border-slate-200 bg-slate-50 p-3">
                    <div className="text-[12px] font-black uppercase tracking-[0.12em] text-slate-400">Meeting controls</div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => updateMeetingStatus(selectedMeeting, "completed")}
                        className="group flex min-h-[52px] items-center gap-3 rounded-[16px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-left text-emerald-700 transition hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-emerald-100"
                      >
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-emerald-200 bg-white/90 text-emerald-700 transition group-hover:bg-white">
                          <CircleCheckIcon />
                        </span>
                        <span>
                          <span className="block text-[13px] font-black">Complete Meeting</span>
                          <span className="block text-[11px] font-bold text-emerald-600">Close it out and keep the outcome notes.</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => updateMeetingStatus(selectedMeeting, "canceled")}
                        className="group flex min-h-[52px] items-center gap-3 rounded-[16px] border border-rose-200 bg-rose-50 px-4 py-3 text-left text-rose-700 transition hover:-translate-y-0.5 hover:border-rose-300 hover:bg-rose-100"
                      >
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-rose-200 bg-white/90 text-rose-700 transition group-hover:bg-white">
                          <SlashCircleIcon />
                        </span>
                        <span>
                          <span className="block text-[13px] font-black">Cancel Meeting</span>
                          <span className="block text-[11px] font-bold text-rose-600">Mark it canceled so everyone sees the update.</span>
                        </span>
                      </button>
                    </div>
                    <label className="mt-3 grid gap-1.5">
                      <span className="text-[12px] font-black uppercase tracking-[0.12em] text-slate-500">Outcome notes</span>
                      <textarea value={outcomeDraft} onChange={(e) => setOutcomeDraft(e.target.value)} className="min-h-[92px] rounded-[14px] border border-slate-200 bg-white px-3 py-3 text-[13px] font-semibold text-slate-800 outline-none focus:border-amber-300" placeholder="Summary, action items, and follow-up decisions." />
                    </label>
                    <div className="mt-3 flex justify-end">
                      <button type="button" onClick={() => updateMeetingStatus(selectedMeeting, selectedMeeting.status)} disabled={savingOutcome} className="h-10 rounded-[12px] border border-amber-300 bg-amber-400 px-4 text-[12px] font-black text-white disabled:opacity-60">{savingOutcome ? "Saving..." : "Save notes"}</button>
                    </div>
                  </div>
                ) : selectedMeeting.outcome_notes ? (
                  <MetaPill label="Outcome notes" value={selectedMeeting.outcome_notes} />
                ) : null}

                <div className="mt-4 rounded-[18px] border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[12px] font-black uppercase tracking-[0.12em] text-slate-400">Participants</div>
                    {participantsLoading[selectedMeeting.id] ? <span className="text-[11px] font-bold text-slate-400">Loading...</span> : null}
                  </div>
                  <div className="mt-3 space-y-2">
                    {selectedMeetingParticipants.map((participant) => {
                      const key = `${selectedMeeting.id}:${participant.user_id}`;
                      const matchesSelf = actorRole === "student" && (
                        participant.email.toLowerCase() === email.toLowerCase() ||
                        (participant.nickname || "").toLowerCase() === login.toLowerCase()
                      );
                      const canEditParticipant = canManage || matchesSelf;
                      const avatarUrl = avatarByLogin[loginOf(participant)] || "";
                      return (
                        <div key={participant.user_id} className="rounded-[14px] border border-slate-200 bg-white px-3 py-3">
                          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px_160px] md:items-start">
                            <button
                              type="button"
                              onClick={() => openUserProfile(participant.user_id)}
                              className="flex min-w-0 items-center gap-3 rounded-[12px] text-left transition hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-[#6d5efc]/12"
                              title="Open profile"
                            >
                              <UserAvatar src={avatarUrl} alt={participant.full_name} fallback={initialsOf(participant.full_name)} sizeClass="h-10 w-10" textClass="text-[12px]" className="bg-slate-50" previewable />
                              <div className="min-w-0">
                                <div className="text-[13px] font-black leading-5 text-slate-900">{participant.full_name}</div>
                                <div className="mt-1 flex flex-wrap gap-2 text-[11px] font-semibold text-slate-500">
                                  <span>{participant.nickname ? `@${participant.nickname}` : participant.email}</span>
                                  <span>{participant.role_in_board || participant.role}</span>
                                </div>
                              </div>
                            </button>
                            <div className="md:justify-self-end">
                              <SelectField
                                label="RSVP"
                                value={participant.rsvp_status}
                                kind="rsvp"
                                disabled={!canEditParticipant || savingParticipantKey === key}
                                options={[
                                  ["pending", "Pending"],
                                  ["going", "Going"],
                                  ["maybe", "Maybe"],
                                  ["cant", "Can't attend"],
                                ]}
                                onChange={(value) => saveParticipant(selectedMeeting.id, participant, value, canManage ? participant.attendance_status : "pending")}
                              />
                            </div>
                            {canManage ? (
                              <div className="md:justify-self-end">
                                <SelectField
                                  label="Attendance"
                                  value={participant.attendance_status}
                                  kind="attendance"
                                  disabled={savingParticipantKey === key}
                                  options={[
                                    ["pending", "Pending"],
                                    ["attended", "Attended"],
                                    ["late", "Late"],
                                    ["missed", "Missed"],
                                  ]}
                                  onChange={(value) => saveParticipant(selectedMeeting.id, participant, participant.rsvp_status, value)}
                                />
                              </div>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                    {selectedMeetingParticipants.length === 0 && !participantsLoading[selectedMeeting.id] ? (
                      <div className="text-[13px] font-semibold text-slate-500">No participants loaded yet.</div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {showComposer ? (
          <div className="fixed inset-0 z-[110] grid place-items-center bg-slate-950/45 p-4 max-[520px]:items-start max-[520px]:p-3" onClick={closeComposer}>
            <div className="flex max-h-[calc(100dvh-32px)] w-full max-w-[760px] flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_30px_80px_rgba(15,23,42,0.35)] max-[520px]:max-h-[calc(100dvh-24px)] max-[520px]:rounded-[18px] max-[520px]:p-4" onClick={(e) => e.stopPropagation()}>
              <div className="mb-4 flex shrink-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[24px] font-black tracking-[-0.03em] text-slate-900 max-[520px]:text-[20px]">{editingMeetingID ? "Reschedule meeting" : "Book a meeting"}</div>
                  <div className="mt-1 max-w-[360px] text-[13px] font-semibold text-slate-500 max-[520px]:text-[12px]">Room conflicts are blocked automatically and participants will sync from the board.</div>
                </div>
                <button type="button" onClick={closeComposer} className="h-10 shrink-0 rounded-[12px] border border-slate-200 bg-slate-50 px-3 text-[13px] font-black text-slate-700">Close</button>
              </div>

              <form className="grid min-h-0 gap-4 overflow-y-auto pr-1" onSubmit={submitMeeting}>
                <div className="grid gap-4 md:grid-cols-2">
                  {isEffectiveAdmin ? (
                    <Field label="Supervisor">
                      <select
                        required
                        value={composerSupervisorID}
                        onChange={(e) => {
                          setComposerSupervisorID(e.target.value);
                          setForm((prev) => ({ ...prev, board_id: "" }));
                        }}
                        className="h-12 w-full rounded-[14px] border border-slate-200 bg-slate-50 px-3 text-[13px] font-bold text-slate-800 outline-none focus:border-amber-300"
                      >
                        <option value="">Choose supervisor</option>
                        {supervisorOptions.map((supervisor) => <option key={supervisor.id} value={supervisor.id}>{supervisor.name}</option>)}
                      </select>
                    </Field>
                  ) : null}
                  <Field label="Board">
                    <select
                      required
                      value={form.board_id}
                      disabled={isEffectiveAdmin && !composerSupervisorID}
                      onChange={(e) => setForm((prev) => ({ ...prev, board_id: e.target.value }))}
                      className="h-12 w-full rounded-[14px] border border-slate-200 bg-slate-50 px-3 text-[13px] font-bold text-slate-800 outline-none focus:border-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <option value="">{isEffectiveAdmin && !composerSupervisorID ? "Pick supervisor first" : "Choose board"}</option>
                      {composerBoardOptions.map((board) => <option key={board.id} value={board.id}>{board.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Meeting title">
                    <input required value={form.title} onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))} className="h-12 w-full rounded-[14px] border border-slate-200 bg-slate-50 px-3 text-[13px] font-bold text-slate-800 outline-none focus:border-amber-300" placeholder="Weekly check-in" />
                  </Field>
                  <Field label="Date">
                    <input required type="date" value={form.date} onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))} className="h-12 w-full rounded-[14px] border border-slate-200 bg-slate-50 px-3 text-[13px] font-bold text-slate-800 outline-none focus:border-amber-300" />
                  </Field>
                  <Field label="Location">
                    <select value={form.location} onChange={(e) => setForm((prev) => ({ ...prev, location: e.target.value }))} className="h-12 w-full rounded-[14px] border border-slate-200 bg-slate-50 px-3 text-[13px] font-bold text-slate-800 outline-none focus:border-amber-300">
                      {MEETING_LOCATIONS.map((location) => <option key={location} value={location}>{location}</option>)}
                    </select>
                  </Field>
                  <Field label="Start time">
                    <input required type="time" value={form.start_time} onChange={(e) => setForm((prev) => ({ ...prev, start_time: e.target.value }))} className="h-12 w-full rounded-[14px] border border-slate-200 bg-slate-50 px-3 text-[13px] font-bold text-slate-800 outline-none focus:border-amber-300" />
                  </Field>
                  <Field label="End time">
                    <input required type="time" value={form.end_time} onChange={(e) => setForm((prev) => ({ ...prev, end_time: e.target.value }))} className="h-12 w-full rounded-[14px] border border-slate-200 bg-slate-50 px-3 text-[13px] font-bold text-slate-800 outline-none focus:border-amber-300" />
                  </Field>
                </div>
                <Field label="Agenda / meeting notes">
                  <textarea value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} className="min-h-[96px] w-full rounded-[14px] border border-slate-200 bg-slate-50 px-3 py-3 text-[13px] font-semibold text-slate-800 outline-none focus:border-amber-300" placeholder="Topics to cover, preparation notes, or room setup details." />
                </Field>
                {form.board_id ? (
                  <div className="rounded-[16px] border border-slate-200 bg-slate-50 px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[12px] font-black uppercase tracking-[0.12em] text-slate-500">Board talents</div>
                      {boardMembersLoading[Number(form.board_id)] ? <span className="text-[11px] font-bold text-slate-400">Loading...</span> : null}
                    </div>
                    {selectedBoardMembers.length === 0 && !boardMembersLoading[Number(form.board_id)] ? (
                      <div className="mt-2 text-[12px] font-semibold text-slate-500">No talents found for this board.</div>
                    ) : (
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {selectedBoardMembers.map((member) => {
                          const avatarUrl = avatarByLogin[loginOf(member)] || "";
                          return (
                            <button
                              key={member.user_id}
                              type="button"
                              onClick={() => openUserProfile(member.user_id)}
                              className="flex min-w-0 items-center gap-3 rounded-[12px] border border-slate-200 bg-white px-3 py-2 text-left transition hover:border-[#6d5efc]/25 hover:bg-[#f7f5ff] focus:outline-none focus:ring-4 focus:ring-[#6d5efc]/12"
                              title="Open profile"
                            >
                              <UserAvatar src={avatarUrl} alt={member.full_name} fallback={initialsOf(member.full_name)} sizeClass="h-9 w-9" textClass="text-[11px]" className="bg-slate-50" previewable />
                              <div className="min-w-0">
                                <div className="truncate text-[13px] font-black text-slate-900">{member.full_name}</div>
                                <div className="truncate text-[11px] font-semibold text-slate-500">{member.nickname ? `@${member.nickname}` : member.email}</div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : null}
                <div className="flex justify-end max-[520px]:sticky max-[520px]:bottom-0 max-[520px]:bg-white max-[520px]:py-2">
                  <button type="submit" disabled={saving} className="h-12 rounded-[14px] border border-amber-300 bg-gradient-to-br from-amber-400 to-orange-400 px-5 text-[13px] font-black text-white shadow-[0_16px_34px_rgba(245,158,11,0.24)] disabled:opacity-70 max-[520px]:w-full">{saving ? "Saving..." : editingMeetingID ? "Save reschedule" : "Create meeting"}</button>
                </div>
              </form>
            </div>
          </div>
        ) : null}
        </div>
      </AdminLayout>
    </>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-[12px] font-black uppercase tracking-[0.12em] text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function MetaPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[14px] border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">{label}</div>
      <div className="mt-1 text-[13px] font-semibold text-slate-700">{value}</div>
    </div>
  );
}

function SummaryCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border-b border-slate-200 px-3 py-3 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
      <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">{label}</div>
      <div className="mt-1 truncate text-[13px] font-black text-slate-800">{value}</div>
    </div>
  );
}

function MeetingAvatarStack({
  participants,
  avatarByLogin,
}: {
  participants: MeetingParticipant[];
  avatarByLogin: Record<string, string>;
}) {
  if (participants.length === 0) {
    return <span className="text-[11px] font-bold text-slate-400">No participants</span>;
  }

  const visible = participants.slice(0, 5);
  const remaining = participants.length - visible.length;

  return (
    <span className="ml-auto flex shrink-0 items-center pl-1" aria-label={`${participants.length} participants`}>
      {visible.map((participant, index) => {
        const avatarUrl = avatarByLogin[loginOf(participant)] || "";
        return (
          <span
            key={participant.user_id}
            className={[
              "group relative inline-flex",
              index === 0 ? "" : "-ml-2",
            ].join(" ")}
          >
            <UserAvatar
              src={avatarUrl}
              alt={participant.full_name}
              fallback={initialsOf(participant.full_name)}
              sizeClass="h-7 w-7"
              textClass="text-[10px]"
              className={[
                "border-2 border-white bg-slate-50 shadow-[0_4px_10px_rgba(15,23,42,0.12)]",
                (participant.role || "").toLowerCase() === "supervisor" ? "ring-2 ring-amber-300" : "",
              ].join(" ")}
            />
            <span className="pointer-events-none absolute bottom-full left-1/2 z-[20] mb-2 max-w-[180px] -translate-x-1/2 whitespace-nowrap rounded-lg border border-slate-200 bg-slate-950 px-2.5 py-1.5 text-[11px] font-black text-white opacity-0 shadow-[0_12px_28px_rgba(15,23,42,0.22)] transition group-hover:opacity-100 group-focus-within:opacity-100">
              {participant.full_name}
              <span className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 -translate-y-1 rotate-45 bg-slate-950" />
            </span>
          </span>
        );
      })}
      {remaining > 0 ? (
        <span className="-ml-2 grid h-7 min-w-7 place-items-center rounded-full border-2 border-white bg-slate-900 px-1.5 text-[10px] font-black text-white shadow-[0_4px_10px_rgba(15,23,42,0.16)]">
          +{remaining}
        </span>
      ) : null}
    </span>
  );
}

function meetingSurfaceClass(status: MeetingRow["status"]) {
  if (status === "completed") {
    return "border-emerald-300 bg-emerald-50/40 text-slate-900";
  }
  if (status === "canceled") {
    return "border-rose-300 bg-rose-50/40 text-slate-900";
  }
  return "border-slate-200 bg-white/95 text-slate-900 shadow-sm";
}

function MiniStat({ label, value, tone }: { label: string; value: number; tone: "amber" | "emerald" | "violet" | "rose" }) {
  const toneClasses =
    tone === "amber"
      ? { shell: "text-amber-800 hover:bg-amber-50", icon: "bg-amber-600", text: "text-amber-800" }
      : tone === "emerald"
        ? { shell: "text-emerald-800 hover:bg-emerald-50", icon: "bg-emerald-600", text: "text-emerald-800" }
        : tone === "violet"
          ? { shell: "text-[#5b21b6] hover:bg-[#f7f5ff]", icon: "bg-[#6d5efc]", text: "text-[#5b21b6]" }
          : { shell: "text-rose-800 hover:bg-rose-50", icon: "bg-rose-600", text: "text-rose-800" };

  return (
    <span
      className={[
        "inline-flex h-10 min-w-[96px] items-center justify-center gap-2 rounded-[14px] px-2.5 transition",
        toneClasses.shell,
      ].join(" ")}
      title={label}
    >
      <span className={["h-2.5 w-2.5 rounded-full", toneClasses.icon].join(" ")} />
      <span className="flex items-baseline gap-1.5 leading-none">
        <span className={["text-[16px] font-black", toneClasses.text].join(" ")}>{value}</span>
        <span className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">{label}</span>
      </span>
    </span>
  );
}

function StatusPill({ status }: { status: MeetingRow["status"] }) {
  const classes = status === "completed"
    ? "border-emerald-200 bg-white text-emerald-700"
    : status === "canceled"
      ? "border-rose-200 bg-white text-rose-700"
      : "border-slate-200 bg-white text-slate-700";
  return <div className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] ${classes}`}>{status}</div>;
}

function SelectField({
  label,
  value,
  kind,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  kind: "rsvp" | "attendance";
  options: Array<[string, string]>;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const toneClass =
    kind === "rsvp"
      ? value === "going"
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : value === "maybe"
          ? "border-amber-200 bg-amber-50 text-amber-700"
          : value === "cant"
            ? "border-rose-200 bg-rose-50 text-rose-700"
            : "border-slate-200 bg-slate-50 text-slate-600"
      : value === "attended"
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : value === "late"
          ? "border-amber-200 bg-amber-50 text-amber-700"
          : value === "missed"
            ? "border-rose-200 bg-rose-50 text-rose-700"
            : "border-slate-200 bg-slate-50 text-slate-600";

  return (
    <label className="grid gap-1.5">
      <span className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">{label}</span>
      <div className={`relative min-w-[132px] rounded-[12px] border shadow-[0_6px_18px_rgba(15,23,42,0.05)] transition ${toneClass}`}>
        <select
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="h-11 w-full appearance-none rounded-[12px] bg-transparent pl-3 pr-9 text-[12px] font-black outline-none disabled:cursor-not-allowed disabled:opacity-60"
        >
          {options.map(([optionValue, labelText]) => <option key={optionValue} value={optionValue}>{labelText}</option>)}
        </select>
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
          <ChevronDownIcon />
        </span>
      </div>
    </label>
  );
}
