import type { ProjectMembership } from '../components/ProfileProjects';
export type JourneyBoard = { id: number; name: string; added_at?: string; supervisor: { nickname: string; full_name: string } };
const catalog = ['go-reloaded','ascii-art','ascii-art-web','groupie-tracker','lem-in','forum','make-your-game','real-time-forum','graphql','social-network','mini-framework','bomberman-dom','smart-road','filler','rt','localhost','multiplayer-fps','0-shell'];
const normalize = (value: string) => value.toLowerCase().trim().replace(/[\s_]+/g, '-');
export function programStart(boards: JourneyBoard[], projects: ProjectMembership[] = []) {
  const dated = boards.filter(board => board.added_at && Number.isFinite(Date.parse(board.added_at)));
  const first = [...dated].sort((a,b) => Date.parse(a.added_at!) - Date.parse(b.added_at!) || a.id-b.id)[0];
  if (!first) return null;
  let name = normalize(first.name);
  const prefix = normalize(first.supervisor.nickname);
  if (prefix && name.startsWith(prefix + '-')) name = name.slice(prefix.length + 1);
  const names = [...catalog, ...projects.filter(p => p.group?.object?.type === 'project' && !p.group.isPiscine).flatMap(p => [p.group.object.name, p.group.path.split('/').pop() || ''])].map(normalize).filter(Boolean).sort((a,b) => b.length-a.length);
  const match = names.find(project => name === project || (name.startsWith(project + '-') && /^\d+$/.test(name.slice(project.length+1))));
  return { board: first, project: match || null };
}
