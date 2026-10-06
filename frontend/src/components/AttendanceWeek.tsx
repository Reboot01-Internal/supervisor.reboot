import { useEffect, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Clock3, AlertCircle, Minus } from "lucide-react";
import { apiFetch } from "../lib/api";
import type { DateRequirement } from "./AttendanceRequirements";
function bahrainToday(){const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Bahrain",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());return ["year","month","day"].map(k=>parts.find(p=>p.type===k)?.value).join("-")}
function shift(date:string,days:number){const d=new Date(date+"T00:00:00Z");d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)}
function format(date:string,options:Intl.DateTimeFormatOptions){return new Date(date+"T00:00:00Z").toLocaleDateString(undefined,{...options,timeZone:"UTC"})}
function duration(minutes:number){return `${Math.floor(minutes/60)}h${minutes%60?` ${minutes%60}m`:""}`}
type WeekData={requirements:DateRequirement[];records:{date:string;minutes:number|null}[]};
export default function AttendanceWeek({memberID}:{memberID:number}){
 const today=bahrainToday();const current=shift(today,-new Date(today+"T00:00:00Z").getUTCDay());
 const [start,setStart]=useState(current);const [data,setData]=useState<WeekData|null>(null);const [error,setError]=useState("");const [revision,setRevision]=useState(0);
 useEffect(()=>{const refresh=()=>setRevision(n=>n+1);window.addEventListener("attendance:requirements",refresh);const timer=window.setInterval(refresh,300000);return()=>{window.removeEventListener("attendance:requirements",refresh);window.clearInterval(timer)}},[]);
 useEffect(()=>{const controller=new AbortController();setData(null);setError("");apiFetch("/admin/attendance/records?"+new URLSearchParams({member_id:String(memberID),startDate:start,endDate:shift(start,6)}),{signal:controller.signal,headers:{Authorization:"Bearer "+(localStorage.getItem("jwt")||"")}}).then(result=>{if(!controller.signal.aborted)setData(result)}).catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:"Could not load this week")});return()=>controller.abort()},[memberID,start,revision]);
 const requirements=new Map(data?.requirements.map(r=>[r.date,r])||[]);const records=new Map(data?.records.map(r=>[r.date,r])||[]);
 return <section className="attendance-week" aria-label="Weekly attendance">
 <header><h3>Weekly attendance</h3><div><button type="button" aria-label="Previous week" onClick={()=>setStart(shift(start,-7))}><ChevronLeft size={16}/></button><button type="button" aria-label="Next week" onClick={()=>setStart(shift(start,7))}><ChevronRight size={16}/></button></div></header>
 <div className="attendance-week-range"><span>{format(start,{day:"numeric",month:"short"})} – {format(shift(start,6),{day:"numeric",month:"short",year:"numeric"})}</span>{start===current?<small>This week</small>:<button type="button" onClick={()=>setStart(current)}>This week</button>}</div>
 <div className="attendance-week-body">{error?<div role="alert" className="attendance-error">{error}<button className="attendance-secondary" onClick={()=>setRevision(n=>n+1)}>Retry</button></div>:!data?<p role="status">Loading this week…</p>:requirements.size===0?<div className="attendance-week-empty">No required dates this week.</div>:<ul>{Array.from({length:7},(_,i)=>shift(start,i)).filter(date=>requirements.has(date)).map(date=>{const target=requirements.get(date);const record=records.get(date);const status=target?.status;const label=status==="met"?"Done":status==="scheduled"?"Upcoming":status==="in_progress"?"In progress":status==="below_target"?"Below target":status==="no_record"?"No record":status==="needs_review"?"Review":record?"Recorded":"Not required";const tone=status==="met"?"done":["below_target","no_record","needs_review"].includes(status||"")?"review":target?"pending":"neutral";const Icon=tone==="done"?Check:tone==="review"?AlertCircle:tone==="pending"?Clock3:Minus;
 return <li key={date} className={date===today?"is-today":""}><div className="attendance-week-date"><strong>{format(date,{weekday:"short"})}</strong><span>{format(date,{day:"numeric",month:"short"})}{date===today?" · Today":""}</span></div><div className="attendance-week-result"><span className={"week-state "+tone}><Icon size={12}/>{label}</span><small>{target?(record?.minutes!=null?duration(record.minutes):"—")+" / "+duration(target.required_minutes):record?.minutes!=null?duration(record.minutes):"—"}</small></div></li>})}</ul>}</div>
 <p className="attendance-week-note">Missing or incomplete records need review before marking a day missed.</p>
 </section>
}
