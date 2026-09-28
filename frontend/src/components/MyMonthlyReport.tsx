import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import SupervisorMonthlyMatrix from './SupervisorMonthlyMatrix';

type Board = { id: number; name: string; supervisor_user_id: number; created_at: string; inactive_at?: string; status?: string };
type Profile = { user: { id: number; full_name: string; nickname: string } };
export default function MyMonthlyReport({ compact = false, revision = 0 }: { compact?: boolean; revision?: number }) {
 const [result, setResult] = useState<{ revision: number; profile?: Profile; boards?: Board[]; error?: string } | null>(null);
 const [retry, setRetry] = useState(0);
 useEffect(() => {
  let alive = true;
  Promise.all([apiFetch('/admin/profile/summary'), apiFetch('/admin/all-boards')]).then(([profile, boards]: [Profile, Board[]]) => {
   if (alive) setResult({ revision, profile, boards: boards.filter(b => b.supervisor_user_id === profile.user.id) });
  }).catch(() => { if (alive) setResult({ revision, error: 'Your monthly report could not load.' }); });
  return () => { alive = false; };
 }, [revision, retry]);
 if (!result || result.revision !== revision) return <section className="mm-self-loading" role="status">Loading your monthly status…</section>;
 if (result.error || !result.profile) return <section className="mm-self-loading" role="alert">{result.error || 'Your profile is unavailable.'} <button onClick={() => { setResult(null); setRetry(v => v + 1); }}>Try again</button></section>;
 const user = result.profile.user;
 return <SupervisorMonthlyMatrix people={[{ supervisor_user_id: user.id, full_name: user.full_name, nickname: user.nickname }]} boards={result.boards || []} avatars={{}} loading={false} sourceError="" revision={revision + retry} personal compact={compact}/>;
}
