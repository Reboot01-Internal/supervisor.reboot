import { useEffect, useSyncExternalStore } from 'react';
import { RefreshCw } from 'lucide-react';
import { PROFILE_CACHE_TTL, profileFetchesRemaining, profileFetchProgress, requestProfileSync, subscribeProfileFetches } from '../lib/profileCache';
import './ProfileSyncButton.css';
export default function ProfileSyncButton() {
 const remaining = useSyncExternalStore(subscribeProfileFetches, profileFetchesRemaining);
 const progress = useSyncExternalStore(subscribeProfileFetches, profileFetchProgress);
 useEffect(() => {
  const timer = window.setInterval(() => requestProfileSync(false), PROFILE_CACHE_TTL);
  const focus = () => requestProfileSync(false);
  window.addEventListener('focus', focus);
  return () => { clearInterval(timer); window.removeEventListener('focus', focus); };
 }, []);
 return <button type="button" className="profile-sync" onClick={() => requestProfileSync()} disabled={remaining > 0} title="Profiles are cached for 2 hours. Sync now to refresh Reboot data." aria-label={remaining ? `Syncing profiles, ${progress}% complete` : 'Sync profiles now'}><RefreshCw size={13} className={remaining ? 'profile-sync-spin' : ''}/><span aria-live="polite">{remaining ? `${progress}%` : 'Sync'}</span></button>;
}
