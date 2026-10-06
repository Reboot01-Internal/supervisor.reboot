import { useEffect, useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react';
import { MousePointer2, Hand, StickyNote, Type, Square, Circle, Pencil, ImagePlus, Undo2, Redo2, Minus, Plus, Maximize2, Download, Copy, Trash2, Check, CloudOff, LayoutTemplate, X, RotateCcw, Users, BringToFront, SendToBack } from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import Modal from '../components/Modal';
import { useSearchParams } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import UserAvatar from '../components/UserAvatar';
import { fetchRebootAvatar, getCachedRebootAvatar } from '../lib/rebootAvatars';
import { useSharedWhiteboard, diffWhiteboard, applyWhiteboardDelta, type Whiteboard as Board, type WhiteboardItem as Item, type WhiteboardKind as Kind } from '../lib/whiteboardSync';
import { useAuth } from '../lib/auth';
import './AdminWhiteboardPage.css';

type Tool = 'select' | 'hand' | Kind;
const colors = ['#ffe580', '#c8b6ff', '#a6ceff', '#ffb780', '#ffc5dc', '#bce8bc'];
const uid = () => crypto.randomUUID();
function starter(): Board {
  return { title: 'Ideas & inspiration', items: [
    { id: 'starter-heading', kind: 'text', x: 300, y: 80, w: 510, h: 135, color: colors[0], text: 'Big ideas start here.\nWhat should we create next?', font: 32 },
    ...['A space for every idea.\nEven the unexpected ones.', 'What’s working well?\nLet’s build on it.', 'One small improvement\nthat could make a big difference.', 'What if we tried\nsomething new?'].map((text, i): Item => ({ id: `starter-note-${i}`, kind: 'note', x: 160 + i * 210, y: 270 + (i % 2) * 50, w: 180, h: 180, color: colors[i], text, font: 20 })),
    { id: 'starter-footer', kind: 'text', x: 310, y: 540, w: 480, h: 60, color: colors[0], text: 'Collect ideas • Connect the dots • Make it happen', font: 18 },
  ] };
}
function WhiteboardAvatar({ login, name }: { login: string; name: string }) {
  const [src, setSrc] = useState(() => getCachedRebootAvatar(login));
  useEffect(() => {
    let cancelled = false;
    void fetchRebootAvatar(login).then(url => { if (!cancelled) setSrc(url); }).catch(() => { if (!cancelled) setSrc(''); });
    return () => { cancelled = true; };
  }, [login]);
  return <UserAvatar src={src} alt={name} fallback={name.split(/\s+/).map(n => n[0]).slice(0, 2).join('')} sizeClass="h-full w-full" textClass="text-[10px]" className="border-0 bg-transparent" />;
}

type WhiteboardEntry = { id:string; title:string; objects:number };
export default function AdminWhiteboardPage() {
  const [params,setParams]=useSearchParams();
  const boardID=params.get('board') || 'default';
  const [boards,setBoards]=useState<WhiteboardEntry[]>([]);
  const [listError,setListError]=useState('');
  const [createOpen,setCreateOpen]=useState(false);
  const [name,setName]=useState('');
  const [creating,setCreating]=useState(false);
  const [createError,setCreateError]=useState('');
  useEffect(()=>{
    let cancelled=false;
    async function refresh(){try{const result=await apiFetch('/admin/whiteboards');if(!cancelled){setBoards(result);setListError('');}}catch(e){if(!cancelled)setListError(e instanceof Error?e.message:'Could not load whiteboards');}}
    void refresh();const timer=setInterval(()=>void refresh(),15000);window.addEventListener('focus',refresh);
    return()=>{cancelled=true;clearInterval(timer);window.removeEventListener('focus',refresh);};
  },[]);
  async function create(event:React.FormEvent){
    event.preventDefault();if(!name.trim() || creating)return;setCreating(true);setCreateError('');
    try{const next=await apiFetch('/admin/whiteboards',{method:'POST',body:JSON.stringify({title:name.trim()})});setBoards(current=>[next,...current]);setParams(current=>{const updated=new URLSearchParams(current);updated.set('board',next.id);return updated;});setCreateOpen(false);setName('');}
    catch(e){setCreateError(e instanceof Error?e.message:'Could not create whiteboard');}finally{setCreating(false);}
  }
  const navigation=<>
    <div className="wb-board-navigation">
      <label><StickyNote size={17}/><span>Whiteboards</span><select aria-label="Switch whiteboard" value={boardID} onChange={event=>setParams(current=>{const updated=new URLSearchParams(current);updated.set('board',event.target.value);return updated;})}>
        {!boards.some(b=>b.id===boardID)&&<option value={boardID}>{boardID==='default'?'Current whiteboard':'Opening whiteboard…'}</option>}
        {boards.map(b=><option key={b.id} value={b.id}>{b.title || 'Untitled whiteboard'}</option>)}
      </select></label>
      <button type="button" onClick={()=>{setCreateError('');setName('');setCreateOpen(true);}}><Plus size={17}/>New whiteboard</button>
    </div>
    {listError&&<div className="wb-error" role="alert">{listError}</div>}
    <Modal open={createOpen} title="New whiteboard" onClose={()=>{if(!creating)setCreateOpen(false);}} footer={<><button className="wb-create-cancel" disabled={creating} onClick={()=>setCreateOpen(false)}>Cancel</button><button className="wb-create-submit" type="submit" form="wb-create-form" disabled={creating || !name.trim()}>{creating?'Creating…':'Create whiteboard'}</button></>}>
      <form id="wb-create-form" className="wb-create-form" onSubmit={create}>
        <p>Start a fresh canvas for your next idea. All admins can join and work together live.</p>
        <label>Whiteboard name<input autoFocus required maxLength={160} disabled={creating} value={name} placeholder="e.g. October planning" onChange={event=>setName(event.target.value)}/></label>
        {createError&&<div className="wb-error" role="alert">{createError}</div>}
      </form>
    </Modal>
  </>;
  return <WhiteboardEditor key={boardID} boardID={boardID} navigation={navigation}/>;
}

function WhiteboardEditor({boardID,navigation}:{boardID:string;navigation:ReactNode}) {
  const { login, email } = useAuth();
  const {board,boardRef,setBoard,loaded,status,error,setError,connected,people,retry} = useSharedWhiteboard(login,email,starter,boardID);
  const [tool, setTool] = useState<Tool>('select');
  const [color, setColor] = useState(colors[0]);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const [history, setHistory] = useState<{ past: {before:Board;after:Board}[]; future: {before:Board;after:Board}[] }>({ past: [], future: [] });
  const [full, setFull] = useState(false);
  const [templates, setTemplates] = useState(false);
  const editorBefore = useRef<{board:Board;id:string} | null>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const interaction = useRef<{ type: 'move' | 'pan' | 'resize' | 'draw'; id?: string; x: number; y: number; before: Board; originX: number; originY: number; layer?: number } | null>(null);
  const item = board.items.find(i => i.id === selected);

  function remember(before: Board, after = boardRef.current, id?: string) { if (id) { before={title:after.title,items:before.items.filter(i=>i.id===id)};after={title:after.title,items:after.items.filter(i=>i.id===id)}; } if (JSON.stringify(before) !== JSON.stringify(after)) setHistory(h => ({ past: [...h.past.slice(-39), {before,after}], future: [] })); }
  function beginEdit(id: string) { editorBefore.current={board:boardRef.current,id};setEditing(id); }
  function endEdit() { if(editorBefore.current)remember(editorBefore.current.board,boardRef.current,editorBefore.current.id);editorBefore.current=null;setEditing(null); }
  function commit(next: Board) { const merged=applyWhiteboardDelta(boardRef.current,diffWhiteboard(board,next));remember(boardRef.current,merged);setBoard(merged); }
  function patch(id: string, changes: Partial<Item>, record = true) {
    const next = { ...boardRef.current, items: boardRef.current.items.map(i => i.id === id ? { ...i, ...changes } : i) };
    if (record) commit(next); else setBoard(next);
  }
  function undo() { if (!history.past.length) return; endEdit(); const action=history.past[history.past.length-1];setHistory({past:history.past.slice(0,-1),future:[action,...history.future]});setBoard(applyWhiteboardDelta(boardRef.current,diffWhiteboard(action.after,action.before)));setSelected(null); }
  function redo() { if (!history.future.length) return;endEdit();const action=history.future[0];setHistory({past:[...history.past,action],future:history.future.slice(1)});setBoard(applyWhiteboardDelta(boardRef.current,diffWhiteboard(action.before,action.after)));setSelected(null); }
  function remove() { if (!selected) return; commit({ ...board, items: board.items.filter(i => i.id !== selected) }); setSelected(null); endEdit(); }
  function topLayer() { return Math.max(0,...boardRef.current.items.map((i,n)=>i.z ?? n+1))+1; }
  function changeLayer(front: boolean) { if(item)patch(item.id,{z:front ? topLayer() : Math.min(0,...boardRef.current.items.map((i,n)=>i.z ?? n+1))-1}); }
  function duplicate() { if (!item) return; if (board.items.length >= 500) { setError('This whiteboard has reached its 500-item limit.'); return; } const copy = { ...item, id: uid(), z:topLayer(), x: item.x + 24, y: item.y + 24 }; commit({ ...board, items: [...board.items, copy] }); setSelected(copy.id); }
  function point(e: { clientX: number; clientY: number }) { const r = canvas.current!.getBoundingClientRect(); return { x: (e.clientX - r.left - view.x) / view.scale, y: (e.clientY - r.top - view.y) / view.scale }; }
  function add(kind: Kind, x?: number, y?: number, text = '', height?: number) {
    if (board.items.length >= 500) { setError('This whiteboard has reached its 500-item limit.'); return; }
    const r = canvas.current!.getBoundingClientRect();
    const next: Item = { id: uid(), kind, z:topLayer(), x: x ?? (r.width / 2 - view.x) / view.scale - 90, y: y ?? (r.height / 2 - view.y) / view.scale - 90, w: kind === 'text' ? 320 : kind === 'image' ? 280 : 180, h: height ?? (kind === 'text' ? 100 : kind === 'image' ? 200 : 180), color, text, font: kind === 'text' ? 28 : 20 };
    commit({ ...board, items: [...board.items, next] }); setSelected(next.id); setTool('select');
    if (kind === 'note' || kind === 'text') beginEdit(next.id);
    return next;
  }
  function startCanvas(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || !loaded) return;
    endEdit(); setSelected(null);
    if (tool === 'hand') { interaction.current = { type: 'pan', x: e.clientX, y: e.clientY, originX: view.x, originY: view.y, before: board }; e.currentTarget.setPointerCapture(e.pointerId); return; }
    const p = point(e);
    if (tool === 'pen') {
      if (board.items.length >= 500) { setError('This whiteboard has reached its 500-item limit.'); return; }
      const next: Item = { id: uid(), kind: 'pen', z:topLayer(), x: p.x, y: p.y, w: 1, h: 1, color, text: '', font: 20, points: [[0,0]] };
      setBoard({ ...boardRef.current, items: [...boardRef.current.items, next] }); setSelected(next.id);
      interaction.current = { type: 'draw', id: next.id, x: p.x, y: p.y, originX: p.x, originY: p.y, before: board };
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  }
  function startItem(e: ReactPointerEvent, target: Item, resize = false) {
    if (tool !== 'select' && !resize) return;
    e.stopPropagation();
    if (editing === target.id && !resize) return;
    setSelected(target.id); endEdit();
    const p = point(e);
    interaction.current = { type: resize ? 'resize' : 'move', id: target.id, x: p.x, y: p.y, before: board, originX: resize ? target.w : target.x, originY: resize ? target.h : target.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function move(e: ReactPointerEvent) {
    const drag = interaction.current; if (!drag) return;
    if (drag.type === 'pan') { setView(v => ({ ...v, x: drag.originX + e.clientX - drag.x, y: drag.originY + e.clientY - drag.y })); return; }
    const p = point(e);
    if (drag.type === 'draw') {
      const i = boardRef.current.items.find(i => i.id === drag.id)!;
      patch(i.id, { points: [...(i.points || []), [p.x - drag.originX, p.y - drag.originY]] }, false);
    } else if (drag.type === 'resize') patch(drag.id!, { w: Math.max(80, drag.originX + p.x - drag.x), h: Math.max(60, drag.originY + p.y - drag.y) }, false);
    else {
      if (drag.layer === undefined && Math.hypot(p.x-drag.x,p.y-drag.y)>2) drag.layer=topLayer();
      patch(drag.id!, { x: drag.originX + p.x - drag.x, y: drag.originY + p.y - drag.y, ...(drag.layer === undefined ? {} : {z:drag.layer}) }, false);
    }
  }
  function stop() {
    const drag = interaction.current;
    if (drag && (drag.type === 'move' || drag.type === 'resize') && JSON.stringify(drag.before) !== JSON.stringify(boardRef.current)) remember(drag.before,boardRef.current,drag.id);
    if (drag?.type === 'draw') {
      const stroke = boardRef.current.items.find(i => i.id === drag.id);
      if (stroke?.points?.length) {
        const minX = Math.min(...stroke.points.map(p => p[0])) - 5, minY = Math.min(...stroke.points.map(p => p[1])) - 5;
        const maxX = Math.max(...stroke.points.map(p => p[0])) + 5, maxY = Math.max(...stroke.points.map(p => p[1])) + 5;
        patch(stroke.id, { x: stroke.x + minX, y: stroke.y + minY, w: Math.max(12, maxX-minX), h: Math.max(12, maxY-minY), points: stroke.points.map(p => [p[0]-minX,p[1]-minY]) }, false);
      }
    }
    if (drag?.type === 'draw') remember(drag.before,boardRef.current,drag.id);
    interaction.current = null;
  }
  function zoom(scale: number) {
    const r = canvas.current!.getBoundingClientRect();
    const next = Math.max(.25, Math.min(2, scale));
    setView(v => ({ x: r.width / 2 - (r.width / 2 - v.x) * next / v.scale, y: r.height / 2 - (r.height / 2 - v.y) * next / v.scale, scale: next }));
  }
  function fit() {
    if (!canvas.current || !board.items.length) { setView({ x: 0, y: 0, scale: 1 }); return; }
    const bounds = board.items.flatMap(i => i.kind === 'pen' ? (i.points || []).map(p => ({ x: i.x+p[0], y:i.y+p[1], w:1, h:1 })) : [i]);
    const left = Math.min(...bounds.map(i => i.x)), top = Math.min(...bounds.map(i => i.y));
    const width = Math.max(...bounds.map(i => i.x+i.w)) - left, height = Math.max(...bounds.map(i => i.y+i.h)) - top;
    const r = canvas.current.getBoundingClientRect(), scale = Math.min(1.4, Math.max(.25, Math.min((r.width-120)/Math.max(width,1),(r.height-120)/Math.max(height,1))));
    setView({ x:(r.width-width*scale)/2-left*scale, y:(r.height-height*scale)/2-top*scale, scale });
  }
  async function upload(selectedFile?: File) {
    if (!selectedFile) return;
    if (!['image/png','image/jpeg','image/webp'].includes(selectedFile.type) || selectedFile.size > 750000) { setError('Choose a PNG, JPG, or WebP image under 750 KB.'); return; }
    const reader = new FileReader();
    reader.onload = () => { const src = String(reader.result); if (JSON.stringify(boardRef.current).length + src.length > 3900000) { setError('The board is full of images. Remove an image or use a smaller file.'); return; } const image = new Image(); image.onload = () => { add('image', undefined, undefined, src, Math.max(60, 280 * image.height / image.width)); }; image.src = src; };
    reader.onerror = () => setError('Could not read this image. Please try another.'); reader.readAsDataURL(selectedFile);
  }
  function exportBoard() {
    const escape = (s: string) => s.replace(/[<>&"]/g, c => ({ '<':'&lt;', '>':'&gt;', '&':'&amp;', '"':'&quot;' }[c]!));
    const bounds = board.items.flatMap(i => i.kind === 'pen' ? (i.points || []).map(p => ({ x:i.x+p[0], y:i.y+p[1], w:1, h:1 })) : [i]);
    const left = Math.min(0,...bounds.map(i => i.x))-40, top = Math.min(0,...bounds.map(i=>i.y))-40;
    const w = Math.max(800,...bounds.map(i=>i.x+i.w))-left+40, h = Math.max(600,...bounds.map(i=>i.y+i.h))-top+40;
    const elements = board.items.map((item,index)=>({item,layer:item.z ?? index+1})).sort((a,b)=>a.layer-b.layer).map(({item:i}) => {
      if (i.kind === 'pen') return `<polyline transform="translate(${i.x} ${i.y})" points="${i.points?.map(p=>p.join(',')).join(' ')}" stroke="${i.color}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`;
      if (i.kind === 'image') return /^data:image\/(png|jpeg|webp);base64,/.test(i.text) ? `<image x="${i.x}" y="${i.y}" width="${i.w}" height="${i.h}" href="${escape(i.text)}"/>` : '';
      const shape = i.kind === 'circle' ? `<ellipse cx="${i.x+i.w/2}" cy="${i.y+i.h/2}" rx="${i.w/2}" ry="${i.h/2}" fill="${i.color}"/>` : i.kind !== 'text' ? `<rect x="${i.x}" y="${i.y}" width="${i.w}" height="${i.h}" fill="${i.color}" rx="${i.kind==='rectangle'?12:2}"/>` : '';
      const lines = i.text.split('\n').flatMap(line => { const size=Math.max(1,Math.floor((i.w-24)/(i.font*.55))); return line.match(new RegExp(`.{1,${size}}`, 'g')) || ['']; });
      return shape + `<text fill="#252537" font-family="Arial,sans-serif" font-size="${i.font}" text-anchor="middle">${lines.map((line,n)=>`<tspan x="${i.x+i.w/2}" y="${i.y+(i.h-lines.length*i.font*1.3)/2+i.font+n*i.font*1.3}">${escape(line)}</tspan>`).join('')}</text>`;
    }).join('');
    const blob = new Blob([`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${left} ${top} ${w} ${h}" width="${w}" height="${h}"><rect x="${left}" y="${top}" width="${w}" height="${h}" fill="#f8f9fc"/>${elements}</svg>`],{type:'image/svg+xml'});
    const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href=url; link.download=`${board.title.replace(/[^a-z0-9_-]/gi,'_') || 'whiteboard'}.svg`; link.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  return <AdminLayout active="whiteboard" title="Whiteboard" subtitle="One shared space for your admin team’s next big idea.">
    {navigation}
    <section className={`wb-shell ${full ? 'wb-full' : ''}`} aria-label="Admin whiteboard" onKeyDown={e => {
      if (!loaded || (e.target instanceof HTMLElement && ['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName))) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicate(); }
      else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(); }
      else if (e.key === 'Escape') { endEdit(); setSelected(null); setTool('select'); setFull(false); }
    }}>
      <header className="wb-header">
        <div className="wb-board-icon"><StickyNote size={21}/></div>
        <div className="wb-title-group"><input aria-label="Whiteboard title" maxLength={160} value={board.title} disabled={!loaded} onChange={e=>commit({...board,title:e.target.value})}/><span className="wb-save">{status === 'All changes saved' ? <Check size={12}/> : status.includes('Not') ? <CloudOff size={12}/> : <span className="wb-status-dot"/>}{status}</span></div>
        <div className="wb-header-actions"><details className="wb-presence"><summary aria-label="Admins currently on this board"><span className={`wb-live-dot ${connected?'is-live':''}`}/><span className="wb-avatar-stack">{people.slice(0,4).map(p=><span key={p.id} style={{background:p.color}} title={p.name}><WhiteboardAvatar login={p.login} name={p.name}/></span>)}</span><Users size={15}/><span>{connected?`${people.length} online`:'Reconnecting'}</span></summary><div className="wb-people-list"><strong>On this board</strong>{people.map(p=><div key={p.id}><span style={{background:p.color}}><WhiteboardAvatar login={p.login} name={p.name}/></span><p>{p.name}<small>{p.login===login?'You':`@${p.login}`}</small></p><i/></div>)}{!people.length&&<p>Connecting to your team…</p>}</div></details><button title="Templates" onClick={()=>setTemplates(!templates)} disabled={!loaded}><LayoutTemplate size={17}/><span>Templates</span></button><button title="Export whiteboard as SVG" onClick={exportBoard} disabled={!loaded}><Download size={17}/><span>Export</span></button><button aria-label={full?'Exit expanded view':'Expand whiteboard'} onClick={()=>setFull(!full)}>{full?<X size={18}/>:<Maximize2 size={18}/>}</button></div>
      </header>
      {error && <div className="wb-error" role="alert">{error} {!loaded ? <button onClick={retry}>Retry loading</button> : <span>Your team shares this board. Pending changes are retained locally.</span>}</div>}
      <div className={`wb-canvas wb-tool-${tool}`} ref={canvas} tabIndex={0} onPointerDown={e=>{e.currentTarget.focus();startCanvas(e);}} onClick={e=>{if (loaded && (e.target === e.currentTarget || (e.target instanceof HTMLElement && e.target.closest('.wb-item'))) && !['select','hand','pen','image'].includes(tool)) { const p=point(e); add(tool as Kind,p.x,p.y); }}} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop} style={{backgroundSize:`${24*view.scale}px ${24*view.scale}px`,backgroundPosition:`${view.x}px ${view.y}px`}} onWheel={e=>{ if (editing) return; if(e.ctrlKey || e.metaKey) zoom(view.scale*(e.deltaY>0?.9:1.1)); else setView(v=>({...v,x:v.x-e.deltaX,y:v.y-e.deltaY})); }}>
        <div className="wb-world" style={{transform:`translate(${view.x}px,${view.y}px) scale(${view.scale})`}}>
          {loaded && board.items.map(i=><div key={i.id} className={`wb-item wb-${i.kind} ${selected===i.id?'wb-selected':''}`} style={{left:i.x,top:i.y,width:i.w,height:i.h,background:i.kind==='text'||i.kind==='image'||i.kind==='pen'?'transparent':i.color,fontSize:i.font,zIndex:i.z ?? board.items.findIndex(object=>object.id===i.id)+1}} onPointerDown={e=>startItem(e,i)} onDoubleClick={e=>{e.stopPropagation();if(!['image','pen'].includes(i.kind)){setSelected(i.id);beginEdit(i.id);}}}>
            {i.kind==='image'? <img draggable={false} src={/^data:image\/(png|jpeg|webp);base64,/.test(i.text)?i.text:undefined} alt="Whiteboard image"/> : i.kind==='pen'?<svg className="wb-stroke"><polyline points={i.points?.map(p=>p.join(',')).join(' ')} fill="none" stroke={i.color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/></svg> : editing===i.id?<textarea autoFocus aria-label="Edit whiteboard text" value={i.text} placeholder={i.kind==='text'?'Add your text…':'Write an idea…'} onChange={e=>patch(i.id,{text:e.target.value},false)} onBlur={()=>endEdit()} onKeyDown={e=>{if(e.key==='Escape')endEdit();}}/>:<span className={!i.text?'wb-placeholder':''}>{i.text || (i.kind==='note'?'Double-click to write':'Double-click to add text')}</span>}
            {selected===i.id && i.kind!=='pen' && <button className="wb-resize" aria-label="Resize selected item" onPointerDown={e=>startItem(e,i,true)}/>}
          </div>)}
        </div>
        <div className="wb-tools" onPointerDown={e=>e.stopPropagation()} role="toolbar" aria-label="Whiteboard tools">
          {([{id:'select',icon:MousePointer2,label:'Select & move'},{id:'hand',icon:Hand,label:'Pan canvas'},{id:'note',icon:StickyNote,label:'Sticky note'},{id:'text',icon:Type,label:'Text'},{id:'rectangle',icon:Square,label:'Rectangle'},{id:'circle',icon:Circle,label:'Circle'},{id:'pen',icon:Pencil,label:'Draw'}] as const).map(t=><button key={t.id} disabled={!loaded} title={t.label} aria-label={t.label} aria-pressed={tool===t.id} onClick={()=>{setTool(t.id);endEdit();}}><t.icon size={21} strokeWidth={1.8}/></button>)}
          <button title="Add image" aria-label="Add image" disabled={!loaded} onClick={()=>file.current?.click()}><ImagePlus size={21}/></button><div className="wb-divider"/><button title="Undo" aria-label="Undo" disabled={!history.past.length} onClick={undo}><Undo2 size={19}/></button><button title="Redo" aria-label="Redo" disabled={!history.future.length} onClick={redo}><Redo2 size={19}/></button>
        </div>
        <div className="wb-palette" onPointerDown={e=>e.stopPropagation()}><span>{item?'Item color':'Note color'}</span>{colors.map((c,n)=><button key={c} aria-label={['Yellow','Lavender','Blue','Orange','Pink','Green'][n]} aria-pressed={(item?.color||color)===c} style={{background:c}} onClick={()=>{setColor(c);if(item && item.kind!=='image')patch(item.id,{color:c});}}/>)}</div>
        {item && <div className="wb-properties" onPointerDown={e=>e.stopPropagation()}>{!['image','pen'].includes(item.kind) && <><button title="Edit text" aria-label="Edit selected text" onClick={()=>{beginEdit(item.id);}}><Type size={17}/></button><select aria-label="Font size" value={item.font} onChange={e=>patch(item.id,{font:Number(e.target.value)})}>{[14,18,20,24,28,32,40].map(n=><option key={n} value={n}>{n}px</option>)}</select></>}<button title="Bring to front" aria-label="Bring selected item to front" onClick={()=>changeLayer(true)}><BringToFront size={17}/></button><button title="Send to back" aria-label="Send selected item to back" onClick={()=>changeLayer(false)}><SendToBack size={17}/></button><button title="Duplicate" aria-label="Duplicate selected item" onClick={duplicate}><Copy size={17}/></button><button title="Delete" aria-label="Delete selected item" onClick={remove}><Trash2 size={17}/></button></div>}
        {templates && <div className="wb-templates" onPointerDown={e=>e.stopPropagation()}><strong>Start with a little structure</strong><p>Add a prompt and make room for ideas.</p>{['Brainstorm: What could we do better?','Retrospective: What went well?','Planning: What’s our next big goal?'].map(prompt=><button key={prompt} onClick={()=>{add('text',undefined,undefined,prompt);setTemplates(false);}}><LayoutTemplate size={16}/>{prompt}</button>)}</div>}
        {!board.items.length && loaded && <div className="wb-empty"><StickyNote size={40}/><h2>Make room for your ideas</h2><p>Choose a sticky note, then click anywhere to begin.</p><button onPointerDown={e=>e.stopPropagation()} onClick={()=>add('note')}>Add your first note <Plus size={16}/></button></div>}
        <div className="wb-hint" onPointerDown={e=>e.stopPropagation()}>{tool==='select'?'Drag to move · Double-click to edit':tool==='hand'?'Drag anywhere to explore':tool==='pen'?'Drag to draw on the canvas':`Click anywhere to add ${tool==='note'?'a sticky note':tool==='text'?'text':`a ${tool}`}`}</div>
        <div className="wb-zoom" onPointerDown={e=>e.stopPropagation()}><button aria-label="Zoom out" onClick={()=>zoom(view.scale-.1)}><Minus size={17}/></button><button title="Reset zoom" onClick={()=>zoom(1)}>{Math.round(view.scale*100)}%</button><button aria-label="Zoom in" onClick={()=>zoom(view.scale+.1)}><Plus size={17}/></button><i/><button aria-label="Fit board to view" title="Fit to view" onClick={fit}><Maximize2 size={17}/></button><button aria-label="Reset canvas position" title="Reset view" onClick={()=>setView({x:0,y:0,scale:1})}><RotateCcw size={17}/></button></div>
      </div>
      <footer className="wb-footer"><span><span className="wb-status-dot"/> Shared admin whiteboard</span><span>{board.items.length} objects · {connected?'Live collaboration':'Reconnecting'}</span></footer>
      <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e=>{void upload(e.target.files?.[0]);e.target.value='';}}/>
    </section>
  </AdminLayout>;
}
