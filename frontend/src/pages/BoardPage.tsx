import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
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

type BoardMember = {
  user_id: number;
  full_name: string;
  email: string;
  role: string;
  role_in_board: string;
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

function GroupIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M16 21v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 19.5V21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="10" cy="9" r="3.5" stroke="currentColor" strokeWidth="2" />
      <path d="M20 21v-1.5A3.5 3.5 0 0 0 17 16.03" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M15.5 5.2a3.5 3.5 0 0 1 0 7.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function BinIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 7h16" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M9 7V5.8a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1V7" stroke="currentColor" strokeWidth="1.9" />
      <path
        d="M7.8 7.8 8.4 18a2 2 0 0 0 2 1.9h3.2a2 2 0 0 0 2-1.9l.6-10.2"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      <path d="M10.5 11.2v5M13.5 11.2v5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
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
        "border-slate-200 hover:-translate-y-0.5 hover:border-[#6d5efc]/25 hover:bg-[#f7f6ff] hover:shadow-md",
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
  onRenameList,
  onDeleteList,
  onOpenCard,
  onToggleDone,
  columnIndex,
}: {
  list: List;
  cards: Card[];
  previews: Record<number, CardPreview | undefined>;
  onAddCard: (listId: number) => void;
  onRenameList: (listId: number, title: string) => Promise<boolean>;
  onDeleteList: (listId: number, listTitle: string) => void;
  onOpenCard: (cardId: number) => void;
  onToggleDone: (cardId: number, nextDone: boolean) => void;
  columnIndex: number;
}) {
  const drop = useDroppable({
    id: `list:${list.id}`,
    data: { type: "list", listId: list.id },
  });
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(list.title);
  const [renaming, setRenaming] = useState(false);

  useEffect(() => {
    if (!isEditingTitle) setTitleDraft(list.title);
  }, [list.title, isEditingTitle]);

  async function commitTitle() {
    const next = titleDraft.trim();
    if (!next) {
      setTitleDraft(list.title);
      setIsEditingTitle(false);
      return;
    }
    if (next === list.title) {
      setIsEditingTitle(false);
      return;
    }

    setRenaming(true);
    const ok = await onRenameList(list.id, next);
    setRenaming(false);

    if (ok) {
      setIsEditingTitle(false);
    } else {
      setTitleDraft(list.title);
    }
  }

  return (
    <div
      style={{ animationDelay: `${Math.min(columnIndex, 8) * 45}ms` }}
      className={[
        "boardColumnIn w-[332px] shrink-0 rounded-xl border bg-slate-100/90 shadow-sm overflow-hidden",
        "border-slate-200 transition hover:-translate-y-0.5 hover:shadow-md",
        drop.isOver ? "border-[#6d5efc]/45 ring-2 ring-[#6d5efc]/15" : "",
      ].join(" ")}
    >
      <div className="px-3 py-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-slate-200 bg-slate-100">
        <div className="min-w-0 flex items-center gap-2 pr-1">
          {isEditingTitle ? (
            <input
              autoFocus
              value={titleDraft}
              disabled={renaming}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={() => void commitTitle()}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void commitTitle();
                } else if (e.key === "Escape") {
                  setTitleDraft(list.title);
                  setIsEditingTitle(false);
                }
              }}
              className="h-8 min-w-0 w-full max-w-[170px] rounded-[10px] border border-[#6d5efc]/35 bg-white px-2.5 text-[13px] font-extrabold text-slate-900 outline-none focus:ring-2 focus:ring-[#6d5efc]/20"
            />
          ) : (
            <button
              type="button"
              onDoubleClick={() => setIsEditingTitle(true)}
              className="max-w-[170px] font-extrabold text-slate-900 truncate text-left"
              title="Double click to rename list"
            >
              {list.title}
            </button>
          )}
          <span className="h-6 px-2 inline-flex items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-xs font-extrabold text-slate-600">
            {cards.length}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onAddCard(list.id)}
            className={[
              "h-9 px-3 rounded-[12px] border border-slate-200 bg-white",
              "text-slate-700 text-[13px] font-extrabold inline-flex items-center gap-1.5 whitespace-nowrap",
              "shadow-[0_4px_12px_rgba(15,23,42,0.05)] transition",
              "hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50",
              "active:translate-y-0",
            ].join(" ")}
          >
            <PlusIcon size={13} />
            Add card
          </button>
          <button
            type="button"
            onClick={() => onDeleteList(list.id, list.title)}
            className={[
              "h-9 w-9 rounded-[12px] border border-slate-200 bg-white text-slate-500 grid place-items-center",
              "shadow-[0_6px_16px_rgba(15,23,42,0.06)] transition",
              "hover:-translate-y-0.5 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 hover:shadow-[0_10px_24px_rgba(251,113,133,0.24)]",
              "active:translate-y-0",
            ].join(" ")}
            title="Delete list"
            aria-label="Delete list"
          >
            <BinIcon />
          </button>
        </div>
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
  const location = useLocation();
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
  const [membersOpen, setMembersOpen] = useState(false);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersErr, setMembersErr] = useState("");
  const [members, setMembers] = useState<BoardMember[]>([]);

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

  async function openMembersModal() {
    setMembersOpen(true);
    setMembersErr("");
    setMembersLoading(true);
    try {
      const res = await apiFetch(`/admin/board-members?board_id=${boardID}`);
      setMembers(Array.isArray(res) ? res : []);
    } catch (e: any) {
      setMembersErr(e?.message || "Failed to load members");
      setMembers([]);
    } finally {
      setMembersLoading(false);
    }
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

  async function deleteList(listId: number, listTitle: string) {
    const ok = window.confirm(`Delete list "${listTitle}" and all its cards? This cannot be undone.`);
    if (!ok) return;

    setErr("");
    try {
      await apiFetch("/admin/lists/delete", {
        method: "POST",
        body: JSON.stringify({ list_id: listId }),
      });
      await load();
    } catch (e: any) {
      setErr(e?.message || "Failed to delete list");
    }
  }

  async function renameList(listId: number, title: string): Promise<boolean> {
    const previous = data;
    setData((d) =>
      d
        ? {
            ...d,
            lists: d.lists.map((l) => (l.id === listId ? { ...l, title } : l)),
          }
        : d
    );
    try {
      await apiFetch("/admin/lists/update", {
        method: "POST",
        body: JSON.stringify({ list_id: listId, title }),
      });
      return true;
    } catch (e: any) {
      setErr(e?.message || "Failed to rename list");
      if (previous) setData(previous);
      return false;
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
  const from = new URLSearchParams(location.search).get("from");
  const layoutActive = from === "boards" ? "boards" : "supervisors";

  return (
    <AdminLayout
      active={layoutActive}
      title={pageTitle}
      subtitle="Drag cards across lists. Double click a card to open."
      right={
        <div className="flex items-center gap-2">
          <button
            className="h-10 w-10 grid place-items-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition"
            onClick={openMembersModal}
            title="Board members"
            aria-label="Board members"
          >
            <GroupIcon />
          </button>
          <button
            className="h-10 px-3 rounded-xl border border-slate-200 bg-slate-50 font-extrabold hover:bg-slate-100 transition"
            onClick={() => nav(-1)}
          >
            Back
          </button>
        </div>
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
        onDeleted={async () => {
          setIsCardModalOpen(false);
          setOpenCardId(null);
          await load();
        }}
      />
      {membersOpen && (
        <div
          className="fixed inset-0 z-[80] grid place-items-center bg-slate-900/40 p-4"
          onClick={() => setMembersOpen(false)}
        >
          <div
            className="w-full max-w-[560px] rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_22px_60px_rgba(15,23,42,0.28)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-[18px] font-black text-slate-900">Board Members</div>
                {/* <div className="text-[12px] font-semibold text-slate-500">
                  Read-only view for board participants
                </div> */}
              </div>
              <button
                className="h-9 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-extrabold text-slate-700 hover:bg-slate-100"
                onClick={() => setMembersOpen(false)}
              >
                Close
              </button>
            </div>

            {membersErr ? (
              <div className="mb-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
                {membersErr}
              </div>
            ) : null}

            {membersLoading ? (
              <div className="text-sm font-semibold text-slate-500">Loading members...</div>
            ) : members.length === 0 ? (
              <div className="text-sm font-semibold text-slate-500">No members found.</div>
            ) : (
              <div className="max-h-[52vh] space-y-2 overflow-y-auto pr-1 [scrollbar-width:thin]">
                {members.map((m) => (
                  <div
                    key={m.user_id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-black text-slate-900">{m.full_name}</div>
                      <div className="truncate text-xs font-semibold text-slate-500">{m.email}</div>
                    </div>
                    <div className="flex flex-none items-center gap-2">
                      <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-black text-slate-700">
                        {m.role}
                      </span>
                      <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-black text-violet-700">
                        {m.role_in_board || "member"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {err && (
        <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800">
          {err}
        </div>
      )}

      {loading && <div className="text-slate-500 font-semibold">Loading board...</div>}

      {!loading && data && (
        <div className="grid gap-4">
          <div className="rounded-[18px] border border-slate-200 bg-white p-3 shadow-[0_10px_25px_rgba(15,23,42,0.06)]">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="h-8 px-3 inline-flex items-center rounded-full border border-[#6d5efc]/20 bg-[#6d5efc]/10 text-[12px] font-extrabold text-slate-700">
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

            <form onSubmit={createList} className="flex items-center gap-2.5">
              {/* <div className="h-10 w-10 rounded-xl border border-[#6d5efc]/25 bg-gradient-to-br from-[#f2f0ff] to-[#ebe8ff] text-[#6d5efc] grid place-items-center">
                <PlusIcon />
              </div> */}

              <input
                className="h-10 flex-1 rounded-xl border border-slate-300 bg-slate-50/80 px-3.5 text-[14px] font-semibold text-slate-900 outline-none transition placeholder:font-semibold placeholder:text-slate-400 focus:border-[#6d5efc]/40 focus:bg-white focus:ring-4 focus:ring-[#6d5efc]/15"
                placeholder="Create a new list..."
                value={newListTitle}
                onChange={(e) => setNewListTitle(e.target.value)}
              />

              <button
                className="h-10 px-4 rounded-xl font-extrabold text-white shadow-[0_12px_26px_rgba(109,94,252,0.28)] disabled:opacity-70 bg-gradient-to-r from-[#6d5efc] to-[#9a8cff]"
                disabled={creatingList || !newListTitle.trim()}
              >
                {creatingList ? "..." : "+"}
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
            <div className="overflow-x-auto pb-2 rounded-[18px] border border-slate-200 bg-[linear-gradient(180deg,#f7f8ff_0%,#eef1f8_100%)] p-3">
              <div className="flex gap-4 items-start min-h-[380px]">
                {listsSorted.map((l, colIdx) => (
                  <ListColumn
                    key={l.id}
                    list={l}
                    cards={cardsByList[l.id] ?? []}
                    previews={previews}
                    onAddCard={createCard}
                    onRenameList={renameList}
                    onDeleteList={deleteList}
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
