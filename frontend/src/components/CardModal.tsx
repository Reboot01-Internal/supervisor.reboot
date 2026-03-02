import { useEffect, useMemo, useState } from "react";
import Modal from "./Modal";
import { apiFetch } from "../lib/api";
import "../admin.css";

type Card = {
  id: number;
  list_id: number;
  title: string;
  description: string;
  due_date: string; // "" or "YYYY-MM-DD"
};

type Subtask = {
  id: number;
  card_id: number;
  title: string;
  is_done: boolean;
  due_date: string; // "" or "YYYY-MM-DD"
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

type CardFull = {
  card: Card;
  subtasks: Subtask[];
  assignees: Assignee[];
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
  const [boardId, setBoardId] = useState<number | null>(null);
  const [boardMembers, setBoardMembers] = useState<BoardMember[]>([]);

  // create subtask
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [subtaskDue, setSubtaskDue] = useState("");

  // assignee picker
  const [assigneeQuery, setAssigneeQuery] = useState("");
  const [assigneeOpen, setAssigneeOpen] = useState(false);

  // small done animation
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

  const studentsOnly = useMemo(
    () => boardMembers.filter((m) => m.role === "student"),
    [boardMembers]
  );

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

  async function loadAll() {
    if (!open || !cardId) return;
    setErr("");
    setMsg("");
    setLoading(true);

    try {
      const full: CardFull = await apiFetch(`/admin/card/full?card_id=${cardId}`);
      setCard(full.card);
      setSubtasks(full.subtasks);
      setAssignees(full.assignees);
      setBoardId(full.board_id);

      const members: BoardMember[] = await apiFetch(`/admin/board-members?board_id=${full.board_id}`);
      setBoardMembers(members);
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

    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cardId]);

  // Close assignee dropdown on Escape
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
        body: JSON.stringify({
          card_id: card.id,
          title: subtaskTitle.trim(),
          due_date: subtaskDue || "",
        }),
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
          <button
            className="admPrimaryBtn"
            onClick={saveCard}
            disabled={saving || loading || !card?.title?.trim()}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </>
      }
    >
      {loading ? (
        <div className="admMuted">Loading...</div>
      ) : (
        <div className="modalBodyScroll">
          {err && <div className="admAlert admAlertBad" style={{ marginBottom: 10 }}>{err}</div>}
          {msg && <div className="admAlert admAlertGood" style={{ marginBottom: 10 }}>{msg}</div>}

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
                    style={{
                      resize: "vertical",
                      height: "auto",
                      minHeight: 160,
                      paddingTop: 10,
                      paddingBottom: 10,
                    }}
                  />
                </div>

                {/* Checklist */}
                <div className="cmSection">
                  <div className="cmHead">
                    <div>
                      <div className="cmHeadTitle">
                        <CheckIcon />
                        Checklist
                      </div>
                      <div className="cmHeadSub">
                        {progress ? `${progress.done}/${progress.total} completed` : "No subtasks yet"}
                      </div>
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

                  {/* Add subtask */}
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
                        <ClockIcon />
                        Due (optional)
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
                              <input
                                type="checkbox"
                                checked={s.is_done}
                                onChange={(e) => toggleSubtask(s.id, e.target.checked)}
                              />

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
                                style={{
                                  opacity: s.due_date ? 1 : 0.7,
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 8,
                                }}
                              >
                                <ClockIcon />
                                {s.due_date || "No due"}
                              </span>

                              <button className="admSoftBtn" type="button" onClick={() => deleteSubtask(s.id)}>
                                Remove
                              </button>
                            </div>

                            <div
                              style={{
                                marginTop: 10,
                                display: "flex",
                                gap: 10,
                                alignItems: "center",
                                flexWrap: "wrap",
                              }}
                            >
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
              </div>

              {/* RIGHT */}
              <div style={{ display: "grid", gap: 14 }}>
                {/* Card due */}
                <div className="cmSection">
                  <div className="cmHead">
                    <div>
                      <div className="cmHeadTitle">
                        <ClockIcon />
                        Card due date
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