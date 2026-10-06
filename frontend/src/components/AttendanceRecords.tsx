import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, RefreshCw, Clock3, Siren, ArrowRight } from "lucide-react";
import { statusLabel, type DateRequirement } from "./AttendanceRequirements";
import { apiFetch } from "../lib/api";

type AttendanceDay = {
 date:string;weekday:string;firstPunch:string;lastPunch:string;totalTime:string;
 minutes:number|null;status:"recorded"|"incomplete";note?:string;
 punches:{time:string;state:string}[];
};
type AttendanceData = {
 requirements:DateRequirement[];records:AttendanceDay[];daysWithRecords:number;knownMinutes:number;excludedDates:number;
 warnings:string[];startDate:string;endDate:string;fetchedAt:string;
};
function todayInBahrain() {
 const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Bahrain",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
 return ["year","month","day"].map(type=>parts.find(p=>p.type===type)?.value).join("-");
}
function dateKey(date:Date){return date.toISOString().slice(0,10);}
function hours(minutes:number){return Math.floor(minutes/60)+"h "+minutes%60+"m";}
export default function AttendanceRecords({memberID=0,self=false}:{memberID?:number;self?:boolean}) {
 const today=todayInBahrain();
 const [month,setMonth]=useState(today.slice(0,7));
 const [selected,setSelected]=useState(today);
 const [data,setData]=useState<AttendanceData|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [revision,setRevision]=useState(0);
 useEffect(()=>{const refresh=()=>setRevision(n=>n+1);window.addEventListener("attendance:requirements",refresh);const timer=window.setInterval(refresh,300000);return()=>{window.removeEventListener("attendance:requirements",refresh);window.clearInterval(timer)}},[]);
 const start=month+"-01";
 const end=dateKey(new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)));
 useEffect(()=>{
  const controller=new AbortController();
  setLoading(true);setError("");setData(null);
  apiFetch((self?"/admin/attendance/me/records?":"/admin/attendance/records?")+new URLSearchParams({member_id:String(memberID),startDate:start,endDate:end}),{
   signal:controller.signal,headers:{Authorization:"Bearer "+(localStorage.getItem("jwt")||"")},
  }).then(result=>{if(!controller.signal.aborted)setData(result);})
   .catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:"Could not load attendance.");})
   .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[memberID,self,start,end,revision]);
 const cells=useMemo(()=>{
  const first=new Date(start+"T00:00:00Z");
  return Array.from({length:42},(_,i)=>dateKey(new Date(first.getTime()+(i-first.getUTCDay())*86400000)));
 },[start]);
 const byDate=new Map(data?.records.map(day=>[day.date,day])||[]);
 const day=byDate.get(selected);
 const requirements=new Map(data?.requirements?.map(item=>[item.date,item])||[]);
 const requirement=requirements.get(selected);
 const alerts=data?.requirements?.filter(r=>["no_record","needs_review","below_target"].includes(r.status||""))||[];
 function changeMonth(delta:number){
  const next=dateKey(new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7))-1+delta,1)));
  setMonth(next.slice(0,7));setSelected(next);
 }
 return <section className="attendance-records">
 <div className="attendance-calendar-toolbar">
  <div className="attendance-month-nav"><button aria-label="Previous month" onClick={()=>changeMonth(-1)}><ChevronLeft size={18}/></button><h3>{new Date(start+"T00:00:00Z").toLocaleDateString(undefined,{month:"long",year:"numeric",timeZone:"UTC"})}</h3><button aria-label="Next month" onClick={()=>changeMonth(1)}><ChevronRight size={18}/></button></div>
  <div className="attendance-calendar-tools"><button className="attendance-secondary" onClick={()=>{setMonth(today.slice(0,7));setSelected(today);}}>Today</button><button className="attendance-secondary" disabled={loading} onClick={()=>setRevision(n=>n+1)}><RefreshCw size={14}/>{loading?"Loading…":"Refresh"}</button></div>
 </div>
 {error&&<div role="alert" className="attendance-error">{error}</div>}
 <div className="attendance-record-metrics" aria-live="polite">
 <div><strong>{data?data.daysWithRecords:"—"}</strong><span>Days with records</span></div>
 <div><strong>{data?hours(data.knownMinutes):"—"}</strong><span>Reported hours</span></div>
 <div><strong>{data?data.excludedDates:"—"}</strong><span>Incomplete days</span></div>
 </div>
 {alerts.length>0&&<section role="status" className="attendance-review-alert">
 <div className="attendance-review-heading"><span className="attendance-review-icon" aria-hidden="true"><Siren size={21}/></span><div><h4>{alerts.length} required {alerts.length===1?"date needs":"dates need"} attention</h4><p>Review attendance and required hours for the dates below.</p></div></div>
 <div className="attendance-review-dates">{alerts.map(r=><button type="button" key={r.date} onClick={()=>setSelected(r.date)} aria-label={"Review attendance for "+r.date}><span className="attendance-review-dot" aria-hidden="true"/><span><strong>{new Date(r.date+"T00:00:00Z").toLocaleDateString(undefined,{weekday:"short",day:"numeric",month:"short",timeZone:"UTC"})}</strong><small>{statusLabel[r.status||""]}{r.recorded_minutes!==null?" · "+hours(r.recorded_minutes)+" of "+hours(r.required_minutes):" · "+hours(r.required_minutes)+" required"}</small></span><ArrowRight size={16}/></button>)}</div>
 </section>}
 <div className="attendance-calendar-layout">
 <div>
 <div className="attendance-weekdays" aria-hidden="true">{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d=><span key={d}>{d}</span>)}</div>
 <div className="attendance-month-grid" aria-label="Monthly attendance" aria-busy={loading}>
 {cells.map(date=>{
  const target=requirements.get(date);const record=byDate.get(date);const inMonth=date.startsWith(month);const future=date>today;
  const label=record?(record.status==="incomplete"?"Incomplete":hours(record.minutes??0)):(future?"":data?"No record":"");
  return <button key={date} disabled={!inMonth||!data||loading} aria-pressed={selected===date} aria-label={date+", "+(label||"Attendance not loaded")} onClick={()=>setSelected(date)}
   className={["attendance-day",!inMonth?"is-outside":"",record?"is-"+record.status:"",selected===date?"is-selected":"",date===today?"is-today":""].join(" ")}>
   <span>{Number(date.slice(-2))}</span>{inMonth&&target&&<em className={"attendance-target status-"+target.status}>{statusLabel[target.status||""]} · {target.required_minutes/60}h</em>}<small>{inMonth?label:""}</small>{inMonth&&record&&<i aria-hidden="true"/>}
  </button>;
 })}
 </div>
 <div className="attendance-calendar-legend"><span><i/>Recorded</span><span><i className="incomplete"/>Incomplete</span><span>No record ≠ absent</span></div>
 </div>
 <aside className="attendance-day-detail">
 <span className="attendance-day-eyebrow">SELECTED DAY</span>
 <h4>{new Date(selected+"T00:00:00Z").toLocaleDateString(undefined,{weekday:"short",day:"numeric",month:"long",timeZone:"UTC"})}</h4>
 {requirement&&<div className={"attendance-target-detail status-"+requirement.status}><strong>{statusLabel[requirement.status||""]}</strong><p>{requirement.required_minutes/60}h required · {requirement.recorded_minutes===null?"Hours unverified":hours(requirement.recorded_minutes)+" reported"}</p></div>}
 {loading?<p role="status">Loading BioTime records…</p>:error?<p>Records could not be loaded. Refresh to retry.</p>:!day?<div className="attendance-day-empty"><CalendarDays size={24}/><p>{selected>today?"This date is in the future.":"No attendance record returned for this date."}</p></div>:<>
 <span className={day.status==="incomplete"?"attendance-badge attendance-incomplete":"attendance-badge"}>{day.status==="incomplete"?"Incomplete":"Recorded"}</span>
 <div className="attendance-day-hours"><Clock3 size={17}/><strong>{day.minutes===null?"Hours unavailable":hours(day.minutes)}</strong></div>
 {day.note&&<p>{day.note}</p>}
 <dl className="attendance-punch-summary"><div><dt>First punch</dt><dd>{day.firstPunch||"—"}</dd></div><div><dt>Last punch</dt><dd>{day.lastPunch||"—"}</dd></div></dl>
 <h5>Punches · {day.punches.length}</h5>
 {day.punches.length?<ul className="attendance-punch-list">{day.punches.map((p,i)=><li key={i}><strong>{p.time}</strong><span>{p.state==="Unknown"?"Direction unknown":p.state||"Direction unavailable"}</span></li>)}</ul>:<p>No individual punches returned.</p>}
 </>}
 </aside>
 </div>
 {data&&<><div className="attendance-data-notes">{data.warnings.map(w=><p key={w}>{w}</p>)}</div><p className="attendance-record-note">BioTime · Last synced {new Date(data.fetchedAt).toLocaleString(undefined,{timeZone:"Asia/Bahrain"})} (Bahrain). Cached for up to 2 hours. {self?"Your requirements are set by your administrator.":"Attendance targets are managed below."}</p></>}
 </section>;
}
