import { useEffect, useState } from 'react';
import { Ban, Check, Clock3, RefreshCw, Siren, Users, Zap } from 'lucide-react';
import type { NotificationItem } from '../lib/notifications';
import { getNotificationTone } from '../lib/notificationTheme';
import { apiFetch } from '../lib/api';
import { fetchRebootAvatar } from '../lib/rebootAvatars';
import UserAvatar from './UserAvatar';
import './NotificationToast.css';

type Actor = { full_name: string; nickname: string; email: string };
let directory: Promise<Actor[]> | undefined;
function actorDirectory() {
  if (!directory) directory = apiFetch('/admin/supervisors').then(value => Array.isArray(value) ? value : []).catch(() => { directory = undefined; return []; });
  return directory;
}
export default function NotificationToast({ item }: { item: NotificationItem }) {
  const [actor, setActor] = useState<Actor>();
  const [photo, setPhoto] = useState('');
  useEffect(() => {
    let alive = true;
    const name = item.body.match(/By:\s*([^.\n]+)/i)?.[1]?.trim().toLowerCase();
    if (name) actorDirectory().then(async people => {
      const person = people.find(p => [p.full_name, p.nickname, p.email].some(v => v?.trim().toLowerCase() === name));
      if (!person || !alive) return;
      setActor(person);
      try { const src = await fetchRebootAvatar(person.nickname || person.email.split('@')[0]); if (alive) setPhoto(src); } catch { /* Initials remain visible. */ }
    });
    return () => { alive = false; };
  }, [item.body]);
  const tone = getNotificationTone(item);
  const status = item.kind === 'attendance' ? 'attendance' : tone.label === 'Canceled' ? 'canceled' : tone.label === 'Booked' || tone.label === 'Completed' ? 'completed' : tone.label === 'Rescheduled' ? 'rescheduled' : item.title.toLowerCase().includes('starting now') ? 'starting' : 'reminder';
  const Icon = status === 'attendance' ? Siren : status === 'canceled' ? Ban : status === 'completed' ? Check : status === 'rescheduled' ? RefreshCw : status === 'starting' ? Zap : item.kind.includes('participant') ? Users : Clock3;
  return <div className="notification-popup" data-status={status}>
    {actor ? <UserAvatar src={photo} alt={actor.full_name} fallback={actor.full_name.slice(0, 2)} sizeClass="h-10 w-10"/> : <span className="notification-popup-symbol"><Icon size={19}/></span>}
    <div className="notification-popup-content">
      <span className="notification-popup-meta"><Icon size={12}/>{tone.label}<span>Just now</span></span>
      {actor && <span className="notification-popup-actor">{actor.full_name}</span>}
      <strong>{item.title}</strong><p>{item.body}</p>
    </div>
  </div>;
}
