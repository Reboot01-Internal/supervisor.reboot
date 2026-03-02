import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import AppShell from "../components/AppShell";
import { apiFetch } from "../lib/api";

import {
  DndContext,
  type DragEndEvent,
  type DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  closestCorners,
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
type Card = {
  id: number;
  list_id: number;
  title: string;
  description: string;
  position: number;
  due_date?: string;
};

type BoardFull = {
  board_id: number;
  supervisor_file_id: number;
  name: string;
  lists: List[];
  cards: Card[];
};

type CardPreview = {
  card_id: number;
  done: number;
  total: number;
  assignees: { user_id: number; full_name: string }[];
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

function isDateOverdue(due: string) {
  const today = new Date();
  const dueD = new Date(due + "T00:00:00");
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return dueD < t;
}
function isDateToday(due: string) {
  const today = new Date();
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dueD = new Date(due + "T00:00:00");
  return dueD.getFullYear() === t.getFullYear() && dueD.getMonth() === t.getMonth() && dueD.getDate() === t.getDate();
}

function CardItem({
  card,
  preview,
  onOpen,
}: {
  card: Card;
  preview?: CardPreview;
  onOpen: (cardId: number) => void;
}) {
  const sortable = useSortable({
    id: `card:${card.id}`,
    data: { type: "card", cardId: card.id, fromListId: card.list_id },
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
    opacity: sortable.isDragging ? 0.7 : 1,
  };

  const progressPct =
    preview && preview.total > 0 ? Math.round((preview.done / preview.total) * 100) : 0;

  const due = card.due_date || "";

  return (
    <div ref={sortable.setNodeRef} style={style} className="tCard">
      <div className="tCardInner">
        <div className="cardTopRow">
          <div className="dragHandle" {...sortable.attributes} {...sortable.listeners} title="Drag">
            <span style={{ opacity: 0.7, fontSize: 14 }}>⋮⋮</span>
          </div>

          <div style={{ flex: 1, minWidth: 0, cursor: "default" }}>
            <div
              className="cardTitle"
              onDoubleClick={() => onOpen(card.id)}
              title="Double click to open"
            >
              {card.title}
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
                {preview && preview.total > 0 && (
                  <span className="miniTag">
                    {preview.done}/{preview.total}
                  </span>
                )}

                {due && (
                  <span
                    className={`pill ${
                      isDateOverdue(due) ? "clockPillOverdue" : isDateToday(due) ? "clockPillSoon" : ""
                    }`}
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
                    +{(preview!.assignees.length - 3)}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div style={{ color: "var(--muted2)", fontSize: 11 }}>
          Double click to open
        </div>
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
    <div className="column" style={{ borderColor: drop.isOver ? "rgba(34,211,238,0.35)" : undefined }}>
      <div className="columnHeader">
        <div className="columnTitle">{list.title}</div>
        <button className="btn" onClick={() => onAddCard(list.id)}>
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
          <div style={{ color: "var(--muted2)", fontSize: 13, padding: "10px 6px" }}>
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
        const assignees = (full.assignees ?? []).map((a: any) => ({
          user_id: a.user_id,
          full_name: a.full_name,
        }));
        next[c.id] = { card_id: c.id, done, total, assignees };
      } catch {
        // ignore
      }
    }
    setPreviews((prev) => ({ ...prev, ...next }));
  }

  useEffect(() => {
    if (!boardID) return;
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

  function onDragStart(e: DragStartEvent) {
    const id = String(e.active.id);
    if (id.startsWith("card:")) setActiveCardId(Number(id.split(":")[1]));
  }

  function findCard(cardId: number): Card | undefined {
    return data?.cards.find((c) => c.id === cardId);
  }

  async function onDragEnd(e: DragEndEvent) {
    setActiveCardId(null);
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

  return (
    <AppShell
      title={data ? data.name : `Board #${boardID}`}
      subtitle="Double click a card to open"
      showLogout
      right={
        <>
          <button className="btn" onClick={() => nav(-1)}>Back</button>
          <button className="btn primary" onClick={load}>Refresh</button>
        </>
      }
    >
      <div className="container">
        <CardModal
          open={isCardModalOpen}
          cardId={openCardId}
          onClose={() => setIsCardModalOpen(false)}
          onSaved={async () => {
            await load();
            if (data) await loadPreviews(data.cards);
          }}
        />

        {err && <div className="noteBad" style={{ marginBottom: 12 }}>{err}</div>}
        {loading && <div style={{ color: "var(--muted)" }}>Loading board...</div>}

        {!loading && data && (
          <div className="boardWrap">
            <div className="glass" style={{ padding: 14 }}>
              <form onSubmit={createList} style={{ display: "flex", gap: 10 }}>
                <input
                  className="input"
                  placeholder="Add a list (To Do, Doing, Done...)"
                  value={newListTitle}
                  onChange={(e) => setNewListTitle(e.target.value)}
                />
                <button className="btn primary" disabled={creatingList}>
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
                        <div className="columnTitle">No lists yet</div>
                      </div>
                      <div style={{ color: "var(--muted2)", fontSize: 13, padding: 10 }}>
                        Add your first list above.
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </DndContext>

            {activeCardId && (
              <div style={{ color: "var(--muted2)", fontSize: 12 }}>
                Moving card #{activeCardId}
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}