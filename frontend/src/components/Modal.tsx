import { X } from "lucide-react";
import React, { useEffect } from "react";
import { createPortal } from "react-dom";

export function useEscClose(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);
}

export default function Modal({
  open,
  title,
  onClose,
  footer,
  children,
  className = "",
}: {
  className?: string;
  open: boolean;
  title: string;
  onClose: () => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  useEscClose(open, onClose);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className={`${className}
        fixed inset-0 z-[9999]
        bg-slate-900/45 backdrop-blur-[2px]
        overflow-y-auto
      `}
      onMouseDown={onClose}
      role="dialog"
      aria-modal="true"
    >
      {/* wrapper */}
      <div className="min-h-full flex items-start sm:items-center justify-center p-3 sm:p-4">
        
        {/* modal */}
        <div
          className="
            w-full max-w-[940px]
            max-h-[calc(100vh-16px)] sm:max-h-[calc(100vh-32px)]
            grid grid-rows-[auto_1fr_auto]
            overflow-hidden
            rounded-[18px]
            border border-slate-200
            bg-white text-slate-900
            shadow-[0_24px_70px_rgba(15,23,42,0.24)]
          "
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* header */}
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-2.5">
            <div className="text-[13px] font-black tracking-[-0.01em]">
              {title}
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              title="Close"
              className="modal-close grid w-8 place-items-center h-8 rounded-[10px] border border-slate-300 bg-slate-50 text-[13px] font-extrabold text-slate-700 transition hover:border-[#6d5efc]/25 hover:bg-[#f2f5ff]"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>

          {/* content (scrollable) */}
          <div
            className="
              overflow-y-auto overflow-x-hidden
              bg-[#f7f8fb]
              p-3 sm:p-4
            "
          >
            {children}
          </div>

          {/* footer */}
          <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-white px-4 py-2.5">
            {footer}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}