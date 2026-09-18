import { Flag, ArrowRight, MapPin } from 'lucide-react';
import type { ProjectMembership } from './ProfileProjects';
import { programStart, type JourneyBoard } from '../lib/programJourney';
import LatestProject from './LatestProject';
import './ProgramJourney.css';

export default function ProgramJourney({boards, projects, loading}: {boards: JourneyBoard[]; projects?: ProjectMembership[]; loading: boolean}) {
  const start = programStart(boards, projects);
  return <section className="program-journey" aria-labelledby="program-journey-title">
    <header><span>THE SUPERVISION JOURNEY</span><h2 id="program-journey-title">From the first step to now.</h2><p>Your starting point in the supervisor program, alongside your latest project activity.</p></header>
    <div className="program-journey-track">
      <div className="program-journey-stop"><span className="program-journey-marker"><Flag size={17}/></span><span className="program-journey-label">WHERE IT STARTED</span><h3>{start?.project || (start ? 'First recorded board' : 'Starting point unavailable')}</h3>{start ? <><span className="program-journey-date">{new Date(start.board.added_at!).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Bahrain'})}</span><p>With {start.board.supervisor.full_name}</p><span className="program-journey-board" title={start.board.name}>{start.board.name}</span></> : <p>No dated board assignment is available yet.</p>}</div>
      <div className="program-journey-connector" aria-hidden="true"><span/><ArrowRight size={20}/></div>
      <div className="program-journey-stop program-journey-now"><span className="program-journey-marker"><MapPin size={17}/></span><span className="program-journey-label">WHERE THEY ARE NOW</span><LatestProject projects={projects ?? (loading ? undefined : null)}/><p>Most recently updated project on Reboot.</p></div>
    </div>
    <footer>Starting point is based on the earliest recorded board assignment and its project name.</footer>
  </section>;
}
