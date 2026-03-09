import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import AdminLayout from "../components/AdminLayout";
import { apiFetch } from "../lib/api";

const GQL_URL = "https://learn.reboot01.com/api/graphql-engine/v1/graphql";

type LocalProfile = {
  user: {
    id: number;
    full_name: string;
    email: string;
    nickname: string;
    cohort: string;
    role: "admin" | "supervisor" | "student";
  };
  supervisor?: {
    assigned_students_overall: number;
    assigned_students: {
      id: number;
      full_name: string;
      nickname: string;
      email: string;
      boards: { id: number; name: string }[];
    }[];
    boards: { id: number; name: string; students_count: number }[];
  };
  student?: {
    supervisors: { id: number; full_name: string; nickname: string; email: string }[];
    boards: {
      id: number;
      name: string;
      supervisor: { id: number; full_name: string; nickname: string; email: string };
    }[];
  };
  tasks: {
    total: number;
    done: number;
    left: number;
    progress_pct: number;
    assigned_cards: {
      card_id: number;
      card_title: string;
      board_id: number;
      board_name: string;
      status: string;
      priority: string;
      due_date: string;
      subtasks_done: number;
      subtasks_all: number;
    }[];
  };
};

type RebootProfile = {
  user?: {
    email?: string;
    firstName?: string;
    lastName?: string;
    login?: string;
    gender?: string;
    auditRatio?: number;
    totalUp?: number;
    totalDown?: number;
  };
  level: number | null;
  xp: number | null;
};
type BoardMember = {
  user_id: number;
  full_name: string;
  nickname: string;
  email: string;
  role: string;
  role_in_board: string;
};

function num(value: number | null | undefined, digits = 2) {
  if (typeof value !== "number" || Number.isNaN(value)) return "-";
  return value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function withAt(v: string) {
  const t = (v || "").trim();
  if (!t) return "-";
  return t.startsWith("@") ? t : `@${t}`;
}

function initials(v: string) {
  const p = String(v || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (p.length === 0) return "?";
  return p.map((x) => x[0]?.toUpperCase() || "").join("");
}

function normalizeGender(v: string) {
  const g = String(v || "").trim().toLowerCase();
  if (g.includes("female") || g === "f" || g === "woman" || g === "girl") return "female";
  if (g.includes("male") || g === "m" || g === "man" || g === "boy") return "male";
  return "unspecified";
}

async function loadRebootProfile(login: string, jwt: string): Promise<RebootProfile> {
  const query = `
    query Profile($login: String!) {
      user(where: { login: { _eq: $login } }, limit: 1) {
        email
        firstName
        lastName
        login
        auditRatio
        totalUp
        totalDown
      }
      event_user(where: { eventId: { _in: [72, 20, 250, 763] }, userLogin: { _eq: $login } }) {
        level
      }
      transaction_aggregate(
        where: {
          event: { path: { _eq: "/bahrain/bh-module" } }
          type: { _eq: "xp" }
          userLogin: { _eq: $login }
        }
      ) {
        aggregate {
          sum {
            amount
          }
        }
      }
    }
  `;

  const res = await fetch(GQL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables: { login } }),
  });

  const json = await res.json();
  if (!res.ok || json?.errors?.length) {
    throw new Error(json?.errors?.[0]?.message || "Failed to load Reboot profile");
  }

  const user = (json?.data?.user?.[0] ?? {}) as RebootProfile["user"];
  const levels = (json?.data?.event_user ?? [])
    .map((e: any) => Number(e?.level))
    .filter((n: number) => Number.isFinite(n));
  const level = levels.length ? Math.max(...levels) : null;
  const xpRaw = Number(json?.data?.transaction_aggregate?.aggregate?.sum?.amount);

  const gender = await loadRebootGender(login, jwt);

  const mergedUser = gender ? { ...user, gender } : user;
  return {
    user: mergedUser,
    level,
    xp: Number.isFinite(xpRaw) ? xpRaw : null,
  };
}

