import { useEffect, useMemo, useRef, useState } from "react";
import Modal from "./Modal";
import { apiFetch } from "../lib/api";
import "../admin.css";

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

type Attachment = {
  id: number;
  card_id: number;
  uploader_user_id: number;
  uploader_name: string;
  original_name: string;
  stored_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
};

type Reminder = {
  id: number;
  card_id: number;
  user_id: number;
  remind_at: string;
  is_sent: boolean;
  created_at: string;
};

type CardFull = {
  card: Card;
  subtasks: Subtask[];
  assignees: Assignee[];
  activities: Activity[];
  labels: CardLabel[];
  comments: Comment[];
  attachments: Attachment[];
  reminders: Reminder[];
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
  return dueD.getFullYear() === t.getFullYear() && dueD.getMonth() === t.getMonth() && dueD.getDate() === t.getDate();
}

function ClockIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 22a10 10 0 1 0-10-10 10 10 0 0 0 10 10Z" stroke="currentColor" strokeWidth="2" opacity="0.9" />
      <path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ActivityIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 13.5 8.2 9.3l3.2 3.2L19.6 4.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 12v7a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function PaperclipIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M8 12.5l6.6-6.6a3 3 0 1 1 4.2 4.2L10 19.9a5 5 0 0 1-7.1-7.1l8.8-8.8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChatIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8Z" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function TagIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M20.6 13.6 13.6 20.6a2 2 0 0 1-2.8 0L3 12.8V3h9.8l7.8 7.8a2 2 0 0 1 0 2.8Z" stroke="currentColor" strokeWidth="2" />
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
    attachment_added: "Attachment added",
    attachment_deleted: "Attachment removed",
    reminder_added: "Reminder set",
    reminder_deleted: "Reminder removed",
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

  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [remindAt, setRemindAt] = useState("");

  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [subtaskDue, setSubtaskDue] = useState("");

  const [assigneeQuery, setAssigneeQuery] = useState("");
  const [assigneeOpen, setAssigneeOpen] = useState(false);

  const [doneAnimId, setDoneAnimId] = useState<number | null>(null);

  const assigneeIds = useMemo(() => new Set(assignees.map((a) => a.user_id)), [assignees]);

  const isOverdue = useMemo(() => (card?.due_date ? isDateOverdue(card.due_date) : false), [card?.due_date]);

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
      .slice(0, 8);
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
      setAttachments(full.attachments || []);
      setReminders(full.reminders || []);

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

    setUploading(false);
    setRemindAt("");

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
    setErr(""); setMsg("");

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
    setErr(""); setMsg("");
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
    setErr(""); setMsg("");
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
    setErr(""); setMsg("");
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
    setErr(""); setMsg("");
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
    setErr(""); setMsg("");
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
    setErr(""); setMsg("");

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
    setErr(""); setMsg("");
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
    setErr(""); setMsg("");
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

  async function startEditComment(c: Comment) {
    setEditingCommentId(c.id);
    setEditingBody(c.body);
  }

  async function saveEditComment() {
    if (!card || !editingCommentId || !editingBody.trim()) return;
    setErr(""); setMsg("");
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
    setErr(""); setMsg("");
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

  async function uploadAttachment(file: File) {
    if (!card) return;
    setErr(""); setMsg("");
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("card_id", String(card.id));
      fd.append("file", file);

      await apiFetch("/admin/card/attachments/upload", { method: "POST", body: fd });
      if (fileRef.current) fileRef.current.value = "";
      await loadAll();
    } catch (e: any) {
      setErr(e.message || "Failed to upload");
    } finally {
      setUploading(false);
    }
  }

  function downloadAttachment(id: number) {
    // apiFetch is JSON oriented; for download we can just open a URL
    window.open(`/admin/card/attachments/download?attachment_id=${id}`, "_blank");
  }

  async function deleteAttachment(id: number) {
    if (!card) return;
    setErr(""); setMsg("");
    try {
      await apiFetch("/admin/card/attachments/delete", {
        method: "POST",
        body: JSON.stringify({ attachment_id: id, card_id: card.id }),
      });
      await loadAll();
    } catch (e: any) {
      setErr(e.message || "Failed to delete attachment");
    }
  }

  async function addReminder() {
    if (!card || !remindAt.trim()) return;
    setErr(""); setMsg("");
    try {
      await apiFetch("/admin/card/reminders", {
        method: "POST",
        body: JSON.stringify({ card_id: card.id, remind_at: remindAt.trim() }),
      });
      setRemindAt("");
      await loadAll();
    } catch (e: any) {
      setErr(e.message || "Failed to set reminder");
    }
  }

  async function deleteReminder(id: number) {
    if (!card) return;
    setErr(""); setMsg("");
    try {
      await apiFetch("/admin/card/reminders/delete", {
        method: "POST",
        body: JSON.stringify({ reminder_id: id, card_id: card.id }),
      });
      await loadAll();
    } catch (e: any) {
      setErr(e.message || "Failed to remove reminder");
    }
  }

  const cardDueClass = isOverdue ? "clockPillOverdue" : card?.due_date ? "clockPillSoon" : "";

  return (
    <Modal
      open={open}
      title={cardId ? `Card #${cardId}` : "Card"}
      onClose={onClose}
      footer={
        <>
          <button className="admGhostBtn" onClick={onClose}>
            Cancel
          </button>
          <button className="admPrimaryBtn" onClick={saveCard} disabled={saving || loading || !card?.title?.trim()}>
            {saving ? "Saving..." : "Save"}
          </button>
        </>
      }
    >
      {loading ? (
        <div className="admMuted">Loading...</div>
      ) : (
        <div className="modalBodyScroll">
          {err && (
            <div className="admAlert admAlertBad" style={{ marginBottom: 10 }}>
              {err}
            </div>
          )}
          {msg && (
            <div className="admAlert admAlertGood" style={{ marginBottom: 10 }}>
              {msg}
            </div>
          )}

          {!card ? (
            <div className="admMuted">No card loaded.</div>
          ) : (
            <div className="cmGrid">
              {/* LEFT */}
              <div style={{ display: "grid", gap: 14 }}>
                {/* Title */}
                <div className="cmSection">
                  <div className="cmHead">
                    <div>
                      <div className="cmHeadTitle">Title</div>
                      <div className="cmHeadSub">Short and clear</div>
                    </div>
                  </div>

                  <input
                    className="admInput"
                    value={card.title}
                    onChange={(e) => setCard({ ...card, title: e.target.value })}
                    placeholder="Card title"
                  />
                </div>

                {/* Status/Priority */}
                <div className="cmSection">
                  <div className="cmHead">
                    <div>
                      <div className="cmHeadTitle">Status & Priority</div>
                      <div className="cmHeadSub">Make it look like a real board</div>
                    </div>
                    <span className="admPill">Meta</span>
                  </div>

                  <div className="cmTwoCols">
                    <div>
                      <div className="admTdMuted" style={{ marginBottom: 6 }}>Status</div>
                      <select
                        className="admInput"
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
                      <div className="admTdMuted" style={{ marginBottom: 6 }}>Priority</div>
                      <select
                        className="admInput"
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

                  <div style={{ marginTop: 10 }} className="cardPillRow">
                    <span className={`pill pillStatus pill-status-${card.status}`}>{prettyStatus(card.status)}</span>
                    <span className={`pill pillPriority pill-priority-${card.priority}`}>{prettyPriority(card.priority)}</span>
                  </div>
                </div>

                {/* Labels */}
                <div className="cmSection">
                  <div className="cmHead">
                    <div>
                      <div className="cmHeadTitle"><TagIcon /> Labels</div>
                      <div className="cmHeadSub">Colors + quick meaning</div>
                    </div>
                    <span className="admPill">{cardLabels.length}</span>
                  </div>

                  {cardLabels.length === 0 ? (
                    <div className="admTdMuted" style={{ fontSize: 13 }}>
                      No labels yet.
                    </div>
                  ) : (
                    <div className="labelGrid">
                      {cardLabels.map((l) => (
                        <div key={l.label_id} className={`labelChip label-${l.color}`} title={l.name}>
                          <span className="labelDotSolid" />
                          <span>{l.name}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ height: 12 }} />

                  <div className="labelPicker">
                    {boardLabels.length === 0 ? (
                      <div className="admTdMuted">No labels on this board yet.</div>
                    ) : (
                      <div className="labelPickerGrid">
                        {boardLabels.map((l) => {
                          const active = cardLabelIds.has(l.id);
                          return (
                            <button
                              key={l.id}
                              className={`labelPickBtn ${active ? "active" : ""}`}
                              onClick={() => toggleLabel(l.id)}
                              type="button"
                              title={active ? "Remove" : "Add"}
                            >
                              <span className={`labelDot label-${l.color}`} />
                              <span className="labelPickName">{l.name}</span>
                              <span className="labelPickState">{active ? "On" : "Off"}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div style={{ height: 12 }} />

                  <div className="cmRow">
                    <input
                      className="admInput"
                      placeholder="Create new label..."
                      value={newLabelName}
                      onChange={(e) => setNewLabelName(e.target.value)}
                    />
                    <select className="admInput" value={newLabelColor} onChange={(e) => setNewLabelColor(e.target.value)} style={{ maxWidth: 170 }}>
                      <option value="indigo">Indigo</option>
                      <option value="sky">Sky</option>
                      <option value="emerald">Emerald</option>
                      <option value="amber">Amber</option>
                      <option value="rose">Rose</option>
                      <option value="violet">Violet</option>
                      <option value="slate">Slate</option>
                    </select>
                    <button className="admPrimaryBtn" type="button" onClick={createLabel} disabled={!newLabelName.trim() || !boardId}>
                      Create
                    </button>
                  </div>
                </div>

                {/* Description */}
                <div className="cmSection">
                  <div className="cmHead">
                    <div>
                      <div className="cmHeadTitle">Description</div>
                      <div className="cmHeadSub">Notes, requirements, links</div>
                    </div>
                  </div>

                  <textarea
                    className="admInput"
                    value={card.description}
                    onChange={(e) => setCard({ ...card, description: e.target.value })}
                    placeholder="Write details..."
                    rows={8}
                    style={{ resize: "vertical", height: "auto", minHeight: 160, paddingTop: 10, paddingBottom: 10 }}
                  />
                </div>

                {/* Comments */}
                <div className="cmSection">
                  <div className="cmHead">
                    <div>
                      <div className="cmHeadTitle"><ChatIcon /> Comments</div>
                      <div className="cmHeadSub">Like Trello discussion</div>
                    </div>
                    <span className="admPill">{comments.length}</span>
                  </div>

                  <div className="commentComposer">
                    <textarea
                      className="admInput"
                      placeholder="Write a comment..."
                      value={commentBody}
                      onChange={(e) => setCommentBody(e.target.value)}
                      rows={3}
                      style={{ resize: "vertical" }}
                    />
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                      <button className="admPrimaryBtn" type="button" onClick={addComment} disabled={!commentBody.trim()}>
                        Add comment
                      </button>
                    </div>
                  </div>

                  {comments.length === 0 ? (
                    <div className="admTdMuted" style={{ fontSize: 13 }}>
                      No comments yet.
                    </div>
                  ) : (
                    <div className="commentList">
                      {comments.slice(0, 40).map((c) => (
                        <div key={c.id} className="commentItem">
                          <div className="commentAvatar">{initials(c.actor_name)}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="commentTop">
                              <div className="commentName">{c.actor_name}</div>
                              <div className="commentTime">{c.created_at}</div>
                            </div>

                            {editingCommentId === c.id ? (
                              <div>
                                <textarea
                                  className="admInput"
                                  value={editingBody}
                                  onChange={(e) => setEditingBody(e.target.value)}
                                  rows={3}
                                  style={{ resize: "vertical" }}
                                />
                                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                                  <button className="admGhostBtn" type="button" onClick={() => { setEditingCommentId(null); setEditingBody(""); }}>
                                    Cancel
                                  </button>
                                  <button className="admPrimaryBtn" type="button" onClick={saveEditComment} disabled={!editingBody.trim()}>
                                    Save
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="commentBody">{c.body}</div>
                            )}

                            {editingCommentId !== c.id && (
                              <div className="commentActions">
                                <button className="admSoftBtn" type="button" onClick={() => startEditComment(c)}>
                                  Edit
                                </button>
                                <button className="admSoftBtn" type="button" onClick={() => deleteComment(c.id)}>
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

                {/* Checklist */}
                <div className="cmSection">
                  <div className="cmHead">
                    <div>
                      <div className="cmHeadTitle">
                        <CheckIcon /> Checklist
                      </div>
                      <div className="cmHeadSub">{progress ? `${progress.done}/${progress.total} completed` : "No subtasks yet"}</div>
                    </div>
                    <span className="admPill">{subtasks.length}</span>
                  </div>

                  {progress && (
                    <>
                      <div style={{ height: 8 }} />
                      <div className="progressBar">
                        <div className="progressFill" style={{ width: `${progress.pct}%` }} />
                      </div>
                    </>
                  )}

                  <div style={{ height: 12 }} />

                  <div style={{ display: "grid", gap: 10 }}>
                    <div className="cmRow">
                      <input
                        className="admInput"
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
                      <button className="admPrimaryBtn" onClick={addSubtask} disabled={!subtaskTitle.trim()}>
                        Add
                      </button>
                    </div>

                    <div className="cmSplit">
                      <span className="admPill" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        <ClockIcon /> Due (optional)
                      </span>

                      <input
                        className="admInput"
                        type="date"
                        value={subtaskDue}
                        onChange={(e) => setSubtaskDue(e.target.value)}
                        style={{ maxWidth: 220 }}
                      />

                      <button className="admSoftBtn" type="button" onClick={() => setSubtaskDue("")}>
                        Clear
                      </button>
                    </div>
                  </div>

                  <div style={{ height: 12 }} />

                  {subtasks.length > 0 && (
                    <div style={{ display: "grid", gap: 10 }}>
                      {subtasks.map((s) => {
                        const overdue = s.due_date ? isDateOverdue(s.due_date) : false;
                        const today = s.due_date ? isDateToday(s.due_date) : false;

                        return (
                          <div key={s.id} className={`cmSubtaskRow ${doneAnimId === s.id ? "animDone" : ""}`}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <input type="checkbox" checked={s.is_done} onChange={(e) => toggleSubtask(s.id, e.target.checked)} />

                              <div
                                style={{
                                  flex: 1,
                                  color: s.is_done ? "rgba(15,23,42,0.6)" : "rgba(15,23,42,0.92)",
                                  textDecoration: s.is_done ? "line-through" : "none",
                                  fontSize: 14,
                                }}
                              >
                                {s.title}
                              </div>

                              <span
                                className={`admPill ${overdue ? "clockPillOverdue" : today ? "clockPillSoon" : ""}`}
                                title={s.due_date ? `Due ${s.due_date}` : "No due date"}
                                style={{ opacity: s.due_date ? 1 : 0.7, display: "inline-flex", alignItems: "center", gap: 8 }}
                              >
                                <ClockIcon />
                                {s.due_date || "No due"}
                              </span>

                              <button className="admSoftBtn" type="button" onClick={() => deleteSubtask(s.id)}>
                                Remove
                              </button>
                            </div>

                            <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                              <div className="admTdMuted" style={{ fontSize: 12 }}>
                                Subtask due date
                              </div>

                              <input
                                className="admInput"
                                type="date"
                                value={s.due_date || ""}
                                onChange={(e) => updateSubtaskDue(s.id, e.target.value)}
                                style={{ maxWidth: 220 }}
                              />

                              <button className="admSoftBtn" type="button" onClick={() => updateSubtaskDue(s.id, "")}>
                                Clear
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Activity */}
                <div className="cmSection">
                  <div className="cmHead">
                    <div>
                      <div className="cmHeadTitle">
                        <ActivityIcon /> Activity
                      </div>
                      <div className="cmHeadSub">Latest changes</div>
                    </div>
                    <span className="admPill">{activities.length}</span>
                  </div>

                  {activities.length === 0 ? (
                    <div className="admTdMuted" style={{ fontSize: 13 }}>
                      No activity yet.
                    </div>
                  ) : (
                    <div style={{ display: "grid", gap: 10 }}>
                      {activities.slice(0, 25).map((a) => (
                        <div key={a.id} className="admAlert" style={{ background: "#fbfcff" }}>
                          <div style={{ fontWeight: 950, fontSize: 13 }}>
                            {a.actor_name} — {formatActivity(a)}
                          </div>
                          {a.meta ? (
                            <div className="admTdMuted" style={{ marginTop: 4 }}>
                              {a.meta}
                            </div>
                          ) : null}
                          <div className="admTdMuted" style={{ marginTop: 6, fontSize: 12 }}>
                            {a.created_at}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* RIGHT */}
              <div style={{ display: "grid", gap: 14 }}>
                {/* Card due */}
                <div className="cmSection">
                  <div className="cmHead">
                    <div>
                      <div className="cmHeadTitle">
                        <ClockIcon /> Card due date
                      </div>
                      <div className="cmHeadSub">{isOverdue ? "Overdue" : " "}</div>
                    </div>

                    <span className={`admPill ${cardDueClass}`} style={{ display: "inline-flex", gap: 8 }}>
                      <ClockIcon />
                      {card.due_date || "None"}
                    </span>
                  </div>

                  <div style={{ display: "grid", gap: 10 }}>
                    <input
                      className="admInput"
                      type="date"
                      value={card.due_date || ""}
                      onChange={(e) => setCard({ ...card, due_date: e.target.value })}
                    />
                    <button className="admSoftBtn" type="button" onClick={() => setCard({ ...card, due_date: "" })}>
                      Clear
                    </button>
                  </div>
                </div>

                {/* Reminders */}
                <div className="cmSection">
                  <div className="cmHead">
                    <div>
                      <div className="cmHeadTitle">Reminders</div>
                      <div className="cmHeadSub">Stored now, cron later</div>
                    </div>
                    <span className="admPill">{reminders.length}</span>
                  </div>

                  <div className="cmRow">
                    <input
                      className="admInput"
                      placeholder="2026-03-10T09:00:00"
                      value={remindAt}
                      onChange={(e) => setRemindAt(e.target.value)}
                    />
                    <button className="admPrimaryBtn" type="button" onClick={addReminder} disabled={!remindAt.trim()}>
                      Add
                    </button>
                  </div>

                  {reminders.length === 0 ? (
                    <div className="admTdMuted" style={{ fontSize: 13 }}>No reminders yet.</div>
                  ) : (
                    <div style={{ display: "grid", gap: 10 }}>
                      {reminders.map((r) => (
                        <div key={r.id} className="admAlert" style={{ background: "#fbfcff", display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                          <div>
                            <div style={{ fontWeight: 900 }}>{r.remind_at}</div>
                            <div className="admTdMuted" style={{ fontSize: 12 }}>{r.is_sent ? "Sent" : "Pending"}</div>
                          </div>
                          <button className="admSoftBtn" type="button" onClick={() => deleteReminder(r.id)}>Remove</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Attachments */}
                <div className="cmSection">
                  <div className="cmHead">
                    <div>
                      <div className="cmHeadTitle"><PaperclipIcon /> Attachments</div>
                      <div className="cmHeadSub">Upload files to this card</div>
                    </div>
                    <span className="admPill">{attachments.length}</span>
                  </div>

                  <div className="cmRow">
                    <input
                      ref={fileRef}
                      className="admInput"
                      type="file"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) uploadAttachment(f);
                      }}
                      disabled={uploading}
                    />
                    <button className="admSoftBtn" type="button" onClick={() => { if (fileRef.current) fileRef.current.value = ""; }}>
                      Clear
                    </button>
                  </div>

                  {uploading && <div className="admTdMuted">Uploading...</div>}

                  {attachments.length === 0 ? (
                    <div className="admTdMuted" style={{ fontSize: 13 }}>No attachments yet.</div>
                  ) : (
                    <div style={{ display: "grid", gap: 10 }}>
                      {attachments.map((a) => (
                        <div key={a.id} className="attachmentRow">
                          <div style={{ minWidth: 0 }}>
                            <div className="attachmentName" title={a.original_name}>{a.original_name}</div>
                            <div className="admTdMuted" style={{ fontSize: 12 }}>
                              {a.uploader_name} • {a.created_at} • {Math.round((a.size_bytes || 0) / 1024)} KB
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 10 }}>
                            <button className="admSoftBtn" type="button" onClick={() => downloadAttachment(a.id)}>Download</button>
                            <button className="admSoftBtn" type="button" onClick={() => deleteAttachment(a.id)}>Delete</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Assignees */}
                <div className="cmSection">
                  <div className="cmHead">
                    <div>
                      <div className="cmHeadTitle">Assignees</div>
                      <div className="cmHeadSub">Assign students to this card</div>
                    </div>
                    <span className="admPill">{assignees.length}</span>
                  </div>

                  {assignees.length === 0 ? (
                    <div className="admTdMuted" style={{ fontSize: 13 }}>
                      No assignees yet.
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {assignees.map((a) => (
                        <div
                          key={a.user_id}
                          className="admPill"
                          style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
                          title={a.email}
                        >
                          <span
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: 999,
                              border: "1px solid rgba(15,23,42,0.14)",
                              background: "rgba(15,23,42,0.06)",
                              display: "grid",
                              placeItems: "center",
                              fontWeight: 900,
                              fontSize: 11,
                            }}
                          >
                            {initials(a.full_name)}
                          </span>

                          <span style={{ fontSize: 12, fontWeight: 900 }}>{a.full_name}</span>

                          <button
                            className="admSoftBtn"
                            type="button"
                            onClick={() => removeAssignee(a.user_id)}
                            style={{ padding: "6px 10px", height: 34 }}
                            title="Remove"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ height: 12 }} />

                  {studentsOnly.length === 0 ? (
                    <div className="admTdMuted" style={{ fontSize: 13 }}>
                      No students in this board yet. Add them from “Members”.
                    </div>
                  ) : (
                    <div style={{ position: "relative" }}>
                      <input
                        className="admInput"
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
                        <div className="cmDrop">
                          <div style={{ display: "grid", gap: 8 }}>
                            {availableStudents.map((m) => (
                              <button
                                key={m.user_id}
                                className="admSoftBtn"
                                style={{
                                  justifyContent: "space-between",
                                  width: "100%",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 10,
                                  height: 44,
                                }}
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => addAssignee(m.user_id)}
                              >
                                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                  <span
                                    style={{
                                      width: 26,
                                      height: 26,
                                      borderRadius: 999,
                                      border: "1px solid rgba(15,23,42,0.14)",
                                      background: "rgba(15,23,42,0.06)",
                                      display: "grid",
                                      placeItems: "center",
                                      fontWeight: 900,
                                      fontSize: 12,
                                    }}
                                  >
                                    {initials(m.full_name)}
                                  </span>

                                  <span style={{ display: "grid", textAlign: "left" }}>
                                    <span style={{ fontWeight: 950, fontSize: 13 }}>{m.full_name}</span>
                                    <span className="admTdMuted" style={{ fontSize: 12 }}>
                                      {m.email}
                                    </span>
                                  </span>
                                </span>

                                <span className="admPill">Add</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {boardId && <div className="admTdMuted" style={{ marginTop: 10 }}>Board: #{boardId}</div>}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}