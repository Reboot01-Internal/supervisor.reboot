import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

type Props = { src: string; title: string; description?: string; wide?: boolean; onClose: () => void };

export default function ImagePreview({ src, title, description, wide = false, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.stopImmediatePropagation(); onClose(); }
      if (event.key === "Tab") { event.preventDefault(); closeRef.current?.focus(); }
    };
    document.addEventListener("keydown", handleKey, true);
    return () => { document.removeEventListener("keydown", handleKey, true); previous?.focus(); };
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[10000] grid place-items-center bg-slate-900/35 backdrop-blur-sm p-6" role="dialog" aria-modal="true" aria-label={`${title} image preview`} onClick={(event) => { event.stopPropagation(); onClose(); }}>
      <div className={`relative w-full ${wide ? "max-w-5xl" : "max-w-[520px]"} rounded-[24px] border border-violet-100 bg-white p-2 shadow-[0_24px_70px_rgba(76,29,149,0.18)]`} onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-3 py-2">
          <div className="min-w-0"><div className="truncate text-[16px] font-bold text-slate-900">{title}</div>{description && <div className="truncate text-xs text-slate-500">{description}</div>}</div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close image preview" className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-violet-50 text-violet-500 hover:bg-violet-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-300"><X size={17}/></button>
        </div>
        <img src={src} alt={title} className="max-h-[75vh] w-full rounded-[18px] object-contain"/>
      </div>
    </div>, document.body);
}
