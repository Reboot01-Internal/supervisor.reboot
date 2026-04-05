import { useEffect, useMemo, useRef, useState } from "react";
import Modal from "./Modal";
import { apiFetch } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useConfirm } from "../lib/useConfirm";
import { playDoneSound } from "../lib/sound";

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
type SubtaskDraft = { title: string; due_date: string };

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

function TrashIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 6h18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19 6v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function EditIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 20h9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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
    subtask_updated: "Subtask updated",
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

const labelColorChoices = [
  { value: "indigo", className: "bg-indigo-600" },
  { value: "sky", className: "bg-sky-600" },
  { value: "emerald", className: "bg-emerald-500" },
  { value: "amber", className: "bg-amber-500" },
  { value: "rose", className: "bg-rose-500" },
  { value: "violet", className: "bg-violet-600" },
  { value: "slate", className: "bg-slate-600" },
] as const;

/** slightly more compact controls */
const inputBase =
  "h-9 w-full rounded-[10px] border border-slate-300 bg-slate-50 px-3 text-[14px] text-slate-900 outline-none transition focus:border-[#6d5efc]/35 focus:bg-white focus:ring-3 focus:ring-[#6d5efc]/15";

const btnPrimary =
  "h-9 rounded-[10px] px-4 text-[14px] font-extrabold text-white disabled:opacity-70 disabled:cursor-not-allowed shadow-sm bg-slate-800 hover:bg-slate-900";

const btnGhost =
  "h-9 rounded-[10px] px-4 text-[14px] font-extrabold border border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100";

const btnSoft =
  "h-9 rounded-[10px] px-4 text-[14px] font-extrabold border border-slate-300 bg-white text-slate-700 hover:bg-slate-50";
const btnDangerIcon =
  "inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-slate-300 bg-white text-slate-500 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600";
const btnEditIcon =
  "inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-slate-300 bg-white text-slate-500 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700";

const pillBase =
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-extrabold";

const section =
  "rounded-[14px] border border-slate-200 bg-[#fbfcff] p-3 shadow-[0_8px_22px_rgba(15,23,42,0.05)] transition hover:border-slate-300 hover:shadow-[0_12px_30px_rgba(15,23,42,0.08)]";
const sectionHead = "mb-1.5 flex items-center justify-between gap-2";
const sectionTitle = "text-[13px] font-black text-slate-900";

