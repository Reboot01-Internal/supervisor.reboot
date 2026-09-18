import { useEffect, useState } from 'react';
import { Code2, Clock3, CircleCheck, CircleX, CircleHelp } from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { ProjectMembership } from './ProfileProjects';
import { latestProject } from '../lib/latestProject';
import './LatestProject.css';

type ProjectState = ProjectMembership[] | null;
export function useAssignedLatestProjects(ids: number[], enabled: boolean) {
  const key = enabled ? [...new Set(ids)].sort((a, b) => a - b).join(',') : '';
  const [result, setResult] = useState<Record<number, ProjectState>>({});
  useEffect(() => {
    const controller = new AbortController();
    setResult({});
    const pending = key ? key.split(',').map(Number) : [];
    async function worker() {
      while (pending.length && !controller.signal.aborted) {
        const id = pending.shift()!;
        let projects: ProjectState = null;
        try {
          const profile = await apiFetch(`/admin/profile/summary?user_id=${id}&reboot_details=1`, { signal: controller.signal });
          projects = profile.user?.reboot_details?.projects ?? null;
        } catch { /* Keep unavailable distinct from an empty project history. */ }
        if (!controller.signal.aborted) setResult(previous => ({ ...previous, [id]: projects }));
      }
    }
    void worker();
    void worker();
    return () => controller.abort();
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
