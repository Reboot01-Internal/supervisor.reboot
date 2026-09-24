import { useEffect, useMemo, useState } from 'react';
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
export default function TalentJourneyMap({revision}:{revision:number}) {
 const [talents,setTalents]=useState<Talent[]>([]),[profiles,setProfiles]=useState<Record<number,Profile|null>>({}),[avatars,setAvatars]=useState<Record<string,string>>({});
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[query,setQuery]=useState(''),[module,setModule]=useState('all'),[supervisor,setSupervisor]=useState('all'),[cohort,setCohort]=useState('all'),[selected,setSelected]=useState<number|null>(null);
 useEffect(()=>{const controller=new AbortController();const signal=controller.signal;setLoading(true);setError('');setProfiles({});setTalents([]);
 (async()=>{try{const users=await apiFetch('/admin/users?include_inactive=1&role=student',{signal});if(signal.aborted)return;setTalents(users);
 void fetchRebootAvatars(users.map((u:Talent)=>u.nickname).filter(Boolean)).then(a=>{if(!signal.aborted)setAvatars(a);}).catch(()=>{});
 let cursor=0;await Promise.all(Array.from({length:3},async()=>{while(cursor<users.length&&!signal.aborted){const u=users[cursor++];let profile:Profile|null=null;try{profile=await apiFetch(`/admin/profile/summary?user_id=${u.id}&reboot_details=1`,{signal});}catch{/* Unavailable stays distinct. */}if(!signal.aborted)setProfiles(p=>({...p,[u.id]:profile}));}}));
 }catch{if(!signal.aborted)setError('Could not load the talent journey. Use Refresh to try again.');}finally{if(!signal.aborted)setLoading(false);}})();return()=>controller.abort();},[revision]);
 const rows=useMemo(()=>talents.map(t=>{const p=profiles[t.id];const projects=p?.user?.reboot_details?.projects;return {...t,profile:p,projects,stage:placement(projects),latest:projects?latestProject(projects):null,start:programStart(p?.student?.boards||[],projects)};}),[talents,profiles]);
 const supervisors=[...new Map(rows.flatMap(r=>r.profile?.student?.supervisors||[]).map(s=>[s.id,s])).values()].sort((a,b)=>a.full_name.localeCompare(b.full_name));
 const visible=rows.filter(r=>(r.full_name+' '+r.nickname+' '+(r.latest?.name||'')).toLowerCase().includes(query.toLowerCase())&&(module==='all'||r.stage===module)&&(cohort==='all'||r.cohort===cohort)&&(supervisor==='all'||r.profile?.student?.supervisors.some(s=>String(s.id)===supervisor)));
 const detail=rows.find(r=>r.id===selected);
 function details(r:typeof rows[number]) {const start=r.start?.board.added_at;return `${r.full_name} · ${r.latest?.name||'Project unavailable'}\nSupervisor: ${r.profile?.student?.supervisors.map(s=>s.full_name).join(', ')||'Not recorded'}\n${start?`Started ${new Date(start).toLocaleDateString('en-GB')} · ${Math.max(0,Math.floor((Date.now()-Date.parse(start))/86400000))} days in program`:'Start date unavailable'}`;}
 return <section className="talent-map"><header><div><span className="talent-map-eyebrow">THE TALENT JOURNEY</span><h2>Every talent. Their next chapter.</h2><p>Explore the path from foundations to specialization.</p></div><span className="talent-map-milestone"><Sparkles size={17}/><strong>{loading?'…':rows.filter(r=>r.stage==='specialization').length}</strong> reached specialization</span></header>
 <div className="talent-map-filters"><label className="talent-map-search"><Search size={16}/><input aria-label="Search talent or project" placeholder="Find a talent or project…" value={query} onChange={e=>setQuery(e.target.value)}/></label><select aria-label="Filter journey by module" value={module} onChange={e=>setModule(e.target.value)}><option value="all">All modules</option>{modules.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select><select aria-label="Filter journey by supervisor" value={supervisor} onChange={e=>setSupervisor(e.target.value)}><option value="all">All supervisors</option>{supervisors.map(s=><option key={s.id} value={s.id}>{s.full_name}</option>)}</select><select aria-label="Filter journey by cohort" value={cohort} onChange={e=>setCohort(e.target.value)}><option value="all">All cohorts</option>{[...new Set(talents.map(t=>t.cohort).filter(Boolean))].sort().map(c=><option key={c}>{c}</option>)}</select>{(query||module!=='all'||supervisor!=='all'||cohort!=='all')&&<button onClick={()=>{setQuery('');setModule('all');setSupervisor('all');setCohort('all');}}>Reset</button>}</div>
 <div className="talent-map-status" role="status">{error||`${visible.length} talents shown${loading?` · Loading progress ${Object.keys(profiles).length}/${talents.length}…`:''}`}</div>
 <div className="talent-map-scroll"><div className="talent-map-path">{modules.filter(m=>m.id!=='unknown').map((m,index)=><div className="talent-map-stage" data-module={m.id} key={m.id}><div className="talent-map-stop"><span>{m.id==='specialization'?<Sparkles size={19}/>:<i style={{maskImage:`url(/languages/${m.id}.svg)`}}/>}</span><small>0{index+1}</small><h3>{m.name}</h3><b>{visible.filter(r=>r.stage===m.id).length}</b></div><div className="talent-map-avatars">{visible.filter(r=>r.stage===m.id).map(r=><button key={r.id} className="talent-map-person" title={details(r)} onMouseEnter={()=>setSelected(r.id)} onFocus={()=>setSelected(r.id)} onClick={()=>setSelected(r.id)} aria-pressed={selected===r.id}><UserAvatar src={avatars[r.nickname?.toLowerCase()]} alt={r.full_name} fallback={r.full_name.slice(0,2)} sizeClass="h-11 w-11"/><span>{r.full_name}</span><small>{r.latest?.name||'Project unavailable'}</small></button>)}{!visible.some(r=>r.stage===m.id)&&<p className="talent-map-empty">No loaded matches</p>}</div></div>)}</div></div>
 {visible.some(r=>r.stage==='unknown')&&<div className="talent-map-unplaced"><strong>Not yet placed</strong><span>No verified module result yet</span><div>{visible.filter(r=>r.stage==='unknown').map(r=><button key={r.id} title={details(r)} onMouseEnter={()=>setSelected(r.id)} onFocus={()=>setSelected(r.id)} onClick={()=>setSelected(r.id)}><UserAvatar src={avatars[r.nickname?.toLowerCase()]} alt={r.full_name} fallback={r.full_name.slice(0,2)} sizeClass="h-8 w-8"/>{r.full_name}</button>)}</div></div>}
 {detail?<div className="talent-map-detail" role="region" aria-label="Selected talent details"><UserAvatar src={avatars[detail.nickname?.toLowerCase()]} alt={detail.full_name} fallback={detail.full_name.slice(0,2)} sizeClass="h-12 w-12"/><div className="talent-detail-field"><strong>{detail.full_name}</strong><span>{modules.find(m=>m.id===detail.stage)?.name} · {detail.cohort||'Cohort not recorded'}</span></div><div className="talent-detail-field"><small>Latest project</small><strong>{detail.latest?.name||'Unavailable'}</strong><span>{detail.latest?.status|| (detail.profile===undefined?'Loading…':'No project data')}</span></div><div className="talent-detail-field"><small>Supervisor</small><strong>{detail.profile?.student?.supervisors.map(s=>s.full_name).join(', ')||'Not recorded'}</strong></div><div className="talent-detail-field"><small>Time in program</small><strong>{detail.start?`${Math.max(0,Math.floor((Date.now()-Date.parse(detail.start.board.added_at!))/86400000))} days`:'Unavailable'}</strong><span>{detail.start?`Since ${new Date(detail.start.board.added_at!).toLocaleDateString('en-GB')}`:'No dated board assignment'}</span>{detail.start&&<span>Started with {detail.start.project||detail.start.board.name} · {detail.start.board.supervisor.full_name}</span>}</div><Link to={`/admin/users/${detail.id}/profile`}>Profile <ArrowUpRight size={15}/></Link></div>:<div className="talent-map-hint">Hover, focus, or select an avatar to explore their journey.</div>}
 <footer>Module placement uses the furthest recognized project in Reboot history. Specialization requires a passed 0-shell result. Time in the program begins with the earliest recorded board assignment; it is elapsed time, not active work time.</footer></section>;
}
