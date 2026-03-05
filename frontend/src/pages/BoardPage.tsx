import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import AdminLayout from "../components/AdminLayout";
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

function CircleCheckIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M8 12.5 10.8 15 16.2 9.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
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
  return (
    dueD.getFullYear() === t.getFullYear() &&
    dueD.getMonth() === t.getMonth() &&
    dueD.getDate() === t.getDate()
  );
}

function prettyPriority(p?: string) {
  const x = (p || "medium").toLowerCase();
  if (x === "low") return "Low";
  if (x === "high") return "High";
  if (x === "urgent") return "Urgent";
  return "Medium";
}

/** Tailwind label dot colors */
function labelDotClass(color: string) {
  switch ((color || "").toLowerCase()) {
    case "indigo":
      return "bg-indigo-600";
    case "sky":
      return "bg-sky-600";
    case "emerald":
      return "bg-emerald-500";
    case "amber":
      return "bg-amber-500";
    case "rose":
      return "bg-rose-500";
    case "violet":
      return "bg-violet-600";
    case "slate":
      return "bg-slate-600";
    default:
      return "bg-slate-400";
  }
}

function priorityPillClass(priority: string) {
  const p = (priority || "medium").toLowerCase();
  if (p === "low") return "bg-sky-50 text-sky-700 border-sky-200";
  if (p === "high") return "bg-amber-50 text-amber-800 border-amber-200";
  if (p === "urgent") return "bg-rose-50 text-rose-700 border-rose-200";
  return "bg-slate-50 text-slate-700 border-slate-200";
}

