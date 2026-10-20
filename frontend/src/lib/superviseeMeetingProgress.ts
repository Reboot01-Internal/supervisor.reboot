type Meeting = { id: number; supervisor_id: number; status: string; starts_at: string };
type Participant = { meeting_id: number; user_id: number; attendance: string };
type Supervisee = { id: number; name: string; in_piscine?:boolean; meeting_target?:number; eligible_from?:string };
const timestamp = (value: string) => Date.parse(value.includes('T') ? value : value.replace(' ', 'T') + 'Z');

export function superviseeMeetingProgress(supervisorId: number, supervisees: Supervisee[], meetings: Meeting[], participants: Participant[], start: number, end: number) {
 const qualifying = new Map(meetings.filter(m => {
  const date = timestamp(m.starts_at);
  return m.supervisor_id === supervisorId && m.status === 'completed' && date >= start && date < end;
 }).map(m => [m.id, timestamp(m.starts_at)]));
 return supervisees.filter(person=>!person.in_piscine && (person.meeting_target ?? 4)>0).map(person => {
  const target = person.meeting_target ?? 4;
  const eligibleFrom = person.eligible_from ? Math.max(start, timestamp(person.eligible_from)) : start;
  const attended = new Set(participants.filter(p => p.user_id === person.id && p.attendance === 'attended' && (qualifying.get(p.meeting_id) ?? -Infinity) >= eligibleFrom).map(p => p.meeting_id)).size;
  return { ...person, target, attended, remaining: Math.max(0, target - attended), met: attended >= target };
 });
}
