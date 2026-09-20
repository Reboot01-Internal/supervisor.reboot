import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";

type Props = { src: string; title: string; description?: string; wide?: boolean; onClose: () => void; onPrevious?: () => void; onNext?: () => void; counter?: string; onDelete?: () => void };

export default function ImagePreview({ src, title, description, wide = false, onClose, onPrevious, onNext, counter, onDelete }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.stopImmediatePropagation(); onClose(); }
      if (event.key === "ArrowLeft" && onPrevious) { event.preventDefault(); onPrevious(); }
      if (event.key === "ArrowRight" && onNext) { event.preventDefault(); onNext(); }
      if (event.key === "Tab") {
        const buttons = panelRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
        if (!buttons?.length) return;
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", handleKey, true);
    return () => { document.removeEventListener("keydown", handleKey, true); previous?.focus(); };
  }, [onClose, onPrevious, onNext]);
  return createPortal(
    <div className="fixed inset-0 z-[10000] grid place-items-center bg-slate-900/35 backdrop-blur-sm p-6" role="dialog" aria-modal="true" aria-label={`${title} image preview`} onClick={(event) => { event.stopPropagation(); onClose(); }}>
      <div ref={panelRef} className={`relative w-full ${wide ? "max-w-5xl" : "max-w-[520px]"} rounded-[24px] border border-violet-100 bg-white p-2 shadow-[0_24px_70px_rgba(76,29,149,0.18)]`} onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-3 py-2">
          <div className="min-w-0"><div className="truncate text-[16px] font-bold text-slate-900">{title}</div>{description && <div className="truncate text-xs text-slate-500">{description}</div>}</div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close image preview" className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-violet-50 text-violet-500 hover:bg-violet-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-300"><X size={17}/></button>
        </div>
        {counter && <div className="flex items-center justify-between px-3 pb-2 text-xs text-slate-500"><span>{counter}</span><span>← → to browse · Esc to close</span></div>}
        <div className="relative rounded-[18px] bg-slate-950/95">
        {onPrevious && <button type="button" aria-label="Previous image" onClick={onPrevious} className="absolute left-3 top-1/2 z-10 rounded-full bg-white/90 p-2 text-slate-900"><ChevronLeft size={22}/></button>}
        {onNext && <button type="button" aria-label="Next image" onClick={onNext} className="absolute right-3 top-1/2 z-10 rounded-full bg-white/90 p-2 text-slate-900"><ChevronRight size={22}/></button>}
        <img src={src} alt={title} className="max-h-[75vh] w-full rounded-[18px] object-contain"/>
        </div>
        {onDelete && <div className="flex justify-end p-3"><button type="button" onClick={onDelete} className="flex items-center gap-2 rounded-lg border border-rose-200 px-3 py-2 text-sm text-rose-600 hover:bg-rose-50"><Trash2 size={16}/>Delete image</button></div>}
      </div>
    </div>, document.body);
}