function pickGenderFromAttrs(attrs: any): string {
  if (!attrs) return "";
  let source = attrs;
  if (typeof source === "string") {
    try {
      source = JSON.parse(source);
    } catch {
      return "";
    }
  }
  if (typeof source === "object" && !Array.isArray(source)) {
    const candidates = [
      source.genders,
      source.gender,
      source.Gender,
      source.sex,
      source.Sex,
      source.profileGender,
    ];
    const found = candidates.find((v) => typeof v === "string" && v.trim());
    if (found) return String(found).trim();
  }
  return "";
}

async function loadRebootGender(login: string, jwt: string): Promise<string> {
  // Try direct `gender` field first.
  try {
    const genderQ = `
      query ProfileGender($login: String!) {
        user(where: { login: { _eq: $login } }, limit: 1) {
          gender
        }
      }
    `;
    const res = await fetch(GQL_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: genderQ, variables: { login } }),
    });
    const json = await res.json().catch(() => null);
    const g = String(json?.data?.user?.[0]?.gender || "").trim();
    if (g) return g;
  } catch {
    // Continue fallback.
  }

  // Fallback for schemas exposing gender inside attrs JSON.
  try {
    const attrsQ = `
      query ProfileAttrs($login: String!) {
        user(where: { login: { _eq: $login } }, limit: 1) {
          attrs
        }
      }
    `;
    const res = await fetch(GQL_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: attrsQ, variables: { login } }),
    });
    const json = await res.json().catch(() => null);
    return pickGenderFromAttrs(json?.data?.user?.[0]?.attrs);
  } catch {
    return "";
  }
}

