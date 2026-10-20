import { useEffect,useLayoutEffect,useRef } from 'react';
import { textLines,type TextRun } from '../lib/whiteboardText';
type Props={text:string;runs:TextRun[];align:'left'|'center'|'right';placeholder:string;onChange:(text:string)=>void;onSelection:(start:number,end:number)=>void;onBlur:(target:EventTarget|null)=>void;onEscape:()=>void};
// Resolve each endpoint within its visual line so a newline boundary places the
// caret on the next line, including an empty final line.
function rangeAt(element:HTMLElement,start:number,end:number){
 const range=document.createRange();
 function pointAt(position:number):[Node,number]{
  let offset=0;
  for(const line of Array.from(element.children)){
   const content=line.textContent||'';
   const length=content.length-(content.endsWith('\n')?1:0);
   if(position<=offset+length){
    const walker=document.createTreeWalker(line,NodeFilter.SHOW_TEXT);let node=walker.nextNode(),remaining=Math.max(0,position-offset);
    while(node){const size=node.textContent?.length||0;if(remaining<=size)return[node,remaining];remaining-=size;node=walker.nextNode();}
    return[line,0];
   }
   offset+=content.length;
  }
  return[element,element.childNodes.length];
 }
 const [startNode,startOffset]=pointAt(start),[endNode,endOffset]=pointAt(end);
 range.setStart(startNode,startOffset);range.setEnd(endNode,endOffset);return range;
}
export default function WhiteboardTextEditor({text,runs,align,placeholder,onChange,onSelection,onBlur,onEscape}:Props){
 const ref=useRef<HTMLDivElement>(null);const selection=useRef({start:0,end:0});const callback=useRef(onSelection);useLayoutEffect(()=>{callback.current=onSelection;},[onSelection]);
 useLayoutEffect(()=>{const el=ref.current;if(!el)return;const focused=document.activeElement===el;const nodes=textLines(text,runs,align).map(line=>{const block=document.createElement('span');block.className='wb-text-line';block.style.textAlign=line.align;for(const s of line.pieces){const span=document.createElement('span');span.textContent=s.text;if(s.textColor&&/^#[0-9a-f]{6}$/i.test(s.textColor))span.style.color=s.textColor;if(s.font)span.style.fontSize=`${s.font}px`;if(s.bold!==undefined)span.style.fontWeight=s.bold?'700':'400';if(s.italic!==undefined)span.style.fontStyle=s.italic?'italic':'normal';block.append(span);}if(line.newline)block.append(document.createTextNode('\n'));else if(!line.pieces.length)block.append(document.createElement('br'));return block;});el.replaceChildren(...nodes);if(focused){const r=rangeAt(el,Math.min(selection.current.start,text.length),Math.min(selection.current.end,text.length));const sel=window.getSelection();sel?.removeAllRanges();sel?.addRange(r);}},[text,runs,align]);
 useEffect(()=>{const el=ref.current;el?.focus({preventScroll:true});function update(){const sel=window.getSelection();if(!el||!sel?.rangeCount)return;const r=sel.getRangeAt(0);if(!el.contains(r.startContainer)||!el.contains(r.endContainer))return;const pre=r.cloneRange();pre.selectNodeContents(el);pre.setEnd(r.startContainer,r.startOffset);const start=pre.toString().length,end=start+r.toString().length;selection.current={start,end};callback.current(start,end);}document.addEventListener('selectionchange',update);return()=>document.removeEventListener('selectionchange',update);},[]);
 function captureSelection(){const el=ref.current,sel=window.getSelection();if(!el||!sel?.rangeCount)return;const r=sel.getRangeAt(0);if(!el.contains(r.startContainer)||!el.contains(r.endContainer))return;const pre=r.cloneRange();pre.selectNodeContents(el);pre.setEnd(r.startContainer,r.startOffset);const start=pre.toString().length,end=start+r.toString().length;selection.current={start,end};callback.current(start,end);}
 function insert(value:string){const el=ref.current,sel=window.getSelection();if(!el||!sel?.rangeCount)return;const range=sel.getRangeAt(0);if(!el.contains(range.commonAncestorContainer))return;range.deleteContents();const node=document.createTextNode(value);range.insertNode(node);range.setStartAfter(node);range.collapse(true);sel.removeAllRanges();sel.addRange(range);captureSelection();onChange(el.textContent||'');}
 return <div ref={ref} className="wb-rich-editor" contentEditable suppressContentEditableWarning role="textbox" aria-label="Edit whiteboard text" aria-multiline="true" data-placeholder={placeholder} onInput={e=>{captureSelection();onChange(e.currentTarget.textContent||'');}} onBlur={e=>onBlur(e.relatedTarget)} onPaste={e=>{e.preventDefault();insert(e.clipboardData.getData('text/plain'));}} onKeyDown={e=>{if(e.key==='Escape')onEscape();else if(e.key==='Enter'){e.preventDefault();insert('\n');}}}/>;
}
