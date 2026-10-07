export const PROFILE_CACHE_TTL = 2 * 60 * 60 * 1000;
type Entry<T> = { value: T; savedAt: number };
const storageKey = 'taskflow-profile-cache-v1';
let scope = '';
let generation = 0;
let entries: Record<string, Entry<unknown>> = {};
const pending = new Map<string, Promise<unknown>>();
const listeners = new Set<() => void>();
let remaining = 0;
let running = 0;
const queue: (() => void)[] = [];
function notify() { listeners.forEach(fn => fn()); }
function session() {
 const next = ['email', 'login', 'role'].map(key => localStorage.getItem(key) || '').join('|');
 if (scope !== next) {
  scope = next; generation++; entries = {};
  try { const saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null'); if (saved?.scope === scope) entries = saved.entries || {}; } catch { /* Cache is optional. */ }
 }
 return next;
}
function persist() {
 try {
  const latest = Object.entries(entries).sort((a,b) => b[1].savedAt-a[1].savedAt).slice(0,300);
  sessionStorage.setItem(storageKey, JSON.stringify({ scope, entries: Object.fromEntries(latest) }));
 } catch { /* Keep the in-memory cache when browser storage is full. */ }
}
export function clearProfileCache() { entries = {}; scope = ''; generation++; try { sessionStorage.removeItem(storageKey); } catch { /* Storage disabled. */ } }
export function peekProfileCache<T>(key: string): Entry<T> | undefined { session(); return entries[key] as Entry<T> | undefined; }
export function cachedProfileResource<T>(key: string, loader: () => Promise<T>, force = false): Promise<T> {
 const owner = session();
 const version = generation;
 const requestKey = `${version}:${owner}:${key}`;
 const existing = pending.get(requestKey);
 if (existing) return existing as Promise<T>;
 const cached = entries[key] as Entry<T> | undefined;
 if (!force && cached && Date.now() - cached.savedAt < PROFILE_CACHE_TTL) return Promise.resolve(cached.value);
 remaining++; notify();
 const promise = new Promise<T>((resolve, reject) => {
  const run = () => {
   running++;
   Promise.resolve().then(() => { if (session() !== owner || generation !== version) throw new Error('Profile session changed'); return loader(); }).then(value => {
    if (session() === owner && generation === version) { entries[key] = { value, savedAt: Date.now() }; persist(); }
    resolve(value);
   }, reject).finally(() => {
    pending.delete(requestKey); remaining--; running--; notify(); queue.shift()?.();
   });
  };
  if (running < 3) run(); else queue.push(run);
 });
 pending.set(requestKey, promise);
 return promise;
}
export const subscribeProfileFetches = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const profileFetchesRemaining = () => remaining;
// One sync event refreshes all mounted profile consumers; fresh cached entries still avoid network work.
export function requestProfileSync(force = true) { window.dispatchEvent(new CustomEvent('profile:sync', { detail: { force } })); }
