import { useConfirm } from "../lib/useConfirm";
import { Link2, Plus, LayoutDashboard, CalendarDays, Pencil, Trash2, X, CircleCheck, CircleSlash } from "lucide-react";
import "./MeetingComposer.css";
import "./MeetingsTheme.css";
import "./BoardMeetingsPage.css";
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import AdminLayout from "../components/AdminLayout";
import UserAvatar from "../components/UserAvatar";
import { apiFetch } from "../lib/api";
import { useAuth } from "../lib/auth";
import { fetchRebootAvatars } from "../lib/rebootAvatars";

type BoardFull = {
  board_id: number;
  name: string;
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

const MEETING_LOCATIONS = ["Online", "Sandbox", "Quest", "Pixel", "Bim", "Snap", "Other"] as const;

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message || fallback : fallback;
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

function formatMeetingDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatMeetingRange(startISO: string, endISO: string) {
  const start = new Date(startISO);
  const end = new Date(endISO);
  return `${start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} - ${end.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

function statusTone(status: MeetingRow["status"]) {
  if (status === "completed") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "canceled") return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function rsvpTone(status: MeetingParticipant["rsvp_status"]) {
  if (status === "going") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "maybe") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "cant") return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function attendanceTone(status: MeetingParticipant["attendance_status"]) {
  if (status === "attended") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "late") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "missed") return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function CalendarIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 3v3M17 3v3M4 9h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <rect x="4" y="5" width="16" height="15" rx="3" stroke="currentColor" strokeWidth="2" />
      <path d="M8 13h3v3H8z" fill="currentColor" opacity="0.75" />
    </svg>
  );
}

export default function BoardMeetingsPage() {
  const nav = useNavigate();
 const {confirm,dialog}=useConfirm();
 const [editing,setEditing]=useState<number|null>(null);
 const [deleting,setDeleting]=useState(false);
  const { boardId } = useParams();
  const boardID = Number(boardId);
  const { isAdmin, isSupervisor } = useAuth();
  const canManage = isAdmin || isSupervisor;

  const [board, setBoard] = useState<BoardFull | null>(null);
  const [meetings, setMeetings] = useState<MeetingRow[]>([]);
  const [participantsByMeeting, setParticipantsByMeeting] = useState<Record<number, MeetingParticipant[]>>({});
  const [participantsLoading, setParticipantsLoading] = useState<Record<number, boolean>>({});
  const [avatarByLogin, setAvatarByLogin] = useState<Record<string, string>>({});
  const [selectedMeetingID, setSelectedMeetingID] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showComposer, setShowComposer] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [outcome, setOutcome] = useState("");
  const [updating, setUpdating] = useState(false);
  useEffect(() => {
    if (!showControls && !showComposer) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setShowControls(false); setShowComposer(false); }
    };
    document.addEventListener("keydown", escape);
    return () => { document.body.style.overflow = previous; document.removeEventListener("keydown", escape); };
  }, [showControls, showComposer]);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    title: "",
    location: "Online",
    notes: "",
    date: toLocalDateInput(),
    start_time: "10:00",
    end_time: "11:00",
  });

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

  const load = useCallback(async () => {
    if (!boardID || Number.isNaN(boardID)) return;
    setLoading(true);
    setError("");
    try {
      const [boardRes, meetingsRes] = await Promise.all([
        apiFetch(`/admin/board?board_id=${boardID}`),
        apiFetch("/admin/meetings"),
      ]);

      const nextMeetings = (Array.isArray(meetingsRes) ? meetingsRes : [])
        .filter((meeting) => Number(meeting.board_id) === boardID)
        .sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime());

      setBoard(boardRes);
      setMeetings(nextMeetings);
      setSelectedMeetingID((prev) => {
        if (prev && nextMeetings.some((meeting) => meeting.id === prev)) return prev;
        return nextMeetings[0]?.id ?? null;
      });
    } catch (e: any) {
      setError(e?.message || "Failed to load board meetings");
      setBoard(null);
      setMeetings([]);
      setSelectedMeetingID(null);
    } finally {
      setLoading(false);
    }
  }, [boardID]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedMeeting = useMemo(
    () => meetings.find((meeting) => meeting.id === selectedMeetingID) || meetings[0] || null,
    [meetings, selectedMeetingID]
  );

  const selectedParticipants = useMemo(() => {
    const rows = selectedMeeting ? participantsByMeeting[selectedMeeting.id] || [] : [];
    return rows.filter((participant) => (participant.role || "").toLowerCase() !== "supervisor");
  }, [participantsByMeeting, selectedMeeting]);

  useEffect(() => {
    let alive = true;
    const logins = Array.from(new Set(selectedParticipants.map((participant) => loginOf(participant)).filter(Boolean)));
    if (logins.length === 0) return;
    fetchRebootAvatars(logins)
      .then((next) => {
        if (alive) setAvatarByLogin((prev) => ({ ...prev, ...next }));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [selectedParticipants]);

  useEffect(() => {
    if (!selectedMeeting) return;
    if (!participantsByMeeting[selectedMeeting.id] && !participantsLoading[selectedMeeting.id]) {
      void loadParticipants(selectedMeeting.id);
    }
  }, [loadParticipants, participantsByMeeting, participantsLoading, selectedMeeting]);

  function openControls(meeting: MeetingRow) {
    setSelectedMeetingID(meeting.id);
    setOutcome(meeting.outcome_notes || "");
    setError("");
    setShowControls(true);
  }

  async function saveControls(status: MeetingRow["status"]) {
    if (!selectedMeeting || updating) return;
    setUpdating(true);
    setError("");
    try {
      await apiFetch("/admin/meetings/status", { method: "POST", body: JSON.stringify({
        meeting_id: selectedMeeting.id, status, outcome_notes: outcome.trim(),
      }) });
      setMeetings(rows => rows.map(row => row.id === selectedMeeting.id ? { ...row, status, outcome_notes: outcome.trim() } : row));
    } catch (e) { setError(errorMessage(e, "Failed to save meeting")); }
    finally { setUpdating(false); }
  }

  async function saveParticipant(participant: MeetingParticipant, field: "rsvp_status" | "attendance_status", value: string) {
    if (!selectedMeeting || updating) return;
    setUpdating(true);
    setError("");
    try {
      await apiFetch("/admin/meeting-participants/update", { method: "POST", body: JSON.stringify({
        meeting_id: selectedMeeting.id, user_id: participant.user_id,
        rsvp_status: participant.rsvp_status, attendance_status: participant.attendance_status, [field]: value,
      }) });
      await loadParticipants(selectedMeeting.id);
    } catch (e) { setError(errorMessage(e, "Failed to update participant")); }
    finally { setUpdating(false); }
  }

  function startCreateMeeting() {
 setEditing(null);
    setForm({
      title: "",
      location: "Online",
      notes: "",
      date: toLocalDateInput(),
      start_time: "10:00",
      end_time: "11:00",
    });
    setShowComposer(true);
  }

  function closeComposer() {
    if (saving) return;
    setShowComposer(false);
  }

  async function submitMeeting(e: FormEvent) {
    e.preventDefault();
    if (!boardID || Number.isNaN(boardID)) {
      setError("This board could not be found.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const startsAt = new Date(`${form.date}T${form.start_time}`);
      const endsAt = new Date(`${form.date}T${form.end_time}`);
      const res = await apiFetch(editing ? "/admin/meetings/update" : "/admin/meetings", {
        method: "POST",
        body: JSON.stringify({
          meeting_id: editing || undefined,
          board_id: boardID,
          title: form.title.trim(),
          location: form.location.trim(),
          notes: form.notes.trim(),
          starts_at: startsAt.toISOString(),
          ends_at: endsAt.toISOString(),
        }),
      });
      const createdID = Number((res as { id?: number })?.id || 0);
      setShowComposer(false);
      if (createdID) setSelectedMeetingID(createdID);
      await load();
    } catch (e: unknown) {
      setError(errorMessage(e, "Failed to create meeting"));
    } finally {
      setSaving(false);
    }
  }

  function editMeeting() {
 if(!selectedMeeting||!canManage)return;
 const m=selectedMeeting;const start=new Date(m.starts_at),end=new Date(m.ends_at);
 const time=(d:Date)=>`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
 setEditing(m.id);setForm({title:m.title,location:m.location,notes:m.notes||'',date:toLocalDateInput(start),start_time:time(start),end_time:time(end)});setShowComposer(true);
 }
 async function deleteMeeting() {
 if(!selectedMeeting||deleting||!canManage)return;
 const m=selectedMeeting;
 if(!await confirm({title:'Delete meeting',message:`Delete "${m.title}"? This cannot be undone.`,confirmLabel:'Delete',danger:true}))return;
 setDeleting(true);setError('');try{await apiFetch('/admin/meetings/delete',{method:'POST',body:JSON.stringify({meeting_id:m.id})});await load();}catch(e){setError(errorMessage(e,'Failed to delete meeting'));}finally{setDeleting(false);}
 }
  const pageTitle = board?.name ? `${board.name} Meetings` : `Board #${boardID} Meetings`;

  return (
    <AdminLayout
      active={isAdmin ? "boards" : "boards"}
      title="Board meetings"
      subtitle={pageTitle}
      right={
        <div className="board-meeting-actions flex flex-wrap items-center gap-2">
          {canManage ? (
            <button
              type="button"
              onClick={startCreateMeeting}
              className="h-10 rounded-[14px] border border-amber-300 bg-gradient-to-br from-amber-400 to-orange-400 px-4 text-[13px] font-black text-white shadow-[0_14px_34px_rgba(245,158,11,0.24)] transition hover:-translate-y-[1px]"
            >
              <Plus size={16}/> Book Meeting
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => nav(`/admin/boards/${boardID}`)}
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-extrabold text-slate-700 transition hover:bg-slate-50"
          >
            <LayoutDashboard size={15}/> Board
          </button>
          <button
            type="button"
            onClick={() => nav("/admin/meetings")}
            className="h-10 rounded-xl border border-amber-200 bg-amber-50 px-3 text-[13px] font-extrabold text-amber-700 transition hover:bg-amber-100"
          >
            <CalendarDays size={15}/> Full calendar
          </button>
        </div>
      }
    >
      <div className="board-meetings-content meetings-page">
      {error ? (
        <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="text-sm font-semibold text-slate-500">Loading board meetings...</div>
      ) : (
        <div className="grid h-auto min-h-0 gap-4">
          {meetings.length === 0 ? (
            <div className="rounded-[26px] border border-dashed border-slate-300 bg-[radial-gradient(circle_at_top,_rgba(245,158,11,0.12),_transparent_44%),#ffffff] px-6 py-16 text-center shadow-[0_16px_40px_rgba(15,23,42,0.05)] max-[520px]:px-4 max-[520px]:py-12">
              <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-amber-200 bg-amber-50 text-amber-600 shadow-sm">
                <CalendarIcon size={24} />
              </div>
              <div className="text-[20px] font-black tracking-[-0.02em] text-slate-900">No meetings for this board yet</div>
              <div className="mx-auto mt-2 max-w-[520px] text-sm font-semibold leading-6 text-slate-500">
                {canManage ? "Create the first meeting from here and it will appear in this board timeline." : "When meetings are scheduled for this board, their details will appear here."}
              </div>
            </div>
          ) : (
            <>
              <div className="board-meetings-toolbar">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex h-9 items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 text-[12px] font-black text-slate-700">
                      <CalendarIcon size={14} />
                      {meetings.length} {meetings.length===1?"Meeting":"Meetings"}
                    </span>
                    <span className="board-meeting-summary">{meetings.filter(m=>m.status==='scheduled').length} scheduled <span>·</span> {meetings.filter(m=>m.status==='completed').length} completed</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => nav("/admin/meetings", { state: { openCalendarLinker: true } })}
                    className="board-calendar-connect inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-[13px] font-extrabold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60 max-[520px]:w-full"
                  >
                    <Link2 size={16} />
                    Connect Calendar
                  </button>
                </div>
              </div>

              <div className="board-meetings-layout">
              <div className="board-meetings-timeline min-h-0 rounded-[22px] border border-slate-200 bg-white p-3 shadow-[0_16px_40px_rgba(15,23,42,0.06)] overflow-hidden">
                <div className="mb-2 px-2 text-[12px] font-black uppercase tracking-[0.16em] text-slate-400">
                  Meetings <span className="board-meetings-hint">Double-click to manage</span>
                </div>
                <div className="grid max-h-full min-h-0 gap-2 overflow-y-auto pr-1 [scrollbar-width:thin]">
                  {meetings.map((meeting) => (
                    <button
                      key={meeting.id}
                      type="button"
                      onClick={() => setSelectedMeetingID(meeting.id)}
                      onDoubleClick={() => openControls(meeting)}
                      onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); openControls(meeting); } }}
                      title="Double-click to open meeting controls"
                      aria-pressed={selectedMeeting?.id === meeting.id}
                      className={`board-meetings-item rounded-[18px] border p-4 text-left transition ${
                        selectedMeeting?.id === meeting.id
                          ? "border-amber-300 bg-amber-50 shadow-[0_14px_32px_rgba(245,158,11,0.14)]"
                          : "border-slate-200 bg-slate-50/70 hover:border-slate-300 hover:bg-white"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-[15px] font-black text-slate-900">{meeting.title}</div>
                          <div className="mt-1 text-[12px] font-semibold text-slate-500">{formatMeetingDate(meeting.starts_at)}</div>
                        </div>
                        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-black capitalize ${statusTone(meeting.status)}`}>
                          {meeting.status}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-black text-slate-700">
                          {formatMeetingRange(meeting.starts_at, meeting.ends_at)}
                        </span>
                        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-black text-slate-700">
                          {meeting.location || "No location"}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {selectedMeeting ? (
                <div className={showControls ? "board-controls-overlay" : "board-detail-wrap"} onClick={() => setShowControls(false)}>
                <div role={showControls ? "dialog" : undefined} aria-modal={showControls || undefined} aria-label="Meeting details and controls" onClick={event => event.stopPropagation()} className="board-meetings-detail min-h-0 overflow-y-auto rounded-[22px] border border-slate-200 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)] [scrollbar-width:thin]">
                  {showControls ? <>
                    <header className="board-modal-header">
                      <div className="board-modal-badges"><span>{selectedMeeting.status}</span><span>{selectedMeeting.location || "Online"}</span></div>
                      <div className="board-modal-icons">
                        {canManage && <><button aria-label="Edit meeting" onClick={() => { setShowControls(false); editMeeting(); }}><Pencil size={18}/></button><button aria-label="Delete meeting" className="danger" disabled={deleting} onClick={deleteMeeting}><Trash2 size={18}/></button></>}
                        <button autoFocus aria-label="Close meeting controls" onClick={() => setShowControls(false)}><X size={22}/></button>
                      </div>
                      <h2>{selectedMeeting.title}</h2>
                      <p>{selectedMeeting.board_name || board?.name}</p>
                    </header>
                    <div className="board-modal-summary">
                      <InfoCard label="Date" value={new Date(selectedMeeting.starts_at).toLocaleDateString(undefined, {day:"numeric",month:"short",year:"numeric"})}/>
                      <InfoCard label="Time" value={formatMeetingRange(selectedMeeting.starts_at,selectedMeeting.ends_at)}/>
                      <InfoCard label="Booked by" value={selectedMeeting.created_by_name || "Unknown"}/>
                      <InfoCard label="Room" value={selectedMeeting.location || "Online"}/>
                    </div>
                    {selectedMeeting.notes && <TextCard title="Agenda / Notes" content={selectedMeeting.notes}/>}
                  </> : <>                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-[24px] font-black tracking-[-0.03em] text-slate-900">{selectedMeeting.title}</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[12px] font-black text-slate-700">
                          {formatMeetingDate(selectedMeeting.starts_at)}
                        </span>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[12px] font-black text-slate-700">
                          {formatMeetingRange(selectedMeeting.starts_at, selectedMeeting.ends_at)}
                        </span>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[12px] font-black text-slate-700">
                          {selectedMeeting.location || "No location"}
                        </span>
                      </div>
                    </div>

                    {showControls && <button autoFocus type="button" className="board-controls-close" aria-label="Close meeting controls" onClick={() => setShowControls(false)}><X size={18}/></button>}
                    {canManage&&<div className="board-meeting-edit"><button type="button" onClick={() => openControls(selectedMeeting)}>Meeting controls</button><button type="button" onClick={() => { setShowControls(false); editMeeting(); }} disabled={deleting}><Pencil size={15}/>Edit</button><button type="button" onClick={deleteMeeting} disabled={deleting} className="danger"><Trash2 size={15}/>{deleting?'Deleting…':'Delete'}</button></div>}
                    <span className={`rounded-full border px-3 py-1.5 text-[12px] font-black capitalize ${statusTone(selectedMeeting.status)}`}>
                      {selectedMeeting.status}
                    </span>
                  </div>

                  <div className="board-meetings-meta">
                    <InfoCard label="Supervisor" value={selectedMeeting.supervisor_name || "Unknown"} />
                    <InfoCard label="Created by" value={selectedMeeting.created_by_name || "Unknown"} />
                  </div>

                  <div className="board-meetings-notes">
                    <TextCard
                      title="Agenda / Notes"
                      content={selectedMeeting.notes || "No meeting notes were added yet."}
                    />
                    <TextCard
                      title="Outcome"
                      content={selectedMeeting.outcome_notes || "No outcome notes were added yet."}
                    />
                  </div>

</>}
                  {showControls && canManage && <section className="board-controls-section">
                    <h3>Meeting controls</h3>
                    {error && <p role="alert" className="text-rose-600">{error}</p>}
                    <div className="board-controls-actions">
                      <button type="button" disabled={updating || selectedMeeting.status === "completed"} onClick={() => void saveControls("completed")}><CircleCheck size={20}/><span><strong>Complete Meeting</strong><small>Close it out and keep the outcome notes.</small></span></button>
                      <button type="button" className="danger" disabled={updating || selectedMeeting.status === "canceled"} onClick={() => void saveControls("canceled")}><CircleSlash size={20}/><span><strong>Cancel Meeting</strong><small>Mark it canceled so everyone sees the update.</small></span></button>
                    </div>
                    <label>Outcome notes<textarea value={outcome} onChange={event => setOutcome(event.target.value)} placeholder="Summary, action items, and follow-up decisions." /></label>
                    <button type="button" className="board-controls-save" disabled={updating} onClick={() => void saveControls(selectedMeeting.status)}>{updating ? "Saving…" : "Save notes"}</button>
                  </section>}
                  <div className={showControls ? "board-modal-participants" : "mt-5"}>
                    <div className="mb-3 text-[13px] font-black uppercase tracking-[0.16em] text-slate-400">
                      Participants
                    </div>

                    {participantsLoading[selectedMeeting.id] ? (
                      <div className="text-sm font-semibold text-slate-500">Loading participants...</div>
                    ) : selectedParticipants.length === 0 ? (
                      <div className="rounded-[18px] border border-dashed border-slate-300 bg-slate-50/70 px-4 py-6 text-sm font-semibold text-slate-500">
                        No participants found for this meeting.
                      </div>
                    ) : (
                      <div className="grid gap-3">
                        {selectedParticipants.map((participant) => {
                          const avatarUrl = avatarByLogin[loginOf(participant)] || "";
                          return (
                            <div
                              key={participant.user_id}
                              className="board-meetings-person"
                            >
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="flex min-w-0 items-center gap-3">
                                  <UserAvatar src={avatarUrl} alt={participant.full_name} fallback={initialsOf(participant.full_name)} sizeClass="h-10 w-10" textClass="text-[12px]" className="bg-white" />
                                  <div className="min-w-0">
                                    <div className="truncate text-[14px] font-black text-slate-900">
                                      {participant.full_name}
                                    </div>
                                    <div className="mt-1 flex flex-wrap gap-2 text-[12px] font-semibold text-slate-500">
                                      {!showControls && <span>{participant.email}</span>}
                                      {participant.nickname ? <span>@{participant.nickname}</span> : null}
                                      <span>{participant.role_in_board || participant.role}</span>
                                    </div>
                                  </div>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                  {showControls && canManage ? <>
                                    <label className="board-participant-field">RSVP<select disabled={updating} value={participant.rsvp_status} onChange={e => void saveParticipant(participant, "rsvp_status", e.target.value)}>{["pending", "going", "maybe", "cant"].map(value => <option key={value} value={value}>{value === "cant" ? "Can't attend" : value[0].toUpperCase() + value.slice(1)}</option>)}</select></label>
                                    <label className="board-participant-field">Attendance<select disabled={updating} value={participant.attendance_status} onChange={e => void saveParticipant(participant, "attendance_status", e.target.value)}>{["pending", "attended", "late", "missed"].map(value => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}</select></label>
                                  </> : <><span className={`rounded-full border px-2.5 py-1 text-[11px] font-black ${rsvpTone(participant.rsvp_status)}`}>
                                    RSVP: {participant.rsvp_status}
                                  </span>
                                  <span className={`rounded-full border px-2.5 py-1 text-[11px] font-black ${attendanceTone(participant.attendance_status)}`}>
                                    Attendance: {participant.attendance_status}
                                  </span></>}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div></div>
              ) : null}
            </div>
            </>
          )}
        </div>
      )}

      {showComposer ? (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/45 p-4 max-[520px]:items-start max-[520px]:p-3" onClick={closeComposer}>
          <div role="dialog" aria-modal="true" aria-label={editing ? "Edit meeting" : "Book a meeting"} className="meeting-composer flex max-h-[calc(100dvh-32px)] w-full max-w-[760px] flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_30px_80px_rgba(15,23,42,0.35)] max-[520px]:max-h-[calc(100dvh-24px)] max-[520px]:rounded-[18px] max-[520px]:p-4" onClick={(e) => e.stopPropagation()}>
            <div className="meeting-composer-header mb-4 flex shrink-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[24px] font-black tracking-[-0.03em] text-slate-900 max-[520px]:text-[20px]">{editing ? "Edit meeting" : "Book a meeting"}</div>
                <div className="mt-1 max-w-[430px] text-[13px] font-semibold text-slate-500 max-[520px]:text-[12px]">
                  This will be added to {board?.name || "this board"} and participants will sync from the board.
                </div>
              </div>
              <button type="button" onClick={closeComposer} disabled={saving} aria-label="Close booking" className="meeting-composer-close h-10 shrink-0 rounded-[12px] border border-slate-200 bg-slate-50 px-3 text-[13px] font-black text-slate-700 disabled:opacity-60">
                <X size={18}/>
              </button>
            </div>

            <form className="grid min-h-0 gap-4 overflow-y-auto pr-1" onSubmit={submitMeeting}>
              <div className="rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3">
                <div className="text-[11px] font-black uppercase tracking-[0.14em] text-amber-700">Board</div>
                <div className="mt-1 truncate text-[15px] font-black text-slate-900">{board?.name || `Board #${boardID}`}</div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Meeting title">
                  <input required value={form.title} onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))} className="h-12 w-full rounded-[14px] border border-slate-200 bg-slate-50 px-3 text-[13px] font-bold text-slate-800 outline-none focus:border-amber-300" placeholder="Weekly check-in" />
                </Field>
                <Field label="Location">
                  <select value={form.location} onChange={(e) => setForm((prev) => ({ ...prev, location: e.target.value }))} className="h-12 w-full rounded-[14px] border border-slate-200 bg-slate-50 px-3 text-[13px] font-bold text-slate-800 outline-none focus:border-amber-300">
                    {MEETING_LOCATIONS.map((location) => <option key={location} value={location}>{location}</option>)}
                  </select>
                </Field>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <Field label="Date">
                  <input required type="date" value={form.date} onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))} className="h-12 w-full rounded-[14px] border border-slate-200 bg-slate-50 px-3 text-[13px] font-bold text-slate-800 outline-none focus:border-amber-300" />
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

              <div className="meeting-composer-footer flex justify-end gap-3 max-[520px]:sticky max-[520px]:bottom-0 max-[520px]:bg-white max-[520px]:py-2">
                <button type="button" className="meeting-composer-cancel" onClick={closeComposer}>Cancel</button>
                <button type="submit" disabled={saving} className="meeting-composer-submit h-12 rounded-[14px] border border-amber-300 bg-gradient-to-br from-amber-400 to-orange-400 px-5 text-[13px] font-black text-white shadow-[0_16px_34px_rgba(245,158,11,0.24)] disabled:opacity-70 max-[520px]:w-full">
                  {saving ? "Saving..." : editing ? "Save changes" : "Create meeting"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
      {dialog}</div>
    </AdminLayout>
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

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="board-meetings-info">
      <div className="text-[12px] font-black uppercase tracking-[0.16em] text-slate-400">{label}</div>
      <div className="mt-2 text-[16px] font-black text-slate-900">{value}</div>
    </div>
  );
}

function TextCard({ title, content }: { title: string; content: string }) {
  return (
    <div className="board-meetings-note">
      <div className="text-[12px] font-black uppercase tracking-[0.16em] text-slate-400">{title}</div>
      <div className="mt-2 whitespace-pre-wrap text-[14px] font-semibold leading-6 text-slate-700">
        {content}
      </div>
    </div>
  );
}
