type Meeting = { id: number; supervisor_id: number; status: string; starts_at: string };
type Participant = { meeting_id: number; user_id: number; attendance: string };
type Supervisee = { id: number; name: string; in_piscine?:boolean };

export function superviseeMeetingProgress(supervisorId: number, supervisees: Supervisee[], meetings: Meeting[], participants: Participant[], start: number, end: number) {
 const qualifying = new Set(meetings.filter(m => {
  const timestamp = Date.parse(m.starts_at.includes('T') ? m.starts_at : m.starts_at.replace(' ', 'T') + 'Z');
  return m.supervisor_id === supervisorId && m.status === 'completed' && timestamp >= start && timestamp < end;
 }).map(m => m.id));
 return supervisees.filter(person=>!person.in_piscine).map(person => {
  const attended = new Set(participants.filter(p => p.user_id === person.id && p.attendance === 'attended' && qualifying.has(p.meeting_id)).map(p => p.meeting_id)).size;
  return { ...person, attended, remaining: Math.max(0, 4 - attended), met: attended >= 4 };
 });
}
