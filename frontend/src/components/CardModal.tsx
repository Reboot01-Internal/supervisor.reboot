import { useEffect, useMemo, useState } from "react";
import Modal from "./Modal";
import { apiFetch } from "../lib/api";

type Card = {
  id: number;
  list_id: number;
  title: string;
  description: string;
  due_date: string;
  status: "todo" | "doing" | "blocked" | "done";
  priority: "low" | "medium" | "high" | "urgent";
};

type Subtask = {
  id: number;
  card_id: number;
  title: string;
  is_done: boolean;
  due_date: string;
};

type Assignee = {
  user_id: number;
  full_name: string;
  email: string;
  role: string;
};

type BoardMember = {
  user_id: number;
  full_name: string;
  email: string;
  role: string;
  role_in_board: string;
};

type Activity = {
  id: number;
  card_id: number;
  actor_user_id: number;
  actor_name: string;
  action: string;
  meta: string;
  created_at: string;
};

type CardLabel = { label_id: number; name: string; color: string };
type Label = { id: number; board_id: number; name: string; color: string };

type Comment = {
  id: number;
  card_id: number;
  actor_user_id: number;
  actor_name: string;
  body: string;
  created_at: string;
  updated_at: string;
};

type CardFull = {
  card: Card;
  subtasks: Subtask[];
  assignees: Assignee[];
  activities: Activity[];
  labels: CardLabel[];
  comments: Comment[];
  board_id: number;
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => (p[0] ? p[0].toUpperCase() : "")).join("");
}

function isDateOverdue(due: string) {
  if (!due) return false;
  const today = new Date();
  const dueD = new Date(due + "T00:00:00");
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return dueD < t;
}

function isDateToday(due: string) {
  if (!due) return false;
  const today = new Date();
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dueD = new Date(due + "T00:00:00");
  return (
    dueD.getFullYear() === t.getFullYear() &&
    dueD.getMonth() === t.getMonth() &&
    dueD.getDate() === t.getDate()
  );
}

function ClockIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 22a10 10 0 1 0-10-10 10 10 0 0 0 10 10Z"
        stroke="currentColor"
        strokeWidth="2"
        opacity="0.9"
      />
      <path
        d="M12 6v6l4 2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20 6 9 17l-5-5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ActivityIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 13.5 8.2 9.3l3.2 3.2L19.6 4.3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M20 12v7a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}

function ChatIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8Z"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}

function TagIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20.6 13.6 13.6 20.6a2 2 0 0 1-2.8 0L3 12.8V3h9.8l7.8 7.8a2 2 0 0 1 0 2.8Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path d="M7.5 7.5h.01" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function formatActivity(a: Activity) {
  const map: Record<string, string> = {
    card_created: "Card created",
    card_updated: "Card updated",
    card_moved: "Card moved",
    cards_reordered: "Cards reordered",
    subtask_created: "Subtask added",
    subtask_toggled: "Subtask toggled",
    subtask_deleted: "Subtask removed",
    subtask_due_date_updated: "Subtask due updated",
    assignee_added: "Assignee added",
    assignee_removed: "Assignee removed",
    label_added: "Label added",
    label_removed: "Label removed",
    comment_added: "Comment added",
    comment_updated: "Comment updated",
    comment_deleted: "Comment deleted",
  };
  return map[a.action] || a.action;
}

function prettyStatus(s: Card["status"]) {
  if (s === "doing") return "Doing";
  if (s === "blocked") return "Blocked";
  if (s === "done") return "Done";
  return "To Do";
}
function prettyPriority(p: Card["priority"]) {
  if (p === "low") return "Low";
  if (p === "high") return "High";
  if (p === "urgent") return "Urgent";
  return "Medium";
}

function pillStatusClass(s: Card["status"]) {
  switch (s) {
    case "doing":
      return "bg-blue-500/10 border-blue-500/25 text-slate-900";
    case "blocked":
      return "bg-rose-500/10 border-rose-500/25 text-slate-900";
    case "done":
      return "bg-emerald-500/10 border-emerald-500/25 text-slate-900";
    default:
      return "bg-slate-900/5 border-slate-900/10 text-slate-900";
  }
}

function pillPriorityClass(p: Card["priority"]) {
  switch (p) {
    case "low":
      return "bg-sky-500/10 border-sky-500/25 text-slate-900";
    case "high":
      return "bg-amber-500/15 border-amber-500/30 text-slate-900";
    case "urgent":
      return "bg-red-500/15 border-red-500/30 text-slate-900";
    default:
      return "bg-slate-500/10 border-slate-500/25 text-slate-900";
  }
}

