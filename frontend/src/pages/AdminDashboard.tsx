import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import UserAvatar from "../components/UserAvatar";
import { fetchRebootAvatars } from "../lib/rebootAvatars";
import AdminLayout from "../components/AdminLayout";
import { apiFetch } from "../lib/api";
import "./AdminDashboard.css";
const BAHRAIN_TIMEZONE = "Asia/Bahrain";
type Supervisor = { nickname?: string; supervisor_user_id: number; full_name: string; email: string };
type Activity = { supervisors?: {user_id:number;name:string;active:boolean;boards_created:number;meetings_created:number;card_updates:number}[]; active?: { count: number; percentage: number }; inactive?: { count: number; percentage: number }; total?: number };
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
 const [filter,setFilter]=useState<"all"|"active"|"inactive">("all");
 useEffect(() => { let alive = true; apiFetch("/admin/supervisors").then(s => { if(alive) setSupervisors(Array.isArray(s)?s:[]); }).catch(() => {});return () => {alive=false;}; },[]);
 useEffect(() => { let alive=true;apiFetch(`/admin/dashboard/supervisor-activity?week_offset=${week}`).then(a => {if(alive)setActivity(a);}).catch(() => {if(alive)setActivityError("Activity couldn’t load. Try another week or refresh.");}).finally(() => {if(alive)setActivityLoading(false);});return () => {alive=false;};},[week]);
 const pct=Math.max(0,Math.min(100,activity?.active?.percentage||0));
 const activityRows=activity?.supervisors;
 const sorted=(activityRows || []).map(s=>({...s,score:s.boards_created+s.meetings_created+s.card_updates})).sort((a,b)=>b.score-a.score || a.name.localeCompare(b.name));
 const ranked=sorted.map(s=>({...s,rank:sorted.findIndex(p=>p.score===s.score)+1,nickname:supervisors.find(p=>p.supervisor_user_id===s.user_id)?.nickname||''}));
 const shown=ranked.filter(s=>(filter==='all'||(filter==='active'?s.active:!s.active)) && `${s.name} ${s.nickname}`.toLowerCase().includes(query.toLowerCase()));

 const selectWeek=(next:number)=>{if(next===week)return;setActivityLoading(true);setActivityError('');setWeek(next);};
 return <AdminLayout active="dashboard" title="Admin workspace" hideHeader><div className="activity-desk">
 <header className="desk-heading"><div><span className="desk-eyebrow">REBOOT / ADMIN SPACE</span><h1>Supervisor activity<span>.</span></h1><p>A clear view of who’s active and how the team is doing.</p></div><Link to="/admin/reports">Reports <ArrowUpRight size={17}/></Link></header>
 <div className="desk-layout">
 <aside className="desk-sidebar">
 <section className="desk-pulse"><span className="desk-code-glow" aria-hidden="true">{"{ }"}</span><div className="desk-week"><button aria-label="Previous week" onClick={()=>selectWeek(week+1)}><ChevronLeft size={18}/></button><span>{formatActivityWeekLabel(week)}</span><button aria-label="Next week" disabled={!week} onClick={()=>selectWeek(Math.max(0,week-1))}><ChevronRight size={18}/></button></div>
 <div className="desk-percentage"><strong>{activityLoading?'…':activityError?'—':pct}<span>{!activityLoading&&!activityError?'%':''}</span></strong><p>of supervisors active</p></div>
 <div className="desk-meter"><i style={{width:`${activityLoading||activityError?0:pct}%`}}/></div>
 <div className="desk-counts"><button onClick={()=>setFilter('active')}><i/>{activityLoading?'…':activityError?'—':activity?.active?.count??'—'} <span>Active</span></button><button onClick={()=>setFilter('inactive')}><i/>{activityLoading?'…':activityError?'—':activity?.inactive?.count??'—'} <span>Inactive</span></button></div>
 </section>
 <section className="desk-history"><span className="desk-eyebrow">THE LAST SIX WEEKS</span><h2>The weekly rhythm</h2><div className="desk-chart">{Array.from({length:6},(_,i)=>{const item=trend[i];return <button key={i} aria-pressed={week===5-i} aria-label={`${formatActivityWeekLabel(5-i)}: ${item?`${item.active?.percentage||0}% active`:'unavailable'}`} onClick={()=>selectWeek(5-i)}><strong>{item?`${item.active?.percentage||0}%`:'—'}</strong><span><i style={{height:`${item?.active?.percentage||0}%`}}/></span><small>{i===5?'Now':`${5-i}w`}</small></button>})}</div><p>Select a week to update the ranking.</p></section>
 <p className="desk-method">Activity = boards created, meetings booked, and card updates. Equal totals share a rank.</p>
 </aside>
 <section className="desk-people"><header><div><span className="desk-eyebrow">{formatActivityWeekLabel(week).toUpperCase()}</span><h2>The supervisors</h2></div><span className="desk-order">Ranked by activity</span></header>
 <div className="desk-tools"><div className="desk-filters" role="group" aria-label="Supervisor status">{(['all','active','inactive'] as const).map(f=><button key={f} aria-pressed={filter===f} onClick={()=>setFilter(f)}>{f==='all'?'Everyone':f==='active'?'Active':'Inactive'}</button>)}</div><label className="desk-search"><Search size={17}/><input aria-label="Search supervisors" placeholder="Search people…" value={query} onChange={e=>setQuery(e.target.value)}/></label></div>
 <div className="desk-roster">{activityLoading?<p role="status" className="desk-empty">Loading activity…</p>:activityError?<p role="alert" className="desk-empty">{activityError}</p>:!activityRows?<p className="desk-empty">Detailed activity is unavailable.</p>:shown.length?shown.map(s=><details className="desk-person" key={`${week}-${s.user_id}`}><summary><span className="desk-rank">{s.score>0?String(s.rank).padStart(2,'0'):'—'}</span><UserAvatar src={avatars[s.nickname.toLowerCase()]} alt={s.name} fallback={s.name.split(' ').map(n=>n[0]).slice(0,2).join('')} sizeClass="h-9 w-9"/><span className="desk-identity"><strong>{s.name}</strong><small className={s.active?'active':''}><i/>{s.active?'Active':'Inactive'}</small></span><span className="desk-score"><b>{s.score}</b><small>actions</small></span><Plus className="desk-expand" size={17}/></summary><div className="desk-detail"><span><b>{s.boards_created}</b> boards created</span><span><b>{s.meetings_created}</b> meetings booked</span><span><b>{s.card_updates}</b> card updates</span><Link to={`/admin/users/${s.user_id}/profile`}>Profile <ArrowUpRight size={14}/></Link></div></details>):<p className="desk-empty">{query?'No supervisors match your search.':'No supervisors in this group for the selected week.'}</p>}</div>
 <footer className="desk-foot">{week===0?'This week is still in progress.':'Activity for '+formatActivityWeekLabel(week)+'.'} Select a person to see their breakdown.</footer>
 </section></div></div></AdminLayout>;
}
