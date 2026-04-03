import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "../components/AdminLayout";
import { apiFetch } from "../lib/api";
import { useConfirm } from "../lib/useConfirm";

type UserRow = {
  id: number;
  full_name: string;
  email: string;
  role: "student" | "supervisor";
  nickname: string;
  cohort: string;
  is_active: boolean;
  created_at: string;
};

type CreateRole = "student" | "supervisor";

type RebootCandidate = {
  nickname: string;
  email: string;
  full_name: string;
  cohort: string;
  any_exists?: boolean;
  role_exists?: boolean;
};

type QueuedCandidate = RebootCandidate & {
  key: string;
  role: CreateRole;
};

const GQL_URL = "https://learn.reboot01.com/api/graphql-engine/v1/graphql";

function initialsOf(name: string) {
  const n = (name || "").trim();
  if (!n) return "?";
  return n
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => (p[0] || "").toUpperCase())
    .join("");
}

function roleTone(role: string) {
  if (role === "supervisor") return "border-[#6d5efc]/20 bg-[#f7f5ff] text-[#6d5efc]";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function withAt(n: string) {
  const x = (n || "").trim();
  if (!x) return "-";
  return x.startsWith("@") ? x : `@${x}`;
}

function roleLabel(role: CreateRole) {
  return role === "supervisor" ? "Supervisor" : "Student";
}

async function searchRebootUsers(query: string): Promise<RebootCandidate[]> {
  const jwt = (localStorage.getItem("jwt") || "").trim();
  if (!jwt) throw new Error("Missing Reboot session.");

  const like = `%${query.trim()}%`;
  const gql = `
    query SearchUsersForTaskFlow($like: String!) {
      user(
        where: {
          _or: [
            { login: { _ilike: $like } }
            { email: { _ilike: $like } }
            { firstName: { _ilike: $like } }
            { lastName: { _ilike: $like } }
          ]
        }
        limit: 8
        order_by: [{ login: asc }]
      ) {
        login
        email
        firstName
        lastName
      }
    }
  `;

  const res = await fetch(GQL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: gql, variables: { like } }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || json?.errors?.length) {
    throw new Error(json?.errors?.[0]?.message || "Failed to search Reboot users.");
  }

  const seen = new Set<string>();
  return (json?.data?.user || [])
    .map((u: any) => {
      const nickname = String(u?.login || "").trim();
      const email = String(u?.email || "").trim().toLowerCase();
      const full_name = `${String(u?.firstName || "").trim()} ${String(u?.lastName || "").trim()}`.trim() || nickname;
      return {
        nickname,
        email,
        full_name,
        cohort: "Unknown cohort",
      } satisfies RebootCandidate;
    })
    .filter((u: RebootCandidate) => {
      const key = `${u.nickname.toLowerCase()}::${u.email.toLowerCase()}`;
      if (!u.nickname || !u.email || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

async function enrichCandidatesWithRoleState(
  users: RebootCandidate[],
  role: CreateRole
): Promise<RebootCandidate[]> {
  return Promise.all(
    users.map(async (u) => {
      try {
        const res = await apiFetch(
          `/admin/users/exists?email=${encodeURIComponent(u.email)}&role=${encodeURIComponent(role)}`
        );
        return {
          ...u,
          any_exists: !!res?.any_exists,
          role_exists: !!res?.exists,
        };
      } catch {
        return u;
      }
    })
  );
}

function SearchIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16Z" stroke="currentColor" strokeWidth="2" />
      <path d="M21 21l-4.3-4.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function UserPlusIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M5 20a7 7 0 0 1 14 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M19 8h4M21 6v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function PlusIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function MinusIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function RoleIcon({ role }: { role: CreateRole }) {
  if (role === "supervisor") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M12 2l7 4v6c0 5-3 9-7 10-4-1-7-5-7-10V6l7-4Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path
          d="M9.5 12.5l1.8 1.8L15.8 9.8"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3l10 5-10 5L2 8l10-5Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M6 10.5V16c0 1.5 3 3 6 3s6-1.5 6-3v-5.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M22 8v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export default function AdminUsersPage() {
  const nav = useNavigate();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [q, setQ] = useState("");
  const [role, setRole] = useState<"all" | "supervisor" | "student">("all");
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [selectedUserIds, setSelectedUserIds] = useState<Set<number>>(new Set());
  const [deletingUsers, setDeletingUsers] = useState(false);
  const [deleteMode, setDeleteMode] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [createRole, setCreateRole] = useState<CreateRole>("supervisor");
  const [lookup, setLookup] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<RebootCandidate[]>([]);
  const [queue, setQueue] = useState<QueuedCandidate[]>([]);
  const [createErr, setCreateErr] = useState("");
  const [createOk, setCreateOk] = useState("");
  const [creating, setCreating] = useState(false);
  const searchSeq = useRef(0);

  async function loadUsers(nextQ: string, nextRole: "all" | "supervisor" | "student") {
    setLoading(true);
    setErr("");
    try {
      const res = await apiFetch(
        `/admin/users?q=${encodeURIComponent(nextQ.trim())}&role=${encodeURIComponent(nextRole)}`
      );
      setRows(Array.isArray(res) ? res : []);
    } catch (e: any) {
      setErr(e?.message || "Failed to load users");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const t = setTimeout(() => {
      loadUsers(q, role);
    }, 180);
    return () => clearTimeout(t);
  }, [q, role]);

  useEffect(() => {
    if (!deleteMode) {
      setSelectedUserIds(new Set());
    }
  }, [deleteMode]);

  useEffect(() => {
    setSelectedUserIds((prev) => {
      const visibleIds = new Set(rows.map((row) => row.id));
      const next = new Set<number>();
      prev.forEach((id) => {
        if (visibleIds.has(id)) next.add(id);
      });
      return next;
    });
  }, [rows]);

  useEffect(() => {
    const needle = lookup.trim();
    if (!createOpen || needle.length < 2) {
      searchSeq.current += 1;
      setSearchResults([]);
      setSearching(false);
      setCreateErr("");
      return;
    }

    let alive = true;
    const t = setTimeout(async () => {
      const seq = ++searchSeq.current;
      setSearching(true);
      setCreateErr("");

      try {
        const found = await searchRebootUsers(needle);
        const enriched = await enrichCandidatesWithRoleState(found, createRole);
        if (!alive || seq !== searchSeq.current) return;
        setSearchResults(enriched);
      } catch (e: any) {
        if (!alive || seq !== searchSeq.current) return;
        setCreateErr(e?.message || "Failed to search users.");
        setSearchResults([]);
      } finally {
        if (alive && seq === searchSeq.current) setSearching(false);
      }
    }, 220);

    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [lookup, createRole, createOpen]);

  const counters = useMemo(() => {
    const sup = rows.filter((r) => r.role === "supervisor").length;
    const stu = rows.filter((r) => r.role === "student").length;
    return { all: rows.length, sup, stu };
  }, [rows]);

  const queuedKeys = useMemo(
    () => new Set(queue.map((u) => `${u.email.toLowerCase()}::${u.role}`)),
    [queue]
  );

  const visibleResults = useMemo(
    () =>
      searchResults.filter(
        (u) =>
          !u.any_exists && !queuedKeys.has(`${u.email.toLowerCase()}::${createRole}`)
      ),
    [searchResults, queuedKeys, createRole]
  );

  const creatableQueue = useMemo(
    () => queue.filter((u) => !u.role_exists),
    [queue]
  );

  const selectedRows = useMemo(
    () => rows.filter((u) => selectedUserIds.has(u.id)),
    [rows, selectedUserIds]
  );

  function toggleUserSelection(id: number) {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllVisibleUsers() {
    setSelectedUserIds(new Set(rows.map((u) => u.id)));
  }

  function clearSelectedUsers() {
    setSelectedUserIds(new Set());
  }

  async function deleteSelectedUsers() {
    if (selectedRows.length === 0 || deletingUsers) return;

    const ok = await confirm({
      title: "Delete selected users",
      message:
        selectedRows.length === 1
          ? `Delete ${selectedRows[0].full_name}?`
          : `Delete ${selectedRows.length} selected users?`,
    });
    if (!ok) return;

    setDeletingUsers(true);
    setErr("");

    const results = await Promise.allSettled(
      selectedRows.map((u) =>
        apiFetch("/admin/users/delete", {
          method: "POST",
          body: JSON.stringify({ email: u.email, role: u.role }),
        })
      )
    );

    const failed = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    if (failed.length > 0) {
      setErr(failed[0]?.reason?.message || "Some users could not be deleted.");
    }

    await loadUsers(q, role);
    setSelectedUserIds(new Set());
    setDeletingUsers(false);
  }

  function resetCreateFlow() {
    setLookup("");
    setSearchResults([]);
    setQueue([]);
    setCreateErr("");
    setCreateOk("");
    setCreateRole("supervisor");
    searchSeq.current += 1;
  }

  function addToQueue(candidate: RebootCandidate) {
    const key = `${candidate.email.toLowerCase()}::${createRole}`;
    if (queuedKeys.has(key) || candidate.role_exists) return;

    setQueue((prev) => [
      ...prev,
      {
        ...candidate,
        key,
        role: createRole,
      },
    ]);
    setCreateErr("");
    setCreateOk("");
  }

  function removeFromQueue(key: string) {
    setQueue((prev) => prev.filter((u) => u.key !== key));
    setCreateErr("");
    setCreateOk("");
  }

  async function createQueuedUsers() {
    if (creatableQueue.length === 0 || creating) return;

    setCreating(true);
    setCreateErr("");
    setCreateOk("");

    const results = await Promise.allSettled(
      creatableQueue.map((u) =>
        apiFetch("/admin/users", {
          method: "POST",
          body: JSON.stringify({
            nickname: u.nickname.trim(),
            cohort: u.cohort || "Unknown cohort",
            full_name: u.full_name,
            email: u.email,
            password: "",
            role: u.role,
          }),
        })
      )
    );

    const successCount = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];

    if (successCount > 0) {
      setQueue((prev) =>
        prev.filter((u) =>
          results.some(
            (r, index) =>
              index < creatableQueue.length &&
              r.status === "rejected" &&
              creatableQueue[index].key === u.key
          )
        )
      );
      await loadUsers(q, role);
    }

    if (failed.length > 0) {
      const firstError = failed[0]?.reason?.message || "Some users could not be created.";
      setCreateErr(firstError);
    }

    if (successCount > 0) {
      setCreateOk(`Added ${successCount} user(s) to TaskFlow.`);
    }

    setCreating(false);
  }

  return (
    <>
      {confirmDialog}
      <AdminLayout
        active="users"
        title="Users"
        subtitle="Browse users and build a clean create queue from Reboot."
        right={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setCreateOpen((prev) => {
                  const next = !prev;
                  if (!next) resetCreateFlow();
                  return next;
                });
              }}
              className="inline-flex h-10 items-center gap-2 rounded-2xl border border-[#6d5efc]/18 bg-white/90 px-3.5 text-[13px] font-black text-[#6d5efc] shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition hover:-translate-y-[1px] hover:border-[#6d5efc]/28 hover:bg-[#f7f5ff]"
            >
              <UserPlusIcon size={15} />
              {createOpen ? "Close create users" : "Create users"}
            </button>
          </div>
        }
      >
      {err ? (
        <div className="mb-3 rounded-[14px] border border-red-200 bg-red-50 px-3 py-2 text-[13px] font-semibold text-red-700">
          {err}
        </div>
      ) : null}

      {createOpen ? (
        <section className="mb-4 rounded-[20px] border border-slate-200/80 bg-white/82 p-3 shadow-[0_10px_28px_rgba(15,23,42,0.06)] backdrop-blur sm:p-4">
          {createErr ? (
            <div className="mb-3 rounded-[14px] border border-red-200 bg-red-50 px-3 py-2 text-[13px] font-semibold text-red-700">
              {createErr}
            </div>
          ) : null}
          {createOk ? (
            <div className="mb-3 rounded-[14px] border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] font-semibold text-emerald-700">
              {createOk}
            </div>
          ) : null}

          <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <section className="min-w-0 rounded-[18px] border border-slate-200/80 bg-white/88 p-3 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <div className="text-[16px] font-black text-slate-900">Find users</div>
                  <div className="mt-1 text-[12px] font-bold text-slate-500">
                    Type a nickname or email and add the closest matches to your queue.
                  </div>
                </div>
                <div className="inline-flex items-center gap-1 rounded-2xl border border-slate-200 bg-white/90 p-1 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
                  {(["supervisor", "student"] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setCreateRole(r)}
                      className={[
                        "inline-flex h-10 items-center gap-2 rounded-[14px] border border-transparent px-3.5 text-[13px] font-black outline-none transition duration-200 focus-visible:border-[#6d5efc]/18 focus-visible:ring-4 focus-visible:ring-[#6d5efc]/10",
                        createRole === r
                          ? "border-[#6d5efc]/18 bg-white text-[#6d5efc] shadow-[0_8px_18px_rgba(15,23,42,0.05)]"
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                      ].join(" ")}
                    >
                      <RoleIcon role={r} />
                      {roleLabel(r)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="relative mb-3">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                  <SearchIcon size={18} />
                </span>
                <input
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white/95 pl-11 pr-4 text-[14px] font-semibold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#6d5efc]/35 focus:ring-4 focus:ring-[#6d5efc]/10"
                  placeholder="Search nickname or email..."
                  value={lookup}
                  onChange={(e) => setLookup(e.target.value)}
                  autoComplete="off"
                />
              </div>

              {lookup.trim().length < 2 ? (
                <div className="rounded-[14px] border border-dashed border-slate-200 bg-slate-50/80 px-3 py-3 text-[13px] font-semibold text-slate-500">
                  Start with at least 2 characters and we’ll show the closest Reboot matches here.
                </div>
              ) : searching ? (
                <div className="rounded-[14px] border border-slate-200 bg-slate-50/80 px-3 py-3 text-[13px] font-semibold text-slate-500">
                  Looking for close matches...
                </div>
              ) : visibleResults.length === 0 ? (
                <div className="rounded-[14px] border border-slate-200 bg-slate-50/80 px-3 py-3 text-[13px] font-semibold text-slate-500">
                  No close matches yet. Try another spelling.
                </div>
              ) : (
                <div className="grid gap-2">
                  {visibleResults.map((u) => (
                    <article
                      key={`${u.email.toLowerCase()}::${createRole}`}
                      className="flex items-center gap-3 rounded-[16px] border border-slate-200 bg-slate-50/75 px-3 py-3 transition hover:border-[#6d5efc]/18 hover:bg-white"
                    >
                      <div className="grid h-11 w-11 flex-none place-items-center rounded-full border border-slate-200 bg-white text-[13px] font-black text-slate-800">
                        {initialsOf(u.full_name)}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[14px] font-black text-slate-900">{u.full_name}</div>
                        <div className="mt-0.5 truncate text-[12px] font-extrabold text-[#6d5efc]">
                          {withAt(u.nickname)}
                        </div>
                        <div className="mt-1 truncate text-[12px] font-semibold text-slate-500">{u.email}</div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <span className={`inline-flex h-7 items-center rounded-full border px-2.5 text-[11px] font-extrabold ${roleTone(createRole)}`}>
                            {roleLabel(createRole)}
                          </span>
                          {u.role_exists ? (
                            <span className="inline-flex h-7 items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 text-[11px] font-extrabold text-amber-700">
                              Already has this role
                            </span>
                          ) : u.any_exists ? (
                            <span className="inline-flex h-7 items-center rounded-full border border-sky-200 bg-sky-50 px-2.5 text-[11px] font-extrabold text-sky-700">
                              Add role only
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => addToQueue(u)}
                        disabled={!!u.role_exists}
                        className="inline-flex h-10 w-10 flex-none items-center justify-center rounded-full border border-[#6d5efc]/18 bg-white text-[#6d5efc] shadow-[0_8px_18px_rgba(15,23,42,0.05)] transition hover:-translate-y-[1px] hover:border-[#6d5efc]/28 hover:bg-[#f7f5ff] disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-300"
                        aria-label={`Add ${u.full_name}`}
                      >
                        <PlusIcon />
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="min-w-0 rounded-[18px] border border-slate-200/80 bg-white/88 p-3 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <div className="text-[16px] font-black text-slate-900">Ready to add</div>
                  <div className="mt-1 text-[12px] font-bold text-slate-500">
                    Build your list here, remove anyone you want, then add them together.
                  </div>
                </div>
                <div className="grid h-9 min-w-9 place-items-center rounded-full border border-[#6d5efc]/18 bg-[#f7f5ff] px-2 text-[12px] font-black text-[#6d5efc]">
                  {queue.length}
                </div>
              </div>

              <div className="mb-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={createQueuedUsers}
                  disabled={creatableQueue.length === 0 || creating}
                  className="inline-flex h-10 items-center rounded-full border border-[#6d5efc]/18 bg-white px-4 text-[13px] font-black text-[#6d5efc] shadow-[0_10px_24px_rgba(15,23,42,0.05)] transition hover:-translate-y-[1px] hover:border-[#6d5efc]/28 hover:bg-[#f7f5ff] disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                >
                  {creating ? "Adding..." : `Add selected ${creatableQueue.length}`}
                </button>
                <button
                  type="button"
                  onClick={() => setQueue([])}
                  disabled={queue.length === 0 || creating}
                  className="inline-flex h-10 items-center rounded-full border border-slate-200 bg-white px-4 text-[13px] font-black text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Clear
                </button>
              </div>

              {queue.length === 0 ? (
                <div className="rounded-[14px] border border-dashed border-slate-200 bg-slate-50/80 px-3 py-3 text-[13px] font-semibold text-slate-500">
                  Your queued users will appear here as soon as you press the `+` button.
                </div>
              ) : (
                <div className="grid gap-2">
                  {queue.map((u) => (
                    <article
                      key={u.key}
                      className={[
                        "flex items-center gap-3 rounded-[16px] border px-3 py-3 transition",
                        u.role_exists
                          ? "border-amber-200 bg-amber-50/70"
                          : "border-slate-200 bg-slate-50/75 hover:border-[#6d5efc]/18 hover:bg-white",
                      ].join(" ")}
                    >
                      <div className="grid h-11 w-11 flex-none place-items-center rounded-full border border-slate-200 bg-white text-[13px] font-black text-slate-800">
                        {initialsOf(u.full_name)}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[14px] font-black text-slate-900">{u.full_name}</div>
                        <div className="mt-0.5 truncate text-[12px] font-extrabold text-[#6d5efc]">
                          {withAt(u.nickname)}
                        </div>
                        <div className="mt-1 truncate text-[12px] font-semibold text-slate-500">{u.email}</div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <span className={`inline-flex h-7 items-center rounded-full border px-2.5 text-[11px] font-extrabold ${roleTone(u.role)}`}>
                            {roleLabel(u.role)}
                          </span>
                          {u.role_exists ? (
                            <span className="inline-flex h-7 items-center rounded-full border border-amber-200 bg-white px-2.5 text-[11px] font-extrabold text-amber-700">
                              Already added
                            </span>
                          ) : u.any_exists ? (
                            <span className="inline-flex h-7 items-center rounded-full border border-sky-200 bg-white px-2.5 text-[11px] font-extrabold text-sky-700">
                              Existing account
                            </span>
                          ) : (
                            <span className="inline-flex h-7 items-center rounded-full border border-slate-200 bg-white px-2.5 text-[11px] font-extrabold text-slate-600">
                              New account
                            </span>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeFromQueue(u.key)}
                        className="inline-flex h-10 w-10 flex-none items-center justify-center rounded-full border border-rose-200 bg-white text-rose-500 transition hover:border-rose-300 hover:bg-rose-50"
                        aria-label={`Remove ${u.full_name}`}
                      >
                        <MinusIcon />
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        </section>
      ) : null}

      <section className="rounded-[18px] border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
        <div className="mb-3 grid gap-2 md:grid-cols-[1fr_auto]">
          <input
            className="h-11 rounded-[14px] border border-slate-200 bg-slate-50 px-3 text-[14px] font-semibold text-slate-900 outline-none focus:border-[#6d5efc]/35 focus:bg-white focus:ring-4 focus:ring-[#6d5efc]/12"
            placeholder="Search by name, email, or nickname..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="flex items-center gap-2">
            {(["all", "supervisor", "student"] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className={[
                  "h-11 rounded-[14px] border px-3 text-[13px] font-black transition",
                  role === r
                    ? "border-[#6d5efc]/30 bg-[#6d5efc]/10 text-slate-900"
                    : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100",
                ].join(" ")}
              >
                {r === "all" ? "All" : r === "supervisor" ? "Supervisors" : "Students"}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setDeleteMode((prev) => !prev)}
            className={[
              "inline-flex h-10 items-center rounded-full border px-4 text-[13px] font-black transition",
              deleteMode
                ? "border-rose-200 bg-rose-50 text-rose-600 hover:border-rose-300 hover:bg-rose-100"
                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50",
            ].join(" ")}
          >
            {deleteMode ? "Done selecting" : "Select users to delete"}
          </button>

          {deleteMode ? (
            <>
              <button
                type="button"
                onClick={selectAllVisibleUsers}
                disabled={rows.length === 0}
                className="inline-flex h-10 items-center rounded-full border border-slate-200 bg-white px-4 text-[13px] font-black text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={clearSelectedUsers}
                disabled={selectedUserIds.size === 0}
                className="inline-flex h-10 items-center rounded-full border border-slate-200 bg-white px-4 text-[13px] font-black text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={deleteSelectedUsers}
                disabled={selectedUserIds.size === 0 || deletingUsers}
                className="inline-flex h-10 items-center rounded-full border border-rose-200 bg-white px-4 text-[13px] font-black text-rose-500 transition hover:border-rose-300 hover:bg-rose-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
              >
                {deletingUsers ? "Deleting..." : `Delete selected ${selectedUserIds.size}`}
              </button>
            </>
          ) : null}
        </div>

        <div className="mb-3 grid gap-2 sm:grid-cols-3">
          <Counter label="All users" value={counters.all} />
          <Counter label="Supervisors" value={counters.sup} />
          <Counter label="Students" value={counters.stu} />
        </div>

        {loading ? (
          <div className="rounded-[14px] border border-slate-200 bg-slate-50 px-3 py-3 text-[13px] font-semibold text-slate-600">
            Loading users...
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-[14px] border border-slate-200 bg-slate-50 px-3 py-3 text-[13px] font-semibold text-slate-600">
            No users found.
          </div>
        ) : (
          <div className="grid gap-2 lg:grid-cols-2">
            {rows.map((u) => (
              <article
                key={u.id}
                role="button"
                tabIndex={0}
                onClick={() => {
                  if (deleteMode) {
                    toggleUserSelection(u.id);
                    return;
                  }
                  nav(`/admin/users/${u.id}/profile`, { state: { backTo: "/admin/users" } });
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    if (deleteMode) {
                      toggleUserSelection(u.id);
                      return;
                    }
                    nav(`/admin/users/${u.id}/profile`, { state: { backTo: "/admin/users" } });
                  }
                }}
                className={[
                  "rounded-[14px] border px-3 py-2.5 transition focus:outline-none focus-visible:ring-4 focus-visible:ring-[#6d5efc]/15",
                  deleteMode ? "cursor-pointer" : "cursor-pointer",
                  deleteMode && selectedUserIds.has(u.id)
                    ? "border-rose-200 bg-rose-50/70 hover:border-rose-300 hover:bg-rose-50"
                    : "border-slate-200 bg-slate-50 hover:border-[#6d5efc]/20 hover:bg-white",
                ].join(" ")}
              >
                <div className="flex items-start gap-3">
                  {deleteMode ? (
                    <label
                      className="mt-1 inline-flex h-5 w-5 flex-none cursor-pointer items-center justify-center"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={selectedUserIds.has(u.id)}
                        onChange={() => toggleUserSelection(u.id)}
                        className="h-5 w-5 rounded border-slate-300 text-[#6d5efc] focus:ring-[#6d5efc]/20"
                      />
                    </label>
                  ) : null}
                  <div className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 bg-white text-[13px] font-black text-slate-800">
                    {initialsOf(u.full_name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-black text-slate-900">{u.full_name}</div>
                    <div className="truncate text-[12px] font-semibold text-slate-500">{u.email}</div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex h-7 items-center rounded-full border border-slate-200 bg-white px-2.5 text-[11px] font-extrabold text-[#6d5efc]">
                        {withAt(u.nickname)}
                      </span>
                      <span className={`inline-flex h-7 items-center rounded-full border px-2.5 text-[11px] font-extrabold ${roleTone(u.role)}`}>
                        {u.role}
                      </span>
                      <span className="inline-flex h-7 items-center rounded-full border border-slate-200 bg-white px-2.5 text-[11px] font-extrabold text-slate-700">
                        {u.cohort || "No cohort"}
                      </span>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      </AdminLayout>
    </>
  );
}

function Counter({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[12px] border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">{label}</div>
      <div className="mt-1 text-[20px] font-black tracking-[-0.02em] text-slate-900">{value}</div>
    </div>
  );
}
