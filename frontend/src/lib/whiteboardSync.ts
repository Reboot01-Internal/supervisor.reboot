import { useEffect, useRef, useState } from 'react';
import { API_URL } from './api';
export type WhiteboardKind = 'note' | 'text' | 'rectangle' | 'circle' | 'image' | 'pen';
export type WhiteboardItem = { id: string; kind: WhiteboardKind; x: number; y: number; w: number; h: number; color: string; text: string; font: number; points?: number[][] };
export type Whiteboard = { title: string; items: WhiteboardItem[] };
export type WhiteboardChange = { id: string; add?: WhiteboardItem; set?: Partial<WhiteboardItem>; delete?: boolean };
export type WhiteboardDelta = { title?: string; changes: WhiteboardChange[] };
type Operation = WhiteboardDelta & { id: string };
export type WhiteboardPerson = { id: number; name: string; login: string; color: string };
export function diffWhiteboard(before: Whiteboard, after: Whiteboard): WhiteboardDelta {
  const changes: WhiteboardChange[] = [];
  const previous = new Map(before.items.map(i => [i.id,i]));
  const next = new Map(after.items.map(i => [i.id,i]));
  for (const i of before.items) if (!next.has(i.id)) changes.push({ id:i.id, delete:true });
  for (const i of after.items) {
    const old = previous.get(i.id);
    if (!old) { changes.push({ id:i.id, add:i }); continue; }
    const set: Partial<WhiteboardItem> = {};
    for (const key of Object.keys(i) as (keyof WhiteboardItem)[]) {
      if (key !== 'id' && JSON.stringify(old[key]) !== JSON.stringify(i[key])) Object.assign(set,{[key]:i[key]});
    }
    if (Object.keys(set).length) changes.push({ id:i.id, set });
  }
  return { ...(before.title !== after.title ? { title:after.title } : {}), changes };
}
export function applyWhiteboardDelta(board: Whiteboard, delta: WhiteboardDelta): Whiteboard {
  let items = [...board.items];
  for (const c of delta.changes) {
    const index = items.findIndex(i => i.id === c.id);
    if (c.delete) items = items.filter(i => i.id !== c.id);
    else if (c.add && index < 0) items.push(c.add);
    else if (c.set && index >= 0) items[index] = { ...items[index], ...c.set, id:c.id };
  }
  return { title:delta.title ?? board.title, items };
}