function CardItem({
  card,
  preview,
  onOpen,
  onToggleDone,
  index = 0,
  isOverlay = false,
}: {
  card: Card;
  preview?: CardPreview;
  onOpen: (cardId: number) => void;
  onToggleDone: (cardId: number, nextDone: boolean) => void;
  index?: number;
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
    animationDelay: isOverlay ? undefined : `${Math.min(index, 12) * 28}ms`,
  };

  const progressPct =
    preview && preview.total > 0 ? Math.round((preview.done / preview.total) * 100) : 0;

  const due = card.due_date || "";
  const labels = preview?.labels ?? [];
  const status = preview?.status || card.status || "todo";
  const isDone = status.toLowerCase() === "done";
  const priority = preview?.priority || card.priority || "medium";

  const dueClass = isDateOverdue(due)
    ? "border-rose-200 bg-rose-50 text-rose-700"
    : isDateToday(due)
    ? "border-amber-200 bg-amber-50 text-amber-800"
    : "border-slate-200 bg-slate-50 text-slate-700";

  return (
    <div
      ref={sortable.setNodeRef}
      style={style}
      className={[
        "boardCardIn rounded-xl border bg-white shadow-sm transition",
        "border-slate-200 hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50/40 hover:shadow-md",
        "active:scale-[0.997]",
        isOverlay ? "shadow-lg ring-1 ring-slate-200/70" : "",
      ].join(" ")}
    >
      <div className="p-3 flex gap-3 items-start">
        {!isOverlay && (
          <button
            type="button"
            className={[
              "h-9 w-9 rounded-lg border border-slate-200 bg-slate-50",
              "grid place-items-center cursor-grab active:cursor-grabbing",
              "hover:border-slate-300 hover:bg-slate-100 transition",
              "shrink-0",
            ].join(" ")}
            {...sortable.attributes}
            {...sortable.listeners}
            title="Drag"
          >
            <span className="text-slate-500 text-sm leading-none">⋮⋮</span>
          </button>
        )}

        <div className="flex-1 min-w-0">
          {/* labels */}
          {labels.length > 0 && (
            <div className="flex items-center gap-1.5 mb-2">
              {labels.slice(0, 4).map((l) => (
                <span
                  key={l.label_id}
                  title={l.name}
                  className={[
                    "inline-block h-2.5 w-2.5 rounded-full",
                    "shadow-[0_0_0_2px_rgba(255,255,255,0.95)]",
                    labelDotClass(l.color),
                  ].join(" ")}
                />
              ))}
              {labels.length > 4 && (
                <span className="text-[11px] font-extrabold text-slate-500">
                  +{labels.length - 4}
                </span>
              )}
            </div>
          )}

          <div
            className={[
              "font-extrabold text-slate-900 truncate cursor-default transition",
              isDone ? "text-slate-500 line-through decoration-slate-300" : "",
            ].join(" ")}
            onDoubleClick={() => onOpen(card.id)}
            title="Double click to open"
          >
            {card.title}
          </div>

          {/* completion + priority */}
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onToggleDone(card.id, !isDone)}
              className={[
                "h-7 px-2.5 inline-flex items-center gap-1.5 rounded-full border text-xs font-extrabold transition",
                isDone
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 animDone"
                  : "border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100",
              ].join(" ")}
              title={isDone ? "Mark as not done" : "Mark as done"}
            >
              <CircleCheckIcon size={12} />
              {isDone ? "Done" : "Mark done"}
            </button>
            <span
              className={[
                "h-7 px-2.5 inline-flex items-center rounded-full border text-xs font-extrabold",
                priorityPillClass(priority),
              ].join(" ")}
              title="Priority"
            >
              {prettyPriority(priority)}
            </span>
          </div>

          {/* progress */}
          {preview && preview.total > 0 && (
            <div className="mt-2">
              <div className="h-2 rounded-full bg-slate-200/70 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-blue-600/90 to-blue-400/70 transition-[width] duration-200"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}

          {/* meta */}
          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {preview && preview.total > 0 && (
                <span className="h-7 px-2.5 inline-flex items-center rounded-full border border-slate-200 bg-slate-50 text-xs font-extrabold text-slate-700">
                  {preview.done}/{preview.total}
                </span>
              )}

              {due && (
                <span
                  className={[
                    "h-7 px-2.5 inline-flex items-center gap-2 rounded-full border text-xs font-extrabold",
                    dueClass,
                  ].join(" ")}
                  title={`Due ${due}`}
                >
                  <ClockIcon />
                  {due}
                </span>
              )}
            </div>

            <div className="flex items-center">
              {(preview?.assignees ?? []).slice(0, 3).map((a, idx) => (
                <div
                  key={a.user_id}
                  title={a.full_name}
                  className={[
                    "h-7 w-7 rounded-full border border-slate-200 bg-slate-100",
                    "grid place-items-center text-[11px] font-extrabold text-slate-700",
                    idx === 0 ? "" : "-ml-2",
                  ].join(" ")}
                >
                  {initials(a.full_name)}
                </div>
              ))}
              {(preview?.assignees?.length ?? 0) > 3 && (
                <div className="-ml-2 h-7 w-7 rounded-full border border-slate-200 bg-slate-100 grid place-items-center text-[11px] font-extrabold text-slate-700">
                  +{preview!.assignees.length - 3}
                </div>
              )}
            </div>
          </div>

          {!isOverlay && (
            <div className="mt-2 text-[11px] font-semibold text-slate-500">
              Double click to open
            </div>
          )}
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
  onToggleDone,
  columnIndex,
}: {
  list: List;
  cards: Card[];
  previews: Record<number, CardPreview | undefined>;
  onAddCard: (listId: number) => void;
  onOpenCard: (cardId: number) => void;
  onToggleDone: (cardId: number, nextDone: boolean) => void;
  columnIndex: number;
}) {
  const drop = useDroppable({
    id: `list:${list.id}`,
    data: { type: "list", listId: list.id },
  });

  return (
    <div
      style={{ animationDelay: `${Math.min(columnIndex, 8) * 45}ms` }}
      className={[
        "boardColumnIn w-[332px] shrink-0 rounded-xl border bg-slate-100/90 shadow-sm overflow-hidden",
        "border-slate-200 transition hover:-translate-y-0.5 hover:shadow-md",
        drop.isOver ? "border-sky-300 ring-2 ring-sky-100" : "",
      ].join(" ")}
    >
      <div className="px-3 py-3 flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-100">
        <div className="min-w-0 flex items-center gap-2">
          <div className="font-extrabold text-slate-900 truncate">{list.title}</div>
          <span className="h-6 px-2 inline-flex items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-xs font-extrabold text-slate-600">
            {cards.length}
          </span>
        </div>

        <button
          type="button"
          onClick={() => onAddCard(list.id)}
          className="h-9 px-3 rounded-lg border border-slate-300 bg-white text-slate-700 font-extrabold hover:bg-slate-50 transition"
        >
          + Card
        </button>
      </div>

      <div ref={drop.setNodeRef} className="p-3 grid gap-2 min-h-[120px] bg-slate-100/80">
        <SortableContext items={cards.map((c) => `card:${c.id}`)} strategy={verticalListSortingStrategy}>
          {cards.map((c, idx) => (
            <CardItem
              key={c.id}
              card={c}
              preview={previews[c.id]}
              onOpen={onOpenCard}
              onToggleDone={onToggleDone}
              index={idx}
            />
          ))}
        </SortableContext>

        {cards.length === 0 && (
          <div className="text-slate-500 text-sm px-1 py-2">Drop cards here</div>
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
        const assignees = (full.assignees ?? []).map((a: any) => ({
          user_id: a.user_id,
          full_name: a.full_name,
        }));
        const labels = (full.labels ?? []).map((l: any) => ({
          label_id: l.label_id,
          name: l.name,
          color: l.color,
        }));

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

  const boardStats = useMemo(() => {
    const cards = data?.cards ?? [];
    const total = cards.length;
    const done = cards.filter((c) => (c.status || "todo").toLowerCase() === "done").length;
    const overdue = cards.filter((c) => c.due_date && isDateOverdue(c.due_date)).length;
    return { total, done, overdue };
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

  async function toggleCardDone(cardId: number, nextDone: boolean) {
    const current = findCard(cardId);
    if (!current) return;

    const nextStatus = nextDone ? "done" : "todo";

    setData((prev) =>
      prev
        ? {
            ...prev,
            cards: prev.cards.map((c) => (c.id === cardId ? { ...c, status: nextStatus } : c)),
          }
        : prev
    );
    setPreviews((prev) => ({
      ...prev,
      [cardId]: prev[cardId] ? { ...prev[cardId], status: nextStatus } : prev[cardId],
    }));

    try {
      await apiFetch("/admin/card", {
        method: "PUT",
        body: JSON.stringify({
          card_id: current.id,
          title: current.title?.trim() || "",
          description: current.description || "",
          due_date: current.due_date || "",
          status: nextStatus,
          priority: current.priority || "medium",
        }),
      });
    } catch (e: any) {
      setErr(e?.message || "Failed to update card");
      await load();
    }
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
      subtitle="Drag cards across lists. Double click a card to open."
      right={
        <button
          className="h-10 px-3 rounded-xl border border-slate-200 bg-slate-50 font-extrabold hover:bg-slate-100 transition"
          onClick={() => nav(-1)}
        >
          Back
        </button>
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
        <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800">
          {err}
        </div>
      )}

      {loading && <div className="text-slate-500 font-semibold">Loading board...</div>}

      {!loading && data && (
        <div className="grid gap-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[18px] font-black tracking-[-0.02em] text-slate-900">{data.name}</div>
                <div className="mt-1 text-[13px] font-semibold text-slate-500">
                  Organize work by list, mark done on cards, and open card modal for details.
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="h-8 px-3 inline-flex items-center rounded-full border border-slate-200 bg-slate-50 text-[12px] font-extrabold text-slate-700">
                  {listsSorted.length} Lists
                </span>
                <span className="h-8 px-3 inline-flex items-center rounded-full border border-slate-200 bg-slate-50 text-[12px] font-extrabold text-slate-700">
                  {boardStats.total} Cards
                </span>
                <span className="h-8 px-3 inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 text-[12px] font-extrabold text-emerald-700">
                  <CircleCheckIcon size={12} />
                  {boardStats.done} Done
                </span>
                <span className="h-8 px-3 inline-flex items-center rounded-full border border-rose-200 bg-rose-50 text-[12px] font-extrabold text-rose-700">
                  {boardStats.overdue} Overdue
                </span>
              </div>
            </div>
          </div>

          {/* add list */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-3">
            <form onSubmit={createList} className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg border border-slate-300 bg-slate-100 text-slate-700 grid place-items-center">
                <PlusIcon />
              </div>

              <input
                className="h-11 flex-1 rounded-lg border border-slate-300 bg-slate-50 px-3 outline-none focus:bg-white focus:ring-4 focus:ring-sky-100 focus:border-sky-300"
                placeholder="Add a new list"
                value={newListTitle}
                onChange={(e) => setNewListTitle(e.target.value)}
              />

              <button
                className="h-11 px-4 rounded-lg font-extrabold text-white bg-slate-800 shadow-sm hover:bg-slate-900 disabled:opacity-70"
                disabled={creatingList || !newListTitle.trim()}
              >
                {creatingList ? "..." : "Add"}
              </button>
            </form>
          </div>

          {/* board */}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          >
            <div className="overflow-x-auto pb-2 rounded-xl border border-slate-200 bg-[linear-gradient(180deg,#f6f7f8_0%,#eef1f3_100%)] p-3">
              <div className="flex gap-4 items-start min-h-[380px]">
                {listsSorted.map((l, colIdx) => (
                  <ListColumn
                    key={l.id}
                    list={l}
                    cards={cardsByList[l.id] ?? []}
                    previews={previews}
                    onAddCard={createCard}
                    onOpenCard={onOpenCard}
                    onToggleDone={toggleCardDone}
                    columnIndex={colIdx}
                  />
                ))}

                {listsSorted.length === 0 && (
                  <div className="w-[332px] shrink-0 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                    <div className="px-3 py-3 border-b border-slate-200">
                      <div className="flex items-center gap-2">
                        <div className="font-extrabold text-slate-900">No lists yet</div>
                        <span className="h-6 px-2 rounded-full border border-slate-200 bg-slate-50 text-xs font-extrabold text-slate-600">
                          0
                        </span>
                      </div>
                    </div>
                    <div className="p-3 text-slate-500 text-sm">Add your first list above.</div>
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
                  onToggleDone={toggleCardDone}
                  index={0}
                  isOverlay
                />
              ) : null}
            </DragOverlay>
          </DndContext>

          {activeCardId && (
            <div className="text-slate-500 text-sm font-semibold">Moving card #{activeCardId}</div>
          )}
        </div>
      )}
    </AdminLayout>
  );
}
