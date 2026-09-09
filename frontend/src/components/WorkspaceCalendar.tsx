import { Search, LayoutDashboard, CircleCheck, CircleDashed } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api";
import BoardCalendar from "./BoardCalendar";
import CardModal from "./CardModal";

type Entry = { id: number; list_id: number; title: string; due_date: string; status: string; priority: string; board_id: number; board_name: string; supervisor_username?: string; supervisor_email?: string; list_name: string; owner: string; assignees: { user_id: number; full_name: string; nickname?: string; email?: string }[]; labels: { label_id: number; name: string; color: string }[] };
export default function WorkspaceCalendar({ boards }: { boards: { id: number; name: string; status?: string; supervisor_name: string }[] }) {
 const [entries,setEntries]=useState<Entry[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [selected,setSelected]=useState<number|null>(null);
 const [query,setQuery]=useState("");
 const [taskStatus,setTaskStatus]=useState("all");
 const load=useCallback(async()=>{setLoading(true);setError("");try{setEntries(await apiFetch("/admin/workspace-calendar"))}catch(e){setError(e instanceof Error?e.message:"Failed to load calendar")}finally{setLoading(false)}},[]);
 useEffect(()=>{void load()},[load]);
 const matching=useMemo(()=>{const ids=new Set(boards.map(b=>b.id));const needle=query.trim().toLowerCase().replace(/^@/, "");return entries.filter(e=>ids.has(e.board_id)&&(!needle||[e.title,e.owner,e.supervisor_username,e.supervisor_email,e.board_name,e.list_name,...e.assignees.map(a=>[a.full_name,a.nickname,a.email].join(" ")),...e.labels.map(l=>l.name)].join(" ").toLowerCase().includes(needle)))},[entries,boards,query]);
 const visible=matching.filter(e=>taskStatus==="all"||(taskStatus==="done"?e.status==="done":e.status!=="done"));
 const matchedBoardIDs=new Set(matching.map(e=>e.board_id));
 const needle=query.trim().toLowerCase().replace(/^@/, "");
 const activeBoards=boards.filter(b=>b.status!=="inactive"&&(!needle||matchedBoardIDs.has(b.id)||[b.name,b.supervisor_name].join(" ").toLowerCase().includes(needle))).length;
 const completed=matching.filter(e=>e.status==="done").length;
 const lists=Array.from(new Map(visible.map(e=>[e.list_id,{id:e.list_id,title:e.list_name}])).values());
 const previews=Object.fromEntries(visible.map(e=>[e.id,{assignees:e.assignees,labels:e.labels}]));
 return <div className="workspace-calendar-view">
  <div className="calendar-overview-toolbar">
  <div className="calendar-filterbar">
    <label className="calendar-filter-search"><Search size={18} aria-hidden="true"/><input aria-label="Search tasks, boards, supervisors, supervisees, usernames, emails and labels" placeholder="Search tasks, boards, supervisors, supervisees, usernames or emails…" value={query} onChange={e=>setQuery(e.target.value)}/></label>
    <label><span>Status</span><select value={taskStatus} onChange={e=>setTaskStatus(e.target.value)}><option value="all">All tasks</option><option value="open">Uncompleted tasks</option><option value="done">Completed tasks</option></select></label>
    {(query||taskStatus!=="all")&&<button type="button" onClick={()=>{setQuery("");setTaskStatus("all")}}>Clear</button>}
  </div>
  <div className="calendar-summary" aria-label="Search results summary">
    {[{label:"Active boards",value:activeBoards,Icon:LayoutDashboard},{label:"Completed tasks",value:completed,Icon:CircleCheck},{label:"Uncompleted tasks",value:matching.length-completed,Icon:CircleDashed}].map(({label,value,Icon})=><span className="calendar-summary-pill" key={label}><span className="calendar-summary-icon"><Icon size={18}/></span><span><strong>{loading?"…":value}</strong><small>{label}</small></span></span>)}
  </div>
  </div>
  {error?<div role="alert">{error} <button onClick={()=>void load()}>Retry</button></div>:loading?<p role="status">Loading tasks…</p>:<><BoardCalendar cards={visible} lists={lists} previews={previews} avatarByUserID={{}} onOpenCard={setSelected} workspace />{visible.length===0&&<p className="p-4 text-slate-500">No tasks match these filters.</p>}</>}
  <CardModal open={selected!==null} cardId={selected} onClose={()=>setSelected(null)} onSaved={load} onDeleted={async()=>{setSelected(null);await load()}} />
 </div>
}