import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import AdminLayout from "../components/AdminLayout";
import { API_URL, apiFetch, authHeaders } from "../lib/api";
import { useAuth } from "../lib/auth";

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

function DownloadIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 4v10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="m8 10 4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 20h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export default function BoardMeetingsPage() {
  const nav = useNavigate();
  const { boardId } = useParams();
  const boardID = Number(boardId);
  const { isAdmin, isSupervisor } = useAuth();
  const canManage = isAdmin || isSupervisor;

  const [board, setBoard] = useState<BoardFull | null>(null);
  const [meetings, setMeetings] = useState<MeetingRow[]>([]);
  const [participantsByMeeting, setParticipantsByMeeting] = useState<Record<number, MeetingParticipant[]>>({});
  const [participantsLoading, setParticipantsLoading] = useState<Record<number, boolean>>({});
  const [selectedMeetingID, setSelectedMeetingID] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");

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

  const selectedParticipants = selectedMeeting ? participantsByMeeting[selectedMeeting.id] || [] : [];

  useEffect(() => {
    if (!selectedMeeting) return;
    if (!participantsByMeeting[selectedMeeting.id] && !participantsLoading[selectedMeeting.id]) {
      void loadParticipants(selectedMeeting.id);
    }
  }, [loadParticipants, participantsByMeeting, participantsLoading, selectedMeeting]);

  async function exportBoardMeetings() {
    setExporting(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/admin/meetings/export?board_id=${boardID}`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error("Failed to export meetings");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(board?.name || `board-${boardID}`).replace(/\s+/g, "-").toLowerCase()}-meetings.ics`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e?.message || "Failed to export meetings");
    } finally {
      setExporting(false);
    }
  }

  const pageTitle = board?.name ? `${board.name} Meetings` : `Board #${boardID} Meetings`;

  return (
    <AdminLayout
      active={isAdmin ? "boards" : "boards"}
      title={pageTitle}
      subtitle="All meetings for this board, with attendance, notes, and outcomes in one place."
      right={
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => nav(`/admin/boards/${boardID}`)}
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-extrabold text-slate-700 transition hover:bg-slate-50"
          >
            Board
          </button>
          <button
            type="button"
            onClick={() => nav("/admin/meetings")}
            className="h-10 rounded-xl border border-amber-200 bg-amber-50 px-3 text-[13px] font-extrabold text-amber-700 transition hover:bg-amber-100"
          >
            Full calendar
          </button>
        </div>
      }
    >
      {error ? (
        <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="text-sm font-semibold text-slate-500">Loading board meetings...</div>
      ) : (
        <div className="grid h-[calc(100vh-220px)] min-h-0 gap-4">
          <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex h-9 items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 text-[12px] font-black text-slate-700">
                  <CalendarIcon size={14} />
                  {meetings.length} Meetings
                </span>
                {selectedMeeting ? (
                  <span className={`inline-flex h-9 items-center rounded-full border px-3 text-[12px] font-black ${statusTone(selectedMeeting.status)}`}>
                    {selectedMeeting.status}
                  </span>
                ) : null}
              </div>

              <button
                type="button"
                onClick={exportBoardMeetings}
                disabled={exporting}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-[13px] font-extrabold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
              >
                <DownloadIcon size={14} />
                {exporting ? "Exporting..." : "Export calendar"}
              </button>
            </div>
          </div>

          {meetings.length === 0 ? (
            <div className="rounded-[22px] border border-dashed border-slate-300 bg-white/80 px-6 py-12 text-center shadow-[0_12px_34px_rgba(15,23,42,0.04)]">
              <div className="text-[18px] font-black text-slate-900">No meetings for this board yet</div>
              <div className="mt-2 text-sm font-semibold text-slate-500">
                {canManage ? "Create the first meeting from the meetings calendar, then it will show up here." : "When meetings are scheduled for this board, their details will appear here."}
              </div>
            </div>
          ) : (
            <div className="grid min-h-0 gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
              <div className="min-h-0 rounded-[22px] border border-slate-200 bg-white p-3 shadow-[0_16px_40px_rgba(15,23,42,0.06)] overflow-hidden">
                <div className="mb-2 px-2 text-[12px] font-black uppercase tracking-[0.16em] text-slate-400">
                  Board timeline
                </div>
                <div className="grid max-h-full min-h-0 gap-2 overflow-y-auto pr-1 [scrollbar-width:thin]">
                  {meetings.map((meeting) => (
                    <button
                      key={meeting.id}
                      type="button"
                      onClick={() => setSelectedMeetingID(meeting.id)}
                      className={`rounded-[18px] border p-4 text-left transition ${
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
                <div className="min-h-0 overflow-y-auto rounded-[22px] border border-slate-200 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)] [scrollbar-width:thin]">
                  <div className="flex flex-wrap items-start justify-between gap-4">
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

                    <span className={`rounded-full border px-3 py-1.5 text-[12px] font-black capitalize ${statusTone(selectedMeeting.status)}`}>
                      {selectedMeeting.status}
                    </span>
                  </div>

                  <div className="mt-5 grid gap-4 lg:grid-cols-2">
                    <InfoCard label="Supervisor" value={selectedMeeting.supervisor_name || "Unknown"} />
                    <InfoCard label="Created by" value={selectedMeeting.created_by_name || "Unknown"} />
                  </div>

                  <div className="mt-5 grid gap-4 lg:grid-cols-2">
                    <TextCard
                      title="Agenda / Notes"
                      content={selectedMeeting.notes || "No meeting notes were added yet."}
                    />
                    <TextCard
                      title="Outcome"
                      content={selectedMeeting.outcome_notes || "No outcome notes were added yet."}
                    />
                  </div>

                  <div className="mt-5">
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
                        {selectedParticipants.map((participant) => (
                          <div
                            key={participant.user_id}
                            className="rounded-[18px] border border-slate-200 bg-slate-50/70 px-4 py-3"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate text-[14px] font-black text-slate-900">
                                  {participant.full_name}
                                </div>
                                <div className="mt-1 flex flex-wrap gap-2 text-[12px] font-semibold text-slate-500">
                                  <span>{participant.email}</span>
                                  {participant.nickname ? <span>@{participant.nickname}</span> : null}
                                  <span>{participant.role_in_board || participant.role}</span>
                                </div>
                              </div>

                              <div className="flex flex-wrap gap-2">
                                <span className={`rounded-full border px-2.5 py-1 text-[11px] font-black ${rsvpTone(participant.rsvp_status)}`}>
                                  RSVP: {participant.rsvp_status}
                                </span>
                                <span className={`rounded-full border px-2.5 py-1 text-[11px] font-black ${attendanceTone(participant.attendance_status)}`}>
                                  Attendance: {participant.attendance_status}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}
    </AdminLayout>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] border border-slate-200 bg-slate-50/70 p-4">
      <div className="text-[12px] font-black uppercase tracking-[0.16em] text-slate-400">{label}</div>
      <div className="mt-2 text-[16px] font-black text-slate-900">{value}</div>
    </div>
  );
}

function TextCard({ title, content }: { title: string; content: string }) {
  return (
    <div className="rounded-[18px] border border-slate-200 bg-slate-50/70 p-4">
      <div className="text-[12px] font-black uppercase tracking-[0.16em] text-slate-400">{title}</div>
      <div className="mt-2 whitespace-pre-wrap text-[14px] font-semibold leading-6 text-slate-700">
        {content}
      </div>
    </div>
  );
}
