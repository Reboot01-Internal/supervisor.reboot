import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, CalendarDays, Code2, Mail, ArrowRight, FolderOpen, Check, Clock3 } from "lucide-react";
import AdminLayout from "../components/AdminLayout";
import UserAvatar from "../components/UserAvatar";
import { fetchRebootAvatars } from "../lib/rebootAvatars";
import type { ProfileSummary, MeetingRow } from "./UserDashboardPage";
import "./TalentDashboard.css";

type Props = { data: ProfileSummary | null; loading: boolean; error: string; meetings: MeetingRow[]; meetingsError: string };
const dayFormat = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
function dueLabel(value: string, now: number) {
  if (!value) return { label: "No due date", late: false };
  const date = new Date(value.includes("T") ? value : `${value}T12:00:00`);
  if (!Number.isFinite(date.getTime())) return { label: "No due date", late: false };
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  return { label: date < today ? `Overdue · ${dayFormat.format(date)}` : date < tomorrow ? "Due today" : dayFormat.format(date), late: date < today };
}
export default function TalentDashboard({ data, loading, error, meetings, meetingsError }: Props) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 60000); return () => window.clearInterval(timer); }, []);
  const [avatars, setAvatars] = useState<Record<string, string>>({});
  const supervisors = data?.student?.supervisors || [];
  const logins = supervisors.map(s => s.nickname || "").filter(Boolean).join(",");
  useEffect(() => { let alive = true; void fetchRebootAvatars(logins.split(",").filter(Boolean)).then(result => { if (alive) setAvatars(result); }); return () => { alive = false; }; }, [logins]);
  const boards = data?.student?.boards || [];
  const tasks = (data?.tasks?.assigned_cards || []).filter(t => t.status.trim().toLowerCase() !== "done").sort((a,b) => (a.due_date || "9999").localeCompare(b.due_date || "9999"));
  const next = meetings.filter(m => m.status === "scheduled" && new Date(m.ends_at).getTime() > now && Number.isFinite(new Date(m.starts_at).getTime())).sort((a,b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())[0];
  return <AdminLayout active="dashboard" title="Your workspace" hideHeader>
    <div className="talent-home">
      {error ? <div role="alert" className="talent-empty">We couldn’t load your workspace. {error} Refresh the page to try again.</div> : loading ? <div role="status" className="talent-loading">Loading your projects and people…</div> : <>
        <header className="talent-intro"><div><span className="talent-eyebrow">REBOOT / TALENT SPACE</span><h1>Hey, {data?.user.full_name?.split(" ")[0] || "there"}<span>.</span></h1><p>{tasks.length ? `${tasks.length} open ${tasks.length === 1 ? "task" : "tasks"}. Here’s where to pick up.` : "Your Reboot workspace, ready when you are."}</p></div><Link className="talent-button" to="/admin/boards">Open my boards <ArrowUpRight size={18}/></Link><Code2 className="talent-intro-code" aria-hidden="true"/></header>
        <div className="talent-desk"><div className="talent-main-grid">
          <section className="talent-people"><div className="talent-section-top"><span className="talent-eyebrow">YOUR SUPPORT CREW</span><span aria-hidden="true">{ "{ }" }</span></div><h3>Your {supervisors.length === 1 ? "supervisor" : "supervisors"}</h3>
            {supervisors.length ? <div className="talent-people-list">{supervisors.map(s => <article className="talent-person" key={s.id}><UserAvatar src={avatars[(s.nickname || "").toLowerCase()]} alt={s.full_name} fallback={s.full_name.split(" ").map(n => n[0]).slice(0,2).join("")} sizeClass="talent-portrait"/><div><h4>{s.full_name}</h4><span>Supervisor{s.nickname ? ` · @${s.nickname}` : ""}</span>{boards.some(b => b.supervisor?.id === s.id) && <small>{boards.filter(b => b.supervisor?.id === s.id).map(b => b.name).join(" · ")}</small>}</div>{s.email && <a className="talent-contact" href={`mailto:${s.email}`} aria-label={`Email ${s.full_name}`}><Mail size={18}/></a>}</article>)}</div> : <div className="talent-unassigned"><Code2 size={32}/><h4>Your support starts here.</h4><p>No supervisor is linked to your account yet. If you already have one, ask them to add you to their talent list.</p></div>}
            <Link className="talent-text-link" to="/calendar">View meetings <ArrowRight size={17}/></Link>
          </section>
          <section className="talent-work"><div className="talent-section-top"><div><span className="talent-eyebrow">TASK QUEUE</span><h3>On your desk</h3></div><span className="talent-task-total">{tasks.length} open</span></div>
            {tasks.length ? <div className="talent-task-list">{tasks.slice(0,5).map(t => { const due = dueLabel(t.due_date, now); return <Link className="talent-task" key={t.card_id} to={`/admin/boards/${t.board_id}`}><span className="talent-task-mark"><ArrowUpRight size={18}/></span><div><h4>{t.card_title}</h4><p>{t.board_name} <span>· {t.status.replace(/[_-]/g," ")}</span></p></div><span className={due.late ? "talent-due is-late" : "talent-due"}>{due.label}</span></Link>; })}{tasks.length > 5 && <Link className="talent-text-link" to="/admin/boards">Find all {tasks.length} tasks in your boards <ArrowRight size={16}/></Link>}</div> : <div className="talent-clear"><span><Check size={24}/></span><h4>No open assigned tasks.</h4><p>{boards.length ? "Your boards are the place to check for shared work and project updates." : "Once you join a board, tasks assigned to you will appear here."}</p><Link className="talent-text-link" to="/admin/boards">Explore your boards <ArrowRight size={17}/></Link></div>}
            {!!data?.tasks.total && <footer className="talent-work-footer"><Check size={15}/>{data.tasks.done} of {data.tasks.total} assigned tasks completed</footer>}
          </section>
        </div>
        <div className="talent-bottom-grid"><section className="talent-projects"><div className="talent-section-top"><div><span className="talent-eyebrow">PROJECT DIRECTORY</span><h3>Project boards</h3></div><Link className="talent-text-link" to="/admin/boards">View all <ArrowUpRight size={17}/></Link></div>{boards.length ? <div className="talent-board-list">{boards.slice(0,4).map(b => <Link key={b.id} to={`/admin/boards/${b.id}`} className="talent-board"><FolderOpen size={22}/><div><h4>{b.name}</h4><p>{b.supervisor ? `With ${b.supervisor.full_name}` : "Your shared project space"}</p></div><ArrowUpRight size={18}/></Link>)}</div> : <div className="talent-empty"><FolderOpen size={22}/><div><h4>You haven’t joined a board yet.</h4><p>Your supervisor can add you to your project board.</p></div></div>}</section>
          <section className="talent-meeting"><span className="talent-eyebrow">YOUR SCHEDULE</span><h3>This week</h3><div className="talent-week" aria-label="This week">{Array.from({ length: 7 }, (_, i) => { const d = new Date(now); d.setDate(d.getDate() - (d.getDay() + 6) % 7 + i); const today = d.toDateString() === new Date(now).toDateString(); const hasMeeting = meetings.some(m => m.status === "scheduled" && new Date(m.starts_at).toDateString() === d.toDateString()); return <Link to="/calendar" key={i} className={today ? "is-today" : ""} aria-label={`${d.toDateString()}${hasMeeting ? ", meeting scheduled" : ""}`}><span>{d.toLocaleDateString(undefined, { weekday: "narrow" })}</span><strong>{d.getDate()}</strong><i className={hasMeeting ? "has-meeting" : ""}/></Link>; })}</div>{meetingsError ? <p role="alert">Couldn’t load your meetings. Open the calendar to try again.</p> : next ? <><div className="talent-meeting-date"><CalendarDays size={20}/>{new Intl.DateTimeFormat(undefined,{weekday:"short",month:"short",day:"numeric"}).format(new Date(next.starts_at))}</div><h4>{next.title}</h4><p>{next.board_name}</p><p><Clock3 size={14}/> {new Date(next.starts_at).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})} – {new Date(next.ends_at).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})}</p>{next.location && <p>{next.location}</p>}</> : <><CalendarDays className="talent-calendar-art" size={34}/><h4>Nothing scheduled yet.</h4><p>Check your calendar for meetings with your supervisor.</p></>}<Link className="talent-text-link" to="/calendar">Open calendar <ArrowRight size={17}/></Link></section></div>
      </div></>}
    </div>
  </AdminLayout>;
}
