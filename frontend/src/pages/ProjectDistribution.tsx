import { useEffect, useState } from 'react';
import { ChevronDown, ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { fetchRebootAvatars } from '../lib/rebootAvatars';
import UserAvatar from '../components/UserAvatar';
const modules: Record<string,string[]> = {
 Go: ['go-reloaded','ascii-art','ascii-art-web','groupie-tracker','lem-in','forum'],
 JavaScript: ['make-your-game','real-time-forum','graphql','social-network','mini-framework','bomberman-dom'],
 Rust: ['smart-road','filler','rt','localhost','multiplayer-fps','0-shell'],
};
const projects = Object.values(modules).flat().sort((a,b)=>b.length-a.length);
type Board = {id:number;name:string;supervisor_name:string};
type User = {role:string;cohort?:string;assigned_boards?:string[]};
type Member = {user_id:number;full_name:string;nickname?:string;role:string;cohort?:string};
function BoardPeople({board,avatars}:{board:Board;avatars:Record<string,string>}) {
 const [photos,setPhotos]=useState<Record<string,string>>({});
 const [members,setMembers]=useState<Member[]|null>(null),[error,setError]=useState(false);
 useEffect(()=>{let alive=true;apiFetch(`/admin/board-members?board_id=${board.id}`).then(r=>{if(alive)setMembers(Array.isArray(r)?r:[]);}).catch(()=>{if(alive)setError(true);});return()=>{alive=false;};},[board.id]);
 useEffect(()=>{let alive=true;if(members)fetchRebootAvatars(members.map(m=>m.nickname||'').filter(Boolean)).then(p=>{if(alive)setPhotos(p);}).catch(()=>{});return()=>{alive=false;};},[members]);
 return <article className="project-board"><Link to={`/admin/boards/${board.id}`}><strong>{board.name}</strong><ArrowUpRight size={16}/></Link><p>Supervisor · {board.supervisor_name||'Unassigned'}</p><div className="project-members">{error?<p>Members could not load. Reopen this project to retry.</p>:members===null?<p role="status">Loading members…</p>:members.length?members.map(m=><div key={m.user_id}><UserAvatar src={photos[m.nickname?.toLowerCase()||'']||avatars[m.nickname?.toLowerCase()||'']} alt={m.full_name} fallback={m.full_name.slice(0,2)} sizeClass="h-8 w-8"/><span>{m.full_name}<small>{m.role==='student'?'Talent':m.role}{m.cohort?` · ${m.cohort}`:''}</small></span></div>):<p>No members assigned.</p>}</div></article>;
}
export default function ProjectDistribution({boards,users,avatars,loading,error}:{boards:Board[];users:User[];avatars:Record<string,string>;loading:boolean;error:string}) {
 const [cohort,setCohort]=useState('all'),[module,setModule]=useState('all'),[project,setProject]=useState('all'),[expanded,setExpanded]=useState<string|null>(null);
 const cohorts=[...new Set(users.filter(u=>u.role==='student').map(u=>u.cohort).filter((c):c is string=>Boolean(c)))].sort();
 const cohortBoards=cohort==='all'?boards:boards.filter(b=>users.some(u=>u.role==='student'&&u.cohort===cohort&&u.assigned_boards?.includes(b.name)));
 const grouped=new Map<string,Board[]>();
 for(const b of cohortBoards){const p=projects.find(p=>`-${b.name.toLowerCase()}-`.includes(`-${p}-`))||'Unclassified';if(module!=='all'&&!modules[module]?.includes(p))continue;grouped.set(p,[...(grouped.get(p)||[]),b]);}
 const options=[...grouped.keys()].sort();
 const rows=[...grouped].filter(([p])=>project==='all'||p===project).sort((a,b)=>b[1].length-a[1].length||a[0].localeCompare(b[0]));
 const max=Math.max(1,...rows.map(([,b])=>b.length));
 return <section className="insight-distribution"><header><div><span>PROJECT DISTRIBUTION</span><h2>Where the work is</h2><p>Select a project to explore its boards, people, and supervisors.</p></div></header><div className="project-filters"><label>Cohort<select value={cohort} onChange={e=>{setCohort(e.target.value);setProject('all');setExpanded(null);}}><option value="all">All cohorts</option>{cohorts.map(c=><option key={c}>{c}</option>)}</select></label><label>Module<select value={module} onChange={e=>{setModule(e.target.value);setProject('all');setExpanded(null);}}><option value="all">All modules</option>{Object.keys(modules).map(m=><option key={m}>{m}</option>)}</select></label><label>Project<select value={project} onChange={e=>{setProject(e.target.value);setExpanded(null);}}><option value="all">All projects</option>{options.map(p=><option key={p}>{p}</option>)}</select></label></div><p className="project-count">{rows.reduce((n,[,b])=>n+b.length,0)} boards · {rows.length} projects · Cohorts based on talents only · Projects identified from board names</p>
 {loading||error?<p role="status">{error||'Loading project distribution…'}</p>:!rows.length?<p>No boards match these filters.</p>:<div className="project-chart">{rows.map(([p,items])=><div key={p}><button className="project-bar" aria-expanded={expanded===p} onClick={()=>setExpanded(expanded===p?null:p)} aria-label={`${p}, ${items.length} boards. ${expanded===p?'Hide':'Show'} members and supervisors`}><span>{p}</span><span className="project-track"><i style={{width:`${items.length/max*100}%`}}/></span><strong>{items.length}</strong><ChevronDown size={16}/></button>{expanded===p&&<div className="project-detail">{items.map(b=><BoardPeople key={b.id} board={b} avatars={avatars}/>)}</div>}</div>)}</div>}</section>;
}
