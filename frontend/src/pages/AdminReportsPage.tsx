import ReportInsights from "./ReportInsights";
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, ChevronDown, ChevronLeft, ChevronRight, RefreshCw, ArrowUpRight } from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import UserAvatar from '../components/UserAvatar';
import { apiFetch } from '../lib/api';
import { fetchRebootAvatars } from '../lib/rebootAvatars';
import './AdminReportsPage.css';

type Board = {lists_count?:number;created_at:string;status?:string;id:number;name:string;supervisor_user_id:number;supervisor_name:string;cards_count:number};
type Supervisor = {supervisor_user_id:number;full_name:string;nickname:string};
type Card = {id:number;title:string;status:string;due_date:string};
type Activity = {supervisors?:{user_id:number;name:string;active:boolean;boards_created:number;meetings_created:number;card_updates:number}[];total:number;active:{count:number;percentage:number}};
export default function AdminReportsPage(){
 const [boards,setBoards]=useState<Board[]>([]),[people,setPeople]=useState<Supervisor[]>([]),[details,setDetails]=useState<Record<number,Card[]>>({});
 const [avatars,setAvatars]=useState<Record<string,string>>({}),[loading,setLoading]=useState(true),[error,setError]=useState(''),[revision,setRevision]=useState(0);
 const [week,setWeek]=useState(0),[activity,setActivity]=useState<Activity|null>(null),[activityError,setActivityError]=useState('');
 const [query,setQuery]=useState(''),[filter,setFilter]=useState('all'),[expanded,setExpanded]=useState<number|null>(null);
 useEffect(()=>{let alive=true;setLoading(true);setError('');(async()=>{try{
  const [b,s]=await Promise.all([apiFetch('/admin/all-boards'),apiFetch('/admin/supervisors')]);
  if(!alive)return;setBoards(b);setPeople(s);
  const results:Record<number,Card[]>={};let cursor=0;
  await Promise.all(Array.from({length:Math.min(5,b.length)},async()=>{while(cursor<b.length){const board=b[cursor++];try{const full=await apiFetch(`/admin/board?board_id=${board.id}`);results[board.id]=full.cards || [];}catch{/* Missing detail is shown as unavailable. */}}}));
  if(alive)setDetails(results);
  const photos=await fetchRebootAvatars(s.map((p:Supervisor)=>p.nickname).filter(Boolean));if(alive)setAvatars(photos);
 }catch{if(alive)setError('Could not load reports. Try refreshing.');}finally{if(alive)setLoading(false);}})();return()=>{alive=false;};},[revision]);
 useEffect(()=>{let alive=true;setActivity(null);setActivityError('');apiFetch(`/admin/dashboard/supervisor-activity?week_offset=${week}`).then(a=>{if(alive)setActivity(a);}).catch(()=>{if(alive)setActivityError('Activity unavailable');});return()=>{alive=false;};},[week,revision]);
 const rows=useMemo(()=>people.map(person=>{
  const owned=boards.filter(b=>b.supervisor_user_id===person.supervisor_user_id);
  const cards=owned.flatMap(b=>details[b.id]||[]);const complete=owned.every(b=>details[b.id]!==undefined);
  const done=cards.filter(c=>c.status.toLowerCase()==='done').length;
  const today=new Date();today.setHours(0,0,0,0);
  const overdue=cards.filter(c=>c.status.toLowerCase()!=='done' && c.due_date && new Date(c.due_date.slice(0,10)+'T00:00:00')<today).length;
  return {...person,owned,cards:cards.length,done,overdue,complete,finished:owned.filter(b=>details[b.id]?.length>0 && details[b.id].every(c=>c.status.toLowerCase()==='done')).length};
 }),[people,boards,details]);
 const visible=rows.filter(r=>(r.full_name+' '+r.nickname).toLowerCase().includes(query.toLowerCase())&&(filter==='all'||(filter==='active'||filter==='inactive'?activity?.supervisors?.some(a=>a.user_id===r.supervisor_user_id&&a.active===(filter==='active')):filter==='overdue'?r.overdue>0:r.owned.length===0)));
 const totals=rows.reduce((a,r)=>({cards:a.cards+r.cards,done:a.done+r.done,overdue:a.overdue+r.overdue}),{cards:0,done:0,overdue:0});
 const complete=rows.every(r=>r.complete);
 const today=new Date();today.setHours(0,0,0,0);const soon=new Date(today);soon.setDate(soon.getDate()+7);
 const monthAgo=new Date(today);monthAgo.setMonth(monthAgo.getMonth()-1);
 const agingBoards=boards.filter(b=>b.status!=='inactive'&&new Date(b.created_at)<monthAgo).sort((a,b)=>new Date(a.created_at).getTime()-new Date(b.created_at).getTime());
 const openTasks=boards.flatMap(b=>(details[b.id]||[]).filter(c=>c.status.toLowerCase()!=='done').map(c=>({...c,board:b})));
 const risks=[{title:'Overdue risk',className:'late',items:openTasks.filter(c=>c.due_date&&new Date(c.due_date.slice(0,10)+'T00:00:00')<today),empty:'No overdue tasks.'},{title:'Due in the next 7 days',className:'soon',items:openTasks.filter(c=>{const d=new Date(c.due_date.slice(0,10)+'T00:00:00');return d>=today&&d<soon;}),empty:'No tasks due in the next 7 days.'},{title:'Missing due dates',className:'undated',items:openTasks.filter(c=>!c.due_date),empty:'All open tasks have a due date.'}];
 return <AdminLayout active="reports" title="Reports" subtitle="Supervisor activity, project progress, and the work still ahead." right={<button className="report-refresh" onClick={()=>setRevision(v=>v+1)} disabled={loading}><RefreshCw size={15}/> Refresh</button>}>
 <div className="reports-hub">
  {error && <p role="alert">{error}</p>}
  <ReportInsights boards={boards} people={people} avatars={avatars} done={totals.done} cards={totals.cards} complete={!loading&&complete} revision={revision}/>
  <section className="reports-overview">
   <div className="reports-activity"><div className="reports-activity-head"><span>SUPERVISOR ACTIVITY</span><div><button aria-label="Previous week" onClick={()=>setWeek(w=>w+1)}><ChevronLeft size={16}/></button><span>{week===0?'This week':`${week} week${week===1?'':'s'} ago`}</span><button aria-label="Next week" disabled={!week} onClick={()=>setWeek(w=>w-1)}><ChevronRight size={16}/></button></div></div>
   <div className="reports-activity-number">{activity?<><strong>{activity.active.count}<small> / {activity.total}</small></strong><span>supervisors active</span></>:<span role="status">{activityError||'Loading activity…'}</span>}</div>
   <p>Activity includes creating boards, booking meetings, or updating cards during the selected week.</p></div>
   <div className="reports-progress"><span>WORKSPACE PROGRESS · ALL TIME</span><h2>{loading?'Loading…':complete?`${totals.done} of ${totals.cards} tasks done`:'Some board details are unavailable'}</h2><div className="reports-progress-track"><i style={{width:`${complete&&totals.cards?totals.done/totals.cards*100:0}%`}}/></div><div className="reports-progress-notes"><span>{boards.length} project boards</span><span className={totals.overdue?'has-overdue':''}>{loading?'…':complete?totals.overdue:'—'} overdue tasks</span></div><p>Task completion is based on cards marked done.</p></div>
  </section>
  <section className="reports-aging"><div><span>LONG-RUNNING BOARDS</span><h2>Time for a check-in</h2><p>Active boards opened more than a month ago.</p></div>{loading?<p>Loading…</p>:agingBoards.length?<div className="reports-aging-list">{agingBoards.map(b=>{const opened=new Date(b.created_at);const days=Math.floor((today.getTime()-opened.getTime())/86400000);return <Link key={b.id} to={`/admin/boards/${b.id}`}><span className="reports-age"><strong>{days}</strong><small>days open</small></span><span><strong>{b.name}</strong><small>{b.supervisor_name}</small><small>Opened {opened.toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'})} · Still active</small></span><ArrowUpRight size={18}/></Link>;})}</div>:<p>No active boards have been open for over a month.</p>}</section>
  <section className="reports-attention"><h2>What needs your attention</h2><p>Current open tasks, independent of the activity week above.</p>{loading?<p>Loading…</p>:<div className="reports-risk-grid">{risks.map(risk=><div key={risk.title} className={`reports-risk ${risk.className}`}><h3>{risk.title}<span>{risk.items.length}{!complete?' +':''}</span></h3>{!complete&&<p>Some boards could not be checked.</p>}{risk.items.length?<div>{risk.items.map(c=><Link key={`${c.board.id}-${c.id}`} to={`/admin/boards/${c.board.id}`}><strong>{c.title}</strong><small>{c.board.supervisor_name} · {c.board.name}</small>{c.due_date&&<small>Due {c.due_date.slice(0,10)}</small>}</Link>)}</div>:<p>{complete?risk.empty:'No matches in loaded boards.'}</p>}</div>)}</div>}</section>
  <section className="reports-directory"><div className="reports-directory-heading"><div><span>PEOPLE & PROJECTS</span><h2>Supervisor breakdown</h2><p>Expand a supervisor to review each board’s progress.</p></div><label className="reports-search"><Search size={16}/><input aria-label="Search supervisors" placeholder="Find a supervisor…" value={query} onChange={e=>setQuery(e.target.value)}/></label></div>
   <div className="reports-filters">{[['all','All supervisors'],['active','Active in selected week'],['inactive','No activity'],['overdue','Overdue work'],['unassigned','No boards']].map(([value,label])=><button key={value} aria-pressed={filter===value} onClick={()=>setFilter(value)}>{label}</button>)}</div>
   <div className="reports-column-head"><span>Supervisor</span><span>Boards</span><span>Tasks done</span><span>Overdue</span><span/></div>
   {loading?<p className="reports-empty" role="status">Loading board progress…</p>:!visible.length?<p className="reports-empty">{(filter==='active'||filter==='inactive')&&!activity?.supervisors ? 'Individual activity details are unavailable. Refresh after the API has updated.' : 'No supervisors match this view.'}</p>:visible.map(r=><div key={r.supervisor_user_id} className="reports-person"><button className="reports-person-row" aria-expanded={expanded===r.supervisor_user_id} onClick={()=>setExpanded(expanded===r.supervisor_user_id?null:r.supervisor_user_id)}><span className="reports-identity"><UserAvatar src={avatars[r.nickname?.toLowerCase()]} alt={r.full_name} fallback={r.full_name.slice(0,2)} sizeClass="h-10 w-10"/><span><strong>{r.full_name}</strong><small>{r.nickname?`@${r.nickname}`:'Supervisor'}</small><small className="reports-activity-badge">{activity?.supervisors?.find(a=>a.user_id===r.supervisor_user_id)?.active ? '● Active' : activity?.supervisors?.some(a=>a.user_id===r.supervisor_user_id) ? '○ No recorded activity' : 'Activity unavailable'}</small></span></span><span><strong>{r.owned.length}</strong><small>{r.complete?`${r.finished} with all tasks done`:'Details unavailable'}</small></span><span><strong>{r.complete?`${r.done} / ${r.cards}`:'—'}</strong><span className="reports-mini-track"><i style={{width:`${r.complete&&r.cards?r.done/r.cards*100:0}%`}}/></span></span><span className={r.overdue?'has-overdue':''}>{r.complete?r.overdue:'—'}</span><ChevronDown size={17}/></button>
   {expanded===r.supervisor_user_id&&<div className="reports-boards">{activity?.supervisors?.filter(a=>a.user_id===r.supervisor_user_id).map(a=><p key={a.user_id}>Selected week: {a.boards_created} boards created · {a.meetings_created} meetings booked · {a.card_updates} card updates</p>)}{!r.owned.length?<p>No boards assigned yet.</p>:r.owned.map(b=>{const cards=details[b.id];const done=cards?.filter(c=>c.status.toLowerCase()==='done').length||0;return <Link key={b.id} to={`/admin/boards/${b.id}`}><span>{b.name}</span><small>{cards?cards.length?`${done} / ${cards.length} tasks done`:'No tasks yet':'Details unavailable'}</small><ArrowUpRight size={15}/></Link>;})}</div>}</div>)}
  </section>
 </div></AdminLayout>;
}
