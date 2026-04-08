import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import AdminLayout from "../components/AdminLayout";
import BackButton from "../components/BackButton";
import { SkeletonBlock } from "../components/Skeleton";
import { apiFetch } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useConfirm } from "../lib/useConfirm";

type Board = {
  id: number;
  supervisor_file_id: number;
  name: string;
  description: string;
  created_by: number;
  created_at: string;
};

type SupervisorLookup = {
  supervisor_user_id: number;
  full_name: string;
  email: string;
  nickname?: string;
  file_id: number;
  created_at: string;
};

function initials(name: string) {
  const parts = (name || "").trim().split(/\s+/).slice(0, 2);
  const v = parts.map((p) => p[0]?.toUpperCase() ?? "").join("");
  return v || "B";
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message || fallback : fallback;
}

function ClockIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 22a10 10 0 1 0-10-10 10 10 0 0 0 10 10Z"
        stroke="currentColor"
        strokeWidth="2"
        opacity="0.9"
      />
      <path
        d="M12 6v6l4 2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function UsersIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" stroke="currentColor" strokeWidth="2" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function BoardIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M8 7h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.65" />
      <path d="M8 11h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.65" />
      <path d="M8 15h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.65" />
    </svg>
  );
}

function BinIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 6h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M19 6v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 10v6M14 10v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function TransferIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 7h11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M14 4l4 3-4 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17 17H6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M10 14l-4 3 4 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function SupervisorFilePage() {
  const nav = useNavigate();
  const { fileId } = useParams();
  const { isAdmin, isSupervisor, email, login } = useAuth();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const fileIDParam = Number(fileId);
  const [resolvedFileID, setResolvedFileID] = useState<number>(Number.isFinite(fileIDParam) ? fileIDParam : 0);

  const [boards, setBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState("");
  const [editingBoardID, setEditingBoardID] = useState<number | null>(null);
  const [editingBoardName, setEditingBoardName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [deletingBoardID, setDeletingBoardID] = useState<number | null>(null);
  const [supervisors, setSupervisors] = useState<SupervisorLookup[]>([]);
  const [reassignBoard, setReassignBoard] = useState<Board | null>(null);
  const [nextSupervisorID, setNextSupervisorID] = useState<number>(0);
  const [reassigning, setReassigning] = useState(false);

  useEffect(() => {
    let alive = true;
    async function resolveSupervisorFile() {
      if (!isSupervisor || Number.isFinite(fileIDParam)) return;
      try {
        const rows: SupervisorLookup[] = await apiFetch("/admin/supervisors");
        if (!alive) return;
        const match = (rows || []).find((r) => {
          const em = String(r.email || "").trim().toLowerCase();
          const nn = String(r.nickname || "").trim().toLowerCase();
          return (email && em === email) || (login && nn === login);
        });
        setResolvedFileID(match?.file_id || 0);
      } catch {
        setResolvedFileID(0);
      }
    }
    resolveSupervisorFile();
    return () => {
      alive = false;
    };
  }, [isSupervisor, fileIDParam, email, login]);

  useEffect(() => {
    let alive = true;

    async function loadSupervisors() {
      if (!isAdmin && !isSupervisor) return;
      try {
        const rows: SupervisorLookup[] = await apiFetch("/admin/supervisors");
        if (!alive) return;
        setSupervisors(Array.isArray(rows) ? rows : []);
      } catch {
        if (!alive) return;
        setSupervisors([]);
      }
    }

    loadSupervisors();
    return () => {
      alive = false;
    };
  }, [isAdmin, isSupervisor]);

  const fileID = Number.isFinite(fileIDParam) ? fileIDParam : resolvedFileID;
  const currentSupervisor = useMemo(
    () => supervisors.find((item) => item.file_id === fileID) || null,
    [supervisors, fileID]
  );

  useEffect(() => {
    const nickname = String(currentSupervisor?.nickname || "").trim().replace(/^@/, "");
    if (!nickname) return;

    setName((prev) => {
      const current = String(prev || "").trim();
      if (!current) return `${nickname}-`;

      const prefixes = supervisors
        .map((supervisor) => String(supervisor.nickname || "").trim().replace(/^@/, ""))
        .filter(Boolean);

      for (const prefix of prefixes) {
        if (current === `${prefix}-` || current.startsWith(`${prefix}-`)) {
          return `${nickname}-${current.slice(prefix.length + 1)}`;
        }
      }

      return `${nickname}-${current}`;
    });
  }, [currentSupervisor, supervisors]);

  async function loadBoards() {
    setErr("");
    setLoading(true);
    try {
      const res = await apiFetch(`/admin/boards?file_id=${fileID}`);
      setBoards(res);
    } catch (e: unknown) {
      setErr(errorMessage(e, "Failed to load boards"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!fileID || Number.isNaN(fileID)) return;
    loadBoards();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileID]);

  async function createBoard(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    setErr("");
    setCreating(true);

    try {
      if (!fileID) throw new Error("Workspace file is not ready yet.");
      await apiFetch("/admin/boards", {
        method: "POST",
        body: JSON.stringify({
          supervisor_file_id: fileID,
          name: name.trim(),
          description: description.trim(),
        }),
      });

      setMsg("Board created.");
      setName("");
      setDescription("");
      await loadBoards();
    } catch (e: unknown) {
      setErr(errorMessage(e, "Failed to create board"));
    } finally {
      setCreating(false);
    }
  }

  function startRename(board: Board) {
    setErr("");
    setMsg("Editing board name. Press Enter to save.");
    setEditingBoardID(board.id);
    setEditingBoardName(board.name || "");
  }

  function cancelRename() {
    setEditingBoardID(null);
    setEditingBoardName("");
    setRenaming(false);
  }

  async function saveRename(boardID: number) {
    const next = editingBoardName.trim();
    if (!next) {
      setErr("Board name cannot be empty.");
      return;
    }
    if (renaming) return;

    const current = boards.find((b) => b.id === boardID)?.name?.trim() || "";
    if (current === next) {
      cancelRename();
      return;
    }

    setRenaming(true);
    setErr("");
    setMsg("");
    try {
      await apiFetch("/admin/boards/update", {
        method: "POST",
        body: JSON.stringify({
          board_id: boardID,
          name: next,
        }),
      });

      setBoards((prev) => prev.map((b) => (b.id === boardID ? { ...b, name: next } : b)));
      setMsg("Board name updated.");
      cancelRename();
    } catch (e: unknown) {
      setErr(errorMessage(e, "Failed to update board name"));
    } finally {
      setRenaming(false);
    }
  }

  async function deleteBoard(board: Board) {
    if (deletingBoardID === board.id) return;

    const ok = await confirm({
      title: "Delete board",
      message: `Delete "${board.name}"? This will also delete its Discord channel and cannot be undone.`,
    });
    if (!ok) return;

    setDeletingBoardID(board.id);
    setErr("");
    setMsg("");
    try {
      await apiFetch("/admin/boards/delete", {
        method: "POST",
        body: JSON.stringify({ board_id: board.id }),
      });
      setBoards((prev) => prev.filter((b) => b.id !== board.id));
      if (editingBoardID === board.id) {
        cancelRename();
      }
      setMsg("Board deleted.");
    } catch (e: unknown) {
      setErr(errorMessage(e, "Failed to delete board"));
    } finally {
      setDeletingBoardID(null);
    }
  }

  function openReassign(board: Board) {
    const firstEligible = supervisors.find((item) => item.file_id !== board.supervisor_file_id);
    setErr("");
    setMsg("");
    setReassignBoard(board);
    setNextSupervisorID(firstEligible?.supervisor_user_id || 0);
  }

  function closeReassign() {
    setReassignBoard(null);
    setNextSupervisorID(0);
  }

  async function submitReassign() {
    if (!reassignBoard || !nextSupervisorID || reassigning) return;

    setReassigning(true);
    setErr("");
    setMsg("");
    try {
      await apiFetch("/admin/boards/reassign", {
        method: "POST",
        body: JSON.stringify({
          board_id: reassignBoard.id,
          supervisor_user_id: nextSupervisorID,
        }),
      });
      setMsg(`Board moved to the new supervisor workspace.`);
      closeReassign();
      await loadBoards();
    } catch (e: unknown) {
      setErr(errorMessage(e, "Failed to reassign board ownership"));
    } finally {
      setReassigning(false);
    }
  }

  const boardsSorted = useMemo(() => {
    return [...boards].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [boards]);

  const eligibleSupervisors = useMemo(() => {
    if (!reassignBoard) return [];
    return supervisors.filter((item) => item.file_id !== reassignBoard.supervisor_file_id);
  }, [reassignBoard, supervisors]);

  const nameMax = 60;
  const descMax = 120;

  if (!isAdmin && !isSupervisor) {
    return <Navigate to="/admin/boards" replace />;
  }

  return (
    <>
    {confirmDialog}
    {reassignBoard ? (
      <div
        className="fixed inset-0 z-[80] grid place-items-center bg-slate-900/40 p-4"
        onClick={closeReassign}
      >
        <div
          className="workspace-reassign-popup w-full max-w-[560px] rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_22px_60px_rgba(15,23,42,0.28)]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[18px] font-black text-slate-900">Reassign Board Ownership</div>
              <div className="mt-1 text-[13px] font-semibold text-slate-500">
                Move <span className="font-black text-slate-900">{reassignBoard.name}</span> to another supervisor workspace.
              </div>
            </div>
            <button
              className="h-9 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-extrabold text-slate-700 hover:bg-slate-100"
              onClick={closeReassign}
              disabled={reassigning}
            >
              Close
            </button>
          </div>

          <div className="mt-4 grid gap-2">
            <label className="grid gap-2">
              <span className="text-[12px] font-extrabold text-slate-500">New owner</span>
              <select
                className="workspace-reassign-field h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 text-slate-900 outline-none transition focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-200/50"
                value={nextSupervisorID}
                onChange={(e) => setNextSupervisorID(Number(e.target.value))}
                disabled={reassigning || eligibleSupervisors.length === 0}
              >
                <option value={0}>
                  {eligibleSupervisors.length === 0 ? "No other supervisors available" : "Select a supervisor"}
                </option>
                {eligibleSupervisors.map((item) => (
                  <option key={item.supervisor_user_id} value={item.supervisor_user_id}>
                    {item.full_name} {item.nickname ? `(@${item.nickname})` : ""}
                  </option>
                ))}
              </select>
            </label>

            {eligibleSupervisors.length > 0 ? (
              <div className="workspace-warning rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] font-semibold text-amber-800">
                The current owner will be removed from this board, and Discord access will sync to the new owner.
              </div>
            ) : (
              <div className="workspace-note rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] font-semibold text-slate-600">
                Add another supervisor first, then you can transfer this board.
              </div>
            )}
          </div>

          <div className="mt-4 flex items-center gap-2">
            <button
              className="h-11 rounded-xl bg-gradient-to-br from-violet-600 to-violet-400 px-4 text-sm font-black text-white shadow-[0_18px_45px_rgba(15,23,42,0.08)] disabled:cursor-not-allowed disabled:opacity-70"
              onClick={submitReassign}
              disabled={reassigning || !nextSupervisorID}
            >
              {reassigning ? "Moving..." : "Move board"}
            </button>
            <button
              className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-900 hover:bg-slate-50"
              onClick={closeReassign}
              disabled={reassigning}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    ) : null}
    <AdminLayout
      active={isAdmin ? "supervisors" : "boards"}
      title="Workspace"
      subtitle={
        !fileID
          ? "Loading workspace..."
          : loading
          ? "Loading…"
          : `${currentSupervisor?.full_name || "Workspace"} • ${boards.length} board(s)`
      }
      right={
        <div className="flex items-center gap-2">
          <BackButton onClick={() => nav(isAdmin ? "/admin/supervisors" : "/admin/boards")} />
        </div>
      }
    >
      <div className="workspace-page">
        {!fileID ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] font-semibold text-amber-800">
            Could not resolve your workspace file yet. Ask admin to ensure your supervisor file exists.
          </div>
        ) : null}

        <section className="grid min-w-0 gap-4 lg:grid-cols-[1.25fr_0.95fr]">
        {/* Left */}
        <div className="grid min-w-0 gap-4">
          <section className="workspace-panel min-w-0 rounded-[18px] border border-slate-200 bg-white p-4 shadow-[0_10px_25px_rgba(15,23,42,0.06)]">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-[16px] font-black tracking-[-0.2px] text-slate-900">
                  <span className="grid h-7 w-7 place-items-center rounded-full border border-slate-200 bg-slate-50 text-slate-600">
                    <BoardIcon />
                  </span>
                  Create board
                </div>
                {/* <div className="mt-2 text-[13px] text-slate-500">Name + optional description.</div> */}
              </div>

              <span className="workspace-soft-pill rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[12px] font-black text-slate-900">
                New
              </span>
            </div>

            <form onSubmit={createBoard} className="grid gap-3">
              <label className="grid gap-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[12px] font-extrabold text-slate-500">Board name</span>
                  <span className="text-[12px] font-extrabold text-slate-400">
                    {name.trim().length}/{nameMax}
                  </span>
                </div>

                <input
                  className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-slate-900 outline-none transition focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-200/50"
                  placeholder="e.g. Social Network"
                  value={name}
                  maxLength={nameMax}
                  onChange={(e) => setName(e.target.value)}
                />
                {/* <span className="text-[12px] text-slate-500">Make it short and clear.</span> */}
              </label>

              <label className="grid gap-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[12px] font-extrabold text-slate-500">Description</span>
                  <span className="text-[12px] font-extrabold text-slate-400">
                    {description.trim().length}/{descMax}
                  </span>
                </div>

                <input
                  className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-slate-900 outline-none transition focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-200/50"
                  // placeholder="Optional (example: tasks to finish before Sunday)"
                  value={description}
                  maxLength={descMax}
                  onChange={(e) => setDescription(e.target.value)}
                />
                {/* <span className="text-[12px] text-slate-500">Optional — helps students understand the board.</span> */}
              </label>

              {err ? (
              <div className="workspace-message workspace-message-error rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-slate-900">
                  {err}
                </div>
              ) : null}

              {msg ? (
                <div className="workspace-message workspace-message-success rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] text-slate-900">
                  {msg}
                </div>
              ) : null}

              <div className="mt-1 flex items-center gap-2">
                <button
                  className="h-11 rounded-xl bg-gradient-to-br from-violet-600 to-violet-400 px-4 text-sm font-black text-white shadow-[0_18px_45px_rgba(15,23,42,0.08)] disabled:cursor-not-allowed disabled:opacity-70"
                  disabled={creating || !name.trim() || !fileID}
                >
                  {creating ? "Creating..." : "Create"}
                </button>

                <button
                  type="button"
                  className="workspace-secondary-button h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-900 hover:bg-slate-50"
                  onClick={() => {
                    setName("");
                    setDescription("");
                    setErr("");
                    setMsg("");
                  }}
                >
                  Clear
                </button>
              </div>
            </form>
          </section>
        </div>

        {/* Right */}
        <div className="grid min-w-0 gap-4">
          <section className="workspace-panel min-w-0 rounded-[18px] border border-slate-200 bg-white p-4 shadow-[0_10px_25px_rgba(15,23,42,0.06)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[16px] font-black tracking-[-0.2px] text-slate-900">Boards</div>
                <div className="mt-2 text-[13px] text-slate-500">Open a board or manage members.</div>
              </div>
              <span className="workspace-soft-pill rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[12px] font-black text-slate-900">
                {loading ? "…" : boards.length}
              </span>
            </div>

            <div className="h-3" />

            {err ? (
              <div className="workspace-message workspace-message-error mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-slate-900">
                {err}
              </div>
            ) : null}

            {loading ? (
              <div className="grid gap-2">
                <SkeletonBlock lines={2} />
                <SkeletonBlock lines={2} />
              </div>
            ) : boardsSorted.length === 0 ? (
              <div className="text-[13px] text-slate-500">No boards yet.</div>
            ) : (
              <div className="grid min-w-0 gap-2">
                {boardsSorted.map((b) => {
                  const created = new Date(b.created_at);
                  const desc = (b.description || "").trim();

                  return (
                    <div
                      key={b.id}
                      className={[
                        "workspace-board-row grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left",
                        "shadow-[0_10px_26px_rgba(15,23,42,0.06)] transition",
                        "hover:-translate-y-[1px] hover:border-violet-200 hover:bg-violet-50/30 hover:shadow-[0_16px_32px_rgba(109,94,252,0.12)]",
                        "max-[520px]:flex-col max-[520px]:items-stretch",
                      ].join(" ")}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="grid h-10 w-10 flex-none place-items-center rounded-full border border-slate-200 bg-slate-50 font-black text-slate-700">
                          {initials(b.name)}
                        </div>

                        <div className="min-w-0 flex-1">
                          {editingBoardID === b.id ? (
                            <div className="flex min-w-0 items-center gap-2">
                              <input
                                autoFocus
                                value={editingBoardName}
                                maxLength={60}
                                onChange={(e) => setEditingBoardName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    saveRename(b.id);
                                  }
                                  if (e.key === "Escape") {
                                    e.preventDefault();
                                    cancelRename();
                                  }
                                }}
                                className="h-8 min-w-0 w-full rounded-lg border border-violet-300 bg-white px-2.5 text-[13px] font-bold text-slate-900 outline-none focus:ring-4 focus:ring-violet-200/50"
                                placeholder="Board name"
                              />
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="block max-w-full truncate text-left font-black text-slate-900 hover:text-violet-700"
                              title="Double click to edit name"
                              onDoubleClick={() => startRename(b)}
                            >
                              {b.name}
                            </button>
                          )}

                          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-[12px] font-extrabold text-slate-500">
                            <span className="inline-flex min-w-0 items-center gap-2">
                              <ClockIcon /> {created.toLocaleDateString()}
                            </span>

                            {desc ? (
                              <>
                                <span className="opacity-50">•</span>
                                <span className="min-w-0 truncate" title={desc}>
                                  {desc}
                                </span>
                              </>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <div className="workspace-board-actions flex min-w-max flex-none items-center justify-end gap-2 max-[520px]:min-w-0 max-[520px]:flex-wrap max-[520px]:justify-start">
                        <button
                          className="inline-flex h-8 items-center justify-center rounded-full border border-[#6d5efc]/18 bg-white/90 px-3.5 text-[12px] font-black text-slate-700 shadow-[0_8px_18px_rgba(15,23,42,0.05)] transition hover:-translate-y-[1px] hover:border-[#6d5efc]/28 hover:bg-[#f7f5ff] hover:text-[#6d5efc]"
                          type="button"
                          onClick={() => nav(`/admin/boards/${b.id}`)}
                          title="Open board"
                        >
                          Open
                        </button>

                        <button
                          className="grid h-8 w-10 place-items-center rounded-full border border-slate-200 bg-slate-50 text-slate-700 transition hover:-translate-y-[1px] hover:border-emerald-200 hover:bg-emerald-50"
                          type="button"
                          onClick={() =>
                            nav(`/admin/boards/${b.id}/members`, {
                              state: { backTo: isAdmin ? `/admin/files/${fileID}` : "/workspace" },
                            })
                          }
                          title="Members"
                          aria-label="Members"
                        >
                          <UsersIcon />
                        </button>

                        {isAdmin ? (
                          <button
                            className="grid h-8 w-10 place-items-center rounded-full border border-amber-200 bg-amber-50 text-amber-700 transition hover:-translate-y-[1px] hover:bg-amber-100"
                            type="button"
                            onClick={() => openReassign(b)}
                            title="Reassign board"
                            aria-label="Reassign board"
                          >
                            <TransferIcon />
                          </button>
                        ) : null}

                        <button
                          className="grid h-8 w-10 place-items-center rounded-full border border-red-200 bg-red-50 text-red-700 transition hover:-translate-y-[1px] hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                          type="button"
                          onClick={() => deleteBoard(b)}
                          title={deletingBoardID === b.id ? "Deleting..." : "Delete board"}
                          aria-label={deletingBoardID === b.id ? "Deleting board" : "Delete board"}
                          disabled={deletingBoardID === b.id}
                        >
                          <BinIcon />
                        </button>

                        <span className="select-none text-2xl text-slate-300">›</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
        </section>
      </div>
    </AdminLayout>
    </>
  );
}
