import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Sparkles, ArrowUpRight } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { fetchRebootAvatars } from '../lib/rebootAvatars';
import { programStart, type JourneyBoard } from '../lib/programJourney';
import { latestProject } from '../lib/latestProject';
import type { ProjectMembership } from './ProfileProjects';
import UserAvatar from './UserAvatar';
import './TalentJourneyMap.css';
const modules = [
 {id:'go',name:'Go',projects:['go-reloaded','ascii-art','ascii-art-web','groupie-tracker','lem-in','forum']},
 {id:'js',name:'JavaScript',projects:['make-your-game','real-time-forum','graphql','social-network','mini-framework','bomberman-dom']},
 {id:'rust',name:'Rust',projects:['smart-road','filler','rt','localhost','multiplayer-fps','0-shell']},
 {id:'specialization',name:'Specialization',projects:[]},
 {id:'unknown',name:'Progress unavailable',projects:[]},
];
type Talent = {id:number;full_name:string;nickname:string;cohort:string};
type Profile = {user?:{reboot_details?:{projects?:ProjectMembership[]}};student?:{boards:JourneyBoard[];supervisors:{id:number;full_name:string}[]}};
function placement(projects?:ProjectMembership[]) {
 if(!projects) return 'unknown';
 const groups=projects.map(p=>p.group).filter(g=>g && !g.isPiscine && g.object?.type==='project');
 const name=(g:typeof groups[number])=>(g.path.split('/').filter(Boolean).pop() || g.object.name || '').toLowerCase().trim();
 const passed=new Set(groups.filter(g=>g.progresses?.some(p=>(p.grade ?? 0)>=1)).map(name));
 if(passed.has('0-shell')) return 'specialization';
 for(const module of modules.slice(0,3).reverse()) if(groups.some(g=>module.projects.includes(name(g)))) return module.id;
 return 'unknown';
}
type JourneySnapshot = {talents:Talent[]; profiles:Record<number,Profile|null>; avatars:Record<string,string>};
let journeyCache: {key:string; value?:JourneySnapshot; pending?:Promise<JourneySnapshot>} | undefined;
const journeyListeners = new Set<(value:JourneySnapshot)=>void>();
function journeySessionKey() {
 return ['jwt','role','email','login'].map(key=>localStorage.getItem(key)||'').join('|');
}
function loadJourney(force:boolean) {
 const key=journeySessionKey();
 if(!force && journeyCache?.key===key) {
  if(journeyCache.pending) return journeyCache.pending;
  if(journeyCache.value) return Promise.resolve(journeyCache.value);
 }
 const entry: NonNullable<typeof journeyCache>={key};
 journeyCache=entry;
 entry.pending=(async()=>{
  const talents:Talent[]=localStorage.getItem('role')==='supervisor' ? (await apiFetch('/admin/profile/summary')).supervisor?.assigned_students || [] : await apiFetch('/admin/users?include_inactive=1&role=student');
  const profiles:Record<number,Profile|null>={};
  let avatars:Record<string,string>={};
  const publish=()=>{entry.value={talents,profiles:{...profiles},avatars};if(journeyCache===entry)journeyListeners.forEach(listener=>listener(entry.value!));};
  publish();
  const photos=fetchRebootAvatars(talents.map(t=>t.nickname).filter(Boolean)).catch(()=>({})).then(value=>{avatars=value;publish();return value;});
  let cursor=0;
  await Promise.all(Array.from({length:3},async()=>{while(cursor<talents.length){const t=talents[cursor++];try{profiles[t.id]=await apiFetch(`/admin/profile/summary?user_id=${t.id}&reboot_details=1`);}catch{profiles[t.id]=null;}publish();}}));
  const value={talents,profiles,avatars:await photos};
  entry.value=value;return value;
 })().finally(()=>{entry.pending=undefined;});
 return entry.pending;
}
export default function TalentJourneyMap({revision}:{revision:number}) {
 const [talents,setTalents]=useState<Talent[]>([]),[profiles,setProfiles]=useState<Record<number,Profile|null>>({}),[avatars,setAvatars]=useState<Record<string,string>>({});
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[query,setQuery]=useState(''),[module,setModule]=useState('all'),[supervisor,setSupervisor]=useState('all'),[cohort,setCohort]=useState('all'),[selected,setSelected]=useState<number|null>(null);
 const lastRevision=useRef(revision);
 useEffect(()=>{
  let active=true;
  const force=lastRevision.current!==revision;
  lastRevision.current=revision;
  setLoading(true);setError('');
  const update=(snapshot:JourneySnapshot)=>{if(active){setTalents(snapshot.talents);setProfiles(snapshot.profiles);setAvatars(snapshot.avatars);}};
  journeyListeners.add(update);
  if(!force && journeyCache?.key===journeySessionKey() && journeyCache.value)update(journeyCache.value);
  loadJourney(force).then(update).catch(()=>{if(active)setError('Could not load the talent journey. Use Refresh to try again.');})
    .finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;journeyListeners.delete(update);};
 },[revision]);

 const rows=useMemo(()=>talents.map(t=>{const p=profiles[t.id];const projects=p?.user?.reboot_details?.projects;return {...t,profile:p,projects,stage:placement(projects),latest:projects?latestProject(projects):null,start:programStart(p?.student?.boards||[],projects)};}),[talents,profiles]);
 const supervisors=[...new Map(rows.flatMap(r=>r.profile?.student?.supervisors||[]).map(s=>[s.id,s])).values()].sort((a,b)=>a.full_name.localeCompare(b.full_name));
 const visible=rows.filter(r=>(r.full_name+' '+r.nickname+' '+(r.latest?.name||'')).toLowerCase().includes(query.toLowerCase())&&(module==='all'||r.stage===module)&&(cohort==='all'||r.cohort===cohort)&&(supervisor==='all'||r.profile?.student?.supervisors.some(s=>String(s.id)===supervisor)));
 const checked=Object.keys(profiles).length;
 const percent=talents.length?Math.round(checked/talents.length*100):0;
 const unavailable=Object.values(profiles).filter(p=>!p?.user?.reboot_details?.projects).length;
 const detail=rows.find(r=>r.id===selected);
 function details(r:typeof rows[number]) {const start=r.start?.board.added_at;return `${r.full_name} · ${r.latest?.name||'Project unavailable'}\nSupervisor: ${r.profile?.student?.supervisors.map(s=>s.full_name).join(', ')||'Not recorded'}\n${start?`Started ${new Date(start).toLocaleDateString('en-GB')} · ${Math.max(0,Math.floor((Date.now()-Date.parse(start))/86400000))} days in program`:'Start date unavailable'}`;}
 return <section className="talent-map"><header><div><span className="talent-map-eyebrow">THE TALENT JOURNEY</span><h2>Every talent. Their next chapter.</h2><p>Explore the path from foundations to specialization.</p></div><span className="talent-map-milestone"><Sparkles size={17}/><strong>{loading?'…':rows.filter(r=>r.stage==='specialization').length}</strong> reached specialization</span></header>
 <div className="talent-map-filters"><label className="talent-map-search"><Search size={16}/><input aria-label="Search talent or project" placeholder="Find a talent or project…" value={query} onChange={e=>setQuery(e.target.value)}/></label><select aria-label="Filter journey by module" value={module} onChange={e=>setModule(e.target.value)}><option value="all">All modules</option>{modules.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select><select aria-label="Filter journey by supervisor" value={supervisor} onChange={e=>setSupervisor(e.target.value)}><option value="all">All supervisors</option>{supervisors.map(s=><option key={s.id} value={s.id}>{s.full_name}</option>)}</select><select aria-label="Filter journey by cohort" value={cohort} onChange={e=>setCohort(e.target.value)}><option value="all">All cohorts</option>{[...new Set(talents.map(t=>t.cohort).filter(Boolean))].sort().map(c=><option key={c}>{c}</option>)}</select>{(query||module!=='all'||supervisor!=='all'||cohort!=='all')&&<button onClick={()=>{setQuery('');setModule('all');setSupervisor('all');setCohort('all');}}>Reset</button>}</div>
 <div className="talent-map-status" role="status">{error || (loading ? talents.length ? `${percent}% · ${checked} of ${talents.length} profiles checked${checked===talents.length?' · Finishing photos…':''}` : 'Connecting · Loading talent list…' : `${visible.length} talents shown · ${checked} profiles checked`)}{unavailable>0 && <span> · {unavailable} profiles with unavailable progress</span>}</div>
 {loading && <progress className="talent-load-progress" aria-label="Talent profile loading progress" max={100} value={talents.length?percent:undefined}/>}

 <div className="talent-map-scroll"><div className="talent-map-path">{modules.filter(m=>m.id!=='unknown').map((m,index)=><div className="talent-map-stage" data-module={m.id} key={m.id}><div className="talent-map-stop"><span>{m.id==='specialization'?<Sparkles size={19}/>:<i style={{maskImage:`url(/languages/${m.id}.svg)`}}/>}</span><small>0{index+1}</small><h3>{m.name}</h3><b>{visible.filter(r=>r.stage===m.id).length}</b></div><div className="talent-map-avatars">{visible.filter(r=>r.stage===m.id).map(r=><button key={r.id} className="talent-map-person" title={details(r)} onMouseEnter={()=>setSelected(r.id)} onFocus={()=>setSelected(r.id)} onClick={()=>setSelected(r.id)} aria-pressed={selected===r.id}><UserAvatar src={avatars[r.nickname?.toLowerCase()]} alt={r.full_name} fallback={r.full_name.slice(0,2)} sizeClass="h-11 w-11"/><span>{r.full_name}</span><small>{r.latest?.name||'Project unavailable'}</small></button>)}{!visible.some(r=>r.stage===m.id)&&<p className="talent-map-empty">No loaded matches</p>}</div></div>)}</div></div>
 {visible.some(r=>r.stage==='unknown')&&<div className="talent-map-unplaced"><strong>Not yet placed</strong><span>No verified module result yet</span><div>{visible.filter(r=>r.stage==='unknown').map(r=><button key={r.id} title={details(r)} onMouseEnter={()=>setSelected(r.id)} onFocus={()=>setSelected(r.id)} onClick={()=>setSelected(r.id)}><UserAvatar src={avatars[r.nickname?.toLowerCase()]} alt={r.full_name} fallback={r.full_name.slice(0,2)} sizeClass="h-8 w-8"/>{r.full_name}</button>)}</div></div>}
 {detail?<div className="talent-map-detail" role="region" aria-label="Selected talent details"><UserAvatar src={avatars[detail.nickname?.toLowerCase()]} alt={detail.full_name} fallback={detail.full_name.slice(0,2)} sizeClass="h-12 w-12"/><div className="talent-detail-field"><strong>{detail.full_name}</strong><span>{modules.find(m=>m.id===detail.stage)?.name} · {detail.cohort||'Cohort not recorded'}</span></div><div className="talent-detail-field"><small>Latest project</small><strong>{detail.latest?.name||'Unavailable'}</strong><span>{detail.latest?.status|| (detail.profile===undefined?'Loading…':'No project data')}</span></div><div className="talent-detail-field"><small>Supervisor</small><strong>{detail.profile?.student?.supervisors.map(s=>s.full_name).join(', ')||'Not recorded'}</strong></div><div className="talent-detail-field"><small>Time in program</small><strong>{detail.start?`${Math.max(0,Math.floor((Date.now()-Date.parse(detail.start.board.added_at!))/86400000))} days`:'Unavailable'}</strong><span>{detail.start?`Since ${new Date(detail.start.board.added_at!).toLocaleDateString('en-GB')}`:'No dated board assignment'}</span>{detail.start&&<span>Started with {detail.start.project||detail.start.board.name} · {detail.start.board.supervisor.full_name}</span>}</div><Link to={localStorage.getItem("role")==="supervisor"?`/profile/${detail.id}`:`/admin/users/${detail.id}/profile`}>Profile <ArrowUpRight size={15}/></Link></div>:<div className="talent-map-hint">Hover, focus, or select an avatar to explore their journey.</div>}
 <footer>Module placement uses the furthest recognized project in Reboot history. Specialization requires a passed 0-shell result. Time in the program begins with the earliest recorded board assignment; it is elapsed time, not active work time.</footer></section>;
}
