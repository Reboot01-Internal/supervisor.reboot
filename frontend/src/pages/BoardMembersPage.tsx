import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import AdminLayout from "../components/AdminLayout";
import BackButton from "../components/BackButton";
import { SkeletonBlock } from "../components/Skeleton";
import { apiFetch } from "../lib/api";
import { useAuth } from "../lib/auth";

type Member = {
  user_id: number;
  full_name: string;
  nickname?: string;
  email: string;
  role: string;
  role_in_board: string;
  added_at: string;
};

type User = {
  id: number;
  full_name: string;
  nickname?: string;
  email: string;
  role: string;
};

function initials(name: string) {
  const parts = (name || "").trim().split(/\s+/).slice(0, 2);
  const v = parts.map((p) => p[0]?.toUpperCase() ?? "").join("");
  return v || "U";
}

function displayNick(nickname?: string, email?: string) {
  const n = (nickname || "").trim();
  if (n) return n;
  const e = (email || "").trim();
  if (!e) return "";
  return e.split("@")[0];
}

function SearchIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16Z" stroke="currentColor" strokeWidth="2" />
      <path d="M21 21l-4.3-4.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function MailIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 6h16v12H4V6Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="m4 7 8 6 8-6" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
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

function CrownIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 7l5 6 4-8 4 8 5-6v12H3V7Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
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

function RolePill({ role }: { role: string }) {
  const r = (role || "").toLowerCase();

  if (r === "admin") {
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-extrabold text-violet-700">
        <span className="grid place-items-center">
          <CrownIcon />
        </span>
        admin
      </span>
    );
  }

  if (r === "supervisor") {
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-extrabold text-blue-700">
        <span className="grid place-items-center">
          <UsersIcon />
        </span>
        supervisor
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-extrabold text-emerald-700">
      <span className="grid place-items-center">
        <UsersIcon />
      </span>
      student
    </span>
  );
}

function BoardRolePill({ roleInBoard }: { roleInBoard: string }) {
  const r = (roleInBoard || "").toLowerCase();
  if (r === "owner") {
    return (
      <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-extrabold text-amber-800">
        owner
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-extrabold text-slate-700">
      {r || "member"}
    </span>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-extrabold text-slate-900">
      {children}
    </span>
  );
}

function RowCard({
  left,
  right,
  selected,
  onClick,
}: {
  left: React.ReactNode;
  right?: React.ReactNode;
  selected?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`group flex w-full items-center justify-between gap-3 rounded-2xl border p-3 shadow-[0_10px_26px_rgba(15,23,42,0.06)] transition ${
        selected
          ? "border-violet-300 bg-violet-50/50"
          : "border-slate-200 bg-white hover:-translate-y-[1px] hover:border-blue-200 hover:bg-blue-50/20 hover:shadow-[0_16px_32px_rgba(59,130,246,0.10)]"
      } ${onClick ? "cursor-pointer" : ""}`}
    >
      <div className="min-w-0">{left}</div>
      {right ? <div className="flex flex-none items-center gap-2">{right}</div> : null}
    </div>
  );
}

