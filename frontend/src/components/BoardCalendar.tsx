import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import UserAvatar from "./UserAvatar";
import "./BoardCalendar.css";

type CalendarCard = { id: number; list_id: number; title: string; due_date?: string; status?: string; priority?: string };
type Preview = { labels: { label_id: number; name: string; color: string }[]; assignees: { user_id: number; full_name: string }[] };
const labelColors: Record<string, string> = { indigo: "#4f46e5", sky: "#0284c7", emerald: "#10b981", amber: "#f59e0b", rose: "#f43f5e", violet: "#7c3aed", slate: "#64748b" };
type Props = { previews: Record<number, Preview | undefined>; avatarByUserID: Record<number, string>; cards: CalendarCard[]; lists: { id: number; title: string }[]; onOpenCard: (id: number) => void };
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export default function BoardCalendar({ cards, lists, onOpenCard, previews, avatarByUserID }: Props) {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const today = dateKey(new Date());
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cellCount = Math.ceil((month.getDay() + days) / 7) * 7;
  const scheduled = new Map<string, CalendarCard[]>();
  const unscheduled: CalendarCard[] = [];
  for (const card of cards) {
    const key = card.due_date?.slice(0, 10);
    if (key && /^\d{4}-\d{2}-\d{2}$/.test(key)) scheduled.set(key, [...(scheduled.get(key) ?? []), card]);
    else unscheduled.push(card);
  }
  const event = (card: CalendarCard) => (
    <button type="button" key={card.id} className={`calendar-card ${card.status === "done" ? "is-done" : ""}`} onClick={() => onOpenCard(card.id)}>
      <span className="calendar-card-labels">{(previews[card.id]?.labels ?? []).map(label => <span className="calendar-label" key={label.label_id}><span style={{ backgroundColor: labelColors[label.color] ?? "#94a3b8" }} />{label.name}</span>)}</span>
      <span className="calendar-card-title">{card.status === "done" ? "✓ " : ""}{card.title}</span>
      <span className="calendar-card-meta">{lists.find(list => list.id === card.list_id)?.title}{card.priority ? ` · ${card.priority}` : ""}</span>
      <span className="calendar-assignees">
        {previews[card.id] ? (previews[card.id]!.assignees.length ? previews[card.id]!.assignees.map(person => (
          <span className="calendar-assignee" key={person.user_id} title={person.full_name}>
            <UserAvatar src={avatarByUserID[person.user_id]} alt={person.full_name} fallback={person.full_name.split(" ").map(part => part[0]).slice(0, 2).join("")} sizeClass="h-5 w-5" textClass="text-[8px]" />
            <span>{person.full_name}</span>
          </span>
        )) : <span className="calendar-card-meta">Unassigned</span>) : <span className="calendar-card-meta">Loading details…</span>}
      </span>
    </button>
  );
  return (
    <section className="board-calendar" aria-label="Board calendar">
      <div className="calendar-toolbar">
        <div><h2 aria-live="polite">{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h2><p>All board cards by due date. Select a card to open it.</p></div>
        <div className="calendar-navigation">
          <button type="button" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft size={18} /></button>
          <button type="button" onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>Today</button>
          <button type="button" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight size={18} /></button>
        </div>
      </div>
      <div className="calendar-scroll">
        <div className="calendar-grid">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => <div className="calendar-weekday" key={day}>{day}</div>)}
          {Array.from({ length: cellCount }, (_, index) => {
            const date = new Date(month.getFullYear(), month.getMonth(), index - month.getDay() + 1);
            const key = dateKey(date);
            return <div key={key} className={`calendar-day ${date.getMonth() !== month.getMonth() ? "outside-month" : ""}`}>
              <time dateTime={key} aria-current={key === today ? "date" : undefined} className={key === today ? "calendar-today" : ""}>{date.getDate()}</time>
              <div className="calendar-events">{(scheduled.get(key) ?? []).map(event)}</div>
            </div>;
          })}
        </div>
      </div>
      <div className="calendar-unscheduled"><h3>Unscheduled · {unscheduled.length}</h3><p>Cards without a due date.</p><div className="calendar-unscheduled-cards">{unscheduled.map(event)}</div></div>
    </section>
  );
}
