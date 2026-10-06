import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, CalendarCheck } from "lucide-react";
import { apiFetch } from "../lib/api";
import AttendanceWeek from "./AttendanceWeek";
import AttendanceRecords from "./AttendanceRecords";
import type { DateRequirement } from "./AttendanceRequirements";
import "../pages/AttendancePage.css";

type Membership={enrolled:boolean;requirements:DateRequirement[]};
export default function MyAttendance({full=false}:{full?:boolean}){
 const [membership,setMembership]=useState<Membership|null>(null);const [error,setError]=useState("");const [revision,setRevision]=useState(0);
 useEffect(()=>{const controller=new AbortController();setError("");apiFetch("/admin/attendance/me",{signal:controller.signal,headers:{Authorization:"Bearer "+(localStorage.getItem("jwt")||"")}}).then(v=>{if(!controller.signal.aborted)setMembership(v)}).catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:"Could not load your attendance")});return()=>controller.abort()},[revision]);
 if(!membership&&!error)return full?<p role="status">Loading your attendance…</p>:null;
 if(error)return <div className="my-attendance-card" role="alert"><h3>My attendance</h3><p>{error}</p><button className="attendance-secondary" onClick={()=>setRevision(n=>n+1)}>Retry</button></div>;
 if(!membership?.enrolled)return full?<div className="my-attendance-card"><h3>No attendance requirements</h3><p>You are not currently enrolled in mandatory attendance.</p></div>:null;
 if(!full)return <section className="my-attendance-card"><header><span><CalendarCheck size={19}/> My attendance</span><Link to="/attendance" aria-label="View my attendance"><ArrowUpRight size={18}/></Link></header><AttendanceWeek self/><Link className="attendance-view" to="/attendance">View attendance <ArrowUpRight size={15}/></Link></section>;
 return <div className="attendance-page"><section className="attendance-manage-card"><AttendanceRecords self/></section><section className="attendance-manage-card my-required-dates"><h3>Your required dates <span>({membership.requirements.length})</span></h3><p>These dates and hours are assigned by your administrator.</p><div className="attendance-saved-list">{membership.requirements.map(r=><div key={r.date}><time>{new Date(r.date+"T00:00:00Z").toLocaleDateString(undefined,{weekday:"short",day:"numeric",month:"short",year:"numeric",timeZone:"UTC"})}</time><strong className="saved-hours">{r.required_minutes/60}h required</strong></div>)}</div>{!membership.requirements.length&&<p>No dates have been assigned yet.</p>}</section></div>
}
