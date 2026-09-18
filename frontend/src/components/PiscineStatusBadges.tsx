import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Clock3, CircleDashed, CircleHelp, LoaderCircle } from 'lucide-react';
import { apiFetch } from '../lib/api';
import './PiscineStatusBadges.css';

type Track = 'rust' | 'js';
type Statuses = Partial<Record<Track, Record<string, string>>>;
const tracks: Track[] = ['rust', 'js'];
const states = {
  passed: { label: 'Passed', Icon: CheckCircle2 },
  failed: { label: 'Failed — no passed attempt', Icon: XCircle },
  working: { label: 'Working on it', Icon: Clock3 },
  not_started: { label: 'No record', Icon: CircleDashed },
  unknown: { label: 'Data unavailable', Icon: CircleHelp },
  loading: { label: 'Loading', Icon: LoaderCircle },
};

export function useAssignedPiscineStatuses(enabled: boolean) {
  const [statuses, setStatuses] = useState<Statuses>({});
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    for (const track of tracks) {
      apiFetch(`/admin/users/${track}-status`)
        .then((result: Record<string, string>) => {
          if (active) setStatuses(previous => ({ ...previous, [track]: result }));
        })
        .catch(() => {
          if (active) setStatuses(previous => ({ ...previous, [track]: {} }));
        });
    }
    return () => { active = false; };
  }, [enabled]);
  return statuses;
}

export default function PiscineStatusBadges({ login, statuses }: { login: string; statuses: Statuses }) {
  return <span className="piscine-status-badges">{tracks.map(track => {
    const value = statuses[track] ? statuses[track]?.[login.toLowerCase()] || 'unknown' : 'loading';
    const status = Object.hasOwn(states, value) ? value as keyof typeof states : 'unknown';
    const { label, Icon } = states[status];
    const name = track === 'rust' ? 'Rust' : 'JS';
    const description = `${name} piscine: ${label}`;
    return <span key={track} className="piscine-status-badge" data-status={status} title={description} aria-label={description} role="img"><span aria-hidden="true">{name}</span><Icon size={13} aria-hidden="true"/></span>;
  })}</span>;
}
