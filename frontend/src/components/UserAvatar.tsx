import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type UserAvatarProps = {
  src?: string;
  alt: string;
  fallback: string;
  sizeClass?: string;
  textClass?: string;
  className?: string;
  previewable?: boolean;
};

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export default function UserAvatar({
  src,
  alt,
  fallback,
  sizeClass = "h-10 w-10",
  textClass = "text-[13px]",
  className,
  previewable = false,
}: UserAvatarProps) {
  const [open, setOpen] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const canPreview = Boolean(src && imgLoaded && !imgFailed && previewable);

  useEffect(() => {
    setImgLoaded(false);
    setImgFailed(false);
  }, [src]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const handleActivate = (event: React.MouseEvent | React.KeyboardEvent) => {
    if (!canPreview) return;
    event.stopPropagation();
    setOpen(true);
  };

  return (
    <>
      <div
        role={canPreview ? "button" : undefined}
        tabIndex={canPreview ? 0 : undefined}
        aria-label={canPreview ? `Open ${alt} image` : undefined}
        onClick={canPreview ? handleActivate : undefined}
        onKeyDown={
          canPreview
            ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  handleActivate(event);
                }
              }
            : undefined
        }
        className={cn(
          "relative grid flex-none place-items-center overflow-hidden rounded-full border border-slate-200 bg-white",
          canPreview && "cursor-zoom-in transition hover:border-violet-200 hover:shadow-[0_10px_24px_rgba(109,94,252,0.14)] focus:outline-none focus-visible:ring-4 focus-visible:ring-violet-200/60",
          sizeClass,
          className
        )}
      >
        <div className={cn("grid h-full w-full place-items-center font-black text-slate-800", textClass)}>
          {fallback}
        </div>
        {src && !imgFailed ? (
          <img
            src={src}
            alt={alt}
            className={cn(
              "absolute inset-0 h-full w-full scale-[1.12] object-cover object-center transition-opacity",
              imgLoaded ? "opacity-100" : "opacity-0"
            )}
            onLoad={() => setImgLoaded(true)}
            onError={() => {
              setImgFailed(true);
              setImgLoaded(false);
            }}
          />
        ) : null}
      </div>

      {open && src && imgLoaded && !imgFailed && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[10000] grid place-items-center bg-slate-950/72 p-4 backdrop-blur-[4px]"
              onClick={() => setOpen(false)}
              role="dialog"
              aria-modal="true"
              aria-label={`${alt} image preview`}
            >
              <div
                className="relative flex max-h-[92vh] w-full max-w-[720px] items-center justify-center rounded-[28px] border border-white/18 bg-white/8 p-4 shadow-[0_30px_100px_rgba(15,23,42,0.45)]"
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full border border-white/18 bg-slate-900/55 text-xl font-black text-white transition hover:bg-slate-900/75"
                  aria-label="Close image preview"
                >
                  ×
                </button>
                <img
                  src={src}
                  alt={alt}
                  className="max-h-[82vh] w-auto max-w-full rounded-[22px] object-contain"
                />
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
