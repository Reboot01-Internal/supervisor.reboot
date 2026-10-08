import { useEffect, useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react';
import { MousePointer2, Hand, StickyNote, Type, Square, Circle, Pencil, ImagePlus, Undo2, Redo2, Minus, Plus, Maximize2, Download, Copy, Trash2, Check, CloudOff, LayoutTemplate, X, RotateCcw, Users, BringToFront, SendToBack, AlignLeft, AlignCenter, AlignRight, Bold, Italic, Sticker } from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import Modal from '../components/Modal';
import { useSearchParams } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import WhiteboardSticker from '../components/WhiteboardSticker';
import { whiteboardStickers, getWhiteboardSticker, stickerSheets, stickerSheetData, type StickerGroup } from '../lib/whiteboardStickers';
import WhiteboardTextEditor from '../components/WhiteboardTextEditor';
import { textSegments,textLines,applyTextStyle,adjustTextRuns,type TextStyle,type TextRun } from '../lib/whiteboardText';
import UserAvatar from '../components/UserAvatar';
import { fetchRebootAvatar, getCachedRebootAvatar } from '../lib/rebootAvatars';
import { useSharedWhiteboard, diffWhiteboard, applyWhiteboardDelta, type Whiteboard as Board, type WhiteboardItem as Item, type WhiteboardKind as Kind } from '../lib/whiteboardSync';
import { useAuth } from '../lib/auth';
import './AdminWhiteboardPage.css';

type Tool = 'select' | 'hand' | Kind;
const colors = ['#ffe580', '#c8b6ff', '#a6ceff', '#ffb780', '#ffc5dc', '#bce8bc'];
const uid = () => crypto.randomUUID();
const componentClipboardType = 'application/x-taskflow-whiteboard';
const componentClipboardPrefix = 'TaskFlow whiteboard component\n';
function isTextInput(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT','TEXTAREA','SELECT'].includes(target.tagName));
}
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
  const [textDefaults,setTextDefaults]=useState({align:'center' as 'left' | 'center' | 'right',textColor:'#252537',bold:false,italic:false,font:20});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selected=selectedIds.length===1?selectedIds[0]:null;
  function setSelected(id:string|null){setSelectedIds(id?[id]:[]);}
  const selectedItems=board.items.filter(i=>selectedIds.includes(i.id));
  const [marquee,setMarquee]=useState<{x:number;y:number;w:number;h:number}|null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const [history, setHistory] = useState<{ past: {before:Board;after:Board}[]; future: {before:Board;after:Board}[] }>({ past: [], future: [] });
  const [full, setFull] = useState(false);
  const [stickersOpen,setStickersOpen]=useState(false);
  const [stickerGroup,setStickerGroup]=useState<StickerGroup>('Work & ideas');
  const [templates, setTemplates] = useState(false);
  const editorBefore = useRef<{board:Board;id:string} | null>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const interaction = useRef<{ type: 'move' | 'pan' | 'resize' | 'draw' | 'select'; ids?:string[]; id?: string; x: number; y: number; before: Board; originX: number; originY: number; layer?: number } | null>(null);
  const [textSelection,setTextSelection]=useState<{id:string;start:number;end:number}|null>(null);
  const formattingFocus=useRef(false);
  const [contextDismissed,setContextDismissed]=useState(false);
  const contextRef=useRef<HTMLDivElement>(null);
  const [canvasSize,setCanvasSize]=useState({width:1000,height:600});
  const [contextSize,setContextSize]=useState({width:535,height:100});
  const item = board.items.find(i => i.id === selected);

  const showContext=!contextDismissed && !!(item || ['note','text','rectangle','circle','pen'].includes(tool));
  useEffect(()=>{const el=canvas.current;if(!el)return;const observer=new ResizeObserver(entries=>{const r=entries[0].contentRect;setCanvasSize({width:r.width,height:r.height});});observer.observe(el);return()=>observer.disconnect();},[]);
  useEffect(()=>{const el=contextRef.current;if(!el)return;const observer=new ResizeObserver(()=>{const r=el.getBoundingClientRect();setContextSize({width:r.width,height:r.height});});observer.observe(el);return()=>observer.disconnect();},[showContext]);
  let contextPosition={left:80,top:18};
  if(item){const left=item.x*view.scale+view.x,top=item.y*view.scale+view.y,right=left+item.w*view.scale,bottom=top+item.h*view.scale;const x=Math.max(12,Math.min(left,canvasSize.width-contextSize.width-12));
    if(top-contextSize.height-12>=12)contextPosition={left:x,top:top-contextSize.height-12};
    else if(bottom+contextSize.height+24<=canvasSize.height)contextPosition={left:x,top:bottom+12};
    else if(right+contextSize.width+24<=canvasSize.width)contextPosition={left:right+12,top:Math.max(12,Math.min(top,canvasSize.height-contextSize.height-12))};
    else contextPosition={left:x,top:Math.max(12,canvasSize.height-contextSize.height-12)};
  }
  function remember(before: Board, after = boardRef.current, id?: string) { if (id) { before={title:after.title,items:before.items.filter(i=>i.id===id)};after={title:after.title,items:after.items.filter(i=>i.id===id)}; } if (JSON.stringify(before) !== JSON.stringify(after)) setHistory(h => ({ past: [...h.past.slice(-39), {before,after}], future: [] })); }
  function beginEdit(id: string) { setContextDismissed(false); editorBefore.current={board:boardRef.current,id};setTextSelection(null);formattingFocus.current=false;setEditing(id); }
  function endEdit() { if(editorBefore.current)remember(editorBefore.current.board,boardRef.current,editorBefore.current.id);editorBefore.current=null;setTextSelection(null);formattingFocus.current=false;setEditing(null); }
  function commit(next: Board) { const merged=applyWhiteboardDelta(boardRef.current,diffWhiteboard(board,next));remember(boardRef.current,merged);setBoard(merged); }
  function patch(id: string, changes: Partial<Item>, record = true) {
    const next = { ...boardRef.current, items: boardRef.current.items.map(i => i.id === id ? { ...i, ...changes } : i) };
    if (record) commit(next); else setBoard(next);
  }
  const selectedTextStyle=item && textSelection?.id===item.id && textSelection.end>textSelection.start ? textSegments(item.text,item.runs).find(s=>s.start<=textSelection.start&&s.end>textSelection.start) : undefined;
  function formatText(changes:Partial<typeof textDefaults>) {
    setTextDefaults(previous=>({...previous,...changes}));if(!item||['image','pen','sticker'].includes(item.kind))return;
    const style:TextStyle={};for(const key of ['font','textColor','bold','italic','align'] as const)if(changes[key]!==undefined)Object.assign(style,{[key]:changes[key]});
    if(textSelection?.id===item.id&&textSelection.end>textSelection.start&&Object.keys(style).length){const start=changes.align?item.text.lastIndexOf('\n',Math.max(0,textSelection.start-1))+1:textSelection.start;const nextBreak=item.text.indexOf('\n',textSelection.end-1);const end=changes.align?(nextBreak<0?item.text.length:nextBreak+1):textSelection.end;patch(item.id,{runs:applyTextStyle(item.text,item.runs||[],start,end,style)});}
    else {const runs=(item.runs||[]).map(run=>{const next={...run};for(const key of Object.keys(style) as (keyof TextStyle)[])delete next[key];return next;}).filter(r=>Object.keys(r).length>2);patch(item.id,{...changes,runs});}
  }
  function undo() { if (!history.past.length) return; endEdit(); const action=history.past[history.past.length-1];setHistory({past:history.past.slice(0,-1),future:[action,...history.future]});setBoard(applyWhiteboardDelta(boardRef.current,diffWhiteboard(action.after,action.before)));setSelected(null); }
  function redo() { if (!history.future.length) return;endEdit();const action=history.future[0];setHistory({past:[...history.past,action],future:history.future.slice(1)});setBoard(applyWhiteboardDelta(boardRef.current,diffWhiteboard(action.before,action.after)));setSelected(null); }
  function remove() { if (!selectedIds.length) return; commit({ ...board, items: board.items.filter(i => !selectedIds.includes(i.id)) }); setSelected(null); endEdit(); }
  function topLayer() { return Math.max(0,...boardRef.current.items.map((i,n)=>i.z ?? n+1))+1; }
  function changeLayer(front: boolean) { if(item)patch(item.id,{z:front ? topLayer() : Math.min(0,...boardRef.current.items.map((i,n)=>i.z ?? n+1))-1}); }
  function pasteItems(sources:Item[]) {
    const current=boardRef.current;if(!sources.length)return;
    if(current.items.length+sources.length>500){setError('This whiteboard has reached its 500-item limit.');return;}
    let offset=24;
    while(sources.some(source=>current.items.some(i=>i.x===source.x+offset&&i.y===source.y+offset)))offset+=24;
    const layer=topLayer();
    const copies=[...sources].sort((a,b)=>(a.z??0)-(b.z??0)).map((source,n)=>({...source,id:uid(),x:source.x+offset,y:source.y+offset,z:layer+n}));
    endEdit();commit({...current,items:[...current.items,...copies]});setSelectedIds(copies.map(i=>i.id));setTool('select');setContextDismissed(false);
  }
  function duplicate(){pasteItems(selectedItems);}
  function point(e: { clientX: number; clientY: number }) { const r = canvas.current!.getBoundingClientRect(); return { x: (e.clientX - r.left - view.x) / view.scale, y: (e.clientY - r.top - view.y) / view.scale }; }
  function add(kind: Kind, x?: number, y?: number, text = '', height?: number) {
    if (board.items.length >= 500) { setError('This whiteboard has reached its 500-item limit.'); return; }
    const r = canvas.current!.getBoundingClientRect();
    const next: Item = { id: uid(), kind, ...textDefaults, z:topLayer(), x: x ?? (r.width / 2 - view.x) / view.scale - 90, y: y ?? (r.height / 2 - view.y) / view.scale - 90, w: kind === 'text' ? 320 : kind === 'image' ? 280 : 180, h: height ?? (kind === 'text' ? 100 : kind === 'image' ? 200 : 180), color, text, font: textDefaults.font };
    commit({ ...board, items: [...board.items, next] }); setSelected(next.id); setTool('select');
    if (kind === 'note' || kind === 'text') beginEdit(next.id);
    return next;
  }
  function addSticker(id:string){
    const sticker=getWhiteboardSticker(id);if(!sticker || boardRef.current.items.length>=500){setError('This whiteboard has reached its 500-item limit.');return;}
    endEdit();const r=canvas.current!.getBoundingClientRect();const width=160,height=width*sticker.height/sticker.width;
    const next:Item={id:uid(),kind:'sticker',stickerId:id,x:(r.width/2-view.x)/view.scale-width/2,y:(r.height/2-view.y)/view.scale-height/2,w:width,h:height,color:colors[0],font:20,text:'',z:topLayer()};
    commit({...boardRef.current,items:[...boardRef.current.items,next]});setSelected(next.id);setTool('select');setContextDismissed(false);setStickersOpen(false);
  }
  function startCanvas(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || !loaded) return;
    endEdit(); setSelected(null);setStickersOpen(false);
    if (tool === 'hand') { interaction.current = { type: 'pan', x: e.clientX, y: e.clientY, originX: view.x, originY: view.y, before: board }; e.currentTarget.setPointerCapture(e.pointerId); return; }
    const p = point(e);
    if(tool==='select'){interaction.current={type:'select',x:p.x,y:p.y,originX:p.x,originY:p.y,before:board,ids:e.shiftKey?selectedIds:[]};setMarquee({x:p.x,y:p.y,w:0,h:0});e.currentTarget.setPointerCapture(e.pointerId);return;}
    if (tool === 'pen') {
      if (board.items.length >= 500) { setError('This whiteboard has reached its 500-item limit.'); return; }
      const next: Item = { id: uid(), kind: 'pen', z:topLayer(), x: p.x, y: p.y, w: 1, h: 1, color, text: '', font: 20, points: [[0,0]] };
      setBoard({ ...boardRef.current, items: [...boardRef.current.items, next] }); setSelected(next.id);
      interaction.current = { type: 'draw', id: next.id, x: p.x, y: p.y, originX: p.x, originY: p.y, before: board };
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  }
  function startItem(e: ReactPointerEvent, target: Item, resize = false) {
    setContextDismissed(false);
    if (tool !== 'select' && !resize) return;
    e.stopPropagation();
    if (editing === target.id && !resize) return;
    canvas.current?.focus({preventScroll:true});
    if((e.shiftKey||e.metaKey||e.ctrlKey)&&!resize){endEdit();setSelectedIds(ids=>ids.includes(target.id)?ids.filter(id=>id!==target.id):[...ids,target.id]);return;}
    const ids=!resize&&selectedIds.includes(target.id)?board.items.filter(i=>selectedIds.includes(i.id)).sort((a,b)=>(a.z??board.items.indexOf(a))-(b.z??board.items.indexOf(b))).map(i=>i.id):[target.id];
    setSelectedIds(ids); endEdit();
    const p = point(e);
    interaction.current = { type: resize ? 'resize' : 'move', ids, id: target.id, x: p.x, y: p.y, before: board, originX: resize ? target.w : target.x, originY: resize ? target.h : target.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function move(e: ReactPointerEvent) {
    const drag = interaction.current; if (!drag) return;
    if (drag.type === 'pan') { setView(v => ({ ...v, x: drag.originX + e.clientX - drag.x, y: drag.originY + e.clientY - drag.y })); return; }
    const p = point(e);
    if(drag.type==='select'){const bounds={x:Math.min(p.x,drag.x),y:Math.min(p.y,drag.y),w:Math.abs(p.x-drag.x),h:Math.abs(p.y-drag.y)};setMarquee(bounds);if(bounds.w>3||bounds.h>3)setSelectedIds([...new Set([...(drag.ids||[]),...boardRef.current.items.filter(i=>i.x<bounds.x+bounds.w&&i.x+i.w>bounds.x&&i.y<bounds.y+bounds.h&&i.y+i.h>bounds.y).map(i=>i.id)])]);return;}
    if (drag.type === 'draw') {
      const i = boardRef.current.items.find(i => i.id === drag.id)!;
      patch(i.id, { points: [...(i.points || []), [p.x - drag.originX, p.y - drag.originY]] }, false);
    } else if (drag.type === 'resize') patch(drag.id!, { w: Math.max(80, drag.originX + p.x - drag.x), h: Math.max(60, drag.originY + p.y - drag.y) }, false);
    else {
      if (drag.layer === undefined && Math.hypot(p.x-drag.x,p.y-drag.y)>2) drag.layer=topLayer();
      const ids=drag.ids||[drag.id!];
      setBoard({...boardRef.current,items:boardRef.current.items.map(i=>{const origin=drag.before.items.find(o=>o.id===i.id);return ids.includes(i.id)&&origin?{...i,x:origin.x+p.x-drag.x,y:origin.y+p.y-drag.y,...(drag.layer===undefined?{}:{z:drag.layer+ids.indexOf(i.id)})}:i;})});
    }
  }
  function stop() {
    const drag = interaction.current;
    if (drag && (drag.type === 'move' || drag.type === 'resize') && JSON.stringify(drag.before) !== JSON.stringify(boardRef.current)) remember(drag.ids?.length&&drag.ids.length>1?{...drag.before,items:drag.before.items.filter(i=>drag.ids!.includes(i.id))}:drag.before,drag.ids?.length&&drag.ids.length>1?{...boardRef.current,items:boardRef.current.items.filter(i=>drag.ids!.includes(i.id))}:boardRef.current,drag.ids?.length&&drag.ids.length>1?undefined:drag.id);
    setMarquee(null);
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
  async function exportBoard() {
    try {
    const sheets=[...new Set(board.items.filter(i=>i.kind==='sticker').map(i=>getWhiteboardSticker(i.stickerId)?.sheet).filter((s):s is keyof typeof stickerSheets=>!!s))];
    const data=await Promise.all(sheets.map(async name=>({name,uri:await stickerSheetData(name)})));
    const defs=data.map(({name,uri})=>`<image id="sticker-sheet-${name}" href="${uri}" width="${stickerSheets[name].width}" height="${stickerSheets[name].height}"/>`).join('');
    const escape = (s: string) => s.replace(/[<>&"]/g, c => ({ '<':'&lt;', '>':'&gt;', '&':'&amp;', '"':'&quot;' }[c]!));
    const bounds = board.items.flatMap(i => i.kind === 'pen' ? (i.points || []).map(p => ({ x:i.x+p[0], y:i.y+p[1], w:1, h:1 })) : [i]);
    const left = Math.min(0,...bounds.map(i => i.x))-40, top = Math.min(0,...bounds.map(i=>i.y))-40;
    const w = Math.max(800,...bounds.map(i=>i.x+i.w))-left+40, h = Math.max(600,...bounds.map(i=>i.y+i.h))-top+40;
    const elements = board.items.map((item,index)=>({item,layer:item.z ?? index+1})).sort((a,b)=>a.layer-b.layer).map(({item:i},index) => {
      if(i.kind==='sticker'){const sticker=getWhiteboardSticker(i.stickerId);return sticker?`<svg x="${i.x}" y="${i.y}" width="${i.w}" height="${i.h}" viewBox="${sticker.x} ${sticker.y} ${sticker.width} ${sticker.height}" overflow="hidden"><defs><clipPath id="sticker-clip-${index}" clipPathUnits="userSpaceOnUse"><rect x="${sticker.x}" y="${sticker.y}" width="${sticker.width}" height="${sticker.height}"/></clipPath></defs><g clip-path="url(#sticker-clip-${index})"><use href="#sticker-sheet-${sticker.sheet}"/></g></svg>`:'';}
      if (i.kind === 'pen') return `<polyline transform="translate(${i.x} ${i.y})" points="${i.points?.map(p=>p.join(',')).join(' ')}" stroke="${i.color}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`;
      if (i.kind === 'image') return /^data:image\/(png|jpeg|webp);base64,/.test(i.text) ? `<image x="${i.x}" y="${i.y}" width="${i.w}" height="${i.h}" href="${escape(i.text)}"/>` : '';
      const shape = i.kind === 'circle' ? `<ellipse cx="${i.x+i.w/2}" cy="${i.y+i.h/2}" rx="${i.w/2}" ry="${i.h/2}" fill="${i.color}"/>` : i.kind !== 'text' ? `<rect x="${i.x}" y="${i.y}" width="${i.w}" height="${i.h}" fill="${i.color}" rx="${i.kind==='rectangle'?12:2}"/>` : '';
      const size=Math.max(1,Math.floor((i.w-36)/(i.font*.55)));
      const lines:{start:number;end:number}[]=[];let offset=0;
      for(const paragraph of i.text.split('\n')){if(!paragraph.length)lines.push({start:offset,end:offset});else for(let n=0;n<paragraph.length;n+=size)lines.push({start:offset+n,end:offset+Math.min(n+size,paragraph.length)});offset+=paragraph.length+1;}
      const align=i.align ?? 'center',anchor=align==='left'?'start':align==='right'?'end':'middle';
      const textX=align==='left'?i.x+18:align==='right'?i.x+i.w-18:i.x+i.w/2;
      const ink=/^#[0-9a-f]{6}$/i.test(i.textColor || '')?i.textColor:'#252537';
      const lineHeights=lines.map(line=>Math.max(i.font,...(i.runs||[]).filter(r=>r.start<line.end&&r.end>line.start).map(r=>r.font||i.font))*1.3);
      let baseline=i.y+Math.max(0,(i.h-lineHeights.reduce((sum,h)=>sum+h,0))/2);
      const markup=lines.map((line,n)=>{baseline+=lineHeights[n];const runs=textSegments(i.text,i.runs).filter(s=>s.start<line.end&&s.end>line.start);const lineAlign=[...(i.runs||[])].reverse().find(r=>r.align&&r.start<=line.start&&r.end>line.start)?.align||align;const lineX=lineAlign==='left'?i.x+18:lineAlign==='right'?i.x+i.w-18:textX;const lineAnchor=lineAlign==='left'?'start':lineAlign==='right'?'end':'middle';return `<tspan x="${lineX}" y="${baseline}" text-anchor="${lineAnchor}">${runs.map(s=>`<tspan fill="${/^#[0-9a-f]{6}$/i.test(s.textColor||'')?s.textColor:ink}" font-size="${typeof s.font==='number'&&s.font>=1&&s.font<=200?s.font:i.font}" font-weight="${(s.bold??i.bold)?700:400}" font-style="${(s.italic??i.italic)?'italic':'normal'}">${escape(i.text.slice(Math.max(s.start,line.start),Math.min(s.end,line.end)))}</tspan>`).join('')}</tspan>`;}).join('');
      return shape+`<text fill="${ink}" font-family="Arial,sans-serif" font-size="${i.font}" font-weight="${i.bold?700:400}" font-style="${i.italic?'italic':'normal'}" text-anchor="${anchor}">${markup}</text>`;
    }).join('');
    const blob = new Blob([`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${left} ${top} ${w} ${h}" width="${w}" height="${h}"><defs>${defs}</defs><rect x="${left}" y="${top}" width="${w}" height="${h}" fill="#f8f9fc"/>${elements}</svg>`],{type:'image/svg+xml'});
    const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href=url; link.download=`${board.title.replace(/[^a-z0-9_-]/gi,'_') || 'whiteboard'}.svg`; link.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
    } catch(e){setError(e instanceof Error?e.message:'Could not export this board');}
  }
  return <AdminLayout active="whiteboard" title="Whiteboard" subtitle="One shared space for your admin team’s next big idea.">
    {navigation}
    <section className={`wb-shell ${full ? 'wb-full' : ''}`} aria-label="Admin whiteboard" onCopy={e=>{
      if(!loaded || isTextInput(e.target) || !selectedItems.length)return;
      const payload=JSON.stringify({type:'taskflow-whiteboard-component',version:2,items:selectedItems});
      e.clipboardData.setData(componentClipboardType,payload);
      e.clipboardData.setData('text/plain',componentClipboardPrefix+payload);
      e.preventDefault();
    }} onPaste={e=>{
      if(!loaded || isTextInput(e.target))return;
      const plain=e.clipboardData.getData('text/plain');
      const payload=e.clipboardData.getData(componentClipboardType)||(plain.startsWith(componentClipboardPrefix)?plain.slice(componentClipboardPrefix.length):'');
      if(!payload)return;
      e.preventDefault();
      try {
        const data=JSON.parse(payload);
        if(data.type!=='taskflow-whiteboard-component'||![1,2].includes(data.version))return;
        const sources:Item[]=data.version===1?[data.item]:data.items;
        if(!Array.isArray(sources)||!sources.length||sources.length>500)return;
        for(const source of sources){
        if(!source||!['note','text','rectangle','circle','image','pen','sticker'].includes(source.kind))return;
        if(!(['x','y','w','h','font'] as const).every(key=>typeof source[key]==='number'&&Number.isFinite(source[key]))||source.w<=0||source.h<=0||typeof source.text!=='string'||typeof source.color!=='string')return;
        if(source.runs&&!Array.isArray(source.runs)||source.points&&!Array.isArray(source.points))return;
        if(source.runs?.some((r:TextRun)=>!r||!Number.isInteger(r.start)||!Number.isInteger(r.end)))return;
        if(source.points?.some((p:number[])=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)))return;
        if(source.kind==='sticker'&&!getWhiteboardSticker(source.stickerId))return;
        }
        pasteItems(sources);
      } catch { /* Ignore clipboard content that is not a board component. */ }
    }} onKeyDown={e => {
      if (!loaded || isTextInput(e.target)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {e.preventDefault();setSelectedIds(board.items.map(i=>i.id));}
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
          {loaded && board.items.map(i=><div key={i.id} className={`wb-item wb-${i.kind} ${selectedIds.includes(i.id)?'wb-selected':''}`} style={{left:i.x,top:i.y,width:i.w,height:i.h,background:i.kind==='text'||i.kind==='image'||i.kind==='pen'||i.kind==='sticker'?'transparent':i.color,fontSize:i.font,textAlign:i.align ?? 'center',color:i.textColor,fontWeight:i.bold?700:400,fontStyle:i.italic?'italic':'normal',zIndex:i.z ?? board.items.findIndex(object=>object.id===i.id)+1}} onPointerDown={e=>startItem(e,i)} onDoubleClick={e=>{e.stopPropagation();if(!['image','pen','sticker'].includes(i.kind)){setSelected(i.id);beginEdit(i.id);}}}>
            {i.kind==='sticker'?<WhiteboardSticker id={i.stickerId}/>:i.kind==='image'? <img draggable={false} src={/^data:image\/(png|jpeg|webp);base64,/.test(i.text)?i.text:undefined} alt="Whiteboard image"/> : i.kind==='pen'?<svg className="wb-stroke"><polyline points={i.points?.map(p=>p.join(',')).join(' ')} fill="none" stroke={i.color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/></svg> : editing===i.id?<WhiteboardTextEditor text={i.text} runs={i.runs||[]} align={i.align||'center'} placeholder={i.kind==='text'?'Add your text…':'Write an idea…'} onChange={text=>patch(i.id,{text,runs:adjustTextRuns(i.text,text,i.runs||[])},false)} onSelection={(start,end)=>setTextSelection(previous=>previous?.id===i.id&&previous.start===start&&previous.end===end?previous:{id:i.id,start,end})} onBlur={target=>{if(!formattingFocus.current && !(target instanceof HTMLElement&&target.closest('.wb-context')))endEdit();}} onEscape={endEdit}/>:<span className={!i.text?'wb-placeholder':''}>{i.text?textLines(i.text,i.runs,i.align||'center').map((line,n)=><span className="wb-text-line" key={n} style={{textAlign:line.align}}>{line.pieces.length?line.pieces.map((s,k)=><span key={k} style={{color:s.textColor,fontSize:s.font,fontWeight:s.bold===undefined?undefined:s.bold?700:400,fontStyle:s.italic===undefined?undefined:s.italic?'italic':'normal'}}>{s.text}</span>):'\u200b'}</span>):(i.kind==='note'?'Double-click to write':'Double-click to add text')}</span>}


            {selected===i.id && i.kind!=='pen' && <button className="wb-resize" aria-label="Resize selected item" onPointerDown={e=>startItem(e,i,true)}/>}
          </div>)}
          {marquee&&<div style={{position:'absolute',left:marquee.x,top:marquee.y,width:marquee.w,height:marquee.h,border:'1px solid #6d5efc',background:'rgba(109,94,252,.1)',pointerEvents:'none',zIndex:2147483647}}/>}
        </div>
        {selectedItems.length>1&&<div className="wb-context" style={{left:90,top:18}} onPointerDown={e=>e.stopPropagation()}><span>{selectedItems.length} selected</span><button aria-label="Duplicate selected items" onClick={duplicate}><Copy size={17}/></button><button aria-label="Delete selected items" onClick={remove}><Trash2 size={17}/></button></div>}
        <div className="wb-tools" onPointerDown={e=>e.stopPropagation()} role="toolbar" aria-label="Whiteboard tools">
          {([{id:'select',icon:MousePointer2,label:'Select & move'},{id:'hand',icon:Hand,label:'Pan canvas'},{id:'note',icon:StickyNote,label:'Sticky note'},{id:'text',icon:Type,label:'Text'},{id:'rectangle',icon:Square,label:'Rectangle'},{id:'circle',icon:Circle,label:'Circle'},{id:'pen',icon:Pencil,label:'Draw'}] as const).map(t=><button key={t.id} disabled={!loaded} title={t.label} aria-label={t.label} aria-pressed={tool===t.id} onClick={()=>{setTool(t.id);endEdit();setSelected(null);setContextDismissed(false);}}><t.icon size={21} strokeWidth={1.8}/></button>)}
          <button title="Stickers" aria-label="Stickers" aria-pressed={stickersOpen} disabled={!loaded} onClick={()=>{endEdit();setSelected(null);setTool('select');setStickersOpen(value=>!value);}}><Sticker size={21}/></button><button title="Add image" aria-label="Add image" disabled={!loaded} onClick={()=>file.current?.click()}><ImagePlus size={21}/></button><div className="wb-divider"/><button title="Undo" aria-label="Undo" disabled={!history.past.length} onClick={undo}><Undo2 size={19}/></button><button title="Redo" aria-label="Redo" disabled={!history.future.length} onClick={redo}><Redo2 size={19}/></button>
        </div>
        {stickersOpen && <section className="wb-sticker-picker" onPointerDown={e=>e.stopPropagation()} aria-label="Sticker library">
          <header><div><strong>Stickers for your board</strong><p>Ideas, activities, and useful board helpers.</p></div><button aria-label="Close stickers" onClick={()=>setStickersOpen(false)}><X size={16}/></button></header>
          <div className="wb-sticker-tabs" role="tablist" aria-label="Sticker categories">{(['Work & ideas','Board helpers','Tech symbols','Cute'] as const).map(group=><button key={group} role="tab" aria-selected={group===stickerGroup} onClick={()=>setStickerGroup(group)}>{group}</button>)}</div>
          <div className="wb-sticker-grid" role="tabpanel" aria-label={stickerGroup}>{whiteboardStickers.filter(s=>s.group===stickerGroup).map(sticker=><button key={sticker.id} title={sticker.name} aria-label={`Add ${sticker.name} sticker`} onClick={()=>addSticker(sticker.id)}><WhiteboardSticker id={sticker.id}/><span>{sticker.name}</span></button>)}</div>
          <footer>Drag to move · Resize from the corner</footer>
        </section>}
        {showContext && <div ref={contextRef} className="wb-context" role="toolbar" aria-label="Selected item controls" onPointerDown={e=>{e.stopPropagation();formattingFocus.current=true;}} style={contextPosition}>
          <button className="wb-context-dismiss" title="Hide formatting controls" aria-label="Hide formatting controls" onClick={()=>setContextDismissed(true)}><X size={13}/></button>
          {((item && ['note','rectangle','circle','pen'].includes(item.kind)) || (!item && tool!=='text')) && <div className="wb-palette"><span>{item?.kind==='pen'||tool==='pen'?'Stroke color':'Note color'}</span>{colors.map((c,n)=><button key={c} aria-label={['Yellow','Lavender','Blue','Orange','Pink','Green'][n]} aria-pressed={(item?.color||color)===c} style={{background:c}} onClick={()=>{setColor(c);if(item)patch(item.id,{color:c});}}/>)}</div>}
          {((item && !['image','pen','sticker'].includes(item.kind)) || (!item && ['note','text','rectangle','circle'].includes(tool))) && <div className="wb-formatting">
            {item && <button title="Edit text" aria-label="Edit selected text" onClick={()=>beginEdit(item.id)}><Type size={17}/></button>}
            <select aria-label="Font size" value={selectedTextStyle?.font ?? item?.font ?? textDefaults.font} onChange={e=>formatText({font:Number(e.target.value)})}>{[14,18,20,24,28,32,40].map(n=><option key={n} value={n}>{n}px</option>)}</select>
            <span className="wb-control-divider"/>
            {([{value:'left',Icon:AlignLeft},{value:'center',Icon:AlignCenter},{value:'right',Icon:AlignRight}] as const).map(({value,Icon})=><button key={value} title={`Align ${value}`} aria-label={`Align ${value}`} aria-pressed={(selectedTextStyle?.align ?? item?.align ?? textDefaults.align)===value} onClick={()=>formatText({align:value})}><Icon size={17}/></button>)}
            <span className="wb-control-divider"/>
            <button title="Bold" aria-label="Bold" aria-pressed={selectedTextStyle?.bold ?? item?.bold ?? textDefaults.bold} onClick={()=>formatText({bold:!(selectedTextStyle?.bold ?? item?.bold ?? textDefaults.bold)})}><Bold size={17}/></button>
            <button title="Italic" aria-label="Italic" aria-pressed={selectedTextStyle?.italic ?? item?.italic ?? textDefaults.italic} onClick={()=>formatText({italic:!(selectedTextStyle?.italic ?? item?.italic ?? textDefaults.italic)})}><Italic size={17}/></button>
            <label className="wb-text-color" title="Text color"><Type size={17}/><input type="color" aria-label="Text color" value={selectedTextStyle?.textColor ?? item?.textColor ?? textDefaults.textColor} onChange={e=>formatText({textColor:e.target.value})}/></label>
          </div>}
          {item && <div className="wb-context-actions"><button title="Bring to front" aria-label="Bring selected item to front" onClick={()=>changeLayer(true)}><BringToFront size={17}/></button><button title="Send to back" aria-label="Send selected item to back" onClick={()=>changeLayer(false)}><SendToBack size={17}/></button><button title="Duplicate" aria-label="Duplicate selected item" onClick={duplicate}><Copy size={17}/></button><button title="Delete" aria-label="Delete selected item" onClick={remove}><Trash2 size={17}/></button></div>}
        </div>}
        {templates && <div className="wb-templates" onPointerDown={e=>e.stopPropagation()}><strong>Start with a little structure</strong><p>Add a prompt and make room for ideas.</p>{['Brainstorm: What could we do better?','Retrospective: What went well?','Planning: What’s our next big goal?'].map(prompt=><button key={prompt} onClick={()=>{add('text',undefined,undefined,prompt);setTemplates(false);}}><LayoutTemplate size={16}/>{prompt}</button>)}</div>}
        {!board.items.length && loaded && <div className="wb-empty"><StickyNote size={40}/><h2>Make room for your ideas</h2><p>Choose a sticky note, then click anywhere to begin.</p><button onPointerDown={e=>e.stopPropagation()} onClick={()=>add('note')}>Add your first note <Plus size={16}/></button></div>}
        <div className="wb-hint" onPointerDown={e=>e.stopPropagation()}>{tool==='select'?'Drag to select · Shift-click to select more · Double-click to edit':tool==='hand'?'Drag anywhere to explore':tool==='pen'?'Drag to draw on the canvas':`Click anywhere to add ${tool==='note'?'a sticky note':tool==='text'?'text':`a ${tool}`}`}</div>
        <div className="wb-zoom" onPointerDown={e=>e.stopPropagation()}><button aria-label="Zoom out" onClick={()=>zoom(view.scale-.1)}><Minus size={17}/></button><button title="Reset zoom" onClick={()=>zoom(1)}>{Math.round(view.scale*100)}%</button><button aria-label="Zoom in" onClick={()=>zoom(view.scale+.1)}><Plus size={17}/></button><i/><button aria-label="Fit board to view" title="Fit to view" onClick={fit}><Maximize2 size={17}/></button><button aria-label="Reset canvas position" title="Reset view" onClick={()=>setView({x:0,y:0,scale:1})}><RotateCcw size={17}/></button></div>
      </div>
      <footer className="wb-footer"><span><span className="wb-status-dot"/> Shared admin whiteboard</span><span>{board.items.length} objects · {connected?'Live collaboration':'Reconnecting'}</span></footer>
      <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e=>{void upload(e.target.files?.[0]);e.target.value='';}}/>
    </section>
  </AdminLayout>;
}