export default function CardModal({
  open,
  cardId,
  onClose,
  onSaved,
  onDeleted,
  onLiveUpdate,
}: {
  open: boolean;
  cardId: number | null;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
  onLiveUpdate?: (payload: {
    cardId: number;
    status?: Card["status"];
    title?: string;
    description?: string;
    due_date?: string;
    priority?: Card["priority"];
    done?: number;
    total?: number;
  }) => void;
}) {
  const { isAdmin, isSupervisor, isStudent } = useAuth();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const [card, setCard] = useState<Card | null>(null);
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [subtaskDrafts, setSubtaskDrafts] = useState<Record<number, SubtaskDraft>>({});
  const [editingSubtaskId, setEditingSubtaskId] = useState<number | null>(null);
  const [savingSubtaskId, setSavingSubtaskId] = useState<number | null>(null);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [initialAssignees, setInitialAssignees] = useState<Assignee[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [boardId, setBoardId] = useState<number | null>(null);
  const [boardMembers, setBoardMembers] = useState<BoardMember[]>([]);

  const [cardLabels, setCardLabels] = useState<CardLabel[]>([]);
  const [boardLabels, setBoardLabels] = useState<Label[]>([]);
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelColor, setNewLabelColor] = useState("indigo");
  const [labelTool, setLabelTool] = useState<"none" | "edit" | "delete">("none");
  const [selectedLabelId, setSelectedLabelId] = useState<number>(0);
  const [editingLabelId, setEditingLabelId] = useState<number | null>(null);
  const [editingLabelName, setEditingLabelName] = useState("");
  const [editingLabelColor, setEditingLabelColor] = useState("indigo");

  const [comments, setComments] = useState<Comment[]>([]);
  const [commentBody, setCommentBody] = useState("");
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editingBody, setEditingBody] = useState("");

  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [subtaskDue, setSubtaskDue] = useState("");

  const [assigneeQuery, setAssigneeQuery] = useState("");
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const assigneeInputRef = useRef<HTMLInputElement | null>(null);

  const [doneAnimId, setDoneAnimId] = useState<number | null>(null);
  const [rightTab, setRightTab] = useState<"comments" | "activity">("comments");

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
  const nowStamp = () => new Date().toISOString().slice(0, 19).replace("T", " ");

  async function loadAll() {
    if (!open || !cardId) return;
    setErr("");
    setMsg("");
    setLoading(true);

    try {
      const full: CardFull = await apiFetch(`/admin/card/full?card_id=${cardId}`);
      const loadedSubtasks = full.subtasks || [];
      setCard(full.card);
      setSubtasks(loadedSubtasks);
      setSubtaskDrafts(
        Object.fromEntries(loadedSubtasks.map((s) => [s.id, { title: s.title, due_date: s.due_date || "" }]))
      );
      setAssignees(full.assignees || []);
      setInitialAssignees(full.assignees || []);
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

    setAssigneeQuery("");
    setAssigneeOpen(false);
    setSubtaskTitle("");
    setSubtaskDue("");
    setEditingSubtaskId(null);
    setDoneAnimId(null);

    setNewLabelName("");
    setNewLabelColor("indigo");
    setLabelTool("none");
    setSelectedLabelId(0);
    setEditingLabelId(null);
    setEditingLabelName("");
    setEditingLabelColor("indigo");

    setCommentBody("");
    setEditingCommentId(null);
    setEditingBody("");
    setRightTab("comments");

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
    if (!canManageCard) return;
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

      const initialIds = new Set(initialAssignees.map((a) => a.user_id));
      const currentIds = new Set(assignees.map((a) => a.user_id));

      const removals = initialAssignees.filter((a) => !currentIds.has(a.user_id));
      const additions = assignees.filter((a) => !initialIds.has(a.user_id));

      for (const assignee of removals) {
        await apiFetch("/admin/card/assignees/remove", {
          method: "POST",
          body: JSON.stringify({ card_id: card.id, user_id: assignee.user_id }),
        });
      }

      for (const assignee of additions) {
        await apiFetch("/admin/card/assignees/add", {
          method: "POST",
          body: JSON.stringify({ card_id: card.id, user_id: assignee.user_id }),
        });
      }

      setInitialAssignees(assignees);

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
      const res = await apiFetch("/admin/card/subtasks", {
        method: "POST",
        body: JSON.stringify({ card_id: card.id, title: subtaskTitle.trim(), due_date: subtaskDue || "" }),
      });
      setSubtasks((prev) => {
        const next = [
          ...prev,
          {
            id: Number(res?.id),
            card_id: card.id,
            title: subtaskTitle.trim(),
            is_done: false,
            due_date: subtaskDue || "",
          },
        ];
        emitLiveUpdate(undefined, next);
        return next;
      });
      setSubtaskDrafts((prev) => ({
        ...prev,
        [Number(res?.id)]: { title: subtaskTitle.trim(), due_date: subtaskDue || "" },
      }));
      setSubtaskTitle("");
      setSubtaskDue("");
    } catch (e: any) {
      setErr(e.message || "Failed to add subtask");
    }
  }

  async function toggleSubtask(id: number, isDone: boolean) {
    setErr("");
    setMsg("");
    setDoneAnimId(id);
    setTimeout(() => setDoneAnimId(null), 280);
    if (isDone) playDoneSound();

    try {
      await apiFetch("/admin/card/subtasks/toggle", {
        method: "POST",
        body: JSON.stringify({ subtask_id: id, is_done: isDone }),
      });
      setSubtasks((prev) => {
        const next = prev.map((s) => (s.id === id ? { ...s, is_done: isDone } : s));
        emitLiveUpdate(undefined, next);
        return next;
      });
    } catch (e: any) {
      setErr(e.message || "Failed to update subtask");
      setSubtasks((prev) => {
        const next = prev.map((s) => (s.id === id ? { ...s, is_done: !isDone } : s));
        emitLiveUpdate(undefined, next);
        return next;
      });
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
      setSubtasks((prev) => {
        const next = prev.filter((s) => s.id !== id);
        emitLiveUpdate(undefined, next);
        return next;
      });
      setSubtaskDrafts((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } catch (e: any) {
      setErr(e.message || "Failed to delete subtask");
    }
  }

  async function saveSubtaskEdits(id: number, draftOverride?: SubtaskDraft) {
    const base = subtasks.find((s) => s.id === id);
    const draft = draftOverride || subtaskDrafts[id];
    if (!base || !draft) return;

    const nextTitle = draft.title.trim();
    const nextDue = draft.due_date || "";
    if (!nextTitle) {
      setErr("Subtask title is required");
      setSubtaskDrafts((prev) => ({ ...prev, [id]: { title: base.title, due_date: base.due_date || "" } }));
      return;
    }
    if (nextTitle === base.title && nextDue === (base.due_date || "")) return;

    setErr("");
    setMsg("");
    const backup = base;
    setSavingSubtaskId(id);
    setSubtasks((prev) => {
      const next = prev.map((s) => (s.id === id ? { ...s, title: nextTitle, due_date: nextDue } : s));
      emitLiveUpdate(undefined, next);
      return next;
    });

    try {
      await apiFetch("/admin/card/subtasks/update", {
        method: "POST",
        body: JSON.stringify({ subtask_id: id, title: nextTitle, due_date: nextDue }),
      });
    } catch (e: any) {
      setErr(e.message || "Failed to update subtask");
      setSubtasks((prev) => {
        const next = prev.map((s) => (s.id === id ? { ...s, title: backup.title, due_date: backup.due_date || "" } : s));
        emitLiveUpdate(undefined, next);
        return next;
      });
      setSubtaskDrafts((prev) => ({
        ...prev,
        [id]: { title: backup.title, due_date: backup.due_date || "" },
      }));
    } finally {
      setSavingSubtaskId((curr) => (curr === id ? null : curr));
    }
  }

  async function removeAssignee(userId: number) {
    setErr("");
    setMsg("");
    setAssignees((prev) => prev.filter((a) => a.user_id !== userId));
  }

  async function addAssignee(userId: number) {
    setErr("");
    setMsg("");
    const chosen = studentsOnly.find((s) => s.user_id === userId);
    if (chosen) {
      setAssignees((prev) => [
        ...prev,
        { user_id: chosen.user_id, full_name: chosen.full_name, email: chosen.email, role: chosen.role },
      ]);
    }
    setAssigneeQuery("");
    setAssigneeOpen(false);
    assigneeInputRef.current?.blur();
  }

  async function createLabel() {
    if (!boardId || !newLabelName.trim()) return;
    setErr("");
    setMsg("");

    try {
      const res = await apiFetch("/admin/labels", {
        method: "POST",
        body: JSON.stringify({ board_id: boardId, name: newLabelName.trim(), color: newLabelColor }),
      });
      setBoardLabels((prev) => [
        ...prev,
        { id: Number(res?.id), board_id: boardId, name: newLabelName.trim(), color: newLabelColor },
      ]);
      setNewLabelName("");
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
      if (has) {
        setCardLabels((prev) => prev.filter((l) => l.label_id !== labelId));
      } else {
        const found = boardLabels.find((l) => l.id === labelId);
        if (found) {
          setCardLabels((prev) => [...prev, { label_id: found.id, name: found.name, color: found.color }]);
        }
      }
    } catch (e: any) {
      setErr(e.message || "Failed to update label");
    }
  }

  useEffect(() => {
    if (boardLabels.length === 0) {
      setSelectedLabelId(0);
      return;
    }
    if (!selectedLabelId || !boardLabels.some((l) => l.id === selectedLabelId)) {
      setSelectedLabelId(boardLabels[0].id);
    }
  }, [boardLabels, selectedLabelId]);

  function startEditLabel() {
    const effectiveId = selectedLabelId || boardLabels[0]?.id;
    if (!effectiveId) return;
    const label = boardLabels.find((l) => l.id === effectiveId);
    if (!label) return;
    setSelectedLabelId(effectiveId);
    setEditingLabelId(label.id);
    setEditingLabelName(label.name);
    setEditingLabelColor(label.color || "indigo");
    setLabelTool("edit");
  }

  function cancelEditLabel() {
    setEditingLabelId(null);
    setEditingLabelName("");
    setEditingLabelColor("indigo");
    setLabelTool("none");
  }

  async function saveLabelEdits() {
    if (!editingLabelId || !editingLabelName.trim()) return;
    setErr("");
    setMsg("");
    const nextName = editingLabelName.trim();
    const nextColor = editingLabelColor;
    try {
      await apiFetch("/admin/labels/update", {
        method: "POST",
        body: JSON.stringify({ label_id: editingLabelId, name: nextName, color: nextColor }),
      });
      setBoardLabels((prev) =>
        prev.map((l) => (l.id === editingLabelId ? { ...l, name: nextName, color: nextColor } : l))
      );
      setCardLabels((prev) =>
        prev.map((l) => (l.label_id === editingLabelId ? { ...l, name: nextName, color: nextColor } : l))
      );
      cancelEditLabel();
    } catch (e: any) {
      setErr(e.message || "Failed to update label");
    }
  }

  async function deleteLabel(labelId: number) {
    const ok = await confirm({ title: "Delete label", message: "Delete this label?" });
    if (!ok) return;
    setErr("");
    setMsg("");
    try {
      await apiFetch("/admin/labels/delete", {
        method: "POST",
        body: JSON.stringify({ label_id: labelId }),
      });
      setBoardLabels((prev) => prev.filter((l) => l.id !== labelId));
      setCardLabels((prev) => prev.filter((l) => l.label_id !== labelId));
      if (editingLabelId === labelId) cancelEditLabel();
      setLabelTool("none");
    } catch (e: any) {
      setErr(e.message || "Failed to delete label");
    }
  }

  async function addComment() {
    if (!card || !commentBody.trim()) return;
    setErr("");
    setMsg("");
    try {
      const res = await apiFetch("/admin/card/comments", {
        method: "POST",
        body: JSON.stringify({ card_id: card.id, body: commentBody.trim() }),
      });
      setComments((prev) => [
        ...prev,
        {
          id: Number(res?.id),
          card_id: card.id,
          actor_user_id: 0,
          actor_name: "You",
          body: commentBody.trim(),
          created_at: nowStamp(),
          updated_at: nowStamp(),
        },
      ]);
      setCommentBody("");
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
      setComments((prev) =>
        prev.map((c) => (c.id === editingCommentId ? { ...c, body: editingBody.trim(), updated_at: nowStamp() } : c))
      );
      setEditingCommentId(null);
      setEditingBody("");
    } catch (e: any) {
      setErr(e.message || "Failed to update comment");
    }
  }

  async function deleteComment(id: number) {
    if (!card) return;
    setErr("");
    setMsg("");
    const backup = comments.find((c) => c.id === id);
    setComments((prev) => prev.filter((c) => c.id !== id));
    try {
      await apiFetch("/admin/card/comments/delete", {
        method: "POST",
        body: JSON.stringify({ comment_id: id, card_id: card.id }),
      });
    } catch (e: any) {
      setErr(e.message || "Failed to delete comment");
      if (backup) {
        setComments((prev) => [...prev, backup]);
      }
    }
  }

  async function deleteCard() {
    if (!card) return;
    const ok = await confirm({ title: "Delete card", message: "Delete this card? This cannot be undone." });
    if (!ok) return;

    setErr("");
    setMsg("");
    setDeleting(true);

    try {
      await apiFetch("/admin/card/delete", {
        method: "POST",
        body: JSON.stringify({ card_id: card.id }),
      });
      onDeleted();
      onClose();
    } catch (e: any) {
      setErr(e.message || "Failed to delete card");
    } finally {
      setDeleting(false);
    }
  }

  const cardDueKind: "overdue" | "soon" | "none" =
    isOverdue ? "overdue" : card?.due_date ? "soon" : "none";
  const dueBadgeText = isOverdue ? "Overdue" : card?.due_date ? "Scheduled" : "None";
  const isDone = card?.status === "done";
  const canManageCard = isAdmin || isSupervisor;
  const canToggleDone = canManageCard || isStudent;
  const canDeleteCard = canManageCard;

  function emitLiveUpdate(nextCard?: Card | null, nextSubtasks?: Subtask[]) {
    if (!onLiveUpdate) return;
    const sourceCard = nextCard || card;
    if (!sourceCard) return;
    const sourceSubtasks = nextSubtasks ?? subtasks;
    onLiveUpdate({
      cardId: sourceCard.id,
      status: sourceCard.status,
      title: sourceCard.title,
      description: sourceCard.description,
      due_date: sourceCard.due_date,
      priority: sourceCard.priority,
      done: sourceSubtasks.filter((s) => s.is_done).length,
      total: sourceSubtasks.length,
    });
  }

  async function toggleDoneFromModal() {
    if (!card || !canToggleDone) return;
    const prevCard = card;
    const nextStatus: Card["status"] = prevCard.status === "done" ? "todo" : "done";
    const nextCard = { ...prevCard, status: nextStatus };
    setCard(nextCard);
    emitLiveUpdate(nextCard);
    if (nextStatus === "done") playDoneSound();
    try {
      await apiFetch("/admin/card", {
        method: "PUT",
        body: JSON.stringify({
          card_id: prevCard.id,
          title: prevCard.title?.trim() || "",
          description: prevCard.description || "",
          due_date: prevCard.due_date || "",
          status: nextStatus,
          priority: prevCard.priority || "medium",
        }),
      });
    } catch (e: any) {
      setErr(e?.message || "Failed to update status");
      setCard(prevCard);
      emitLiveUpdate(prevCard);
    }
  }

  return (
    <>
    {confirmDialog}
    <Modal
      open={open}
      title={cardId ? `Card #${cardId}` : "Card"}
      onClose={onClose}
      footer={
        <>
          {canDeleteCard && (
            <button
              className={`${btnDangerIcon} disabled:opacity-70`}
              onClick={deleteCard}
              disabled={loading || saving || deleting || !card}
              title={deleting ? "Deleting..." : "Delete card"}
              aria-label={deleting ? "Deleting card" : "Delete card"}
            >
              <TrashIcon size={18} />
            </button>
          )}
          <button
            className="h-9 rounded-[10px] px-4 text-[14px] font-extrabold text-white shadow-sm bg-gradient-to-r from-[#6d5efc] to-[#9a8cff] hover:brightness-105"
            onClick={onClose}
          >
            Done
          </button>
          {canManageCard && (
            <button className={btnPrimary} onClick={saveCard} disabled={saving || deleting || loading || !card?.title?.trim()}>
              {saving ? "Saving..." : "Save"}
            </button>
          )}
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
              <div className="dropdownAnim max-h-[62vh] overflow-y-auto overflow-x-hidden pr-[2px]">
                <div className="grid items-start gap-2.5 xl:grid-cols-[1.25fr_0.95fr]">
                  <div className="grid gap-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`${pillBase} ${pillStatusClass(card.status)}`}>
                        <CheckIcon size={12} />
                        {isDone ? "Done" : "Open"}
                      </span>
                      {canToggleDone ? (
                        <button
                          type="button"
                          className={`${pillBase} border-[#6d5efc]/30 bg-[#6d5efc]/10 text-slate-900 hover:bg-[#6d5efc]/15`}
                          onClick={toggleDoneFromModal}
                        >
                          <CheckIcon size={12} />
                          {isDone ? "Mark open" : "Mark done"}
                        </button>
                      ) : null}
                      <span className={`${pillBase} ${pillPriorityClass(card.priority)}`}>{prettyPriority(card.priority)}</span>
                      {canManageCard ? (
                        <select
                          className="h-7 rounded-full border border-slate-300 bg-white px-2.5 text-[12px] font-extrabold text-slate-700"
                          value={card.priority}
                          onChange={(e) => setCard({ ...card, priority: e.target.value as Card["priority"] })}
                          title="Priority"
                        >
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                          <option value="urgent">Urgent</option>
                        </select>
                      ) : null}
                      {/* <span className={`${pillBase} border-slate-200 bg-slate-50 text-slate-600`}>
                        Mark done from board card
                      </span> */}
                    </div>

                    <div className="grid gap-2 xl:grid-cols-12">
                      <div className={`${section} xl:col-span-7`}>
                        <div className={sectionHead}>
                          <div className={sectionTitle}>Title</div>
                          <span className={`${pillBase} border-slate-900/10 bg-slate-900/5 text-slate-700`}>
                            #{card.id}
                          </span>
                        </div>
                        <input
                          className={inputBase}
                          value={card.title}
                          onChange={(e) => setCard({ ...card, title: e.target.value })}
                          placeholder="Card title"
                          disabled={!canManageCard}
                        />
                      </div>

                      <div className={`${section} min-w-0 overflow-hidden xl:col-span-5`}>
                        <div className={sectionHead}>
                          <div className="flex items-center gap-1.5 whitespace-nowrap text-[12px] font-black tracking-[0.02em] text-slate-800">
                            <ClockIcon /> Due date
                          </div>
                          <span className={`${pillBase} shrink-0 ${duePillClass(cardDueKind)} gap-1.5`}>
                            <ClockIcon size={12} />
                            {dueBadgeText}
                          </span>
                        </div>
                        <div className="grid gap-2">
                          <input
                            className={
                              inputBase +
                              " min-w-0" +
                              " h-10 text-[15px] [color-scheme:light] [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-70"
                            }
                            type="date"
                            value={card.due_date || ""}
                            onChange={(e) => setCard({ ...card, due_date: e.target.value })}
                            disabled={!canManageCard}
                          />
                          <button
                            className="h-9 rounded-[10px] border border-slate-300 bg-white px-3 text-[13px] font-extrabold text-slate-700 hover:bg-slate-50"
                            type="button"
                            onClick={() => setCard({ ...card, due_date: "" })}
                            disabled={!canManageCard}
                          >
                            Clear
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className={section}>
                      <div className={sectionHead}>
                        <div className={sectionTitle}>Description</div>
                      </div>
                      <textarea
                        className={inputBase + " h-auto min-h-[100px] py-2.5"}
                        value={card.description}
                        onChange={(e) => setCard({ ...card, description: e.target.value })}
                        placeholder="Notes, requirements, links..."
                        rows={4}
                        disabled={!canManageCard}
                      />
                    </div>

                    <div className={section}>
                      <div className={sectionHead}>
                        <div className={sectionTitle}>Assignees</div>
                        <span className={`${pillBase} border-indigo-500/25 bg-indigo-500/10 text-slate-900`}>
                          {assignees.length}
                        </span>
                      </div>
                      {assignees.length === 0 ? (
                        <div className="text-[13px] font-semibold text-slate-500">No assignees yet.</div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {assignees.map((a) => (
                            <div key={a.user_id} className={`${pillBase} border-indigo-500/25 bg-indigo-500/10 pr-1`}>
                              <span className="grid h-[22px] w-[22px] place-items-center rounded-full border border-slate-900/10 bg-slate-900/5 text-[11px] font-black">
                                {initials(a.full_name)}
                              </span>
                              <span className="text-[12px] font-black">{a.full_name}</span>
                              {canManageCard ? (
                                <button
                                  className="h-[26px] rounded-[10px] border border-slate-900/10 bg-white/70 px-2 text-[12px] font-black hover:bg-rose-500/10"
                                  type="button"
                                  onClick={() => removeAssignee(a.user_id)}
                                  title="Remove"
                                >
                                  ×
                                </button>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      )}

                      {canManageCard && (
                        <>
                          <div className="h-1.5" />
                          {studentsOnly.length === 0 ? (
                            <div className="text-[13px] font-semibold text-slate-500">
                              No talents in this board yet. Add them from members.
                            </div>
                          ) : (
                            <div className="relative">
                              <input
                                ref={assigneeInputRef}
                                className={inputBase}
                                placeholder="Search talent to assign..."
                                value={assigneeQuery}
                                onChange={(e) => {
                                  setAssigneeQuery(e.target.value);
                                  setAssigneeOpen(true);
                                }}
                                onFocus={() => setAssigneeOpen(true)}
                                onBlur={() => setTimeout(() => setAssigneeOpen(false), 120)}
                              />
                              {assigneeOpen && availableStudents.length > 0 && (
                                <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 rounded-[14px] border border-slate-900/10 bg-white p-2 shadow-[0_16px_40px_rgba(15,23,42,0.10)]">
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
                                            <span className="block truncate text-[13px] font-black text-slate-900">{m.full_name}</span>
                                            <span className="block truncate text-[12px] font-semibold text-slate-500">{m.email}</span>
                                          </span>
                                        </span>
                                        <span className={`${pillBase} border-indigo-500/25 bg-indigo-500/10 text-slate-900`}>Add</span>
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    <div className={section}>
                      <div className={sectionHead}>
                        <div>
                          <div className={`flex items-center gap-2 ${sectionTitle}`}>
                            <CheckIcon /> Things to do
                          </div>
                          <div className="mt-[1px] text-[11px] font-semibold text-slate-500">
                            {progress ? `${progress.done}/${progress.total} completed` : "No items yet"}
                          </div>
                        </div>
                        <span className={`${pillBase} border-indigo-500/25 bg-indigo-500/10 text-slate-900`}>
                          {subtasks.length}
                        </span>
                      </div>

                      {progress && (
                        <div className="mt-1.5">
                          <div className="h-1.5 overflow-hidden rounded-full bg-slate-900/10">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-blue-600/90 to-sky-500/60 transition-[width] duration-200"
                              style={{ width: `${progress.pct}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {canManageCard && (
                        <>
                          <div className="h-1.5" />

                          <div className="grid gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <input
                                className={inputBase}
                                placeholder="Add an item..."
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
                        </>
                      )}

                      <div className="h-1.5" />

                      {subtasks.length > 0 && (
                        <div className="grid gap-2">
                          {subtasks.map((s) => {
                            const draft = subtaskDrafts[s.id] || { title: s.title, due_date: s.due_date || "" };
                            const isEditing = editingSubtaskId === s.id;
                            const overdue = s.due_date ? isDateOverdue(s.due_date) : false;
                            const today = s.due_date ? isDateToday(s.due_date) : false;

                            return (
                              <div
                                key={s.id}
                                className={[
                                  "rounded-[12px] border border-slate-900/10 bg-blue-500/[0.03] p-2.5 transition",
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
                                  {isEditing && canManageCard ? (
                                    <>
                                      <input
                                        className={[
                                          inputBase,
                                          "h-8 min-w-[180px] flex-1 text-[13px]",
                                          s.is_done ? "text-slate-500 line-through" : "text-slate-900",
                                        ].join(" ")}
                                        autoFocus
                                        value={draft.title}
                                        onChange={(e) =>
                                          setSubtaskDrafts((prev) => ({
                                            ...prev,
                                            [s.id]: { ...draft, title: e.target.value },
                                          }))
                                        }
                                        onKeyDown={async (e) => {
                                          if (e.key === "Enter") {
                                            e.preventDefault();
                                            await saveSubtaskEdits(s.id);
                                            setEditingSubtaskId(null);
                                          } else if (e.key === "Escape") {
                                            e.preventDefault();
                                            setSubtaskDrafts((prev) => ({
                                              ...prev,
                                              [s.id]: { title: s.title, due_date: s.due_date || "" },
                                            }));
                                            setEditingSubtaskId(null);
                                          }
                                        }}
                                      />
                                      <input
                                        className={inputBase + " h-8 w-[160px] text-[13px]"}
                                        type="date"
                                        value={draft.due_date || ""}
                                        onChange={(e) =>
                                          setSubtaskDrafts((prev) => ({
                                            ...prev,
                                            [s.id]: { ...draft, due_date: e.target.value },
                                          }))
                                        }
                                        onKeyDown={async (e) => {
                                          if (e.key === "Enter") {
                                            e.preventDefault();
                                            await saveSubtaskEdits(s.id);
                                            setEditingSubtaskId(null);
                                          } else if (e.key === "Escape") {
                                            e.preventDefault();
                                            setSubtaskDrafts((prev) => ({
                                              ...prev,
                                              [s.id]: { title: s.title, due_date: s.due_date || "" },
                                            }));
                                            setEditingSubtaskId(null);
                                          }
                                        }}
                                      />
                                      <button
                                        className="h-8 rounded-[10px] border border-slate-300 bg-white px-2.5 text-[12px] font-extrabold text-slate-700 hover:bg-slate-50"
                                        type="button"
                                        onClick={() =>
                                          setSubtaskDrafts((prev) => ({
                                            ...prev,
                                            [s.id]: { ...draft, due_date: "" },
                                          }))
                                        }
                                        title="Clear due date"
                                      >
                                        Clear
                                      </button>
                                    </>
                                  ) : (
                                    <div
                                      className={[
                                        "flex-1 text-[13px] font-semibold",
                                        s.is_done ? "text-slate-500 line-through" : "text-slate-900",
                                      ].join(" ")}
                                    >
                                      {s.title}
                                    </div>
                                  )}
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
                                  {savingSubtaskId === s.id ? (
                                    <span className="text-[11px] font-semibold text-slate-500">Saving...</span>
                                  ) : null}
                                  {canManageCard ? (
                                    <>
                                      <button
                                        className={btnEditIcon}
                                        type="button"
                                        onClick={() => {
                                          setSubtaskDrafts((prev) => ({
                                            ...prev,
                                            [s.id]: { title: s.title, due_date: s.due_date || "" },
                                          }));
                                          setEditingSubtaskId(s.id);
                                        }}
                                        title="Edit item"
                                        aria-label="Edit item"
                                      >
                                        <EditIcon size={16} />
                                      </button>
                                      <button
                                        className={btnDangerIcon}
                                        type="button"
                                        onClick={() => deleteSubtask(s.id)}
                                        title="Delete item"
                                        aria-label="Delete item"
                                      >
                                        <TrashIcon size={16} />
                                      </button>
                                    </>
                                  ) : null}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div className={section}>
                      <div className={sectionHead}>
                        <div className={`flex items-center gap-2 ${sectionTitle}`}>
                          <TagIcon /> Labels
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className={`${pillBase} border-indigo-500/25 bg-indigo-500/10 text-slate-900`}>
                            {cardLabels.length}
                          </span>
                          {canManageCard ? (
                            <>
                              <button
                                className={btnEditIcon + " h-7 w-7"}
                                type="button"
                                onClick={startEditLabel}
                                title="Edit label"
                                aria-label="Edit label"
                                disabled={boardLabels.length === 0}
                              >
                                <EditIcon size={14} />
                              </button>
                              <button
                                className={btnDangerIcon + " h-7 w-7"}
                                type="button"
                                onClick={() => {
                                  setLabelTool("delete");
                                  setEditingLabelId(null);
                                  if (!selectedLabelId && boardLabels[0]) setSelectedLabelId(boardLabels[0].id);
                                }}
                                title="Delete label"
                                aria-label="Delete label"
                                disabled={boardLabels.length === 0}
                              >
                                <TrashIcon size={14} />
                              </button>
                            </>
                          ) : null}
                        </div>
                      </div>

                      <div className="grid gap-2 lg:grid-cols-2 lg:items-start">
                        <div className="rounded-[12px] border border-slate-200 bg-white p-2.5">
                          <div className="mb-2 text-[12px] font-extrabold text-slate-700">Available labels</div>
                          {boardLabels.length === 0 ? (
                            <div className="text-[13px] font-semibold text-slate-500">No labels yet.</div>
                          ) : (
                            <div className="grid gap-2">
                              {boardLabels.map((l) => {
                                const active = cardLabelIds.has(l.id);
                                return (
                                  <button
                                    key={l.id}
                                    type="button"
                                    onClick={() => canManageCard && toggleLabel(l.id)}
                                    disabled={!canManageCard}
                                    className={[
                                      "flex min-h-10 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left font-extrabold text-[13px]",
                                      active
                                        ? "border-indigo-500/35 bg-indigo-500/10"
                                        : "border-slate-900/10 bg-white/85 hover:bg-indigo-500/[0.04]",
                                      !canManageCard ? "cursor-default opacity-90 hover:bg-white/85" : "",
                                    ].join(" ")}
                                  >
                                    <span className={`h-2.5 w-2.5 flex-none rounded-full ${labelDotClass(l.color)}`} />
                                    <span className="min-w-0 flex-1 pr-2 leading-5 whitespace-nowrap overflow-hidden text-ellipsis">{l.name}</span>
                                    <span className="flex-none text-[11px] font-extrabold text-slate-500">{active ? "On" : "Off"}</span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {canManageCard ? (
                        <div className="rounded-[12px] border border-slate-200 bg-white p-2.5">
                          <div className="mb-2 text-[12px] font-extrabold text-slate-700">
                            {labelTool === "edit" ? "Edit label" : labelTool === "delete" ? "Delete label" : "Create a new label"}
                          </div>
                          {labelTool !== "none" && boardLabels.length > 0 && (
                            <div className="mb-2 rounded-[10px] border border-slate-300 bg-slate-50 p-2">
                              <div className="mb-1 text-[11px] font-extrabold text-slate-600">Choose label</div>
                              <select
                                className={inputBase + " h-8 text-[12px]"}
                                value={selectedLabelId || boardLabels[0]?.id || 0}
                                onChange={(e) => {
                                  const id = Number(e.target.value);
                                  setSelectedLabelId(id);
                                  if (labelTool === "edit") {
                                    const selected = boardLabels.find((l) => l.id === id);
                                    if (selected) {
                                      setEditingLabelId(selected.id);
                                      setEditingLabelName(selected.name);
                                      setEditingLabelColor(selected.color || "indigo");
                                    }
                                  }
                                }}
                              >
                                {boardLabels.map((l) => (
                                  <option key={l.id} value={l.id}>
                                    {l.name}
                                  </option>
                                ))}
                              </select>
                              {labelTool === "delete" && (
                                <div className="mt-2 flex justify-end">
                                  <button
                                    className={btnDangerIcon + " h-8 w-8"}
                                    type="button"
                                    onClick={() => deleteLabel(selectedLabelId || boardLabels[0].id)}
                                    title="Delete selected label"
                                  >
                                    <TrashIcon size={15} />
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                          {labelTool === "edit" ? (
                            <div className="grid gap-2">
                              <input
                                className={inputBase}
                                placeholder="Label name..."
                                value={editingLabelName}
                                onChange={(e) => setEditingLabelName(e.target.value)}
                              />
                              <div className="flex flex-wrap items-center gap-2 rounded-[10px] border border-slate-300 bg-slate-50 p-2">
                                {labelColorChoices.map((c) => (
                                  <button
                                    key={c.value}
                                    type="button"
                                    onClick={() => setEditingLabelColor(c.value)}
                                    className={[
                                      "grid h-7 w-7 place-items-center rounded-full border transition",
                                      editingLabelColor === c.value
                                        ? "border-slate-900/50 bg-white shadow-[0_0_0_2px_rgba(99,102,241,0.22)]"
                                        : "border-slate-300 bg-white hover:border-slate-400",
                                    ].join(" ")}
                                    title={c.value}
                                  >
                                    <span className={`h-4 w-4 rounded-full ${c.className}`} />
                                  </button>
                                ))}
                              </div>
                              <div className="flex justify-end gap-2">
                                <button className={btnGhost} type="button" onClick={cancelEditLabel}>
                                  Cancel
                                </button>
                                <button
                                  className={btnPrimary}
                                  type="button"
                                  onClick={saveLabelEdits}
                                  disabled={!editingLabelName.trim() || !editingLabelId}
                                >
                                  Save
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                          <div className="grid gap-2">
                            <input
                              className={inputBase}
                              placeholder="Label name..."
                              value={newLabelName}
                              onChange={(e) => setNewLabelName(e.target.value)}
                            />
                            <div className="flex flex-wrap items-center gap-2 rounded-[10px] border border-slate-300 bg-slate-50 p-2">
                              {labelColorChoices.map((c) => {
                                const active = newLabelColor === c.value;
                                return (
                                  <button
                                    key={c.value}
                                    type="button"
                                    onClick={() => setNewLabelColor(c.value)}
                                    className={[
                                      "grid h-7 w-7 place-items-center rounded-full border transition",
                                      active
                                        ? "border-slate-900/50 bg-white shadow-[0_0_0_2px_rgba(99,102,241,0.22)]"
                                        : "border-slate-300 bg-white hover:border-slate-400",
                                    ].join(" ")}
                                    title={c.value}
                                    aria-label={`Choose ${c.value}`}
                                  >
                                    <span className={`h-4 w-4 rounded-full ${c.className}`} />
                                  </button>
                                );
                              })}
                            </div>
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
                            </>
                          )}
                        </div>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-2.5 xl:sticky xl:top-0">
                    <div className={`${section} min-h-[320px]`}>
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          className={[
                            "inline-flex h-9 items-center gap-1.5 rounded-[11px] border px-3 text-[13px] font-extrabold transition",
                            rightTab === "comments"
                              ? "border-indigo-500/35 bg-indigo-500/12 text-slate-900"
                              : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
                          ].join(" ")}
                          onClick={() => setRightTab("comments")}
                        >
                          <ChatIcon />
                          Comments
                          <span className="rounded-full bg-white/85 px-2 py-0.5 text-[11px]">{comments.length}</span>
                        </button>
                        <button
                          type="button"
                          className={[
                            "inline-flex h-9 items-center gap-1.5 rounded-[11px] border px-3 text-[13px] font-extrabold transition",
                            rightTab === "activity"
                              ? "border-indigo-500/35 bg-indigo-500/12 text-slate-900"
                              : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
                          ].join(" ")}
                          onClick={() => setRightTab("activity")}
                        >
                          <ActivityIcon />
                          Activity
                          <span className="rounded-full bg-white/85 px-2 py-0.5 text-[11px]">{activities.length}</span>
                        </button>
                      </div>

                      {rightTab === "comments" ? (
                        <>
                          <div className="grid gap-2">
                            <textarea
                              className={inputBase + " h-auto py-2.5"}
                              placeholder="Write a comment..."
                              value={commentBody}
                              onChange={(e) => setCommentBody(e.target.value)}
                              rows={2}
                            />
                            <div className="flex justify-end">
                              <button className={btnPrimary} type="button" onClick={addComment} disabled={!commentBody.trim()}>
                                Add comment
                              </button>
                            </div>
                          </div>

                          {comments.length === 0 ? (
                            <div className="mt-3 rounded-[12px] border border-dashed border-slate-300 bg-white/70 px-3 py-3 text-[13px] font-semibold text-slate-500">
                              No comments yet.
                            </div>
                          ) : (
                            <div className="mt-2 grid max-h-[45vh] gap-2 overflow-y-auto pr-1">
                              {comments.slice(0, 40).map((c) => (
                                <div key={c.id} className="flex gap-2.5 rounded-[12px] border border-slate-200 bg-white/90 p-2.5">
                                  <div className="grid h-[30px] w-[30px] place-items-center rounded-full border border-slate-200 bg-slate-100 text-[11px] font-black text-slate-800">
                                    {initials(c.actor_name)}
                                  </div>

                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-baseline justify-between gap-3">
                                      <div className="truncate text-[13px] font-black text-slate-900">{c.actor_name}</div>
                                      <div className="shrink-0 text-[11px] font-semibold text-slate-500">{c.created_at}</div>
                                    </div>

                                {editingCommentId === c.id && canManageCard ? (
                                  <div className="mt-2 grid gap-2">
                                        <textarea
                                          className={inputBase + " h-auto py-2.5"}
                                          value={editingBody}
                                          onChange={(e) => setEditingBody(e.target.value)}
                                          rows={2}
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
                                      <div className="mt-1.5 whitespace-pre-wrap text-[13px] font-semibold text-slate-900">
                                        {c.body}
                                      </div>
                                    )}

                                {editingCommentId !== c.id && canManageCard && (
                                  <div className="mt-2 flex gap-2">
                                        <button
                                          className={btnEditIcon}
                                          type="button"
                                          onClick={() => startEditComment(c)}
                                          title="Edit comment"
                                          aria-label="Edit comment"
                                        >
                                          <EditIcon size={17} />
                                        </button>
                                        <button
                                          className={btnDangerIcon}
                                          type="button"
                                          onClick={() => deleteComment(c.id)}
                                          title="Delete comment"
                                          aria-label="Delete comment"
                                        >
                                          <TrashIcon size={17} />
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      ) : activities.length === 0 ? (
                        <div className="rounded-[12px] border border-dashed border-slate-300 bg-white/70 px-3 py-3 text-[13px] font-semibold text-slate-500">
                          No activity yet.
                        </div>
                      ) : (
                        <div className="grid max-h-[56vh] gap-2 overflow-y-auto pr-1">
                          {activities.slice(0, 60).map((a) => (
                            <div
                              key={a.id}
                              className="rounded-[12px] border border-slate-200 bg-slate-50 px-2.5 py-2 text-[12px]"
                            >
                              <div className="text-[12px] font-black text-slate-900">
                                {a.actor_name} — {formatActivity(a)}
                              </div>
                              {a.meta ? <div className="mt-1 text-[12px] font-semibold text-slate-500">{a.meta}</div> : null}
                              <div className="mt-1 text-[11px] font-semibold text-slate-500">{a.created_at}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
    </>
  );
}
