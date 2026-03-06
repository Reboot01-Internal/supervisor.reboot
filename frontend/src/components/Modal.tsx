import React from "react";

export default function Modal({
  open,
  title,
  onClose,
  footer,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  if (!open) return null;

  return (
    <div
      className="modalOverlayIn fixed inset-0 z-[9999] grid place-items-center bg-slate-900/45 p-4 backdrop-blur-[2px]"
      onMouseDown={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="modalPanelIn grid w-full max-w-[940px] grid-rows-[auto_1fr_auto] overflow-hidden rounded-[18px] border border-slate-200 bg-white text-slate-900 shadow-[0_24px_70px_rgba(15,23,42,0.24)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-2.5">
          <div className="text-[13px] font-black tracking-[-0.01em]">{title}</div>

          <button
            type="button"
            onClick={onClose}
            className="h-8 rounded-[10px] border border-slate-300 bg-slate-50 px-3 text-[13px] font-extrabold text-slate-700 transition hover:border-[#6d5efc]/25 hover:bg-[#f2f5ff]"
          >
            Close
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto overflow-x-hidden bg-[#f7f8fb] p-4">{children}</div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-white px-4 py-2.5">
          {footer}
        </div>
      </div>
    </div>
  );
}
