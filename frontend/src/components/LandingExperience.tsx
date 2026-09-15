import rebootPhoto from "../reboot.JPG";
import { useState, useEffect, useRef } from "react";
import "./TeamShowcase.css";
import { ArrowRight } from "lucide-react";
// Curated public team, independent of workspace accounts.
export const landingTeam = [
  {
    "name": "Fatima Almoathen",
    "username": "falmoath",
    "photo": "/team/falmoath.png",
    "role": "Head of supervisors",
    "group": "head"
  },
  {
    "name": "Yaman Al Masri",
    "username": "yalmasri",
    "role": "Tech Lead",
    "photo": "/team/yalmasri.jpg",
    "group": "tech"
  },
  {
    "name": "Ahmed Al Jamal",
    "username": "aaljamal",
    "role": "Tech Mentor",
    "photo": "/team/aaljamal.jpg",
    "group": "tech"
  },
  {
    "name": "Ahmed Abdeen",
    "username": "aabdeen",
    "role": "Tech Mentor",
    "photo": "/team/aabdeen.jpg",
    "group": "tech"
  },
  {
    "name": "Reem Alhalwachi",
    "username": "ralhalwa",
    "photo": "/reem-creator.jpg",
    "role": "Tech Mentor \u00b7 TaskFlow Creator",
    "group": "tech"
  },
  {
    "name": "Abdelrahman Ahmed",
    "username": "abdeahmed",
    "photo": "/team/abdeahmed.png",
    "role": "Supervisor",
    "group": "supervisor"
  },
  {
    "name": "Ahmed Aburowais",
    "username": "aaburowai",
    "photo": "/team/aaburowai.png",
    "role": "Supervisor",
    "group": "supervisor"
  },
  {
    "name": "Ali AbdulHussain",
    "username": "aabdulhu",
    "photo": "/team/aabdulhu.png",
    "role": "Supervisor",
    "group": "supervisor"
  },
  {
    "name": "Anwar Alghanem",
    "username": "aalghanem",
    "photo": "/team/aalghanem.jpeg",
    "role": "Supervisor",
    "group": "supervisor"
  },
  {
    "name": "Hamza Albasara",
    "username": "haalbasara",
    "photo": "/team/haalbasara.png",
    "role": "Supervisor",
    "group": "supervisor"
  },
  {
    "name": "Mohamed Ahmed",
    "username": "mohamedahmed0",
    "photo": "/team/mohamedahmed0.jpeg",
    "role": "Supervisor",
    "group": "supervisor"
  },
  {
    "name": "Sarah Albahrani",
    "username": "salbahran",
    "photo": "/team/salbahran.jpeg",
    "role": "Supervisor",
    "group": "supervisor"
  },
  {
    "name": "Husain Fadhel",
    "username": "hufadhel",
    "photo": "/team/hufadhel.png",
    "role": "Supervisor",
    "group": "supervisor"
  }
];
export function ProjectExperience(){
 return <figure className="reboot-hero-photo">
 <div className="reboot-photo-halo" aria-hidden="true"/>
 <span className="reboot-photo-symbol photo-code" aria-hidden="true">{'</>'}</span>
 <div className="reboot-photo-frame"><img src={rebootPhoto} alt="Reboot community members working together around a laptop" fetchPriority="high"/></div>
 <figcaption><span>REBOOT × TASKFLOW</span><strong>Learning happens together.</strong></figcaption>
 <span className="reboot-photo-symbol photo-star" aria-hidden="true">{'</>'}</span>
 </figure>
}
export function SupervisorTeam(){
 const [selected,setSelected]=useState(0);
 const root=useRef<HTMLElement>(null);
 const person=landingTeam[selected];
 const select=(index:number)=>setSelected((index+landingTeam.length)%landingTeam.length);
 useEffect(()=>{
  let frame=0;
  const update=()=>{
   frame=0;if(!root.current)return;
   const rect=root.current.getBoundingClientRect();
   const progress=Math.max(0,Math.min(1,(window.innerHeight-rect.top)/(window.innerHeight*.8)));
   root.current.style.setProperty('--team-enter',String(progress));
  };
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(update)};
  window.addEventListener('scroll',schedule,{passive:true});window.addEventListener('resize',schedule);update();
  return()=>{cancelAnimationFrame(frame);window.removeEventListener('scroll',schedule);window.removeEventListener('resize',schedule)};
 },[]);
 return <section ref={root} id="team" className="team-showcase" aria-labelledby="team-title">
  <header className="team-showcase-heading"><span className="landing-eyebrow">03 / THE PEOPLE BEHIND THE PROGRESS</span><h2 id="team-title">Big on ideas.<br/><em>Bigger on people.</em></h2><p>No one builds alone. Meet the supervisors and tech team helping the Reboot community find its next step.</p></header>
  <div className="team-stage">
   <div className="team-stage-type" aria-hidden="true">TOGETHER.</div>
   <div className="team-feature" aria-live="polite" aria-atomic="true">
    <span className="team-feature-index">THE REBOOT COLLECTIVE <b>{String(selected+1).padStart(2,'0')} / {landingTeam.length}</b></span>
    <div key={person.username} className="team-feature-copy"><span className="team-feature-group">{person.group==='head'?'LEADERSHIP':person.group==='tech'?'TECH TEAM':'SUPERVISORS'}</span><h3>{person.name}</h3><p>{person.role}</p></div>
    <div className="team-stage-controls"><button type="button" aria-label="Previous team member" onClick={()=>select(selected-1)}><ArrowRight size={20} style={{transform:'rotate(180deg)'}}/></button><span>Find your people</span><button type="button" aria-label="Next team member" onClick={()=>select(selected+1)}><ArrowRight size={20}/></button></div>
   </div>
   <div className="team-portrait-stage">
    <div className="team-orbit-line" aria-hidden="true"/><span className="team-portrait-brace" aria-hidden="true">{'{ }'}</span>
    <button type="button" className="team-wing wing-left" onClick={()=>select(selected-1)} aria-label={`Meet ${landingTeam[(selected+landingTeam.length-1)%landingTeam.length].name}`}><img src={landingTeam[(selected+landingTeam.length-1)%landingTeam.length].photo} alt=""/><span>PREVIOUS ↖</span></button>
    <figure className="team-feature-portrait" key={person.username}><img src={person.photo} alt={person.name}/><figcaption><span>{person.role}</span><b>{String(selected+1).padStart(2,'0')}</b></figcaption></figure>
    <button type="button" className="team-wing wing-right" onClick={()=>select(selected+1)} aria-label={`Meet ${landingTeam[(selected+1)%landingTeam.length].name}`}><img src={landingTeam[(selected+1)%landingTeam.length].photo} alt=""/><span>NEXT ↗</span></button>
   </div>
  </div>
  <div className="team-roster-heading"><span>DIFFERENT STRENGTHS. ONE TEAM.</span><span>CHOOSE A FACE. MEET YOUR TEAM. ↙</span></div>
  <div className="team-roster" aria-label="Choose a team member">{landingTeam.map((member,i)=><button type="button" key={member.username} className={selected===i?'selected':''} aria-pressed={selected===i} onClick={()=>select(i)} onKeyDown={event=>{if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();const next=(i+(event.key==='ArrowRight'?1:-1)+landingTeam.length)%landingTeam.length;select(next);const buttons=event.currentTarget.parentElement?.querySelectorAll('button');buttons?.[next]?.focus();}}}><span className="roster-photo"><img src={member.photo} alt="" loading="lazy"/><span>{String(i+1).padStart(2,'0')}</span></span><strong>{member.name}</strong><small>{member.role}</small></button>)}</div>
 </section>
}
