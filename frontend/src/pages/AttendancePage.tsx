import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Search, Users, X, ArrowUpRight } from "lucide-react";
import Modal from "../components/Modal";
import AdminLayout from "../components/AdminLayout";
import UserAvatar from "../components/UserAvatar";
import { apiFetch } from "../lib/api";
import { searchRebootUsers, type RebootCandidate } from "../lib/rebootUserImport";
import { fetchRebootAvatars } from "../lib/rebootAvatars";
import { fetchRebootPhones } from "../lib/rebootPhones";
import "./AttendancePage.css";
import { loadRebootProfile } from "./ProfilePage";

type Member = RebootCandidate & {id:number;user_id:number;role:string;is_active:boolean;enrolled:boolean;created_at:string};
export default function AttendancePage() {
 const nav=useNavigate();
 const [members,setMembers]=useState<Member[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [query,setQuery]=useState("");
 const [status,setStatus]=useState("enrolled");
 const [open,setOpen]=useState(false);
 const [lookup,setLookup]=useState("");
 const [results,setResults]=useState<RebootCandidate[]>([]);
 const [queue,setQueue]=useState<RebootCandidate[]>([]);
 const [searching,setSearching]=useState(false);
 const [saving,setSaving]=useState(false);
 const [avatars,setAvatars]=useState<Record<string,string>>({});
 const [phones,setPhones]=useState<Record<string,string>>({});
 const [profile,setProfile]=useState<Awaited<ReturnType<typeof loadRebootProfile>>|null>(null);
 const [profileLoading,setProfileLoading]=useState(false);
 const [profileError,setProfileError]=useState("");
 const [detail,setDetail]=useState<Member|null>(null);
 useEffect(()=>{
  if(!detail)return;
  let alive=true;setProfile(null);setProfileError("");setProfileLoading(true);
  loadRebootProfile(detail.nickname,localStorage.getItem("jwt")||"").then(p=>{if(alive)setProfile(p);}).catch(()=>{if(alive)setProfileError("Reboot profile details are temporarily unavailable.");}).finally(()=>{if(alive)setProfileLoading(false);});
  return()=>{alive=false;};
 },[detail]);

 async function load() {try {setMembers(await apiFetch("/admin/attendance/members"));}catch(e){setError(e instanceof Error?e.message:"Could not load members");}finally{setLoading(false);}}
 useEffect(()=>{void load();},[]);
 useEffect(()=>{
  let alive=true;
  if(!open || lookup.trim().length<2){setResults([]);setSearching(false);return;}
  setSearching(true);setResults([]);
  const timer=setTimeout(()=>{searchRebootUsers(lookup).then(rows=>{if(alive)setResults(rows);}).catch(e=>{if(alive)setError(e.message);}).finally(()=>{if(alive)setSearching(false);});},300);
  return()=>{alive=false;clearTimeout(timer);};
 },[lookup,open]);
 useEffect(()=>{
  let alive=true;const logins=[...new Set([...members,...results,...queue].map(u=>u.nickname))];
  if(logins.length) {
   fetchRebootAvatars(logins).then(v=>{if(alive)setAvatars(v);}).catch(()=>{});
   fetchRebootPhones(logins).then(v=>{if(alive)setPhones(v);}).catch(()=>{});
  }
  return()=>{alive=false;};
 },[members,results,queue]);
 async function add() {
  setSaving(true);setError("");const failed:RebootCandidate[]=[];
  for(const user of queue) {try {await apiFetch("/admin/attendance/members",{method:"POST",body:JSON.stringify(user)});}catch {failed.push(user);}}
  await load();setQueue(failed);setSaving(false);
  if(failed.length)setError("Some members could not be added. They remain selected so you can retry.");else {setOpen(false);setLookup("");}
 }
 async function toggle(member:Member) {
  setSaving(true);setError("");
  try {await apiFetch("/admin/attendance/members",{method:"POST",body:JSON.stringify({id:member.id,enrolled:!member.enrolled})});await load();setDetail(null);}
  catch(e){setError(e instanceof Error?e.message:"Could not update membership");}finally{setSaving(false);}
 }
 const visible=members.filter(m=>(status==="all" || m.enrolled===(status==="enrolled")) && [m.full_name,m.nickname,m.email,m.cohort].join(" ").toLowerCase().includes(query.toLowerCase()));
 function person(user:RebootCandidate) {return <div className="attendance-person"><UserAvatar src={avatars[user.nickname]} alt={user.full_name} fallback={user.full_name.slice(0,1)} sizeClass="h-10 w-10"/><div><strong>{user.full_name}</strong><span>@{user.nickname}</span></div></div>;}
 return <AdminLayout active="attendance" title="Mandatory Attendance" subtitle="Manage attendance members and their Reboot profiles." right={<button className="attendance-primary" onClick={()=>{setOpen(true);setError("");}}><Plus size={17}/>Add members</button>}>
 <div className="attendance-page">
 {error && <div role="alert" className="attendance-error">{error}</div>}
 <section className="attendance-directory">
 <div className="attendance-directory-heading"><div><h2>Members <span>{members.length}</span></h2><p>People enrolled in mandatory attendance.</p></div></div>
 <div className="attendance-toolbar"><div className="attendance-tabs" role="group" aria-label="Membership filter">{[["enrolled","Enrolled"],["archived","Archived"],["all","All"]].map(([value,label])=><button key={value} aria-pressed={status===value} onClick={()=>setStatus(value)}>{label}<span>{members.filter(m=>value==="all"||m.enrolled===(value==="enrolled")).length}</span></button>)}</div><label><Search size={16}/><input aria-label="Search attendance members" placeholder="Search members…" value={query} onChange={e=>setQuery(e.target.value)}/></label></div>
 {loading?<div className="attendance-empty">Loading members…</div>:visible.length===0?<div className="attendance-empty"><Users size={30}/><h3>{members.length?"No matching members":"Build your attendance group"}</h3><p>{members.length?"Try another search or filter.":"Add people from Reboot to get started. Their existing roles stay the same."}</p></div>:<div className="attendance-table"><table><thead><tr><th>Member</th><th>Contact</th><th>Cohort</th><th>Membership</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{visible.map(m=><tr key={m.id}><td>{person(m)}{m.role&&<small>{m.role==="student"?"Talent":m.role} · {m.is_active?"Active account":"Inactive account"}</small>}</td><td><span>{m.email}</span><small>{phones[m.nickname]||"Phone unavailable"}</small></td><td>{m.cohort||"—"}</td><td><span className={m.enrolled?"attendance-badge":"attendance-badge is-archived"}>{m.enrolled?"Attendance Member":"Archived"}</span></td><td><button className="attendance-view" aria-label={"View "+m.full_name} onClick={()=>setDetail(m)}>View<ArrowUpRight size={15}/></button></td></tr>)}</tbody></table></div>}
 <footer>{visible.length} members shown · Records are retained when membership is archived.</footer>
 </section>
 <Modal open={open} title="Add attendance members" onClose={()=>{if(!saving)setOpen(false);}} className="attendance-dialog" footer={<><span className="attendance-selection-count">{queue.length} selected</span><button className="attendance-secondary" disabled={saving} onClick={()=>setOpen(false)}>Cancel</button><button className="attendance-primary" disabled={saving||!queue.length} onClick={()=>void add()}>{saving?"Adding…":`Add ${queue.length || ""} members`}</button></>}>
 <div className="attendance-import">
 <p>Find people in Reboot and select everyone you want to add.</p>
 {error&&<div role="alert" className="attendance-error">{error}</div>}
 <label className="attendance-import-search"><Search size={17}/><input autoFocus aria-label="Search Reboot" placeholder="Search name, username or email…" value={lookup} onChange={e=>setLookup(e.target.value)}/></label>
 {queue.length>0&&<div className="attendance-selected">{queue.map(u=><button disabled={saving} key={u.nickname} aria-label={"Remove "+u.full_name+" from selection"} onClick={()=>setQueue(q=>q.filter(x=>x.nickname!==u.nickname))}>{u.full_name}<X size={13}/></button>)}</div>}
 <div className="attendance-results" aria-live="polite">{searching?<div className="attendance-empty">Searching Reboot…</div>:results.map(u=>{const added=members.some(m=>m.nickname===u.nickname&&m.enrolled);const selected=queue.some(m=>m.nickname===u.nickname);return <label className="attendance-result" key={u.nickname}><input type="checkbox" disabled={saving||added} checked={selected||added} onChange={()=>setQueue(q=>selected?q.filter(x=>x.nickname!==u.nickname):[...q,u])}/>{person(u)}<small>{added?"Already enrolled":u.cohort}</small></label>;})}{!searching&&!results.length&&<div className="attendance-empty"><Search size={24}/><p>{lookup.trim().length<2?"Type at least two characters to search Reboot.":"No people found. Try another name or username."}</p></div>}</div>
 </div></Modal>
 <Modal open={!!detail} title="Member details" onClose={()=>{if(!saving)setDetail(null);}} className="attendance-dialog attendance-profile-dialog" footer={detail&&<><button disabled={saving} className="attendance-secondary" onClick={()=>void toggle(detail)}>{saving?"Saving…":detail.enrolled?"Archive membership":"Restore membership"}</button>{detail.user_id>0&&<button className="attendance-primary" onClick={()=>nav(`/admin/users/${detail.user_id}/profile`)}>Full profile <ArrowUpRight size={15}/></button>}</>}>
 {detail&&<div className="attendance-member-detail"><header>{person(detail)}<span className={detail.enrolled?"attendance-badge":"attendance-badge is-archived"}>{detail.enrolled?"Attendance Member":"Archived"}</span></header>
 {error&&<div role="alert" className="attendance-error">{error}</div>}
 <dl>{Object.entries({"Email":detail.email,"Phone":profile?.user?.number||phones[detail.nickname]||"Unavailable","Cohort":detail.cohort||"Unavailable","Existing role":detail.role==="student"?"Talent":detail.role||"No workspace role","Account status":detail.user_id?(detail.is_active?"Active":"Inactive"):"Reboot member","Gender":profileLoading?"Loading…":profile?.user?.gender||"Unavailable","Level":profileLoading?"Loading…":profile?.level?.toString()||"Unavailable","Audit ratio":profileLoading?"Loading…":profile?.user?.auditRatio?.toString()||"Unavailable","Added":new Date(detail.created_at.replace(" ","T")+"Z").toLocaleDateString(undefined,{day:"numeric",month:"short",year:"numeric"})}).map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>{profileError&&<p role="status">{profileError}</p>}<p className="attendance-record-note">Archiving ends membership. The user’s record and existing role are kept.</p></div>}
 </Modal>
 </div></AdminLayout>;
}
