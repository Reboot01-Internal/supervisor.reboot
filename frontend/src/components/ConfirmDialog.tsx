import { createPortal } from "react-dom";
import { useEscClose } from "./Modal";

type Props = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  danger = true,
  onConfirm,
  onCancel,
}: Props) {
  useEscClose(open, onCancel);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] grid place-items-center bg-slate-900/50 p-4 backdrop-blur-[2px]"
      onMouseDown={onCancel}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="confirm-dialog-panel w-full max-w-[400px] rounded-[18px] border border-slate-200 bg-white p-5 shadow-[0_24px_70px_rgba(15,23,42,0.24)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="confirm-dialog-title text-[16px] font-black text-slate-900">{title}</div>
        <div className="confirm-dialog-message mt-2 text-[13px] font-semibold leading-relaxed text-slate-500">
          {message}
        </div>

        <div className="confirm-dialog-actions mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-10 rounded-[12px] border border-slate-200 bg-slate-50 px-4 text-[13px] font-extrabold text-slate-700 transition hover:bg-slate-100"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`h-10 rounded-[12px] border px-4 text-[13px] font-extrabold text-white transition ${
              danger
                ? "border-red-600 bg-red-600 hover:bg-red-700"
                : "border-[#6d5efc] bg-[#6d5efc] hover:bg-[#5f50f6]"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
