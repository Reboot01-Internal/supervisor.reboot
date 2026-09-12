import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";
import UserAvatar from "../components/UserAvatar";
import { fetchRebootAvatars } from "../lib/rebootAvatars";
import AdminLayout from "../components/AdminLayout";
import { apiFetch } from "../lib/api";
import "./AdminDashboard.css";
const BAHRAIN_TIMEZONE = "Asia/Bahrain";
type Supervisor = { nickname?: string; supervisor_user_id: number; full_name: string; email: string };
type Board = { id: number; name: string; supervisor_name: string; supervisor_user_id: number; cards_count: number };
type Activity = { active?: { count: number; percentage: number }; inactive?: { count: number; percentage: number }; total?: number };
function formatActivityWeekLabel(weekOffset: number) {
  if (weekOffset <= 0) return "This week";
  if (weekOffset === 1) return "Last week";

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BAHRAIN_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(new Date());
  const year = Number(parts.find((part) => part.type === "year")?.value || 0);
  const month = Number(parts.find((part) => part.type === "month")?.value || 1) - 1;
  const day = Number(parts.find((part) => part.type === "day")?.value || 1);
  const weekdayShort = String(parts.find((part) => part.type === "weekday")?.value || "Sun").toLowerCase();
  const weekdayMap: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  const weekday = weekdayMap[weekdayShort.slice(0, 3)] ?? 0;

  const start = new Date(Date.UTC(year, month, day));
  start.setUTCDate(start.getUTCDate() - weekday - weekOffset * 7);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);

  const formatter = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  return `${formatter.format(start)} - ${formatter.format(end)}`;
}


