import { useEffect, useMemo, useState } from "react";
import Modal from "./Modal";
import { apiFetch } from "../lib/api";

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

  // anim
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

  async function loadAll() {
    if (!open || !cardId) return;
    setErr("");
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

  async function saveCard() {
    if (!card) return;
    setErr("");
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
    // optimistic UI
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

  return (
    <Modal
      open={open}
      title={cardId ? `Card #${cardId}` : "Card"}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button
            className="btn primary"
            onClick={saveCard}
            disabled={saving || loading || !card?.title?.trim()}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </>
      }
    >
      {loading ? (
        <div style={{ color: "var(--muted)" }}>Loading...</div>
      ) : (
        <div className="modalBodyScroll">
          {err && <div className="noteBad" style={{ fontSize: 13, marginBottom: 10 }}>{err}</div>}

          {!card ? (
            <div style={{ color: "var(--muted)" }}>No card loaded.</div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1.25fr 0.75fr",
                gap: 14,
                alignItems: "start",
              }}
            >
              {/* LEFT */}
              <div style={{ display: "grid", gap: 14 }}>
                <div className="glass animPop" style={{ padding: 12, borderRadius: 16 }}>
                  <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 6 }}>Title</div>
                  <input
                    className="input"
                    value={card.title}
                    onChange={(e) => setCard({ ...card, title: e.target.value })}
                    placeholder="Card title"
                  />
                </div>

                <div className="glass" style={{ padding: 12, borderRadius: 16 }}>
                  <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 6 }}>Description</div>
                  <textarea
                    className="input"
                    value={card.description}
                    onChange={(e) => setCard({ ...card, description: e.target.value })}
                    placeholder="Write details..."
                    rows={8}
                    style={{ resize: "vertical" }}
                  />
                </div>

                {/* Checklist */}
                <div className="glass" style={{ padding: 12, borderRadius: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                    <div>
                      <div style={{ fontWeight: 950 }}>Checklist</div>
                      {progress ? (
                        <div style={{ color: "var(--muted2)", fontSize: 12, marginTop: 4 }}>
                          {progress.done}/{progress.total} completed
                        </div>
                      ) : (
                        <div style={{ color: "var(--muted2)", fontSize: 12, marginTop: 4 }}>
                          No subtasks yet
                        </div>
                      )}
                    </div>
                    <span className="badge">{subtasks.length}</span>
                  </div>

                  {progress && (
                    <>
                      <div style={{ height: 10 }} />
                      <div className="progressBar">
                        <div className="progressFill" style={{ width: `${progress.pct}%` }} />
                      </div>
                    </>
                  )}

                  <div style={{ height: 12 }} />

                  {/* Add subtask + optional due */}
                  <div style={{ display: "grid", gap: 10 }}>
                    <div style={{ display: "flex", gap: 10 }}>
                      <input
                        className="input"
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
                      <button className="btn primary" onClick={addSubtask} disabled={!subtaskTitle.trim()}>
                        Add
                      </button>
                    </div>

                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <span className="pill">
                        <ClockIcon />
                        Due (optional)
                      </span>
                      <input
                        className="input"
                        type="date"
                        value={subtaskDue}
                        onChange={(e) => setSubtaskDue(e.target.value)}
                        style={{ maxWidth: 220 }}
                      />
                      <button className="btn" onClick={() => setSubtaskDue("")}>Clear</button>
                    </div>
                  </div>

                  <div style={{ height: 12 }} />

                  {subtasks.length > 0 && (
                    <div style={{ display: "grid", gap: 8 }}>
                      {subtasks.map((s) => {
                        const overdue = s.due_date ? isDateOverdue(s.due_date) : false;
                        const today = s.due_date ? isDateToday(s.due_date) : false;

                        return (
                          <div
                            key={s.id}
                            className={`glass ${doneAnimId === s.id ? "animDone" : ""}`}
                            style={{ padding: 10, borderRadius: 14 }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <input
                                type="checkbox"
                                checked={s.is_done}
                                onChange={(e) => toggleSubtask(s.id, e.target.checked)}
                              />

                              <div
                                style={{
                                  flex: 1,
                                  color: s.is_done ? "var(--muted2)" : "var(--text)",
                                  textDecoration: s.is_done ? "line-through" : "none",
                                  fontSize: 14,
                                }}
                              >
                                {s.title}
                              </div>

                              <span
                                className={`pill ${overdue ? "clockPillOverdue" : today ? "clockPillSoon" : ""}`}
                                title={s.due_date ? `Due ${s.due_date}` : "No due date"}
                                style={{ opacity: s.due_date ? 1 : 0.55 }}
                              >
                                <ClockIcon />
                                {s.due_date || "No due"}
                              </span>

                              <button className="btn" onClick={() => deleteSubtask(s.id)}>Remove</button>
                            </div>

                            <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center" }}>
                              <div style={{ color: "var(--muted2)", fontSize: 12 }}>Subtask due date</div>
                              <input
                                className="input"
                                type="date"
                                value={s.due_date || ""}
                                onChange={(e) => updateSubtaskDue(s.id, e.target.value)}
                                style={{ maxWidth: 220 }}
                              />
                              <button className="btn" onClick={() => updateSubtaskDue(s.id, "")}>Clear</button>
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
                <div className="glass" style={{ padding: 12, borderRadius: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                    <div>
                      <div style={{ fontWeight: 950, display: "flex", alignItems: "center", gap: 8 }}>
                        <ClockIcon />
                        Card due date
                      </div>
                      <div style={{ color: "var(--muted2)", fontSize: 12, marginTop: 4 }}>
                        {isOverdue ? "Overdue" : " "}
                      </div>
                    </div>

                    <span className={`pill ${isOverdue ? "clockPillOverdue" : card.due_date ? "clockPillSoon" : ""}`}>
                      <ClockIcon />
                      {card.due_date || "None"}
                    </span>
                  </div>

                  <div style={{ height: 12 }} />

                  <div style={{ display: "grid", gap: 10 }}>
                    <input
                      className="input"
                      type="date"
                      value={card.due_date || ""}
                      onChange={(e) => setCard({ ...card, due_date: e.target.value })}
                    />
                    <button className="btn" onClick={() => setCard({ ...card, due_date: "" })}>
                      Clear
                    </button>
                  </div>
                </div>

                {/* Assignees */}
                <div className="glass" style={{ padding: 12, borderRadius: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                    <div>
                      <div style={{ fontWeight: 950 }}>Assignees</div>
                      <div style={{ color: "var(--muted2)", fontSize: 12, marginTop: 4 }}>
                        Assign students
                      </div>
                    </div>
                    <span className="badge">{assignees.length}</span>
                  </div>

                  <div style={{ height: 12 }} />

                  {assignees.length === 0 ? (
                    <div style={{ color: "var(--muted2)", fontSize: 13 }}>No assignees yet.</div>
                  ) : (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {assignees.map((a) => (
                        <div
                          key={a.user_id}
                          className="pill animPop"
                          style={{ display: "flex", alignItems: "center", gap: 8 }}
                          title={a.email}
                        >
                          <span
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: 999,
                              border: "1px solid rgba(255,255,255,0.18)",
                              background: "rgba(255,255,255,0.06)",
                              display: "grid",
                              placeItems: "center",
                              fontWeight: 900,
                              fontSize: 11,
                            }}
                          >
                            {initials(a.full_name)}
                          </span>
                          <span style={{ fontSize: 12, fontWeight: 900 }}>{a.full_name}</span>
                          <button className="btn" onClick={() => removeAssignee(a.user_id)}>×</button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ height: 12 }} />

                  {studentsOnly.length === 0 ? (
                    <div style={{ color: "var(--muted2)", fontSize: 13 }}>
                      No students in this board yet. Add them from “Members”.
                    </div>
                  ) : (
                    <div style={{ position: "relative" }}>
                      <input
                        className="input"
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
                        <div
                          className="glass dropdownAnim"
                          style={{
                            position: "absolute",
                            top: "calc(100% + 8px)",
                            left: 0,
                            right: 0,
                            padding: 10,
                            borderRadius: 16,
                            zIndex: 20,
                          }}
                        >
                          <div style={{ display: "grid", gap: 8 }}>
                            {availableStudents.map((m) => (
                              <button
                                key={m.user_id}
                                className="btn"
                                style={{ justifyContent: "space-between" }}
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => addAssignee(m.user_id)}
                              >
                                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                  <span
                                    style={{
                                      width: 26,
                                      height: 26,
                                      borderRadius: 999,
                                      border: "1px solid rgba(255,255,255,0.18)",
                                      background: "rgba(255,255,255,0.06)",
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
                                    <span style={{ color: "var(--muted)", fontSize: 12 }}>{m.email}</span>
                                  </span>
                                </span>
                                <span className="badge">Add</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {boardId && (
                  <div style={{ color: "var(--muted2)", fontSize: 12 }}>
                    Board: #{boardId}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}