export default function BoardMembersPage() {
  const nav = useNavigate();
  const { boardId } = useParams();
  const boardID = Number(boardId);
  const { isAdmin, isSupervisor } = useAuth();
  const canManage = isAdmin || isSupervisor;

  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "student" | "supervisor">(
    isSupervisor ? "student" : "all"
  );
  const [results, setResults] = useState<User[]>([]);
  const [searching, setSearching] = useState(false);

  const [selectedResultIds, setSelectedResultIds] = useState<Set<number>>(new Set());
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<number>>(new Set());
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState(false);

  const removableMembers = useMemo(
    () => members.filter((m) => (m.role_in_board || "").toLowerCase() !== "owner"),
    [members]
  );

  if (!canManage) {
    return <Navigate to={Number.isFinite(boardID) ? `/admin/boards/${boardID}` : "/admin/boards"} replace />;
  }

  async function loadMembers() {
    setErr("");
    setLoading(true);
    try {
      const res = await apiFetch(`/admin/board-members?board_id=${boardID}`);
      setMembers(res);
    } catch (e: any) {
      setErr(e.message || "Failed to load members");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!boardID || Number.isNaN(boardID)) return;
    loadMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardID]);

  async function fetchUsers(nextQ: string, nextRole: "all" | "student" | "supervisor") {
    setMsg("");
    setErr("");
    setSearching(true);
    try {
      const url = isSupervisor
        ? `/supervisor/eligible-students?board_id=${boardID}&q=${encodeURIComponent(nextQ)}`
        : `/admin/eligible-users?board_id=${boardID}&role=${encodeURIComponent(
            nextRole
          )}&q=${encodeURIComponent(nextQ)}`;
      const res = await apiFetch(url);
      setResults(res);
      setSelectedResultIds(new Set());
    } catch (e: any) {
      setErr(e.message || "Search failed");
    } finally {
      setSearching(false);
    }
  }

  async function searchUsers() {
    await fetchUsers(q.trim(), roleFilter);
  }

  useEffect(() => {
    if (!boardID || Number.isNaN(boardID)) return;
    fetchUsers("", roleFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardID, roleFilter, isSupervisor]);

  function toggleResult(id: number) {
    setSelectedResultIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleMember(id: number) {
    setSelectedMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllResults() {
    setSelectedResultIds(new Set(results.map((r) => r.id)));
  }

  function selectAllMembers() {
    setSelectedMemberIds(new Set(removableMembers.map((m) => m.user_id)));
  }

  async function addSelected() {
    if (selectedResultIds.size === 0 || adding) return;

    setAdding(true);
    setMsg("");
    setErr("");

    const ids = Array.from(selectedResultIds);
    try {
      await Promise.all(
        ids.map((userId) =>
          apiFetch(isSupervisor ? "/supervisor/board-members" : "/admin/board-members", {
            method: "POST",
            body: JSON.stringify({
              board_id: boardID,
              user_id: userId,
              role_in_board: "member",
            }),
          })
        )
      );

      const addedUsers = results.filter((u) => selectedResultIds.has(u.id));
      const now = new Date().toISOString();

      setMembers((prev) => {
        const next = new Map(prev.map((m) => [m.user_id, m]));
        addedUsers.forEach((u) => {
          next.set(u.id, {
            user_id: u.id,
            full_name: u.full_name,
            nickname: u.nickname,
            email: u.email,
            role: u.role,
            role_in_board: "member",
            added_at: now,
          });
        });
        return Array.from(next.values()).sort((a, b) => a.full_name.localeCompare(b.full_name));
      });

      setResults((prev) => prev.filter((u) => !selectedResultIds.has(u.id)));
      setSelectedResultIds(new Set());
      setMsg(`Added ${ids.length} member(s).`);
    } catch (e: any) {
      setErr(e.message || "Failed to add selected members");
    } finally {
      setAdding(false);
    }
  }

  async function removeMembers(userIds: number[]) {
    if (userIds.length === 0 || removing) return;

    setRemoving(true);
    setMsg("");
    setErr("");
    try {
      await Promise.all(
        userIds.map((userId) =>
          apiFetch("/admin/board-members/delete", {
            method: "POST",
            body: JSON.stringify({
              board_id: boardID,
              user_id: userId,
            }),
          })
        )
      );

      const removed = new Set(userIds);
      setMembers((prev) => prev.filter((m) => !removed.has(m.user_id)));
      setSelectedMemberIds((prev) => {
        const next = new Set(prev);
        userIds.forEach((id) => next.delete(id));
        return next;
      });
      setMsg(`Removed ${userIds.length} member(s).`);
    } catch (e: any) {
      setErr(e.message || "Failed to remove member(s)");
    } finally {
      setRemoving(false);
    }
  }

  const subtitle = useMemo(() => {
    if (loading) return "Loading…";
    return `Board #${boardID} • ${members.length} member(s)`;
  }, [loading, boardID, members.length]);

  return (
    <AdminLayout
      active="supervisors"
      title="Board Members"
      subtitle={subtitle}
      right={
        <div className="flex items-center gap-2">
             <button
            className="h-10 rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-extrabold text-slate-900 transition hover:border-violet-200 hover:bg-violet-50"
            onClick={() => nav(`/admin/boards/${boardID}`)}
          >
            Board
          </button>
          <BackButton onClick={() => nav("/admin/boards")} />
       
        </div>
      }
    >
      <div className="w-full max-w-full overflow-x-hidden">
        <section className="grid min-w-0 h-[calc(100vh-220px)] grid-cols-1 gap-4 lg:grid-cols-[1.2fr_1fr]">
          <div className="grid min-h-0 gap-4">
            <section className="flex min-h-0 flex-col rounded-[18px] border border-slate-200 bg-white p-4 shadow-[0_10px_25px_rgba(15,23,42,0.06)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-black text-slate-900">Add members</div>
                <div className="mt-1 text-sm font-semibold text-slate-500">
                  Select multiple users, then add all at once.
                </div>
              </div>
              <Pill>{results.length}</Pill>
            </div>

            <div className="h-3" />

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex h-11 min-w-[220px] flex-1 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 shadow-[0_10px_25px_rgba(15,23,42,0.06)]">
                <span className="text-slate-500">
                  <SearchIcon />
                </span>
                <input
                  className="w-full bg-transparent text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-400"
                  placeholder="Search users"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (!searching) searchUsers();
                    }
                  }}
                />
              </div>

              <select
                className="h-11 w-[170px] rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-extrabold text-slate-900 outline-none focus:ring-4 focus:ring-violet-200"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as any)}
                disabled={isSupervisor}
              >
                <option value="all">{isSupervisor ? "Students only" : "All roles"}</option>
                <option value="student">Students</option>
                {!isSupervisor ? <option value="supervisor">Supervisors</option> : null}
              </select>

              <button
                className="h-11 rounded-2xl bg-gradient-to-br from-violet-600 to-violet-400 px-4 text-sm font-black text-white shadow-[0_18px_45px_rgba(15,23,42,0.08)] disabled:cursor-not-allowed disabled:opacity-70"
                onClick={searchUsers}
                disabled={searching}
              >
                {searching ? "Searching..." : "Search"}
              </button>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={selectAllResults}
                disabled={results.length === 0}
              >
                Select all
              </button>
              <button
                className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => setSelectedResultIds(new Set())}
                disabled={selectedResultIds.size === 0}
              >
                Clear
              </button>
              <button
                className="h-9 rounded-xl bg-slate-900 px-3 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-60"
                onClick={addSelected}
                disabled={selectedResultIds.size === 0 || adding}
              >
                {adding ? "Adding..." : `Add selected (${selectedResultIds.size})`}
              </button>
            </div>

            {err ? (
              <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                {err}
              </div>
            ) : null}

            {msg ? (
              <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
                {msg}
              </div>
            ) : null}

            <div className="h-4" />

            <div className="min-h-0 flex-1 overflow-y-auto pr-1 [scrollbar-width:thin]">
              {results.length === 0 ? (
                <div className="text-sm font-semibold text-slate-500">No matching users found.</div>
              ) : (
                <div className="grid gap-2.5">
                  {results.map((u) => {
                    const checked = selectedResultIds.has(u.id);
                    return (
                      <RowCard
                        key={u.id}
                        selected={checked}
                        onClick={() => toggleResult(u.id)}
                        left={
                          <div className="flex min-w-0 items-center gap-3">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleResult(u.id)}
                              className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-400"
                            />
                            <div className="grid h-10 w-10 flex-none place-items-center rounded-full border border-slate-200 bg-slate-50 font-black text-slate-800">
                              {initials(u.full_name)}
                            </div>

                            <div className="min-w-0">
                              <div className="truncate text-sm font-black text-slate-900">{u.full_name}</div>
                              <div className="mt-0.5 truncate text-xs font-extrabold text-slate-500">
                                {displayNick(u.nickname, u.email)}
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-2">
                                <span className="inline-flex min-w-0 items-center gap-2 truncate text-xs font-bold text-slate-500">
                                  <MailIcon /> <span className="truncate">{u.email}</span>
                                </span>
                                <RolePill role={u.role} />
                              </div>
                            </div>
                          </div>
                        }
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </div>

        <div className="grid min-h-0 gap-4">
          <section className="flex min-h-0 flex-col rounded-[18px] border border-slate-200 bg-white p-4 shadow-[0_10px_25px_rgba(15,23,42,0.06)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-black text-slate-900">Current members</div>
                <div className="mt-1 text-sm font-semibold text-slate-500">Manage who can access this board.</div>
              </div>
              <Pill>{loading ? "..." : members.length}</Pill>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={selectAllMembers}
                disabled={removableMembers.length === 0}
              >
                Select removable
              </button>
              <button
                className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => setSelectedMemberIds(new Set())}
                disabled={selectedMemberIds.size === 0}
              >
                Clear
              </button>
              <button
                className="inline-flex h-9 items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 text-xs font-black text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => removeMembers(Array.from(selectedMemberIds))}
                disabled={selectedMemberIds.size === 0 || removing}
              >
                <BinIcon size={14} />
                {removing ? "Removing..." : `Remove selected (${selectedMemberIds.size})`}
              </button>
            </div>

            <div className="h-3" />

            <div className="min-h-0 flex-1 overflow-y-auto pr-1 [scrollbar-width:thin]">
              {loading ? (
                <div className="grid gap-2">
                  <SkeletonBlock lines={2} />
                  <SkeletonBlock lines={2} />
                  <SkeletonBlock lines={2} />
                </div>
              ) : members.length === 0 ? (
                <div className="text-sm font-semibold text-slate-500">No members yet.</div>
              ) : (
                <div className="grid gap-2.5">
                  {members.map((m) => {
                    const isOwner = (m.role_in_board || "").toLowerCase() === "owner";
                    const checked = selectedMemberIds.has(m.user_id);
                    return (
                      <RowCard
                        key={m.user_id}
                        selected={checked}
                        onClick={isOwner ? undefined : () => toggleMember(m.user_id)}
                        left={
                          <div className="flex min-w-0 items-center gap-3">
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={isOwner}
                              onChange={() => toggleMember(m.user_id)}
                              className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-400 disabled:opacity-40"
                            />
                            <div className="grid h-10 w-10 flex-none place-items-center rounded-full border border-slate-200 bg-slate-50 font-black text-slate-800">
                              {initials(m.full_name)}
                            </div>

                            <div className="min-w-0">
                              <div className="truncate text-sm font-black text-slate-900">{m.full_name}</div>
                              <div className="mt-0.5 truncate text-xs font-extrabold text-slate-500">
                                {displayNick(m.nickname, m.email)}
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-2">
                                <span className="inline-flex min-w-0 items-center gap-2 truncate text-xs font-bold text-slate-500">
                                  <MailIcon /> <span className="truncate">{m.email}</span>
                                </span>
                                <RolePill role={m.role} />
                                <BoardRolePill roleInBoard={m.role_in_board} />
                              </div>
                            </div>
                          </div>
                        }
                        right={
                          isOwner ? (
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-black text-slate-500">
                              Protected
                            </span>
                          ) : (
                            <button
                              type="button"
                              title="Remove member"
                              disabled={removing}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-red-200 bg-red-50 text-red-700 transition hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeMembers([m.user_id]);
                              }}
                            >
                              <BinIcon size={14} />
                            </button>
                          )
                        }
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </div>
      </section>
      </div>
    </AdminLayout>
  );
}