// Persist pending operations, then rebase them over each server update. Reconnects never send stale full canvases.
export function useSharedWhiteboard(login: string, email: string, starter: () => Whiteboard) {
  const [board, renderBoard] = useState<Whiteboard>(starter);
  const boardRef = useRef(board);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState('Connecting to shared board…');
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);
  const [people, setPeople] = useState<WhiteboardPerson[]>([]);
  const [retry, setRetry] = useState(0);
  const socket = useRef<WebSocket | null>(null);
  const confirmed = useRef<Whiteboard>({title:'',items:[]});
  const pending = useRef<Operation[]>([]);
  const revision = useRef(0);
  const ready = useRef(false);
  const sent = useRef(new Set<string>());
  const starterRef = useRef(starter);
  const draftKey = `taskflow-whiteboard-shared-pending:${login || email}`;
  const flushRef = useRef<() => void>(()=>{});
  function storePending() {
    try { if (pending.current.length) localStorage.setItem(draftKey,JSON.stringify(pending.current)); else localStorage.removeItem(draftKey); }
    catch { setError('Browser draft storage is full. Keep this page open until all changes are saved.'); }
  }
  function setBoard(next: Whiteboard) {
    const delta = diffWhiteboard(boardRef.current,next);
    if (!delta.changes.length && delta.title === undefined) return;
    const inFlight=pending.current.filter(op=>sent.current.has(op.id));
    const base=inFlight.reduce(applyWhiteboardDelta,confirmed.current);
    const combined=diffWhiteboard(base,next);
    pending.current=[...inFlight,...(combined.changes.length || combined.title!==undefined ? [{...combined,id:crypto.randomUUID()}] : [])];
    boardRef.current = next; renderBoard(next); storePending();
    setStatus(ready.current ? 'Saving…' : 'Offline · changes saved in this browser');
    flushRef.current();
  }
  useEffect(() => {
    let disposed = false;
    let reconnect: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    let flushTimer: ReturnType<typeof setTimeout> | undefined;
    const key = `taskflow-whiteboard-shared-pending:${login || email}`;
    try { const raw = localStorage.getItem(key); const saved: Operation[] = raw ? JSON.parse(raw) : []; if (Array.isArray(saved) && saved.every(o=>typeof o.id==='string' && Array.isArray(o.changes))) pending.current=saved; } catch { /* Retain the draft on disk for recovery. */ }
    function persist() {
      try { if (pending.current.length) localStorage.setItem(key,JSON.stringify(pending.current)); else localStorage.removeItem(key); } catch { setError('Browser draft storage is full. Keep this page open until all changes are saved.'); }
    }
    function rebase() {
      const next = pending.current.reduce(applyWhiteboardDelta,confirmed.current);
      boardRef.current=next;renderBoard(next);persist();setStatus(pending.current.length?'Saving…':'All changes saved');
    }
    function flush() { if(flushTimer)return;flushTimer=setTimeout(()=>{flushTimer=undefined;sendPending();},50); }
    function sendPending() {
      if (!ready.current || socket.current?.readyState !== WebSocket.OPEN) return;
      const op=pending.current[0]; if(op && !sent.current.has(op.id)){socket.current.send(JSON.stringify(op));sent.current.add(op.id);}
    }
    flushRef.current=flush;
    function connect() {
      if (disposed) return;
      if (!navigator.onLine) { reconnect=setTimeout(connect,1000);return; }
      const query = new URLSearchParams({login,email});
      const ws = new WebSocket(`${API_URL.replace(/^http/i,'ws')}/admin/whiteboard/stream?${query}`);
      socket.current=ws;ready.current=false;sent.current.clear();
      ws.onmessage = event => {
        if (disposed || socket.current!==ws) return;
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'state') {
            const doc = message.document as Whiteboard & { revision:number; applied?:string[] };
            if (!doc || !Array.isArray(doc.items)) throw new Error('Invalid shared board');
            confirmed.current={title:doc.title,items:doc.items};revision.current=doc.revision;
            const applied=new Set(doc.applied || []);pending.current=pending.current.filter(op=>!applied.has(op.id));
            // A deterministic starter avoids duplicate sample notes when two admins join a new board together.
            if (doc.revision===0 && !doc.items.length && !pending.current.length) pending.current.push({...diffWhiteboard(confirmed.current,starterRef.current()),id:crypto.randomUUID()});
            const legacyKey=`taskflow-whiteboard-draft:${login || email}`;
            try {
              const legacy=localStorage.getItem(legacyKey);
              if(legacy){const old=JSON.parse(legacy) as Whiteboard;const current=pending.current.reduce(applyWhiteboardDelta,confirmed.current);const ids=new Set(current.items.map(i=>i.id));if(Array.isArray(old.items)){const missing=old.items.filter(i=>!ids.has(i.id));if(missing.length)pending.current.push({id:crypto.randomUUID(),changes:missing.map(i=>({id:i.id,add:i}))});persist();localStorage.removeItem(legacyKey);}}
            } catch { /* Keep malformed legacy drafts untouched. */ }
            ready.current=true;attempts=0;setConnected(true);setLoaded(true);setError('');rebase();flush();
          } else if (message.type === 'operation') {
            const op=message.operation as Operation;
            if (message.revision>revision.current) {confirmed.current=applyWhiteboardDelta(confirmed.current,op);revision.current=message.revision;}
            pending.current=pending.current.filter(o=>o.id!==op.id);sent.current.delete(op.id);rebase();setError('');flush();
          } else if (message.type === 'ack') {
            pending.current=pending.current.filter(o=>o.id!==message.id);sent.current.delete(message.id);rebase();flush();
          } else if (message.type === 'presence') setPeople(message.people);
          else if (message.type === 'error') {
            const rejected=pending.current.find(o=>o.id===message.id);
            if(message.retryable){sent.current.delete(message.id);setStatus('Save failed · retrying…');}
            else {
              try { if(rejected)localStorage.setItem(`${key}:rejected:${message.id}`,JSON.stringify(rejected)); } catch { /* The operation remains in the existing pending draft until persisted below. */ }
              pending.current=pending.current.filter(o=>o.id!==message.id);sent.current.delete(message.id);rebase();flush();
            }
            setError(message.error || 'Could not save a change');
          }
        } catch { setError('Could not read a live update. Reconnecting…');ws.close(); }
      };
      ws.onclose = () => {
        if(disposed || socket.current!==ws)return;ready.current=false;setConnected(false);setPeople([]);setStatus(pending.current.length?'Offline · changes saved in this browser':'Reconnecting…');
        if(!boardRef.current.items.length)setError('Could not connect. Check that the backend is running and your account has admin access.');
        reconnect=setTimeout(connect,Math.min(1000*2**attempts++,10000));
      };
      ws.onerror = () => { if(disposed || socket.current!==ws)return;setError('Live connection unavailable. Reconnecting automatically; your pending changes stay in this browser.'); };
    }
    function offline(){ready.current=false;setConnected(false);setPeople([]);setStatus('Offline · changes saved in this browser');socket.current?.close();}
    function online(){clearTimeout(reconnect);if(socket.current?.readyState!==WebSocket.OPEN && socket.current?.readyState!==WebSocket.CONNECTING)connect();}
    window.addEventListener('offline',offline);window.addEventListener('online',online);
    connect();
    const ticker=setInterval(flush,2000);
    function beforeUnload(e: BeforeUnloadEvent){if(pending.current.length){e.preventDefault();}}
    window.addEventListener('beforeunload',beforeUnload);
    return () => {disposed=true;ready.current=false;clearTimeout(reconnect);clearInterval(ticker);clearTimeout(flushTimer);window.removeEventListener('beforeunload',beforeUnload);window.removeEventListener('offline',offline);window.removeEventListener('online',online);socket.current?.close();flushRef.current=()=>{};};
  },[login,email,retry]);
  return { board,boardRef,setBoard,loaded,status,error,setError,connected,people,retry:()=>setRetry(n=>n+1) };
}