function duePillClass(kind: "overdue" | "soon" | "none") {
  if (kind === "overdue") return "border-red-500/25 bg-red-500/10 text-red-700";
  if (kind === "soon") return "border-amber-500/25 bg-amber-500/10 text-amber-700";
  return "border-slate-900/10 bg-slate-900/5 text-slate-700";
}

function labelDotClass(color: string) {
  const map: Record<string, string> = {
    indigo: "bg-indigo-600",
    sky: "bg-sky-600",
    emerald: "bg-emerald-500",
    amber: "bg-amber-500",
    rose: "bg-rose-500",
    violet: "bg-violet-600",
    slate: "bg-slate-600",
  };
  return map[color] || "bg-indigo-600";
}

/** slightly more compact controls */
const inputBase =
  "h-10 w-full rounded-[14px] border border-slate-900/10 bg-slate-50 px-3 text-slate-900 outline-none transition focus:border-indigo-500/35 focus:bg-white focus:ring-4 focus:ring-indigo-500/15";

const btnPrimary =
  "h-10 rounded-[14px] px-4 font-extrabold text-white disabled:opacity-70 disabled:cursor-not-allowed shadow-[0_18px_45px_rgba(15,23,42,0.08)] bg-gradient-to-br from-indigo-600 to-violet-500";

const btnGhost =
  "h-10 rounded-[14px] px-4 font-extrabold border border-slate-900/10 bg-slate-50 hover:border-indigo-500/20 hover:bg-indigo-500/10";

const btnSoft =
  "h-10 rounded-[14px] px-4 font-extrabold border border-slate-900/10 bg-white hover:bg-indigo-500/[0.04]";

const pillBase =
  "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] font-extrabold";

const section =
  "rounded-[18px] border border-slate-900/10 bg-white p-3.5 shadow-[0_14px_34px_rgba(15,23,42,0.06)]";

type TabKey = "overview" | "details" | "discussion" | "activity";

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "h-10 rounded-full px-4 text-[13px] font-extrabold transition border",
        active
          ? "border-indigo-500/30 bg-indigo-500/10 text-slate-900"
          : "border-slate-900/10 bg-white text-slate-600 hover:bg-indigo-500/[0.05]",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

