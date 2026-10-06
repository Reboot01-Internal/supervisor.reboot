import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { apiFetch } from "../lib/api";
export type DateRequirement={date:string;required_minutes:number;status?:string;recorded_minutes:number|null};
export const statusLabel:Record<string,string>={scheduled:"Scheduled",in_progress:"In progress",met:"Met",no_record:"No record · review",needs_review:"Incomplete · review",below_target:"Below target"};
export default function AttendanceRequirements({memberID}:{memberID:number}) {
 const [month,setMonth]=useState(new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Bahrain",year:"numeric",month:"2-digit"}).format(new Date()).slice(0,7));
 const [selected,setSelected]=useState<string[]>([]);const [hours,setHours]=useState("8");
 const [items,setItems]=useState<DateRequirement[]>([]);const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [message,setMessage]=useState("");
 const headers={Authorization:"Bearer "+(localStorage.getItem("jwt")||"")};
 useEffect(()=>{let alive=true;setItems([]);apiFetch("/admin/attendance/dates?member_id="+memberID,{headers}).then(v=>{if(alive)setItems(v)}).catch(e=>{if(alive)setError(e.message)});return()=>{alive=false}},[memberID]);
 async function save(dates=selected,remove=false){setBusy(true);setError("");setMessage("");try{
 await apiFetch("/admin/attendance/dates",{method:"POST",headers,body:JSON.stringify({member_id:memberID,dates,required_minutes:Math.round(Number(hours)*60),remove})});
 setItems(await apiFetch("/admin/attendance/dates?member_id="+memberID,{headers}));setSelected([]);setMessage(remove?"Requirement removed.":"Required dates saved.");window.dispatchEvent(new Event("attendance:requirements"));
 }catch(e){setError(e instanceof Error?e.message:"Could not save dates")}finally{setBusy(false)}}
 const first=new Date(month+"-01T00:00:00Z");
 const cells=Array.from({length:42},(_,i)=>new Date(first.getTime()+(i-first.getUTCDay())*86400000).toISOString().slice(0,10));
 function move(n:number){setMonth(new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+n,1)).toISOString().slice(0,7))}
 const saved=new Map(items.map(v=>[v.date,v]));
 return <section className="attendance-date-requirements"><h3>Attendance requirements</h3><p>Select one or more dates and set the hours required on each date. Select a saved date to change its hours.</p>
 <div className="attendance-requirement-layout"><div>
 <div className="attendance-month-nav"><button type="button" aria-label="Previous requirement month" onClick={()=>move(-1)}><ChevronLeft size={18}/></button><h4>{first.toLocaleDateString(undefined,{month:"long",year:"numeric",timeZone:"UTC"})}</h4><button type="button" aria-label="Next requirement month" onClick={()=>move(1)}><ChevronRight size={18}/></button></div>
 <div className="attendance-weekdays">{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d=><span key={d}>{d}</span>)}</div>
 <div className="attendance-month-grid">{cells.map(date=><button type="button" key={date} disabled={busy||!date.startsWith(month)} aria-pressed={selected.includes(date)} aria-label={date+(saved.has(date)?", saved requirement":"")} className={"attendance-day requirement-day "+(selected.includes(date)?"is-selected ":"")+(saved.has(date)?"is-recorded ":"")+(!date.startsWith(month)?"is-outside":"")} onClick={()=>setSelected(old=>old.includes(date)?old.filter(d=>d!==date):[...old,date])}><span>{Number(date.slice(-2))}</span><small>{saved.has(date)?saved.get(date)!.required_minutes/60+"h required":""}</small></button>)}</div>
 </div><form className="attendance-requirement-editor" onSubmit={e=>{e.preventDefault();void save()}}><h4>{selected.length} dates selected</h4><p>The same hours will apply to each selected date. Existing dates will be updated.</p><label>Hours per date<input type="number" required min="0.25" max="24" step="0.25" value={hours} disabled={busy} onChange={e=>setHours(e.target.value)}/></label><button className="attendance-primary" disabled={busy||!selected.length}>{busy?"Saving…":"Save required dates"}</button>{selected.length>0&&<button type="button" className="attendance-secondary" disabled={busy} onClick={()=>setSelected([])}>Clear selection</button>}</form></div>
 {error&&<p role="alert" className="attendance-error">{error}</p>}{message&&<p role="status">{message}</p>}
 <div className="attendance-saved-heading"><h4>Saved requirements <span>({items.length})</span></h4><p>Attendance status appears on the attendance calendar above after each check.</p></div>
 {items.length?<div className="attendance-saved-list">{items.map(item=><div key={item.date}><time>{new Date(item.date+"T00:00:00Z").toLocaleDateString(undefined,{weekday:"short",day:"numeric",month:"short",year:"numeric",timeZone:"UTC"})}</time><strong>{item.required_minutes/60}h required</strong><button className="attendance-secondary" disabled={busy} onClick={()=>{setMonth(item.date.slice(0,7));setSelected([item.date]);setHours(String(item.required_minutes/60))}}>Edit</button><button className="attendance-secondary" disabled={busy} onClick={()=>void save([item.date],true)}>Remove</button></div>)}</div>:<p>No required dates added yet.</p>}
 </section>
}
