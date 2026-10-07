import { test } from 'node:test';
import assert from 'node:assert/strict';
import { superviseeMeetingProgress } from './superviseeMeetingProgress.ts';
const start = Date.parse('2026-10-01T00:00:00+03:00');
const end = Date.parse('2026-11-01T00:00:00+03:00');
const people = [{ id: 1, name: 'Same name' }, { id: 2, name: 'Same name' }, { id: 3, name: 'No meetings' }];
const meeting = (id, extra = {}) => ({ id, supervisor_id: 7, status: 'completed', starts_at: '2026-10-05T10:00:00Z', ...extra });
const attendance = (meeting_id, user_id, attendance = 'attended') => ({ meeting_id, user_id, attendance });
test('each supervisee needs four; group attendees get separate credit without duplicate credit', () => {
 const meetings = [1, 2, 3, 4].map(id => meeting(id));
 const participants = [1, 2, 3, 4].map(id => attendance(id, 1));
 participants.push(attendance(1, 1), attendance(1, 2), attendance(2, 2, 'absent'), attendance(3, 2, 'unknown'));
 const result = superviseeMeetingProgress(7, people, meetings, participants, start, end);
 assert.deepEqual(result.map(p => [p.attended, p.remaining, p.met]), [[4, 0, true], [1, 3, false], [0, 4, false]]);
});
test('only completed meetings with this supervisor inside the Bahrain month count', () => {
 const meetings = [meeting(1, { starts_at: '2026-09-30T21:00:00Z' }), meeting(2, { starts_at: '2026-10-31T21:00:00Z' }), meeting(3, { supervisor_id: 8 }), meeting(4, { status: 'scheduled' }), meeting(5, { status: 'canceled' }), meeting(6, { starts_at: '2026-09-30 20:59:59' })];
 const result = superviseeMeetingProgress(7, people, meetings, meetings.map(m => attendance(m.id, 1)), start, end);
 assert.equal(result[0].attended, 1);
 assert.deepEqual(superviseeMeetingProgress(7, [], meetings, [], start, end), []);
});