export default function CardModal({
  open,
  cardId,
  onClose,
  onSaved,
}: {
  open: boolean;
  cardId: number | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [tab, setTab] = useState<TabKey>("overview");

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const [card, setCard] = useState<Card | null>(null);
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [boardId, setBoardId] = useState<number | null>(null);
  const [boardMembers, setBoardMembers] = useState<BoardMember[]>([]);

  const [cardLabels, setCardLabels] = useState<CardLabel[]>([]);
  const [boardLabels, setBoardLabels] = useState<Label[]>([]);
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelColor, setNewLabelColor] = useState("indigo");

  const [comments, setComments] = useState<Comment[]>([]);
  const [commentBody, setCommentBody] = useState("");
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editingBody, setEditingBody] = useState("");

  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [subtaskDue, setSubtaskDue] = useState("");

  const [assigneeQuery, setAssigneeQuery] = useState("");
  const [assigneeOpen, setAssigneeOpen] = useState(false);

  const [doneAnimId, setDoneAnimId] = useState<number | null>(null);

  const assigneeIds = useMemo(() => new Set(assignees.map((a) => a.user_id)), [assignees]);

  const isOverdue = useMemo(
    () => (card?.due_date ? isDateOverdue(card.due_date) : false),
    [card?.due_date]
  );

  const progress = useMemo(() => {
    if (subtasks.length === 0) return null;
    const done = subtasks.filter((s) => s.is_done).length;
    const total = subtasks.length;
    const pct = total === 0 ? 0 : Math.round((done / total) * 100);
    return { done, total, pct };
  }, [subtasks]);

  const studentsOnly = useMemo(() => boardMembers.filter((m) => m.role === "student"), [boardMembers]);

  const availableStudents = useMemo(() => {
    const q = assigneeQuery.trim().toLowerCase();
    return studentsOnly
      .filter((m) => !assigneeIds.has(m.user_id))
      .filter((m) => {
        if (!q) return true;
        return m.full_name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q);
      })
      .slice(0, 10);
  }, [studentsOnly, assigneeIds, assigneeQuery]);

  const cardLabelIds = useMemo(() => new Set(cardLabels.map((x) => x.label_id)), [cardLabels]);

  async function loadAll() {
    if (!open || !cardId) return;
    setErr("");
    setMsg("");
    setLoading(true);

    try {
      const full: CardFull = await apiFetch(`/admin/card/full?card_id=${cardId}`);
      setCard(full.card);
      setSubtasks(full.subtasks || []);
      setAssignees(full.assignees || []);
      setActivities(full.activities || []);
      setBoardId(full.board_id);

      setCardLabels(full.labels || []);
      setComments(full.comments || []);

      const members: BoardMember[] = await apiFetch(`/admin/board-members?board_id=${full.board_id}`);
      setBoardMembers(members || []);

      const labels: Label[] = await apiFetch(`/admin/labels?board_id=${full.board_id}`);
      setBoardLabels(labels || []);
    } catch (e: any) {
      setErr(e.message || "Failed to load card");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open || !cardId) return;

    setTab("overview");

    setAssigneeQuery("");
    setAssigneeOpen(false);
    setSubtaskTitle("");
    setSubtaskDue("");
    setDoneAnimId(null);

    setNewLabelName("");
    setNewLabelColor("indigo");

    setCommentBody("");
    setEditingCommentId(null);
    setEditingBody("");

    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cardId]);

  useEffect(() => {
    if (!assigneeOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setAssigneeOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [assigneeOpen]);

  async function saveCard() {
    if (!card) return;

    setErr("");
    setMsg("");
    setSaving(true);

    try {
      await apiFetch("/admin/card", {
        method: "PUT",
        body: JSON.stringify({
          card_id: card.id,
          title: card.title.trim(),
          description: card.description.trim(),
          due_date: card.due_date || "",
          status: card.status || "todo",
          priority: card.priority || "medium",
        }),
      });

      setMsg("Saved.");
      onSaved();
      onClose();
    } catch (e: any) {
      setErr(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function addSubtask() {
    if (!card || !subtaskTitle.trim()) return;
    setErr("");
    setMsg("");

    try {
      await apiFetch("/admin/card/subtasks", {
        method: "POST",
        body: JSON.stringify({ card_id: card.id, title: subtaskTitle.trim(), due_date: subtaskDue || "" }),
      });
      setSubtaskTitle("");
      setSubtaskDue("");
      await loadAll();
    } catch (e: any) {
      setErr(e.message || "Failed to add subtask");
    }
  }

  async function toggleSubtask(id: number, isDone: boolean) {
    setErr("");
    setMsg("");
    setDoneAnimId(id);
    setTimeout(() => setDoneAnimId(null), 280);

    try {
      await apiFetch("/admin/card/subtasks/toggle", {
        method: "POST",
        body: JSON.stringify({ subtask_id: id, is_done: isDone }),
      });
      setSubtasks((prev) => prev.map((s) => (s.id === id ? { ...s, is_done: isDone } : s)));
      await loadAll();
    } catch (e: any) {
      setErr(e.message || "Failed to update subtask");
    }
  }

  async function updateSubtaskDue(id: number, due: string) {
    setErr("");
    setMsg("");
    setSubtasks((prev) => prev.map((s) => (s.id === id ? { ...s, due_date: due } : s)));

    try {
      await apiFetch("/admin/card/subtasks/due", {
        method: "POST",
        body: JSON.stringify({ subtask_id: id, due_date: due || "" }),
      });
      await loadAll();
    } catch (e: any) {
      setErr(e.message || "Failed to update subtask due date");
      await loadAll();
    }
  }

  async function deleteSubtask(id: number) {
    setErr("");
    setMsg("");
    try {
      await apiFetch("/admin/card/subtasks/delete", {
        method: "POST",
        body: JSON.stringify({ subtask_id: id }),
      });
      setSubtasks((prev) => prev.filter((s) => s.id !== id));
      await loadAll();
    } catch (e: any) {
      setErr(e.message || "Failed to delete subtask");
    }
  }

  async function removeAssignee(userId: number) {
    if (!card) return;
    setErr("");
    setMsg("");
    try {
      await apiFetch("/admin/card/assignees/remove", {
        method: "POST",
        body: JSON.stringify({ card_id: card.id, user_id: userId }),
      });
      await loadAll();
    } catch (e: any) {
      setErr(e.message || "Failed to remove assignee");
    }
  }

  async function addAssignee(userId: number) {
    if (!card) return;
    setErr("");
    setMsg("");
    try {
      await apiFetch("/admin/card/assignees/add", {
        method: "POST",
        body: JSON.stringify({ card_id: card.id, user_id: userId }),
      });
      setAssigneeQuery("");
      setAssigneeOpen(false);
      await loadAll();
    } catch (e: any) {
      setErr(e.message || "Failed to add assignee");
    }
  }

  async function createLabel() {
    if (!boardId || !newLabelName.trim()) return;
    setErr("");
    setMsg("");

    try {
      await apiFetch("/admin/labels", {
        method: "POST",
        body: JSON.stringify({ board_id: boardId, name: newLabelName.trim(), color: newLabelColor }),
      });
      setNewLabelName("");
      const labels: Label[] = await apiFetch(`/admin/labels?board_id=${boardId}`);
      setBoardLabels(labels || []);
    } catch (e: any) {
      setErr(e.message || "Failed to create label");
    }
  }

  async function toggleLabel(labelId: number) {
    if (!card) return;
    setErr("");
    setMsg("");
    const has = cardLabelIds.has(labelId);

    try {
      await apiFetch(has ? "/admin/card/labels/remove" : "/admin/card/labels/add", {
        method: "POST",
        body: JSON.stringify({ card_id: card.id, label_id: labelId }),
      });
      await loadAll();
    } catch (e: any) {
      setErr(e.message || "Failed to update label");
    }
  }

  async function addComment() {
    if (!card || !commentBody.trim()) return;
    setErr("");
    setMsg("");
    try {
      await apiFetch("/admin/card/comments", {
        method: "POST",
        body: JSON.stringify({ card_id: card.id, body: commentBody.trim() }),
      });
      setCommentBody("");
      await loadAll();
    } catch (e: any) {
      setErr(e.message || "Failed to add comment");
    }
  }

  function startEditComment(c: Comment) {
    setEditingCommentId(c.id);
    setEditingBody(c.body);
  }

  async function saveEditComment() {
    if (!card || !editingCommentId || !editingBody.trim()) return;
    setErr("");
    setMsg("");
    try {
      await apiFetch("/admin/card/comments", {
        method: "PUT",
        body: JSON.stringify({ comment_id: editingCommentId, card_id: card.id, body: editingBody.trim() }),
      });
      setEditingCommentId(null);
      setEditingBody("");
      await loadAll();
    } catch (e: any) {
      setErr(e.message || "Failed to update comment");
    }
  }

  async function deleteComment(id: number) {
    if (!card) return;
    setErr("");
    setMsg("");
    try {
      await apiFetch("/admin/card/comments/delete", {
        method: "POST",
        body: JSON.stringify({ comment_id: id, card_id: card.id }),
      });
      await loadAll();
    } catch (e: any) {
      setErr(e.message || "Failed to delete comment");
    }
  }

  const cardDueKind: "overdue" | "soon" | "none" =
    isOverdue ? "overdue" : card?.due_date ? "soon" : "none";

  return (
    <Modal
      open={open}
      title={cardId ? `Card #${cardId}` : "Card"}
      onClose={onClose}
      footer={
        <>
          <button className={btnGhost} onClick={onClose}>
            Cancel
          </button>
          <button className={btnPrimary} onClick={saveCard} disabled={saving || loading || !card?.title?.trim()}>
            {saving ? "Saving..." : "Save"}
          </button>
        </>
      }
    >
      {loading ? (
        <div className="text-[13px] font-semibold text-slate-500">Loading...</div>
      ) : (
        <div>
          {err && (
            <div className="mb-[10px] rounded-[14px] border border-red-500/25 bg-red-500/10 px-3 py-2 text-[13px] font-semibold text-red-700">
              {err}
            </div>
          )}
          {msg && (
            <div className="mb-[10px] rounded-[14px] border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-[13px] font-semibold text-emerald-700">
              {msg}
            </div>
          )}

          {!card ? (
            <div className="text-[13px] font-semibold text-slate-500">No card loaded.</div>
          ) : (
            <>
              {/* Tabs */}
              <div className="mb-3 flex flex-wrap gap-2">
                <TabButton active={tab === "overview"} onClick={() => setTab("overview")}>
                  Overview
                </TabButton>
                <TabButton active={tab === "details"} onClick={() => setTab("details")}>
                  Details
                </TabButton>
                <TabButton active={tab === "discussion"} onClick={() => setTab("discussion")}>
                  Discussion
                </TabButton>
                <TabButton active={tab === "activity"} onClick={() => setTab("activity")}>
                  Activity
                </TabButton>
              </div>

              {/* Tab content (scroll only inside content area) */}
              <div className="max-h-[62vh] overflow-y-auto overflow-x-hidden pr-[2px]">
                {tab === "overview" && (
                  <div className="grid gap-3 xl:grid-cols-12">
                    {/* Row 1: Title + Due */}
                    <div className={`${section} xl:col-span-7`}>
                      <div className="mb-2 flex items-start justify-between gap-3">
                        <div>
                          <div className="text-[14px] font-black text-slate-900">Title</div>
                          <div className="mt-[2px] text-[12px] font-semibold text-slate-500">Short and clear</div>
                        </div>
                        <span className={`${pillBase} border-slate-900/10 bg-slate-900/5 text-slate-700`}>
                          #{card.id}
                        </span>
                      </div>

                      <input
                        className={inputBase}
                        value={card.title}
                        onChange={(e) => setCard({ ...card, title: e.target.value })}
                        placeholder="Card title"
                      />
                    </div>

                    <div className={`${section} xl:col-span-5`}>
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-[14px] font-black text-slate-900">
                          <ClockIcon /> Due date
                        </div>

                        <span className={`${pillBase} ${duePillClass(cardDueKind)} gap-2`}>
                          <ClockIcon />
                          {card.due_date || "None"}
                        </span>
                      </div>

                      <div className="grid gap-2">
                        <input
                          className={inputBase}
                          type="date"
                          value={card.due_date || ""}
                          onChange={(e) => setCard({ ...card, due_date: e.target.value })}
                        />
                        <button className={btnSoft} type="button" onClick={() => setCard({ ...card, due_date: "" })}>
                          Clear
                        </button>
                      </div>
                    </div>

                    {/* Row 2: Status/Priority + Assignees */}
                    <div className={`${section} xl:col-span-7`}>
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <div>
                          <div className="text-[14px] font-black text-slate-900">Status & Priority</div>
                          <div className="mt-[2px] text-[12px] font-semibold text-slate-500">Quick settings</div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <span className={`${pillBase} ${pillStatusClass(card.status)}`}>{prettyStatus(card.status)}</span>
                          <span className={`${pillBase} ${pillPriorityClass(card.priority)}`}>
                            {prettyPriority(card.priority)}
                          </span>
                        </div>
                      </div>

                      <div className="grid gap-2 sm:grid-cols-2">
                        <div>
                          <div className="mb-1 text-[12px] font-semibold text-slate-500">Status</div>
                          <select
                            className={inputBase}
                            value={card.status || "todo"}
                            onChange={(e) => setCard({ ...card, status: e.target.value as any })}
                          >
                            <option value="todo">To Do</option>
                            <option value="doing">Doing</option>
                            <option value="blocked">Blocked</option>
                            <option value="done">Done</option>
                          </select>
                        </div>

                        <div>
                          <div className="mb-1 text-[12px] font-semibold text-slate-500">Priority</div>
                          <select
                            className={inputBase}
                            value={card.priority || "medium"}
                            onChange={(e) => setCard({ ...card, priority: e.target.value as any })}
                          >
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                            <option value="urgent">Urgent</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    <div className={`${section} xl:col-span-5`}>
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <div>
                          <div className="text-[14px] font-black text-slate-900">Assignees</div>
                          <div className="mt-[2px] text-[12px] font-semibold text-slate-500">Assign students</div>
                        </div>
                        <span className={`${pillBase} border-indigo-500/25 bg-indigo-500/10 text-slate-900`}>
                          {assignees.length}
                        </span>
                      </div>

                      {assignees.length === 0 ? (
                        <div className="text-[13px] font-semibold text-slate-500">No assignees yet.</div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {assignees.map((a) => (
                            <div
                              key={a.user_id}
                              className={`${pillBase} border-indigo-500/25 bg-indigo-500/10 pr-1`}
                            >
                              <span className="grid h-[22px] w-[22px] place-items-center rounded-full border border-slate-900/10 bg-slate-900/5 text-[11px] font-black">
                                {initials(a.full_name)}
                              </span>
                              <span className="text-[12px] font-black">{a.full_name}</span>
                              <button
                                className="h-[32px] rounded-[12px] border border-slate-900/10 bg-white/70 px-2.5 font-black hover:bg-rose-500/10"
                                type="button"
                                onClick={() => removeAssignee(a.user_id)}
                                title="Remove"
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="h-2" />

                      {studentsOnly.length === 0 ? (
                        <div className="text-[13px] font-semibold text-slate-500">
                          No students in this board yet. Add them from “Members”.
                        </div>
                      ) : (
                        <div className="relative">
                          <input
                            className={inputBase}
                            placeholder="Search student to assign..."
                            value={assigneeQuery}
                            onChange={(e) => {
                              setAssigneeQuery(e.target.value);
                              setAssigneeOpen(true);
                            }}
                            onFocus={() => setAssigneeOpen(true)}
                            onBlur={() => setTimeout(() => setAssigneeOpen(false), 120)}
                          />

                          {assigneeOpen && availableStudents.length > 0 && (
                            <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-30 rounded-[18px] border border-slate-900/10 bg-white p-2.5 shadow-[0_18px_50px_rgba(15,23,42,0.10)]">
                              <div className="grid gap-2">
                                {availableStudents.map((m) => (
                                  <button
                                    key={m.user_id}
                                    type="button"
                                    className="flex h-10 w-full items-center justify-between gap-3 rounded-[14px] border border-slate-900/10 bg-white px-3 text-left font-extrabold hover:bg-indigo-500/[0.04]"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => addAssignee(m.user_id)}
                                  >
                                    <span className="flex min-w-0 items-center gap-3">
                                      <span className="grid h-[24px] w-[24px] place-items-center rounded-full border border-slate-900/10 bg-slate-900/5 text-[12px] font-black">
                                        {initials(m.full_name)}
                                      </span>

                                      <span className="min-w-0">
                                        <span className="block truncate text-[13px] font-black text-slate-900">
                                          {m.full_name}
                                        </span>
                                        <span className="block truncate text-[12px] font-semibold text-slate-500">
                                          {m.email}
                                        </span>
                                      </span>
                                    </span>

                                    <span className={`${pillBase} border-indigo-500/25 bg-indigo-500/10 text-slate-900`}>
                                      Add
                                    </span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Row 3: Labels (two-column inside, no wasted horizontal space) */}
                    <div className={`${section} xl:col-span-12`}>
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-[14px] font-black text-slate-900">
                          <TagIcon /> Labels
                        </div>
                        <span className={`${pillBase} border-indigo-500/25 bg-indigo-500/10 text-slate-900`}>
                          {cardLabels.length}
                        </span>
                      </div>

                      <div className="grid gap-3 lg:grid-cols-[1fr_420px] lg:items-start">
                        {/* Existing labels list */}
                        <div>
                          {boardLabels.length === 0 ? (
                            <div className="text-[13px] font-semibold text-slate-500">No labels yet.</div>
                          ) : (
                            <div className="grid gap-2 sm:grid-cols-2">
                              {boardLabels.map((l) => {
                                const active = cardLabelIds.has(l.id);
                                return (
                                  <button
                                    key={l.id}
                                    type="button"
                                    onClick={() => toggleLabel(l.id)}
                                    className={[
                                      "flex h-10 w-full items-center gap-3 rounded-xl border px-3 text-left font-extrabold",
                                      active
                                        ? "border-indigo-500/35 bg-indigo-500/10"
                                        : "border-slate-900/10 bg-white/85 hover:bg-indigo-500/[0.04]",
                                    ].join(" ")}
                                  >
                                    <span className={`h-2.5 w-2.5 rounded-full ${labelDotClass(l.color)}`} />
                                    <span className="min-w-0 flex-1 truncate">{l.name}</span>
                                    <span className="text-[11px] font-extrabold text-slate-500">
                                      {active ? "On" : "Off"}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* Create label box */}
                        <div className="rounded-[16px] border border-slate-900/10 bg-slate-50 p-3">
                          <div className="mb-2 text-[12px] font-extrabold text-slate-700">Create a new label</div>
                          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                            <input
                              className={inputBase}
                              placeholder="Label name..."
                              value={newLabelName}
                              onChange={(e) => setNewLabelName(e.target.value)}
                            />
                            <select
                              className={inputBase}
                              value={newLabelColor}
                              onChange={(e) => setNewLabelColor(e.target.value)}
                            >
                              <option value="indigo">Indigo</option>
                              <option value="sky">Sky</option>
                              <option value="emerald">Emerald</option>
                              <option value="amber">Amber</option>
                              <option value="rose">Rose</option>
                              <option value="violet">Violet</option>
                              <option value="slate">Slate</option>
                            </select>
                          </div>

                          <div className="mt-2 flex justify-end">
                            <button
                              className={btnPrimary}
                              type="button"
                              onClick={createLabel}
                              disabled={!newLabelName.trim() || !boardId}
                            >
                              Create
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {tab === "details" && (
                  <div className="grid gap-[14px]">
                    <div className={section}>
                      <div className="mb-[10px]">
                        <div className="text-[14px] font-black text-slate-900">Description</div>
                        <div className="mt-[2px] text-[12px] font-semibold text-slate-500">
                          Notes, requirements, links
                        </div>
                      </div>

                      <textarea
                        className={inputBase + " h-auto min-h-[160px] py-3"}
                        value={card.description}
                        onChange={(e) => setCard({ ...card, description: e.target.value })}
                        placeholder="Write details..."
                        rows={8}
                      />
                    </div>

                    <div className={section}>
                      <div className="mb-[10px] flex items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 text-[14px] font-black text-slate-900">
                            <CheckIcon /> Checklist
                          </div>
                          <div className="mt-[2px] text-[12px] font-semibold text-slate-500">
                            {progress ? `${progress.done}/${progress.total} completed` : "No subtasks yet"}
                          </div>
                        </div>
                        <span className={`${pillBase} border-indigo-500/25 bg-indigo-500/10 text-slate-900`}>
                          {subtasks.length}
                        </span>
                      </div>

                      {progress && (
                        <div className="mt-2">
                          <div className="h-2 overflow-hidden rounded-full bg-slate-900/10">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-blue-600/90 to-sky-500/60 transition-[width] duration-200"
                              style={{ width: `${progress.pct}%` }}
                            />
                          </div>
                        </div>
                      )}

                      <div className="h-3" />

                      <div className="grid gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            className={inputBase}
                            placeholder="Add a subtask..."
                            value={subtaskTitle}
                            onChange={(e) => setSubtaskTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                addSubtask();
                              }
                            }}
                          />
                          <button className={btnPrimary} onClick={addSubtask} disabled={!subtaskTitle.trim()}>
                            Add
                          </button>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`${pillBase} border-slate-900/10 bg-slate-900/5 text-slate-700`}>
                            <ClockIcon /> Due (optional)
                          </span>

                          <input
                            className={inputBase + " max-w-[220px]"}
                            type="date"
                            value={subtaskDue}
                            onChange={(e) => setSubtaskDue(e.target.value)}
                          />

                          <button className={btnSoft} type="button" onClick={() => setSubtaskDue("")}>
                            Clear
                          </button>
                        </div>
                      </div>

                      <div className="h-3" />

                      {subtasks.length > 0 && (
                        <div className="grid gap-2">
                          {subtasks.map((s) => {
                            const overdue = s.due_date ? isDateOverdue(s.due_date) : false;
                            const today = s.due_date ? isDateToday(s.due_date) : false;

                            return (
                              <div
                                key={s.id}
                                className={[
                                  "rounded-[16px] border border-slate-900/10 bg-blue-500/[0.03] p-3 transition",
                                  "hover:-translate-y-[1px] hover:border-blue-500/20 hover:bg-blue-500/[0.05]",
                                  doneAnimId === s.id ? "animate-[cmPop_0.28s_ease]" : "",
                                ].join(" ")}
                              >
                                <style>{`@keyframes cmPop{from{transform:scale(.98)}to{transform:scale(1)}}`}</style>

                                <div className="flex flex-wrap items-center gap-3">
                                  <input
                                    type="checkbox"
                                    checked={s.is_done}
                                    onChange={(e) => toggleSubtask(s.id, e.target.checked)}
                                  />

                                  <div
                                    className={[
                                      "flex-1 text-[14px] font-semibold",
                                      s.is_done ? "text-slate-500 line-through" : "text-slate-900",
                                    ].join(" ")}
                                  >
                                    {s.title}
                                  </div>

                                  <span
                                    className={[
                                      pillBase,
                                      duePillClass(overdue ? "overdue" : today ? "soon" : "none"),
                                      "opacity-100",
                                    ].join(" ")}
                                    title={s.due_date ? `Due ${s.due_date}` : "No due date"}
                                    style={{ opacity: s.due_date ? 1 : 0.7 }}
                                  >
                                    <ClockIcon />
                                    {s.due_date || "No due"}
                                  </span>

                                  <button className={btnSoft} type="button" onClick={() => deleteSubtask(s.id)}>
                                    Remove
                                  </button>
                                </div>

                                <div className="mt-3 flex flex-wrap items-center gap-2">
                                  <div className="text-[12px] font-semibold text-slate-500">Subtask due date</div>

                                  <input
                                    className={inputBase + " max-w-[220px]"}
                                    type="date"
                                    value={s.due_date || ""}
                                    onChange={(e) => updateSubtaskDue(s.id, e.target.value)}
                                  />

                                  <button className={btnSoft} type="button" onClick={() => updateSubtaskDue(s.id, "")}>
                                    Clear
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {tab === "discussion" && (
                  <div className="grid gap-[14px]">
                    <div className={section}>
                      <div className="mb-[10px] flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-[14px] font-black text-slate-900">
                          <ChatIcon /> Comments
                        </div>
                        <span className={`${pillBase} border-indigo-500/25 bg-indigo-500/10 text-slate-900`}>
                          {comments.length}
                        </span>
                      </div>

                      <div className="grid gap-2">
                        <textarea
                          className={inputBase + " h-auto py-3"}
                          placeholder="Write a comment..."
                          value={commentBody}
                          onChange={(e) => setCommentBody(e.target.value)}
                          rows={3}
                        />
                        <div className="flex justify-end">
                          <button className={btnPrimary} type="button" onClick={addComment} disabled={!commentBody.trim()}>
                            Add comment
                          </button>
                        </div>
                      </div>

                      {comments.length === 0 ? (
                        <div className="mt-3 text-[13px] font-semibold text-slate-500">No comments yet.</div>
                      ) : (
                        <div className="mt-3 grid gap-3">
                          {comments.slice(0, 60).map((c) => (
                            <div
                              key={c.id}
                              className="flex gap-3 rounded-[14px] border border-slate-900/10 bg-white/85 p-3"
                            >
                              <div className="grid h-[34px] w-[34px] place-items-center rounded-full border border-slate-900/10 bg-slate-900/5 text-[12px] font-black text-slate-800">
                                {initials(c.actor_name)}
                              </div>

                              <div className="min-w-0 flex-1">
                                <div className="flex items-baseline justify-between gap-3">
                                  <div className="truncate font-black text-slate-900">{c.actor_name}</div>
                                  <div className="shrink-0 text-[12px] font-semibold text-slate-500">{c.created_at}</div>
                                </div>

                                {editingCommentId === c.id ? (
                                  <div className="mt-2 grid gap-2">
                                    <textarea
                                      className={inputBase + " h-auto py-3"}
                                      value={editingBody}
                                      onChange={(e) => setEditingBody(e.target.value)}
                                      rows={3}
                                    />
                                    <div className="flex justify-end gap-2">
                                      <button
                                        className={btnGhost}
                                        type="button"
                                        onClick={() => {
                                          setEditingCommentId(null);
                                          setEditingBody("");
                                        }}
                                      >
                                        Cancel
                                      </button>
                                      <button
                                        className={btnPrimary}
                                        type="button"
                                        onClick={saveEditComment}
                                        disabled={!editingBody.trim()}
                                      >
                                        Save
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="mt-2 whitespace-pre-wrap text-[14px] font-semibold text-slate-900">
                                    {c.body}
                                  </div>
                                )}

                                {editingCommentId !== c.id && (
                                  <div className="mt-2 flex gap-2">
                                    <button className={btnSoft} type="button" onClick={() => startEditComment(c)}>
                                      Edit
                                    </button>
                                    <button className={btnSoft} type="button" onClick={() => deleteComment(c.id)}>
                                      Delete
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {tab === "activity" && (
                  <div className="grid gap-[14px]">
                    <div className={section}>
                      <div className="mb-[10px] flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-[14px] font-black text-slate-900">
                          <ActivityIcon /> Activity
                        </div>
                        <span className={`${pillBase} border-indigo-500/25 bg-indigo-500/10 text-slate-900`}>
                          {activities.length}
                        </span>
                      </div>

                      {activities.length === 0 ? (
                        <div className="text-[13px] font-semibold text-slate-500">No activity yet.</div>
                      ) : (
                        <div className="grid gap-2">
                          {activities.slice(0, 80).map((a) => (
                            <div
                              key={a.id}
                              className="rounded-[14px] border border-slate-900/10 bg-slate-50 px-3 py-2 text-[13px]"
                            >
                              <div className="text-[13px] font-black text-slate-900">
                                {a.actor_name} — {formatActivity(a)}
                              </div>
                              {a.meta ? <div className="mt-1 text-[13px] font-semibold text-slate-500">{a.meta}</div> : null}
                              <div className="mt-1.5 text-[12px] font-semibold text-slate-500">{a.created_at}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}