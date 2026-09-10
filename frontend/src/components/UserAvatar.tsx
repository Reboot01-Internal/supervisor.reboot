import { useEffect, useRef, useState } from "react";
import ImagePreview from "./ImagePreview";

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
  const [imgLoaded, setImgLoaded] = useState(Boolean(src));
  const [imgFailed, setImgFailed] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const canPreview = Boolean(src && imgLoaded && !imgFailed && previewable);

  useEffect(() => {
    setImgLoaded(Boolean(src));
    setImgFailed(false);
  }, [src]);

  useEffect(() => {
    const img = imgRef.current;
    if (!src || !img) return;
    if (!img.complete) return;

    if (img.naturalWidth > 0) {
      setImgLoaded(true);
      setImgFailed(false);
      return;
    }

    setImgLoaded(false);
    setImgFailed(true);
  }, [src]);

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
            ref={imgRef}
            src={src}
            alt={alt}
            className="absolute inset-0 h-full w-full scale-[1.12] object-cover object-center"
            onLoad={() => setImgLoaded(true)}
            onError={() => {
              setImgFailed(true);
              setImgLoaded(false);
            }}
          />
        ) : null}
      </div>

      {open && src && imgLoaded && !imgFailed && typeof document !== "undefined"
        ? <ImagePreview src={src} title={alt} onClose={() => setOpen(false)} />
        : null}
    </>
  );
}
