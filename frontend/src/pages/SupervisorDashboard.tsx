import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, ArrowRight, Code2, FolderOpen, CalendarDays } from "lucide-react";
import AdminLayout from "../components/AdminLayout";
import UserAvatar from "../components/UserAvatar";
import { fetchRebootAvatars } from "../lib/rebootAvatars";
import type { ProfileSummary, MeetingRow, TaskCompletionStats } from "./UserDashboardPage";
import "./TalentDashboard.css";
import "./SupervisorDashboard.css";

type Props = { data: ProfileSummary | null; loading: boolean; error: string; meetings: MeetingRow[]; meetingsError: string; completion: TaskCompletionStats | null; completionError: string };
export default function SupervisorDashboard({ data, loading, error, meetings, meetingsError, completion, completionError }: Props) {
  const [now, setNow] = useState(() => Date.now());
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [onlyUnlinked, setOnlyUnlinked] = useState(false);
  const [query, setQuery] = useState("");
  const [avatars, setAvatars] = useState<Record<string,string>>({});
  const talents = data?.supervisor?.assigned_students || [];
  const logins = talents.map(t => t.nickname).filter(Boolean).join(",");
  useEffect(() => { let alive = true; void fetchRebootAvatars(logins.split(",").filter(Boolean)).then(v => { if (alive) setAvatars(v); }); return () => { alive = false; }; }, [logins]);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()),60000); return () => window.clearInterval(timer); }, []);
  const boards = data?.supervisor?.boards || [];
  const upcoming = meetings.filter(m => m.status === "scheduled" && new Date(m.ends_at).getTime() > now && Number.isFinite(new Date(m.starts_at).getTime())).sort((a,b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  const visibleTalents = talents.filter(t => `${t.full_name} ${t.nickname}`.toLowerCase().includes(query.toLowerCase()) && (!onlyUnlinked || !t.boards?.length));
  const unlinked = talents.filter(t => !t.boards?.length);

  const overdue = completion?.overdue?.count || 0;
  return <AdminLayout active="dashboard" title="Supervisor workspace" hideHeader><div className="talent-home supervisor-home">
    {loading ? <div role="status" className="talent-loading">Loading your talents and projects…</div> : error ? <div role="alert">Couldn’t load your workspace. {error}</div> : <>
      <header className="talent-intro"><div><span className="talent-eyebrow">REBOOT / SUPERVISOR DESK</span><h1>Hey, {data?.user.full_name?.split(" ")[0] || "there"}<span>.</span></h1><p>Your Reboot workspace, ready when you are.</p></div><Code2 className="talent-intro-code" aria-hidden="true"/></header>
      {completionError ? <p role="alert">Task status couldn’t load.</p> : overdue > 0 ? <Link className="supervisor-alert" to="/admin/boards">{overdue} overdue tasks or checklist items need follow-up <ArrowRight size={16}/></Link> : null}<div className="supervisor-desk">
        <section className="talent-work supervisor-roster"><div className="talent-section-top"><div><span className="talent-eyebrow">YOUR PEOPLE</span><h3>Your talents</h3></div><span className="talent-task-total">{talents.length} talents</span></div>
          {talents.length > 0 && <input className="supervisor-search" aria-label="Find a talent" placeholder="Find a talent by name or username…" value={query} onChange={e => setQuery(e.target.value)}/>}
          <div className="supervisor-filters"><button type="button" aria-pressed={!onlyUnlinked} onClick={() => setOnlyUnlinked(false)}>All talents · {talents.length}</button><button type="button" aria-pressed={onlyUnlinked} onClick={() => setOnlyUnlinked(true)}>Without a board · {unlinked.length}</button></div><div className="supervisor-roster-list">{visibleTalents.map(t => <div className="supervisor-member" key={t.id}><button type="button" className="supervisor-talent" aria-expanded={selectedId === t.id} onClick={() => setSelectedId(selectedId === t.id ? null : t.id)}><UserAvatar src={avatars[t.nickname?.toLowerCase()]} alt={t.full_name} fallback={t.full_name[0]} sizeClass="supervisor-gallery-photo"/><div><h4>{t.full_name}</h4><p>@{t.nickname}</p></div><span className="supervisor-assignment">{t.boards?.length ? `${t.boards.length} boards` : "Needs a board"}</span><span className="supervisor-expand">{selectedId === t.id ? "−" : "+"}</span></button>{selectedId === t.id && <div className="supervisor-member-detail">{t.boards?.length ? t.boards.map(b => <Link key={b.id} to={`/admin/boards/${b.id}`}><FolderOpen size={14}/>{b.name}<ArrowUpRight size={14}/></Link>) : <p>Add this talent through a project board’s members.</p>}<nav aria-label={`Actions for ${t.full_name}`}><Link to={`/admin/users/${t.id}/profile`}>View profile ↗</Link>{t.email && <a href={`mailto:${t.email}`}>Email ↗</a>}<Link to="/admin/boards">Project boards ↗</Link></nav></div>}</div>)}</div>
          {!visibleTalents.length && <div className="talent-empty"><p>{talents.length ? "No talents match your search." : "No talents assigned yet. Add your talents from the Users page to keep their profiles here."}</p></div>}
          <Link className="talent-text-link" to="/admin/users">Open talent directory <ArrowRight size={16}/></Link>
        </section>
        <aside className="supervisor-side">
          <section className="talent-meeting"><span className="talent-eyebrow">YOUR SCHEDULE</span><h3>Next check-ins</h3><div className="talent-week">{Array.from({length:7},(_,i) => { const d = new Date(now); d.setDate(d.getDate() - (d.getDay()+6)%7+i); const scheduled = upcoming.some(m => new Date(m.starts_at).toDateString() === d.toDateString()); return <Link to="/calendar" key={i} className={d.toDateString() === new Date(now).toDateString() ? "is-today" : ""} aria-label={`${d.toDateString()}${scheduled ? ", meeting scheduled" : ""}`}><span>{d.toLocaleDateString(undefined,{weekday:"narrow"})}</span><strong>{d.getDate()}</strong><i className={scheduled ? "has-meeting" : ""}/></Link>; })}</div>
            {meetingsError ? <p role="alert">Meetings couldn’t load. Open the calendar to try again.</p> : upcoming.length ? upcoming.slice(0,3).map(m => <Link className="supervisor-checkin" key={m.id} to="/calendar"><CalendarDays size={18}/><div><h4>{m.title}</h4><p>{new Date(m.starts_at).toLocaleString([], {month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})}</p><p>{m.board_name}</p></div><ArrowUpRight size={15}/></Link>) : <p>No upcoming meetings. Open the calendar to arrange your next check-in.</p>}
            <Link className="talent-text-link" to="/calendar">Open calendar <ArrowRight size={16}/></Link></section></aside>
        <section className="talent-projects supervisor-projects"><div className="talent-section-top"><div><span className="talent-eyebrow">PROJECT DIRECTORY</span><h3>Projects</h3></div><Link className="talent-text-link" to="/admin/boards">All boards <ArrowUpRight size={16}/></Link></div>{boards.length ? boards.map(b => <Link className="talent-board" to={`/admin/boards/${b.id}`} key={b.id}><FolderOpen size={22}/><div><h4>{b.name}</h4><p>{b.students_count} talents on this board</p></div><ArrowUpRight size={17}/></Link>) : <div className="talent-empty"><FolderOpen size={23}/><div><h4>No project boards yet.</h4><p>Create a board to organize your talents’ tasks and progress.</p></div></div>}</section>
      </div></>}
  </div></AdminLayout>;
}
