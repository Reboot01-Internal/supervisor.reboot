import type { ProjectMembership } from '../components/ProfileProjects';

export function latestProject(projects: ProjectMembership[]) {
  const latest = projects.map(row => row.group)
    .filter(group => group && !group.isPiscine && group.object?.type === 'project')
    .sort((a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0) || b.id - a.id)[0];
  if (!latest) return null;
  let status = latest.status.toLowerCase();
  const grade = latest.progresses?.[0]?.grade;
  if (status === 'finished' && grade != null) status = grade >= 1 ? 'passed' : 'failed';
  return { name: latest.object.name || latest.path.split('/').pop() || 'Project', status };
}
