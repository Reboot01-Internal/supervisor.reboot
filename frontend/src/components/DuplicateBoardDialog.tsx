import { useEffect, useState } from "react";
import Modal from "./Modal";
import UserAvatar from "./UserAvatar";
import { apiFetch } from "../lib/api";
import { useAuth } from "../lib/auth";
import { fetchRebootAvatars } from "../lib/rebootAvatars";
import "../pages/AdminBoardsPage.css";

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase() || "").join("") || "U";
}

export default function DuplicateBoardDialog({ boardID, boardName: pageTitle, onClose, onDuplicated }: {
  boardID: number;
  boardName: string;
  onClose: () => void;
  onDuplicated: (id: number) => void;
}) {
  const { isSupervisor } = useAuth();
  const duplicateOpen = true;
  const [duplicateName, setDuplicateName] = useState("");
  const [duplicateUsers, setDuplicateUsers] = useState<Array<{ id: number; full_name: string; email: string; nickname?: string; cohort?: string }>>([]);
  const [duplicateMembers, setDuplicateMembers] = useState<Set<number>>(new Set());
  const [duplicateAvatars, setDuplicateAvatars] = useState<Record<string, string>>({});
  const [duplicateSearch, setDuplicateSearch] = useState("");
  const [duplicateLoading, setDuplicateLoading] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [duplicateErr, setDuplicateErr] = useState("");

  useEffect(() => {
    if (!duplicateOpen || duplicateUsers.length === 0) return;
    let alive = true;
    void fetchRebootAvatars(duplicateUsers.map(u => u.nickname || u.email.split("@")[0]).filter(Boolean))
      .then(avatars => { if (alive) setDuplicateAvatars(avatars); }).catch(() => { if (alive) setDuplicateAvatars({}); });
    return () => { alive = false; };
  }, [duplicateOpen, duplicateUsers]);

  async function loadDuplicate() {
    setDuplicateName("");
    setDuplicateMembers(new Set());
    setDuplicateUsers([]);
    setDuplicateSearch("");
    setDuplicateErr("");
    setDuplicateLoading(true);
    try {
      const [eligible, current, suggested] = await Promise.all([
        apiFetch(isSupervisor ? `/supervisor/eligible-students?board_id=${boardID}` : `/admin/eligible-users?board_id=${boardID}&role=all`),
        apiFetch(`/admin/board-members?board_id=${boardID}`),
        apiFetch(`/admin/boards/duplicate-name?board_id=${boardID}`),
      ]);
      setDuplicateName(suggested.name);
      const users = new Map<number, { id: number; full_name: string; email: string; nickname?: string; cohort?: string }>();
      for (const user of eligible) users.set(user.id, user);
      for (const member of current) {
        if (member.role_in_board !== "owner" && ["student", "supervisor"].includes(member.role))
          users.set(member.user_id, { ...member, id: member.user_id });
      }
      setDuplicateUsers([...users.values()].sort((a, b) => a.full_name.localeCompare(b.full_name)));
    } catch (e: unknown) {
      setDuplicateErr(e instanceof Error ? e.message : "Failed to load members");
    } finally { setDuplicateLoading(false); }
  }

  async function duplicateBoard() {
    if (duplicating || duplicateLoading || !duplicateName.trim()) return;
    setDuplicating(true);
    setDuplicateErr("");
    try {
      const result = await apiFetch("/admin/boards/duplicate", {
        method: "POST",
        body: JSON.stringify({ board_id: boardID, name: duplicateName.trim(), member_ids: [...duplicateMembers] }),
      });
      onDuplicated(result.id);
      onClose();
    } catch (e: unknown) {
      setDuplicateErr(e instanceof Error ? e.message : "Failed to duplicate board");
    } finally { setDuplicating(false); }
  }

  useEffect(() => {
    void loadDuplicate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardID]);

  return (
      <Modal className="board-create-dialog" open={duplicateOpen} title="Duplicate board" onClose={() => { if (!duplicating) onClose(); }} footer={
        <>
          <button type="button" disabled={duplicating} onClick={() => onClose()} className="inline-flex h-10 items-center rounded-2xl border border-slate-200 bg-white px-4 text-[13px] font-black text-slate-600 transition hover:bg-slate-50">Cancel</button>
          <button type="button" disabled={duplicating || duplicateLoading || !duplicateName.trim()} onClick={() => void duplicateBoard()} className="inline-flex h-10 items-center rounded-2xl border border-[#6d5efc]/18 bg-white px-4 text-[13px] font-black text-[#6d5efc] transition disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400">{duplicating ? "Duplicating…" : "Duplicate board"}</button>
        </>
      }>
        <div className="create-board-modal grid gap-4">
          {duplicateErr && <div role="alert" className="rounded-[14px] border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">{duplicateErr}</div>}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="create-board-panel">
              <div className="mb-3 text-[15px] font-black text-slate-900">Board details</div>
              <div className="grid gap-3">
                <label className="grid gap-1.5"><span>Original board</span><div className="create-board-field truncate rounded-[14px] border border-slate-200 px-3 py-2.5 text-[14px] font-semibold text-slate-900" title={pageTitle}>{pageTitle}</div></label>
                <label className="grid gap-1.5"><span>Board name</span><input className="create-board-field rounded-[14px] border border-slate-200 px-3 py-2.5 text-[14px] font-semibold text-slate-900 outline-none focus:ring-4 focus:ring-[#6d5efc]/12" placeholder={duplicateLoading ? "Loading suggested name…" : "Enter board name"} value={duplicateName} disabled={duplicating || duplicateLoading} onChange={e => setDuplicateName(e.target.value)} /></label>
                <div className="rounded-[14px] border border-[#6d5efc]/15 bg-[#f7f5ff] p-3 text-[12px] leading-relaxed text-slate-600">
                  <div className="mb-1 font-bold text-slate-900">A fresh start for your new team</div>
                  <p>Titles, descriptions, labels, priority, list order, and appearance stay the same.</p>
                  <p className="mt-2">Tasks start as To do, subtasks are unchecked, and due dates are cleared. Assignments stay only for selected members.</p>
                </div>
                <p className="create-board-hint">The supervisor stays as owner. Comments, attachments, activity, reminders, and meetings are not copied.</p>
              </div>
            </div>
            <div className="create-board-panel">
              <div className="mb-1 flex items-center justify-between gap-3"><div className="text-[15px] font-black text-slate-900">Board members</div><span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-black text-slate-600">{duplicateMembers.size} selected</span></div>
              <p className="mb-3 text-[12px] text-slate-500">Pick the people for your new board.</p>
              <input aria-label="Search board members" type="search" placeholder="Search by name, nickname, or email" className="create-board-field mb-3 w-full rounded-[14px] border border-slate-200 px-3 py-2.5 outline-none focus:ring-4 focus:ring-[#6d5efc]/12" value={duplicateSearch} onChange={e => setDuplicateSearch(e.target.value)} />
              {duplicateLoading ? <p className="rounded-[14px] border border-slate-200 bg-slate-50 px-3 py-3 text-[13px] text-slate-500">Loading members…</p> : <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1 [scrollbar-width:thin]">
                {duplicateUsers.filter(u => `${u.full_name} ${u.nickname || ""} ${u.email}`.toLowerCase().includes(duplicateSearch.toLowerCase())).map(u => {
                  const checked = duplicateMembers.has(u.id);
                  const login = String(u.nickname || u.email.split("@")[0]).trim().toLowerCase();
                  return <label key={u.id} className={`create-board-member flex cursor-pointer items-center gap-3 rounded-2xl border px-3 py-2.5 transition ${checked ? "border-[#6d5efc]/40 bg-[#f7f5ff]" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                    <input type="checkbox" className="h-4 w-4" disabled={duplicating} checked={checked} onChange={() => setDuplicateMembers(prev => { const next = new Set(prev); if (next.has(u.id)) next.delete(u.id); else next.add(u.id); return next; })} />
                    <UserAvatar src={duplicateAvatars[login]} alt={u.full_name} fallback={initials(u.full_name)} className="shrink-0 bg-slate-50" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] font-black text-slate-900">{u.full_name}</div>
                      <div className="mt-0.5 truncate text-[12px] font-extrabold text-[#6d5efc]">{u.nickname ? `@${u.nickname.replace(/^@/, "")}` : "—"}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        {u.cohort && <span className="inline-flex h-7 items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 text-[11px] font-extrabold text-slate-700">{u.cohort}</span>}
                        <span className="truncate text-[12px] text-slate-500">{u.email}</span>
                      </div>
                    </div>
                  </label>;
                })}
                {duplicateUsers.length === 0 && <p className="rounded-[14px] border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-[13px] text-slate-500">No eligible members found. You can create a copy with only its owner.</p>}
                {duplicateUsers.length > 0 && !duplicateUsers.some(u => `${u.full_name} ${u.nickname || ""} ${u.email}`.toLowerCase().includes(duplicateSearch.toLowerCase())) && <p className="text-[13px] text-slate-500">No members match your search.</p>}
              </div>}
            </div>
          </div>
        </div>
      </Modal>
  );
}
