import { useEffect, useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import { API_URL, apiFetch, authHeaders } from "../lib/api";

import { projectForBoard } from "../lib/boardProjects";

type CoverBoard = { id: number; name: string; status?: string; cover_version?: string; can_edit_cover?: boolean };
export default function BoardCover({ board, onUpdated }: { board: CoverBoard; onUpdated: (version: string) => void }) {
  const project = projectForBoard(board.name);
  const [custom, setCustom] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setCustom("");
    if (project || !board.cover_version) return;
    const abort = new AbortController();
    let objectURL = "";
    fetch(`${API_URL}/admin/boards/cover?board_id=${board.id}&v=${encodeURIComponent(board.cover_version)}`, { headers: authHeaders(), signal: abort.signal })
      .then((res) => { if (!res.ok) throw new Error("Unable to load cover"); return res.blob(); })
      .then((blob) => { if (!abort.signal.aborted) { objectURL = URL.createObjectURL(blob); setCustom(objectURL); } })
      .catch(() => { /* Keep the default illustration if a custom cover is unavailable. */ });
    return () => { abort.abort(); if (objectURL) URL.revokeObjectURL(objectURL); };
  }, [board.id, board.cover_version, project?.slug]);
  async function upload(file?: File) {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/gif"].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setError("Choose a PNG, JPG, or GIF smaller than 5 MB."); return;
    }
    setSaving(true); setError("");
    try {
      const data = new FormData(); data.append("image", file);
      const result = await apiFetch(`/admin/boards/cover?board_id=${board.id}`, { method: "POST", body: data });
      onUpdated(result.cover_version);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to upload cover."); }
    finally { setSaving(false); if (input.current) input.current.value = ""; }
  }
  return <div className="project-cover">
    <img src={custom || `/board-covers/${project?.slug || "default"}.png`} alt="" loading="lazy" decoding="async" width={1536} height={1024} onError={(e) => { const fallback = "/board-covers/default.png"; if (!e.currentTarget.src.endsWith(fallback)) e.currentTarget.src = fallback; }} />
    <span className="project-cover-status" data-inactive={board.status === "inactive"}><i />{board.status === "inactive" ? "Inactive" : "Active"}</span>
    {!project && board.can_edit_cover && <div className="project-cover-upload" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/gif" hidden onChange={(e) => void upload(e.target.files?.[0])} />
      <button type="button" disabled={saving} onClick={() => input.current?.click()}><ImagePlus size={14} />{saving ? "Uploading…" : custom ? "Change cover" : "Add cover"}</button>
    </div>}
    {error && <div className="project-cover-error" role="alert" onClick={(e) => e.stopPropagation()}>{error}</div>}
  </div>;
}
