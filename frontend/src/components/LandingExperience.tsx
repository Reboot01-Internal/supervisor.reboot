import rebootPhoto from "../reboot.JPG";
import { useState } from "react";
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
 const person=landingTeam[selected];
 return <section id="team" className="landing-team reveal-section">
 <div className="team-gallery-heading"><div><span className="landing-eyebrow">03 / THE PEOPLE BEHIND THE PROGRESS</span><h2>Different strengths.<br/><em>One team.</em></h2></div><p>Meet the people helping our community move forward. Pick a portrait. Get to know the team.</p></div>
 <div className="team-gallery team-reel"><div className={`team-spotlight ${person.group==='head'?'is-head':''} ${person.group==='tech'?'is-tech':''}`}>
 <div className="spotlight-top"><span>{person.group==='head'?'HEAD OF SUPERVISORS':person.group==='tech'?'REBOOT / TECH TEAM':'REBOOT / SUPERVISORS'}</span><span>{String(selected+1).padStart(2,'0')} / {landingTeam.length}</span></div>
 <div className="spotlight-photo" key={person.username}><img src={person.photo} alt={person.name}/></div>
 <div className="spotlight-caption" aria-live="polite"><span>{selected===0?'Leading with purpose':person.username==='ralhalwa'?'Building with the community':'Growing together'}</span><h3>{person.name}</h3><p>{person.role}</p></div>
 <div className="spotlight-navigation"><button aria-label="Previous supervisor" onClick={()=>setSelected((selected+landingTeam.length-1)%landingTeam.length)}><ArrowRight size={19} style={{transform:'rotate(180deg)'}}/></button><div className="collective-position"><span>THE REBOOT COLLECTIVE</span><div aria-hidden="true">{landingTeam.map((member,i)=><i key={member.username} className={selected===i?'active':''}/>)}</div></div><button aria-label="Next supervisor" onClick={()=>setSelected((selected+1)%landingTeam.length)}><ArrowRight size={19}/></button></div></div>
 <div className="team-contact-sheet"><div className="contact-sheet-label"><span>THE PEOPLE BEHIND YOUR PROGRESS.</span><span>SCROLL TO EXPLORE →</span></div><div className="team-portrait-grid team-filmstrip">{landingTeam.map((member,i)=><button type="button" key={member.username} className={`team-tile team-group-${member.group} ${selected===i?'is-selected':''}`} aria-pressed={selected===i} onClick={()=>setSelected(i)}><div className="team-tile-photo"><img src={member.photo} alt="" loading="lazy"/><span>{member.group==='head'?'HEAD':member.group==='tech'?'TECH TEAM':'SUPERVISOR'}</span></div><strong>{member.name}</strong><small>{member.role}</small></button>)}</div><p className="team-gallery-note">A little guidance. A shared ambition.<br/><em>A whole community moving forward.</em></p></div></div></section>
}
