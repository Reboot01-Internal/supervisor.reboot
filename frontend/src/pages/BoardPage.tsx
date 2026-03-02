import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import AdminLayout from "../components/AdminLayout";
import { apiFetch } from "../lib/api";
import "../admin.css";

import {
  DndContext,
  type DragEndEvent,
  type DragStartEvent,
  type DragOverEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  closestCorners,
  DragOverlay,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import CardModal from "../components/CardModal";

type List = { id: number; board_id: number; title: string; position: number };

type Label = { id: number; board_id: number; name: string; color: string };
type CardLabel = { label_id: number; name: string; color: string };

type Card = {
  id: number;
  list_id: number;
  title: string;
  description: string;
  position: number;
  due_date?: string;
  status?: "todo" | "doing" | "blocked" | "done";
  priority?: "low" | "medium" | "high" | "urgent";
};

type BoardFull = {
  board_id: number;
  supervisor_file_id: number;
  name: string;
  lists: List[];
  cards: Card[];
  labels: Label[];
};

type CardPreview = {
  card_id: number;
  done: number;
  total: number;
  assignees: { user_id: number; full_name: string }[];
  labels: CardLabel[];
  status: string;
  priority: string;
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("");
}

function ClockIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 22a10 10 0 1 0-10-10 10 10 0 0 0 10 10Z" stroke="currentColor" strokeWidth="2" opacity="0.9" />
      <path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PlusIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5v14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
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

function prettyStatus(s?: string) {
  const x = (s || "todo").toLowerCase();
  if (x === "doing") return "Doing";
  if (x === "blocked") return "Blocked";
  if (x === "done") return "Done";
  return "To Do";
}
function prettyPriority(p?: string) {
  const x = (p || "medium").toLowerCase();
  if (x === "low") return "Low";
  if (x === "high") return "High";
  if (x === "urgent") return "Urgent";
  return "Medium";
}

function CardItem({
  card,
  preview,
  onOpen,
  isOverlay = false,
}: {
  card: Card;
  preview?: CardPreview;
  onOpen: (cardId: number) => void;
  isOverlay?: boolean;
}) {
  const sortable = useSortable({
    id: `card:${card.id}`,
    data: { type: "card", cardId: card.id, fromListId: card.list_id },
    disabled: isOverlay,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: isOverlay ? undefined : sortable.transition,
    opacity: sortable.isDragging ? 0.65 : 1,
  };

  const progressPct = preview && preview.total > 0 ? Math.round((preview.done / preview.total) * 100) : 0;
  const due = card.due_date || "";
  const labels = preview?.labels ?? [];
  const status = preview?.status || card.status || "todo";
  const priority = preview?.priority || card.priority || "medium";

  return (
    <div ref={sortable.setNodeRef} style={style} className={`tCard ${isOverlay ? "tCardOverlay" : ""}`}>
      <div className="tCardInner">
        <div className="cardTopRow">
          {!isOverlay && (
            <div className="dragHandle" {...sortable.attributes} {...sortable.listeners} title="Drag">
              <span style={{ opacity: 0.7, fontSize: 14 }}>⋮⋮</span>
            </div>
          )}

          <div style={{ flex: 1, minWidth: 0 }}>
            {/* labels row */}
            {labels.length > 0 && (
              <div className="cardLabelRow">
                {labels.slice(0, 4).map((l) => (
                  <span key={l.label_id} className={`labelDot label-${l.color}`} title={l.name} />
                ))}
                {labels.length > 4 && <span className="labelMore">+{labels.length - 4}</span>}
              </div>
            )}

            <div className="cardTitle" onDoubleClick={() => onOpen(card.id)} title="Double click to open">
              {card.title}
            </div>

            {/* status + priority */}
            <div className="cardPillRow">
              <span className={`pill pillStatus pill-status-${status}`} title="Status">
                {prettyStatus(status)}
              </span>
              <span className={`pill pillPriority pill-priority-${priority}`} title="Priority">
                {prettyPriority(priority)}
              </span>
            </div>

            {preview && preview.total > 0 && (
              <div style={{ marginTop: 8 }}>
                <div className="progressBar">
                  <div className="progressFill" style={{ width: `${progressPct}%` }} />
                </div>
              </div>
            )}

            <div style={{ marginTop: 8 }} className="cardMetaRow">
              <div className="metaLeft">
                {preview && preview.total > 0 && <span className="miniTag">{preview.done}/{preview.total}</span>}

                {due && (
                  <span
                    className={`pill ${isDateOverdue(due) ? "clockPillOverdue" : isDateToday(due) ? "clockPillSoon" : ""}`}
                    title={`Due ${due}`}
                  >
                    <ClockIcon />
                    {due}
                  </span>
                )}
              </div>

              <div className="avatars">
                {(preview?.assignees ?? []).slice(0, 3).map((a) => (
                  <div key={a.user_id} className="avatarDot" title={a.full_name}>
                    {initials(a.full_name)}
                  </div>
                ))}
                {(preview?.assignees?.length ?? 0) > 3 && (
                  <div className="avatarDot" title="More">
                    +{preview!.assignees.length - 3}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {!isOverlay && <div style={{ color: "rgba(15,23,42,0.55)", fontSize: 11 }}>Double click to open</div>}
      </div>
    </div>
  );
}

function ListColumn({
  list,
  cards,
  previews,
  onAddCard,
  onOpenCard,
}: {
  list: List;
  cards: Card[];
  previews: Record<number, CardPreview | undefined>;
  onAddCard: (listId: number) => void;
  onOpenCard: (cardId: number) => void;
}) {
  const drop = useDroppable({
    id: `list:${list.id}`,
    data: { type: "list", listId: list.id },
  });

  return (
    <div className="column" style={{ borderColor: drop.isOver ? "rgba(37,99,235,0.35)" : undefined }}>
      <div className="columnHeader">
        <div className="columnTitleRow">
          <div className="columnTitle">{list.title}</div>
          <span className="colCountPill">{cards.length}</span>
        </div>

        <button className="admSoftBtn" onClick={() => onAddCard(list.id)}>
          + Card
        </button>
      </div>

      <div ref={drop.setNodeRef} className="columnBody">
        <SortableContext items={cards.map((c) => `card:${c.id}`)} strategy={verticalListSortingStrategy}>
          {cards.map((c) => (
            <CardItem key={c.id} card={c} preview={previews[c.id]} onOpen={onOpenCard} />
          ))}
        </SortableContext>

        {cards.length === 0 && (
          <div style={{ color: "rgba(15,23,42,0.55)", fontSize: 13, padding: "10px 6px" }}>
            Drop cards here
          </div>
        )}
      </div>
    </div>
  );
}

export default function BoardPage() {
  const nav = useNavigate();
  const { boardId } = useParams();
  const boardID = Number(boardId);

  const [data, setData] = useState<BoardFull | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  const [newListTitle, setNewListTitle] = useState("");
  const [creatingList, setCreatingList] = useState(false);

  const [activeCardId, setActiveCardId] = useState<number | null>(null);
  const [activeCardSnapshot, setActiveCardSnapshot] = useState<Card | null>(null);

  const [openCardId, setOpenCardId] = useState<number | null>(null);
  const [isCardModalOpen, setIsCardModalOpen] = useState(false);

  const [previews, setPreviews] = useState<Record<number, CardPreview | undefined>>({});

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  async function load() {
    setErr("");
    setLoading(true);
    try {
      const res = await apiFetch(`/admin/board?board_id=${boardID}`);
      setData(res);
    } catch (e: any) {
      setErr(e.message || "Failed to load board");
    } finally {
      setLoading(false);
    }
  }

  async function loadPreviews(cards: Card[]) {
    const next: Record<number, CardPreview> = {};
    for (const c of cards) {
      try {
        const full = await apiFetch(`/admin/card/full?card_id=${c.id}`);
        const done = (full.subtasks ?? []).filter((s: any) => s.is_done).length;
        const total = (full.subtasks ?? []).length;
        const assignees = (full.assignees ?? []).map((a: any) => ({ user_id: a.user_id, full_name: a.full_name }));
        const labels = (full.labels ?? []).map((l: any) => ({ label_id: l.label_id, name: l.name, color: l.color }));
        next[c.id] = {
          card_id: c.id,
          done,
          total,
          assignees,
          labels,
          status: full.card?.status || "todo",
          priority: full.card?.priority || "medium",
        };
      } catch {
        // ignore
      }
    }
    setPreviews((prev) => ({ ...prev, ...next }));
  }

  useEffect(() => {
    if (!boardID || Number.isNaN(boardID)) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardID]);

  useEffect(() => {
    if (!data) return;
    loadPreviews(data.cards);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.board_id]);

  const listsSorted = useMemo(() => {
    if (!data) return [];
    return [...data.lists].sort((a, b) => a.position - b.position);
  }, [data]);

  const cardsByList = useMemo(() => {
    const map: Record<number, Card[]> = {};
    if (!data) return map;

    for (const l of data.lists) map[l.id] = [];
    for (const c of data.cards) {
      if (!map[c.list_id]) map[c.list_id] = [];
      map[c.list_id].push(c);
    }
    for (const k of Object.keys(map)) map[Number(k)].sort((a, b) => a.position - b.position);

    return map;
  }, [data]);

  async function createList(e: React.FormEvent) {
    e.preventDefault();
    const title = newListTitle.trim();
    if (!title) return;

    setCreatingList(true);
    try {
      await apiFetch("/admin/lists", {
        method: "POST",
        body: JSON.stringify({ board_id: boardID, title }),
      });
      setNewListTitle("");
      await load();
    } catch (e: any) {
      setErr(e.message || "Failed to create list");
    } finally {
      setCreatingList(false);
    }
  }

  async function createCard(listId: number) {
    setErr("");
    try {
      const res = await apiFetch("/admin/cards", {
        method: "POST",
        body: JSON.stringify({ list_id: listId, title: "New card", description: "" }),
      });
      const newId = res.id as number;
      await load();
      setOpenCardId(newId);
      setIsCardModalOpen(true);
    } catch (e: any) {
      setErr(e.message || "Failed to create card");
    }
  }

  function onOpenCard(cardId: number) {
    setOpenCardId(cardId);
    setIsCardModalOpen(true);
  }

  function findCard(cardId: number): Card | undefined {
    return data?.cards.find((c) => c.id === cardId);
  }

  function onDragStart(e: DragStartEvent) {
    const id = String(e.active.id);
    if (id.startsWith("card:")) {
      const cid = Number(id.split(":")[1]);
      setActiveCardId(cid);
      const c = findCard(cid);
      if (c) setActiveCardSnapshot(c);
    }
  }

  async function onDragEnd(e: DragEndEvent) {
    setActiveCardId(null);
    setActiveCardSnapshot(null);
    if (!data) return;

    const activeId = String(e.active.id);
    const overId = e.over ? String(e.over.id) : null;
    if (!overId) return;
    if (!activeId.startsWith("card:")) return;

    const cardId = Number(activeId.split(":")[1]);
    const activeCard = findCard(cardId);
    if (!activeCard) return;

    const fromListId = activeCard.list_id;

    if (overId.startsWith("card:")) {
      const overCardId = Number(overId.split(":")[1]);
      const overCard = findCard(overCardId);
      if (!overCard) return;

      const toListId = overCard.list_id;

      if (toListId === fromListId) {
        const current = cardsByList[fromListId] ?? [];
        const fromIndex = current.findIndex((c) => c.id === cardId);
        const toIndex = current.findIndex((c) => c.id === overCardId);
        if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;

        const ordered = arrayMove(current, fromIndex, toIndex).map((c) => c.id);

        await apiFetch("/admin/cards/reorder", {
          method: "POST",
          body: JSON.stringify({ list_id: fromListId, ids: ordered }),
        });

        await load();
        return;
      }

      const target = cardsByList[toListId] ?? [];
      const toPos = target.findIndex((c) => c.id === overCardId);
      const position = toPos < 0 ? 0 : toPos;

      await apiFetch("/admin/cards/move", {
        method: "POST",
        body: JSON.stringify({ card_id: cardId, to_list_id: toListId, to_position: position }),
      });

      await load();
      return;
    }

    if (overId.startsWith("list:")) {
      const toListId = Number(overId.split(":")[1]);
      const endPos = cardsByList[toListId]?.length ?? 0;
      if (toListId === fromListId) return;

      await apiFetch("/admin/cards/move", {
        method: "POST",
        body: JSON.stringify({ card_id: cardId, to_list_id: toListId, to_position: endPos }),
      });

      await load();
      return;
    }
  }

  const pageTitle = data ? data.name : `Board #${boardID}`;

  return (
    <AdminLayout
      active="supervisors"
      title={pageTitle}
      subtitle="Double click a card to open"
      right={
        <>
          <button className="admGhostBtn" onClick={() => nav(-1)}>
            Back
          </button>
          <button className="admPrimaryBtn" onClick={load} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </>
      }
    >
      <CardModal
        open={isCardModalOpen}
        cardId={openCardId}
        onClose={() => setIsCardModalOpen(false)}
        onSaved={async () => {
          await load();
          if (data) await loadPreviews(data.cards);
        }}
      />

      {err && (
        <div className="admAlert admAlertBad" style={{ marginBottom: 12 }}>
          {err}
        </div>
      )}
      {loading && <div className="admMuted">Loading board...</div>}

      {!loading && data && (
        <div className="boardWrap">
          <div className="admCard boardAddListCard">
            <form onSubmit={createList} className="boardTopBar">
              <div className="boardTopIcon" aria-hidden="true">
                <PlusIcon />
              </div>

              <input
                className="admInput"
                placeholder="Add a list (To Do, Doing, Done...)"
                value={newListTitle}
                onChange={(e) => setNewListTitle(e.target.value)}
                style={{ flex: 1 }}
              />

              <button className="admPrimaryBtn" disabled={creatingList || !newListTitle.trim()}>
                {creatingList ? "..." : "Add"}
              </button>
            </form>
          </div>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          >
            <div className="boardScroller">
              <div className="columnsRow">
                {listsSorted.map((l) => (
                  <ListColumn
                    key={l.id}
                    list={l}
                    cards={cardsByList[l.id] ?? []}
                    previews={previews}
                    onAddCard={createCard}
                    onOpenCard={onOpenCard}
                  />
                ))}

                {listsSorted.length === 0 && (
                  <div className="column">
                    <div className="columnHeader">
                      <div className="columnTitleRow">
                        <div className="columnTitle">No lists yet</div>
                        <span className="colCountPill">0</span>
                      </div>
                    </div>
                    <div style={{ color: "rgba(15,23,42,0.55)", fontSize: 13, padding: 12 }}>
                      Add your first list above.
                    </div>
                  </div>
                )}
              </div>
            </div>

            <DragOverlay dropAnimation={{ duration: 200, easing: "cubic-bezier(.2,.9,.2,1)" }}>
              {activeCardSnapshot ? (
                <CardItem
                  card={activeCardSnapshot}
                  preview={previews[activeCardSnapshot.id]}
                  onOpen={onOpenCard}
                  isOverlay
                />
              ) : null}
            </DragOverlay>
          </DndContext>

          {activeCardId && <div className="admTdMuted">Moving card #{activeCardId}</div>}
        </div>
      )}
    </AdminLayout>
  );
}