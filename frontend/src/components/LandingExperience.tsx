import rebootPhoto from "../reboot.JPG";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
// Curated public team, independent of workspace accounts.
export const landingTeam = [{"name": "Fatima Almoathen", "username": "falmoath", "photo": "/team/falmoath.png"}, {"name": "Abdelrahman Ahmed", "username": "abdeahmed", "photo": "/team/abdeahmed.png"}, {"name": "Ahmed Aburowais", "username": "aaburowai", "photo": "/team/aaburowai.png"}, {"name": "Ali AbdulHussain", "username": "aabdulhu", "photo": "/team/aabdulhu.png"}, {"name": "Anwar Alghanem", "username": "aalghanem", "photo": "/team/aalghanem.jpeg"}, {"name": "Hamza Albasara", "username": "haalbasara", "photo": "/team/haalbasara.png"}, {"name": "Mohamed Ahmed", "username": "mohamedahmed0", "photo": "/team/mohamedahmed0.jpeg"}, {"name": "Reem Alhalwachi", "username": "ralhalwa", "photo": "/reem-creator.jpg"}, {"name": "Sarah Albahrani", "username": "salbahran", "photo": "/team/salbahran.jpeg"}, {"name": "Husain Fadhel", "username": "hufadhel", "photo": "/team/hufadhel.png"}];
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
 <div className="team-gallery"><div className={`team-spotlight ${selected===0?'is-head':''}`}>
 <div className="spotlight-top"><span>{selected===0?'✦ TEAM LEAD':'REBOOT / SUPERVISORS'}</span><span>{String(selected+1).padStart(2,'0')} / {landingTeam.length}</span></div>
 <div className="spotlight-photo" key={person.username}><img src={person.photo} alt={person.name}/></div>
 <div className="spotlight-caption" aria-live="polite"><span>{selected===0?'Leading with purpose':selected===7?'Building with the community':'Growing together'}</span><h3>{person.name}</h3><p>{selected===0?'Head of supervisors':selected===7?'Supervisor & TaskFlow creator':'Supervisor'}</p></div>
 <div className="spotlight-navigation"><button aria-label="Previous supervisor" onClick={()=>setSelected((selected+landingTeam.length-1)%landingTeam.length)}><ArrowRight size={19} style={{transform:'rotate(180deg)'}}/></button><div className="collective-position"><span>THE REBOOT COLLECTIVE</span><div aria-hidden="true">{landingTeam.map((member,i)=><i key={member.username} className={selected===i?'active':''}/>)}</div></div><button aria-label="Next supervisor" onClick={()=>setSelected((selected+1)%landingTeam.length)}><ArrowRight size={19}/></button></div></div>
 <div className="team-contact-sheet"><div className="contact-sheet-label"><span>OUR CIRCLE OF PEOPLE.</span><span>PICK YOUR CONNECTION ↙</span></div><div className="team-portrait-grid team-constellation"><div className="team-orbit-center" aria-hidden="true"><span>{'{ }'}</span><strong>Better<br/>together.</strong><small>REBOOT × TASKFLOW</small></div>{landingTeam.map((member,i)=><button type="button" key={member.username} className={`team-tile ${selected===i?'is-selected':''}`} style={{left:`${50+38*Math.cos((i*36-90)*Math.PI/180)}%`,top:`${48+39*Math.sin((i*36-90)*Math.PI/180)}%`}} aria-pressed={selected===i} onClick={()=>setSelected(i)}><div className="team-tile-photo"><img src={member.photo} alt="" loading="lazy"/><span>{i===0?'✦ HEAD':String(i+1).padStart(2,'0')}</span></div><strong>{member.name}</strong><small>{i===0?'Head of supervisors':i===7?'Supervisor · Creator':'Supervisor'}</small></button>)}</div><p className="team-gallery-note">A little guidance. A shared ambition.<br/><em>A whole community moving forward.</em></p></div></div></section>
}
