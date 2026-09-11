import { ArrowUpRight, Code2, MessagesSquare, Flag } from 'lucide-react';

export default function WorkspacePlayground(){
 return <section id="explore" className="project-journey reveal-section">
  <div className="journey-intro"><span className="landing-eyebrow">01 / THE WAY WE BUILD</span><h2>Your project.<br/>Your pace.<br/><em>Your people.</em></h2><p>Reboot gives you the projects.<br/>TaskFlow brings the work and the people supporting you together.</p><a href="#team">Meet the supervisors <ArrowUpRight size={17}/></a><span className="journey-intro-mark" aria-hidden="true">{'{ }'}</span></div>
  <div className="journey-map">
   <div className="journey-map-label"><span>REBOOT / PROJECT JOURNEY</span><span aria-hidden="true">{'</>'}</span></div>
   <div className="journey-rail" aria-hidden="true"/>
   <article className="journey-stop"><div className="journey-node"><Code2 size={24}/></div><div><span className="journey-number">01 — GET INTO THE WORK</span><h3>A project to grow through.</h3><p>Keep your project tasks together, understand what needs doing, and make the next step clear.</p><div className="journey-code" aria-hidden="true"><span>project</span><b> / </b>tasks<b> / </b>next_step<span className="journey-cursor">_</span></div></div></article>
   <article className="journey-stop"><div className="journey-node"><MessagesSquare size={23}/></div><div><span className="journey-number">02 — FIND YOUR WAY FORWARD</span><h3>Support when it matters.</h3><p>Your supervisors help you work through challenges, stay focused, and move forward with your project.</p><div className="journey-team"><img src="/team/falmoath.png" alt=""/><img src="/reem-creator.jpg" alt=""/><img src="/team/abdeahmed.png" alt=""/><span>People behind your progress.</span></div></div></article>
   <article className="journey-stop"><div className="journey-node"><Flag size={23}/></div><div><span className="journey-number">03 — KEEP MOVING</span><h3>See the work add up.</h3><p>Follow your tasks, keep track of deadlines, and see what you have completed along the way.</p><div className="journey-finish"><span aria-hidden="true">{'</>'}</span>Every step is part of the learning.</div></div></article>
   <div className="journey-map-footer"><span>LEARN. BUILD. REPEAT.</span><span aria-hidden="true">{'</>'}</span></div>
  </div>
 </section>
}
