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

test('each talent uses their own prorated target and eligibility date', () => {
 const people = [
  { id: 1, name: 'Assigned in week 2', meeting_target: 3, eligible_from: '2026-10-08T00:00:00+03:00' },
  { id: 2, name: 'Passed in week 3', meeting_target: 2, eligible_from: '2026-10-15T00:00:00+03:00' },
  { id: 3, name: 'Assigned in last week', meeting_target: 1, eligible_from: '2026-10-25T00:00:00+03:00' },
 ];
 const meetings = [meeting(1), meeting(2,{starts_at:'2026-10-10T10:00:00Z'}),meeting(3,{starts_at:'2026-10-20T10:00:00Z'}),meeting(4,{starts_at:'2026-10-26T10:00:00Z'})];
 const participants = people.flatMap(person=>meetings.map(m=>attendance(m.id,person.id)));
 const result = superviseeMeetingProgress(7,people,meetings,participants,start,end);
 assert.deepEqual(result.map(p=>[p.target,p.attended,p.remaining,p.met]),[[3,3,0,true],[2,2,0,true],[1,1,0,true]]);
});
test('attendance starts at the exact Bahrain eligibility boundary; duplicates still count once',()=>{
 const people=[{id:1,name:'New',meeting_target:1,eligible_from:'2026-10-21T21:00:00Z'}];
 const meetings=[meeting(1,{starts_at:'2026-10-21T20:59:59Z'}),meeting(2,{starts_at:'2026-10-21T21:00:00Z'})];
 const result=superviseeMeetingProgress(7,people,meetings,[attendance(1,1),attendance(2,1),attendance(2,1)],start,end);
 assert.equal(result[0].attended,1);assert.equal(result[0].met,true);
});
test('unresolved piscine marks and zero targets are not assessed',()=>{
 const people=[{id:1,name:'Piscine',in_piscine:true,meeting_target:0},{id:2,name:'Future assignment',meeting_target:0}];
 assert.deepEqual(superviseeMeetingProgress(7,people,[],[],start,end),[]);
});
