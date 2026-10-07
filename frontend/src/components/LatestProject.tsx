import { useEffect, useState } from 'react';
import { Code2, Clock3, CircleCheck, CircleX, CircleHelp } from 'lucide-react';
import { peekProfileCache } from '../lib/profileCache';
import { apiFetch, API_URL } from '../lib/api';
import type { ProjectMembership } from './ProfileProjects';
import { latestProject } from '../lib/latestProject';
import './LatestProject.css';

type ProjectState = ProjectMembership[] | null;
export function useAssignedLatestProjects(ids: number[], enabled: boolean) {
  const key = enabled ? [...new Set(ids)].sort((a, b) => a - b).join(',') : '';
  const [result, setResult] = useState<Record<number, ProjectState>>({});
  useEffect(() => {
    let active = true;
    const ids = key ? key.split(',').map(Number) : [];
    const cached: Record<number, ProjectState> = {};
    for (const id of ids) {
      const value = peekProfileCache<{user?:{reboot_details?:{projects?:ProjectMembership[]}}}>(`${API_URL}/admin/profile/summary?user_id=${id}&reboot_details=1`)?.value;
      if (value?.user?.reboot_details?.projects) cached[id] = value.user.reboot_details.projects;
    }
    setResult(cached);
    function load(force = false) {
      for (const id of ids) {
        void apiFetch(`/admin/profile/summary?user_id=${id}&reboot_details=1`, {}, force).then(profile => {
          if (active) setResult(previous => ({ ...previous, [id]: profile.user?.reboot_details?.projects ?? previous[id] ?? null }));
        }).catch(() => { if (active) setResult(previous => ({ ...previous, [id]: previous[id] ?? null })); });
      }
    }
    const sync = (event: Event) => load((event as CustomEvent<{force:boolean}>).detail?.force ?? false);
    load();
    window.addEventListener('profile:sync', sync);
    return () => { active = false; window.removeEventListener('profile:sync', sync); };
  }, [key]);
  return result;
}
const statuses = {
  working: { label: 'Working on it', Icon: Code2 },
  audit: { label: 'In audit', Icon: Clock3 },
  passed: { label: 'Passed', Icon: CircleCheck },
  failed: { label: 'Failed', Icon: CircleX },
  finished: { label: 'Finished · result unavailable', Icon: CircleHelp },
  setup: { label: 'Setting up', Icon: Clock3 },
  canceled: { label: 'Cancelled', Icon: CircleX },
  cancelled: { label: 'Cancelled', Icon: CircleX },
};
export default function LatestProject({ projects }: { projects: ProjectState | undefined }) {
  const project = projects ? latestProject(projects) : null;
  const meta = project && (statuses[project.status as keyof typeof statuses] || { label: project.status || 'Unavailable', Icon: CircleHelp });
  return <div className="talent-latest-project">
    <span className="talent-latest-label"><Code2 size={12} aria-hidden="true"/> Latest project</span>
    {project && meta ? <div className="talent-latest-detail"><strong title={project.name}>{project.name}</strong><span data-status={project.status}><meta.Icon size={12} aria-hidden="true"/>{meta.label}</span></div> : <span className="talent-latest-empty">{projects === undefined ? 'Loading project…' : projects === null ? 'Project unavailable' : 'No project yet'}</span>}
  </div>;
}