export default function ProfilePage() {
  const nav = useNavigate();
  const params = useParams<{ userId?: string }>();
  const role = (localStorage.getItem("role") || "").trim().toLowerCase();
  const ownLogin = (localStorage.getItem("login") || "").trim();
  const jwt = (localStorage.getItem("jwt") || "").trim().replace(/^"|"$/g, "");
  const targetUserID = Number(params.userId || 0);
  const isAdminViewingUser = role === "admin" && Number.isFinite(targetUserID) && targetUserID > 0;

  const [localProfile, setLocalProfile] = useState<LocalProfile | null>(null);
  const [rebootProfile, setRebootProfile] = useState<RebootProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [membersByBoard, setMembersByBoard] = useState<Record<number, BoardMember[]>>({});
  const [membersOpen, setMembersOpen] = useState<Record<number, boolean>>({});
  const [membersLoading, setMembersLoading] = useState<Record<number, boolean>>({});

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setErr("");
      try {
        const local = await apiFetch(
          isAdminViewingUser ? `/admin/profile/summary?user_id=${targetUserID}` : "/admin/profile/summary"
        );
        const targetLogin =
          String(local?.user?.nickname || "").trim() || (isAdminViewingUser ? "" : ownLogin);
        const reboot = targetLogin && jwt ? await loadRebootProfile(targetLogin, jwt) : null;
        if (!mounted) return;
        setLocalProfile(local);
        setRebootProfile(reboot);
      } catch (e: any) {
        if (!mounted) return;
        setErr(e?.message || "Failed to load profile");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [isAdminViewingUser, ownLogin, jwt, targetUserID]);

  const displayName = useMemo(() => {
    if (rebootProfile?.user?.firstName || rebootProfile?.user?.lastName) {
      return `${rebootProfile?.user?.firstName || ""} ${rebootProfile?.user?.lastName || ""}`.trim();
    }
    return localProfile?.user?.full_name || "Profile";
  }, [localProfile?.user?.full_name, rebootProfile?.user?.firstName, rebootProfile?.user?.lastName]);
  const roleLabel = localProfile?.user?.role || role;
  const genderRaw = rebootProfile?.user?.gender || "";
  const genderNormalized = normalizeGender(genderRaw);
  const boardRows =
    localProfile?.user?.role === "student"
      ? (localProfile.student?.boards || []).map((b) => ({
          id: b.id,
          name: b.name,
          subtitle: `Supervisor: ${b.supervisor.full_name} (${withAt(b.supervisor.nickname)})`,
        }))
      : (localProfile?.supervisor?.boards || []).map((b) => ({
          id: b.id,
          name: b.name,
          subtitle: `${b.students_count} students`,
        }));

  async function toggleMembers(boardID: number) {
    const isOpen = !!membersOpen[boardID];
    if (isOpen) {
      setMembersOpen((prev) => ({ ...prev, [boardID]: false }));
      return;
    }
    setMembersOpen((prev) => ({ ...prev, [boardID]: true }));
    if (membersByBoard[boardID]) return;
    setMembersLoading((prev) => ({ ...prev, [boardID]: true }));
    try {
      const rows = await apiFetch(`/admin/board-members?board_id=${boardID}`);
      setMembersByBoard((prev) => ({ ...prev, [boardID]: Array.isArray(rows) ? rows : [] }));
    } catch {
      setMembersByBoard((prev) => ({ ...prev, [boardID]: [] }));
    } finally {
      setMembersLoading((prev) => ({ ...prev, [boardID]: false }));
    }
  }

  if (role === "admin" && !isAdminViewingUser) return <Navigate to="/admin" replace />;
  if (!isAdminViewingUser && role !== "supervisor" && role !== "student") return <Navigate to="/login" replace />;

  return (
    <AdminLayout
      active={isAdminViewingUser ? "users" : "profile"}
      title={isAdminViewingUser ? "User Profile" : "My Profile"}
      subtitle={
        isAdminViewingUser
          ? "User details, role information, and assignment overview."
          : "Personal info, role details, and assignment overview."
      }
      right={
        isAdminViewingUser ? (
          <button
            type="button"
            onClick={() => nav("/admin/users")}
            className="h-10 rounded-[14px] border border-slate-200 bg-slate-50 px-3 font-extrabold text-slate-900 transition hover:border-[#6d5efc]/25 hover:bg-[#f2f5ff]"
          >
            Back
          </button>
        ) : null
      }
    >
      {err ? (
        <div className="mb-3 rounded-[14px] border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-slate-800">
          {err}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-[18px] border border-slate-200 bg-white p-5 text-[14px] font-semibold text-slate-500">
          Loading profile...
        </div>
      ) : null}

      {!loading && localProfile ? (
        <div className="mx-auto grid max-w-[1280px] gap-3 [animation:pfFade_.32s_ease]">
          <style>{`@keyframes pfFade{from{opacity:.2;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>

          <section className="rounded-[18px] border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
            <div className="grid gap-3 lg:grid-cols-[auto_minmax(0,1fr)]">
              <AvatarPlaceholder name={displayName} gender={genderNormalized} />
              <div className="min-w-0">
                <div className="truncate text-[26px] font-black tracking-[-0.02em] text-slate-900">{displayName}</div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12px] font-bold text-slate-600">
                  <span className="rounded-full border border-[#6d5efc]/20 bg-[#6d5efc]/10 px-2.5 py-1">
                    {withAt(localProfile.user.nickname)}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 capitalize">
                    {roleLabel}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                    {localProfile.user.cohort || "No cohort"}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <Info label="Email" value={rebootProfile?.user?.email || localProfile.user.email} />
              <Info
                label="Gender"
                value={genderNormalized === "female" ? "Female" : genderNormalized === "male" ? "Male" : "-"}
                icon={<GenderIcon gender={genderNormalized} />}
              />
              <Info label="Level" value={num(rebootProfile?.level, 0)} />
              <Info label="Audit ratio" value={num(rebootProfile?.user?.auditRatio)} />
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <SnapshotItem label="Boards" value={String(boardRows.length)} />
              <SnapshotItem label="Assigned Tasks" value={String(localProfile.tasks?.total || 0)} />
              <SnapshotItem label="Completed" value={String(localProfile.tasks?.done || 0)} />
            </div>
          </section>

          <div className="grid gap-3 lg:grid-cols-2 lg:[grid-auto-rows:minmax(0,1fr)]">
            <section className="rounded-[18px] border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)] lg:min-h-[450px]">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="text-[18px] font-black text-slate-900">Boards</div>
                <span className="inline-flex h-7 items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 text-[11px] font-black text-slate-700">
                  {boardRows.length} boards
                </span>
              </div>
              <div className="space-y-2 overflow-y-auto pr-1 lg:max-h-[360px]">
                {boardRows.length === 0 ? (
                  <div className="text-[13px] font-semibold text-slate-500">No boards yet.</div>
                ) : (
                  boardRows.map((b) => (
                    <div key={b.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-[13px] font-black text-slate-900">{b.name}</div>
                          <div className="mt-0.5 text-[12px] font-semibold text-slate-500">{b.subtitle}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleMembers(b.id)}
                          aria-label={membersOpen[b.id] ? "Hide members" : "Show members"}
                          title={membersOpen[b.id] ? "Hide members" : "Show members"}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200/80 bg-slate-50 text-slate-600 transition hover:border-[#6d5efc]/25 hover:bg-[#f6f4ff] hover:text-[#6d5efc]"
                        >
                          {membersOpen[b.id] ? (
                            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
                              <path d="M6 15l6-6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                            </svg>
                          ) : (
                            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
                              <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                            </svg>
                          )}
                        </button>
                      </div>

                      {membersOpen[b.id] ? (
                        <div className="mt-2 rounded-lg border border-slate-200 bg-white p-2.5">
                          {membersLoading[b.id] ? (
                            <div className="text-[12px] font-semibold text-slate-500">Loading members...</div>
                          ) : (membersByBoard[b.id] || []).length === 0 ? (
                            <div className="text-[12px] font-semibold text-slate-500">No members found.</div>
                          ) : (
                            <div className="space-y-1.5">
                              {(membersByBoard[b.id] || []).map((m) => (
                                <div
                                  key={`${b.id}-${m.user_id}`}
                                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12px]"
                                >
                                  <span className="truncate font-extrabold text-slate-800">{m.full_name}</span>
                                  <span className="shrink-0 text-[11px] font-extrabold text-[#6d5efc]">
                                    {withAt(m.nickname)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </section>

            {localProfile.user.role === "supervisor" ? (
              <section className="rounded-[18px] border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)] lg:min-h-[450px]">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="text-[18px] font-black text-slate-900">Assigned Students</div>
                  <span className="inline-flex h-7 items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 text-[11px] font-black text-slate-700">
                    {localProfile.supervisor?.assigned_students_overall || 0} total
                  </span>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-2 flex items-center justify-between text-[12px] font-bold text-slate-600">
                    <span>{localProfile.supervisor?.assigned_students_overall || 0} assigned</span>
                    <span>{boardRows.length} boards</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-200">
                    <div
                      className="h-2 rounded-full bg-gradient-to-r from-[#6d5efc] to-[#8f83ff]"
                      style={{
                        width: `${Math.max(
                          0,
                          Math.min(
                            100,
                            boardRows.length > 0
                              ? Math.round(
                                  (((localProfile.supervisor?.assigned_students || []).filter(
                                    (s) => (s.boards || []).length > 0
                                  ).length || 0) /
                                    Math.max(1, localProfile.supervisor?.assigned_students_overall || 1)) *
                                    100
                                )
                              : 0
                          )
                        )}%`,
                      }}
                    />
                  </div>
                  <div className="mt-1 text-right text-[11px] font-extrabold text-slate-600">
                    {(localProfile.supervisor?.assigned_students || []).filter((s) => (s.boards || []).length > 0).length}{" "}
                    linked to boards
                  </div>
                </div>

                <div className="mt-3 space-y-2 overflow-y-auto pr-1 lg:max-h-[300px]">
                  {(localProfile.supervisor?.assigned_students || []).length === 0 ? (
                    <div className="text-[13px] font-semibold text-slate-500">No assigned students yet.</div>
                  ) : (
                    (localProfile.supervisor?.assigned_students || []).map((s) => (
                      <div key={s.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <div className="truncate text-[13px] font-black text-slate-900">{s.full_name}</div>
                        <div className="mt-0.5 text-[12px] font-semibold text-slate-500">
                          {withAt(s.nickname)} • {s.email}
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
                          {(s.boards || []).length === 0 ? (
                            <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-slate-700">
                              no board yet
                            </span>
                          ) : (
                            (s.boards || []).map((b) => (
                              <span
                                key={`${s.id}-${b.id}`}
                                className="rounded-full border border-[#6d5efc]/20 bg-[#6d5efc]/10 px-2 py-0.5 text-slate-700"
                              >
                                {b.name}
                              </span>
                            ))
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            ) : (
              <section className="rounded-[18px] border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)] lg:min-h-[450px]">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="text-[18px] font-black text-slate-900">Assigned Tasks</div>
                  <span className="inline-flex h-7 items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 text-[11px] font-black text-slate-700">
                    {localProfile.tasks?.total || 0} total
                  </span>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-2 flex items-center justify-between text-[12px] font-bold text-slate-600">
                    <span>{localProfile.tasks?.done || 0} done</span>
                    <span>{localProfile.tasks?.left || 0} left</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-200">
                    <div
                      className="h-2 rounded-full bg-gradient-to-r from-[#6d5efc] to-[#8f83ff]"
                      style={{ width: `${Math.max(0, Math.min(100, localProfile.tasks?.progress_pct || 0))}%` }}
                    />
                  </div>
                  <div className="mt-1 text-right text-[11px] font-extrabold text-slate-600">
                    {localProfile.tasks?.progress_pct || 0}% complete
                  </div>
                </div>

                <div className="mt-3 space-y-2 overflow-y-auto pr-1 lg:max-h-[300px]">
                  {(localProfile.tasks?.assigned_cards || []).length === 0 ? (
                    <div className="text-[13px] font-semibold text-slate-500">No assigned tasks yet.</div>
                  ) : (
                    (localProfile.tasks?.assigned_cards || []).map((t) => (
                      <div key={t.card_id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <div className="truncate text-[13px] font-black text-slate-900">{t.card_title}</div>
                        <div className="mt-0.5 text-[12px] font-semibold text-slate-500">{t.board_name}</div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
                          <span
                            className={
                              t.status === "done"
                                ? "rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-emerald-700"
                                : "rounded-full border border-slate-300 bg-white px-2 py-0.5 text-slate-700"
                            }
                          >
                            {t.status || "open"}
                          </span>
                          <span className="rounded-full border border-[#6d5efc]/20 bg-[#6d5efc]/10 px-2 py-0.5 text-slate-700">
                            {t.priority || "medium"}
                          </span>
                          <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-slate-700">
                            {t.subtasks_all > 0 ? `${t.subtasks_done}/${t.subtasks_all}` : "no checklist"}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            )}
          </div>
        </div>
      ) : null}
    </AdminLayout>
  );
}

function Info({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-[12px] border border-slate-200 bg-slate-50 px-3 py-2.5">
      <div className="text-[10px] font-black uppercase tracking-[0.09em] text-slate-500">{label}</div>
      <div className="mt-1 flex items-center gap-1.5 truncate text-[13px] font-black text-slate-900">
        {icon}
        <span className="truncate">{value}</span>
      </div>
    </div>
  );
}

function SnapshotItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <div className="text-[11px] font-black uppercase tracking-[0.07em] text-slate-500">{label}</div>
      <div className="mt-1 text-[18px] font-black tracking-[-0.02em] text-slate-900">{value}</div>
    </div>
  );
}

function AvatarPlaceholder({ name, gender }: { name: string; gender: "male" | "female" | "unspecified" }) {
  const isFemale = gender === "female";
  const tone = isFemale
    ? "from-[#ffe4ef] via-[#f0e6ff] to-[#e2e8ff]"
    : "from-[#dff2ff] via-[#e8ecff] to-[#ecf3ff]";

  return (
    <div className={`relative grid h-20 w-20 flex-none place-items-center rounded-full border border-slate-200 bg-gradient-to-br ${tone}`}>
      <div className="text-[22px] font-black text-slate-700">{initials(name)}</div>
      <div className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full border border-white bg-white shadow-sm">
        <GenderIcon gender={gender} />
      </div>
    </div>
  );
}

function GenderIcon({ gender }: { gender: "male" | "female" | "unspecified" }) {
  const common = "h-4 w-4";
  if (gender === "female") {
    return (
      <svg viewBox="0 0 24 24" className={common} fill="none" aria-hidden="true">
        <circle cx="12" cy="8" r="4.5" stroke="#7c3aed" strokeWidth="2" />
        <path d="M12 12.5V21M8 17h8" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  if (gender === "male") {
    return (
      <svg viewBox="0 0 24 24" className={common} fill="none" aria-hidden="true">
        <circle cx="9" cy="15" r="4.5" stroke="#2563eb" strokeWidth="2" />
        <path d="M13 11l6-6M14.5 5H19v4.5" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={common} fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="5" stroke="#64748b" strokeWidth="2" />
      <path d="M12 7v10M7 12h10" stroke="#64748b" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
