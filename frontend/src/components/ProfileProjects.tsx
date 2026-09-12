import { useState } from 'react';
import { Code2, Clock3, CircleCheck, CircleX, LoaderCircle, CircleHelp, Search, X } from 'lucide-react';
import './ProfileProjects.css';
export type ProjectMembership = {group:{id:number;status:string;path:string;updatedAt:string;object:{name:string;type:string};progresses:{grade:number|null;isDone:boolean}[]}};
function statusOf(g:ProjectMembership['group']) {
 const status=g.status.toLowerCase(),progress=g.progresses?.[0];
 if(status==='finished'&&progress?.grade!=null) return progress.grade>=1?'passed':'failed';
 if(status==='audit')return 'audit';
 if(status==='working')return 'working';
 return status;
}
const display:Record<string,{label:string;icon:typeof Code2}>={working:{label:'Working on it',icon:Code2},audit:{label:'In audit',icon:Clock3},passed:{label:'Passed',icon:CircleCheck},failed:{label:'Failed',icon:CircleX},finished:{label:'Finished · result unavailable',icon:CircleHelp},setup:{label:'Setting up',icon:LoaderCircle}};
export default function ProfileProjects({projects}:{projects?:ProjectMembership[]}) {
 const [tab,setTab]=useState('current');
 const [query,setQuery]=useState('');
 const normalize=(value:string)=>value.toLowerCase().replace(/[-_\s]+/g,' ').trim();
 const search=normalize(query);
 const unique=[...new Map((projects||[]).filter(p=>p.group?.object?.type==='project').map(p=>[p.group.id,p.group])).values()];
 const current=unique.filter(g=>!['finished','canceled','cancelled'].includes(g.status.toLowerCase()));
 const rows=(search?unique:tab==='current'?current:unique).filter(g=>!search||normalize(g.object.name+' '+g.path).includes(search));
 return <section className="profile-projects"><header><div><span className="profile-project-eyebrow">REBOOT PROGRESS</span><h2><Code2 size={21}/> Projects</h2><p>Current work and results from Reboot.</p></div><div className="profile-project-tabs"><button aria-pressed={tab==='current'} onClick={()=>setTab('current')}>Current · {current.length}</button><button aria-pressed={tab==='all'} onClick={()=>setTab('all')}>All projects · {unique.length}</button></div></header><label className="profile-project-search"><Search size={17}/><input type="search" aria-label="Search all profile projects" placeholder="Search a project…" value={query} onChange={e=>setQuery(e.target.value)}/>{query&&<button type="button" aria-label="Clear project search" onClick={()=>setQuery('')}><X size={16}/></button>}</label>{search&&projects&&<p className="profile-project-search-note" role="status">{rows.length} matching {rows.length===1?'record':'records'} across current and past projects</p>}{!projects?<p>Project data is currently unavailable.</p>:!rows.length?<p>{search?'No matching project record found in Reboot for this profile.':tab==='current'?'No current projects recorded in Reboot.':'No projects recorded in Reboot.'}</p>:<div className="profile-project-list">{rows.map(g=>{const status=statusOf(g),meta=display[status]||{label:g.status,icon:CircleHelp},Icon=meta.icon;return <article key={g.id}><div className="profile-project-symbol"><Code2 size={20}/></div><div><strong>{g.object.name}</strong><small>{g.path.replace('/bahrain/bh-module/','')}</small></div><span className="profile-project-status" data-status={status}><Icon size={15}/>{meta.label}</span></article>;})}</div>}</section>;
}