export default function AdminDashboard() {
 const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
 const [boards, setBoards] = useState<Board[]>([]);
 const [error, setError] = useState("");
 const [loading, setLoading] = useState(true);
 const [activity, setActivity] = useState<Activity | null>(null);
 const [activityError, setActivityError] = useState("");
 const [activityLoading, setActivityLoading] = useState(true);
 const [week, setWeek] = useState(0);
 const [trend, setTrend] = useState<(Activity | null)[]>([]);
 const [avatars, setAvatars] = useState<Record<string,string>>({});
 const logins=supervisors.map(s=>s.nickname||"").filter(Boolean).join(",");
 useEffect(()=>{let alive=true;fetchRebootAvatars(logins.split(",").filter(Boolean)).then(v=>{if(alive)setAvatars(v);});return()=>{alive=false;};},[logins]);
 useEffect(()=>{let alive=true;Promise.allSettled(Array.from({length:6},(_,i)=>apiFetch(`/admin/dashboard/supervisor-activity?week_offset=${5-i}`))).then(rows=>{if(alive)setTrend(rows.map(r=>r.status==="fulfilled"?r.value:null));});return()=>{alive=false;};},[]);
 const [query, setQuery] = useState("");
 useEffect(() => { let alive = true; Promise.all([apiFetch("/admin/supervisors"), apiFetch("/admin/all-boards")]).then(([s,b]) => { if(alive) {setSupervisors(Array.isArray(s)?s:[]);setBoards(Array.isArray(b)?b:[]);} }).catch(() => {if(alive) setError("Couldn’t load the supervisor directory. Refresh to try again.");}).finally(() => {if(alive) setLoading(false);});return () => {alive=false;}; },[]);
 useEffect(() => { let alive=true;apiFetch(`/admin/dashboard/supervisor-activity?week_offset=${week}`).then(a => {if(alive)setActivity(a);}).catch(() => {if(alive)setActivityError("Activity couldn’t load. Try another week or refresh.");}).finally(() => {if(alive)setActivityLoading(false);});return () => {alive=false;};},[week]);
 const pct=Math.max(0,Math.min(100,activity?.active?.percentage||0));
 const filtered=supervisors.filter(s => `${s.full_name} ${s.email}`.toLowerCase().includes(query.toLowerCase()));
 return <AdminLayout active="dashboard" title="Admin workspace" hideHeader><div className="admin-hub">
 <header className="ah-header"><div><span className="ah-label">REBOOT / ADMIN SPACE</span><h1>The bigger picture<span>.</span></h1><p>Keep an eye on the team. Find the work behind the numbers.</p></div><span className="ah-symbol" aria-hidden="true">{ "{ }" }</span></header>
 <div className="ah-overview"><section className="ah-activity"><div className="ah-activity-heading"><div><span className="ah-label">TEAM PULSE</span><h2>Supervisor Activity</h2></div><div className="ah-weeks"><button aria-label="Previous week" onClick={() => {setActivityLoading(true);setActivityError("");setWeek(w=>w+1);}}><ChevronLeft size={16}/></button><span>{formatActivityWeekLabel(week)}</span><button aria-label="Next week" disabled={!week} onClick={() => {setActivityLoading(true);setActivityError("");setWeek(w=>Math.max(0,w-1));}}><ChevronRight size={16}/></button></div></div>
 {activityLoading ? <p role="status">Loading activity…</p> : activityError ? <p role="alert">{activityError}</p> : <div className="ah-pulse"><div className="ah-ring" role="img" aria-label={`${pct}% active supervisors`} style={{background:`conic-gradient(#9f8aff ${pct}%, #504364 0)`}}><div><strong>{pct}%</strong><span>ACTIVE</span></div></div><div className="ah-pulse-copy"><h3>{activity?.total ? `${activity.active?.count||0} of ${activity.total} supervisors active` : "No supervisor activity data"}</h3><p>{formatActivityWeekLabel(week)}</p><div className="ah-legend"><span><i/>{activity?.active?.count||0} active</span><span><i/>{activity?.inactive?.count||0} inactive</span></div></div><Link to="/admin/reports" className="ah-report">Open reports <ArrowUpRight size={18}/></Link></div>}</section><section className="ah-trend"><span className="ah-label">THE LAST SIX WEEKS</span><h2>Activity over time</h2><p>Active supervisors each week</p><div className="ah-bars">{Array.from({length:6},(_,i)=>{const item=trend[i];return <button key={i} aria-pressed={week===5-i} aria-label={`${formatActivityWeekLabel(5-i)}: ${item ? `${item.active?.percentage||0}% active` : "unavailable"}`} onClick={()=>{setActivityLoading(true);setActivityError("");setWeek(5-i);}}><span className="ah-bar-track"><i style={{height:`${item?.active?.percentage||0}%`}}/></span><strong>{trend.length ? item ? `${item.active?.percentage||0}%` : "—" : "…"}</strong><small>{i===5?"Now":`${5-i}w ago`}</small></button>;})}</div></section></div>
 <div className="ah-body"><section className="ah-directory"><div className="ah-section-head"><div><span className="ah-label">PEOPLE & PROJECTS</span><h2>Supervisor directory</h2></div><input aria-label="Search supervisors" placeholder="Find a supervisor…" value={query} onChange={e=>setQuery(e.target.value)}/></div><p className="ah-hint">Expand a supervisor to view their boards and profile.</p>
 {loading ? <p role="status">Loading supervisors…</p> : error ? <p role="alert">{error}</p> : filtered.length ? filtered.map(s=>{const owned=boards.filter(b=>b.supervisor_user_id===s.supervisor_user_id);return <details className="ah-person" key={s.supervisor_user_id}><summary><UserAvatar src={avatars[(s.nickname||"").toLowerCase()]} alt={s.full_name} fallback={s.full_name.split(" ").map(n=>n[0]).slice(0,2).join("")} sizeClass="h-10 w-10"/><strong>{s.full_name}</strong><span>{owned.length} boards</span><span className="ah-plus">+</span></summary><div className="ah-details"><nav><Link to={`/admin/users/${s.supervisor_user_id}/profile`}>View profile ↗</Link>{s.email&&<a href={`mailto:${s.email}`}>Email ↗</a>}</nav>{owned.length ? owned.map(b=><Link className="ah-board" to={`/admin/boards/${b.id}`} key={b.id}><span>{b.name}</span><small>{b.cards_count} tasks ↗</small></Link>) : <p>No project boards for this supervisor yet.</p>}</div></details>}) : <p>No supervisors found.</p>}</section>
 </div>
 </div></AdminLayout>;
}
