import { useEffect, useMemo, useState } from "react";
import AdminLayout from "../components/AdminLayout";
import UserAvatar from "../components/UserAvatar";
import { apiFetch } from "../lib/api";
import { fetchRebootAvatars } from "../lib/rebootAvatars";
import { fetchRebootPhones } from "../lib/rebootPhones";
import { useLocation, useNavigate } from "react-router-dom";
// import "../admin.css";

type User = {
  id: number;
  full_name: string;
  nickname: string;
  email: string;
  cohort: string;
  role: string;
};

type Role = "supervisor" | "student";

function RoleIcon({ role }: { role: Role }) {
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

function BinIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 6h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M19 6v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 10v6M14 10v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function initialsOf(name: string) {
  const n = (name || "").trim();
  if (!n) return "?";
  const parts = n.split(/\s+/).slice(0, 2);
  return parts.map((p) => (p[0] || "").toUpperCase()).join("") || "?";
}

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function safeLower(v: unknown) {
  return String(v ?? "").toLowerCase();
}

function displayNickname(nickname: string) {
  const n = (nickname || "").trim();
  if (!n) return "";
  return n.startsWith("@") ? n : `@${n}`;
}

function normalizeCohort(value: string) {
  const cohort = String(value || "").trim();
  if (!cohort) return "";
  if (cohort.toLowerCase() === "unknown cohort") return "";
  return cohort;
}

function adminContact(phoneByLogin: Record<string, string>, user: User) {
  const login = String(user.nickname || user.email.split("@")[0] || "").trim().toLowerCase();
  return phoneByLogin[login] || "-";
}

export default function AssignPage() {
  const nav = useNavigate();
  const [supervisors, setSupervisors] = useState<User[]>([]);
  const [students, setStudents] = useState<User[]>([]);
  const [assigned, setAssigned] = useState<User[]>([]);
  const [avatarByLogin, setAvatarByLogin] = useState<Record<string, string>>({});
  const [phoneByLogin, setPhoneByLogin] = useState<Record<string, string>>({});

  const [selectedSup, setSelectedSup] = useState<User | null>(null);

  const [supQ, setSupQ] = useState("");
  const [stuQ, setStuQ] = useState("");
  const [assignedQ, setAssignedQ] = useState("");
  const [stuCohort, setStuCohort] = useState("all");
  const [assignedCohort, setAssignedCohort] = useState("all");

  const [selectedStuIds, setSelectedStuIds] = useState<Set<number>>(new Set());
  const [selectedAssignedIds, setSelectedAssignedIds] = useState<Set<number>>(new Set());

  const [loadingAssigned, setLoadingAssigned] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  // const nav = useNavigate();
const location = useLocation();

const from = location.state?.from === "users" ? "users" : "supervisors";
const backTo = location.state?.backTo || "/admin/supervisors";

  async function loadBase() {
    setErr("");
    try {
      const [sups, studs] = await Promise.all([
        apiFetch("/admin/assign/supervisors"),
        apiFetch("/admin/assign/students"),
      ]);
      setSupervisors(sups || []);
      setStudents(studs || []);
      setSelectedSup(null);
      setAssigned([]);
      setSelectedStuIds(new Set());
      setSelectedAssignedIds(new Set());
      setStuCohort("all");
      setAssignedCohort("all");
    } catch (e: any) {
      setErr(e.message || "Failed to load");
    }
  }

  async function loadAssigned(supervisorId: number) {
    setErr("");
    setOk("");
    setLoadingAssigned(true);
    try {
      const res = await apiFetch(`/admin/assign/list?supervisor_id=${supervisorId}`);
      setAssigned(res || []);
      setSelectedAssignedIds(new Set());
    } catch (e: any) {
      setErr(e.message || "Failed to load assigned talents");
      setAssigned([]);
      setSelectedAssignedIds(new Set());
    } finally {
      setLoadingAssigned(false);
    }
  }

  useEffect(() => {
    loadBase();
  }, []);

  useEffect(() => {
    let alive = true;

    async function loadAvatars() {
      const logins = [...supervisors, ...students, ...assigned]
        .map((user) => user.nickname || user.email.split("@")[0])
        .filter(Boolean);
      if (logins.length === 0) {
        setAvatarByLogin({});
        return;
      }
      try {
        const next = await fetchRebootAvatars(logins);
        if (!alive) return;
        setAvatarByLogin(next);
      } catch {
        if (!alive) return;
        setAvatarByLogin({});
      }
    }

    void loadAvatars();
    return () => {
      alive = false;
    };
  }, [supervisors, students, assigned]);

  useEffect(() => {
    let alive = true;

    async function loadPhones() {
      const logins = [...supervisors, ...students, ...assigned]
        .map((user) => user.nickname || user.email.split("@")[0])
        .filter(Boolean);
      if (logins.length === 0) {
        setPhoneByLogin({});
        return;
      }
      try {
        const next = await fetchRebootPhones(logins);
        if (!alive) return;
        setPhoneByLogin(next);
      } catch {
        if (!alive) return;
        setPhoneByLogin({});
      }
    }

    void loadPhones();
    return () => {
      alive = false;
    };
  }, [supervisors, students, assigned]);

  useEffect(() => {
    if (selectedSup) {
      loadAssigned(selectedSup.id);
      setSelectedStuIds(new Set());
      setSelectedAssignedIds(new Set());
      setAssignedQ("");
      setAssignedCohort("all");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSup?.id]);

  const assignedIds = useMemo(() => new Set(assigned.map((a) => a.id)), [assigned]);

  const availableCohortOptions = useMemo(() => {
    return [...new Set(
      students
        .filter((s) => !assignedIds.has(s.id))
        .map((s) => normalizeCohort(s.cohort))
        .filter(Boolean)
    )].sort((a, b) => a.localeCompare(b));
  }, [students, assignedIds]);

  const assignedCohortOptions = useMemo(() => {
    return [...new Set(
      assigned
        .map((s) => normalizeCohort(s.cohort))
        .filter(Boolean)
    )].sort((a, b) => a.localeCompare(b));
  }, [assigned]);

  // ✅ Search includes nickname
  const visibleSupervisors = useMemo(() => {
    const q = supQ.trim().toLowerCase();
    return supervisors.filter((s) => {
      if (!q) return true;
      return (
        safeLower(s.full_name).includes(q) ||
        safeLower(s.email).includes(q) ||
        safeLower(s.nickname).includes(q)
      );
    });
  }, [supervisors, supQ]);

  // ✅ Search includes nickname
  const visibleStudents = useMemo(() => {
    const q = stuQ.trim().toLowerCase();
    return students
      .filter((s) => !assignedIds.has(s.id))
      .filter((s) => stuCohort === "all" || normalizeCohort(s.cohort) === stuCohort)
      .filter((s) => {
        if (!q) return true;
        return (
          safeLower(s.full_name).includes(q) ||
          safeLower(s.email).includes(q) ||
          safeLower(s.nickname).includes(q)
        );
      });
  }, [students, assignedIds, stuQ, stuCohort]);

  const visibleAssigned = useMemo(() => {
    const q = assignedQ.trim().toLowerCase();
    return assigned
      .filter((s) => assignedCohort === "all" || normalizeCohort(s.cohort) === assignedCohort)
      .filter((s) => {
        if (!q) return true;
        return (
          safeLower(s.full_name).includes(q) ||
          safeLower(s.email).includes(q) ||
          safeLower(s.nickname).includes(q)
        );
      });
  }, [assigned, assignedQ, assignedCohort]);

  function toggleStudent(id: number) {
    setSelectedStuIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    setSelectedStuIds((prev) => {
      const next = new Set(prev);
      visibleStudents.forEach((s) => next.add(s.id));
      return next;
    });
  }

  function clearSelected() {
    setSelectedStuIds(new Set());
  }

  function toggleAssigned(id: number) {
    setSelectedAssignedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllAssignedVisible() {
    setSelectedAssignedIds((prev) => {
      const next = new Set(prev);
      visibleAssigned.forEach((s) => next.add(s.id));
      return next;
    });
  }

  function clearAssignedSelection() {
    setSelectedAssignedIds(new Set());
  }

  async function addSelected() {
    if (!selectedSup) {
      setErr("Select a supervisor first.");
      return;
    }
    if (selectedStuIds.size === 0) return;

    setSaving(true);
    setErr("");
    setOk("");

    const supId = selectedSup.id;
    const ids = Array.from(selectedStuIds);

    try {
      await Promise.all(
        ids.map((studentId) =>
          apiFetch("/admin/assign", {
            method: "POST",
            body: JSON.stringify({ supervisor_id: supId, student_id: studentId }),
          })
        )
      );

      await loadAssigned(supId);
      const refreshed = await apiFetch("/admin/assign/students");
      setStudents(refreshed || []);
      setSelectedStuIds(new Set());
      setOk(`Assigned ${ids.length} talent(s).`);
    } catch (e: any) {
      setErr(e.message || "Failed to assign selected talents");
    } finally {
      setSaving(false);
    }
  }

  async function removeSelectedAssigned() {
    if (!selectedSup || saving || selectedAssignedIds.size === 0) return;

    const ids = Array.from(selectedAssignedIds);
    setErr("");
    setOk("");
    setSaving(true);
    try {
      await Promise.all(
        ids.map((studentId) =>
          apiFetch("/admin/assign/remove", {
            method: "POST",
            body: JSON.stringify({ supervisor_id: selectedSup.id, student_id: studentId }),
          })
        )
      );
      await loadAssigned(selectedSup.id);
      const refreshed = await apiFetch("/admin/assign/students");
      setStudents(refreshed || []);
      setSelectedAssignedIds(new Set());
      setOk(`Removed ${ids.length} talent(s).`);
    } catch (e: any) {
      setErr(e.message || "Failed to unassign selected talents");
    } finally {
      setSaving(false);
    }
  }

  const addDisabled = !selectedSup || selectedStuIds.size === 0 || saving;

  return (
    <AdminLayout
  active={from === "users" ? "users" : "supervisors"}
  title="Assign Talents"
  subtitle={from === "users" ? "Assign talents from the users flow" : "Assign talents to supervisors"}
  right={
    <button
      type="button"
      onClick={() => nav(backTo)}
      className="inline-flex h-10 items-center rounded-2xl border border-slate-200 bg-white px-4 text-[13px] font-black text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
    >
      Back
    </button>
  }

    >
      <div className="w-full max-w-full overflow-x-hidden">
        {err && (
          <div className="assign-message assign-message-error mb-3 rounded-[14px] border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-slate-800">
            {err}
          </div>
        )}
        {ok && (
          <div className="assign-message assign-message-success mb-3 rounded-[14px] border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] text-slate-800">
            {ok}
          </div>
        )}

        <div className="grid min-w-0 h-auto grid-cols-1 gap-3 xl:h-[calc(100vh-220px)] xl:grid-cols-[360px_minmax(0,1fr)_minmax(0,1fr)]">
          {/* ============== Column 1: Supervisors ============== */}
          <section className="min-w-0 min-h-0 flex flex-col rounded-[18px] border border-slate-200/70 bg-white/75 p-3 shadow-[0_10px_28px_rgba(15,23,42,0.06)] backdrop-blur">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div>
                <div className="text-[16px] font-black text-slate-900">Supervisors</div>
                <div className="mt-1 text-[12px] font-bold text-slate-500">{supervisors.length} total</div>
              </div>
            </div>

            <input
              className="assign-field mb-2 w-full rounded-xl border border-slate-200 bg-white/90 px-3 py-2.5 text-[13px] font-semibold text-slate-900 outline-none focus:border-[#6d5efc]/40 focus:ring-4 focus:ring-[#6d5efc]/10"
              placeholder="Search supervisors by name/email/nickname..."
              value={supQ}
              onChange={(e) => setSupQ(e.target.value)}
            />

            {!selectedSup ? (
              <div className="mb-2 rounded-[14px] border border-[#6d5efc]/20 bg-[#6d5efc]/10 px-3 py-2 text-[13px] font-bold text-slate-700">
                No supervisor selected. Pick one to view assignments.
              </div>
            ) : (
              <div className="mb-2 rounded-[14px] border border-[#6d5efc]/25 bg-[#6d5efc]/10 px-3 py-2 text-[13px] font-extrabold text-slate-700">
                Selected: <b>{selectedSup.full_name}</b>
                {selectedSup.nickname ? (
                  <span className="ml-2 text-[#6d5efc]">{displayNickname(selectedSup.nickname)}</span>
                ) : null}
              </div>
            )}

            <div className="mt-2 flex-1 min-h-0 min-w-0 space-y-2 overflow-y-auto pr-1 [scrollbar-width:thin]">
              {visibleSupervisors.map((s) => {
                const active = selectedSup?.id === s.id;
                const avatarUrl = avatarByLogin[String(s.nickname || s.email.split("@")[0]).toLowerCase()] || "";
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedSup(s)}
                    className={cn(
                      "w-full rounded-2xl border px-3 py-2.5 text-left transition",
                      "flex items-center gap-3 bg-white/80",
                      "hover:border-[#6d5efc]/25 hover:shadow-[0_10px_22px_rgba(109,94,252,0.10)]",
                      active
                        ? "border-[#6d5efc]/40 bg-[#6d5efc]/10 shadow-[0_12px_26px_rgba(109,94,252,0.12)]"
                        : "border-slate-200/70"
                    )}
                  >
                    <UserAvatar src={avatarUrl} alt={s.full_name} fallback={initialsOf(s.full_name)} sizeClass="h-11 w-11" className="bg-slate-50" />

                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] font-black text-slate-900">{s.full_name}</div>

                      {/* ✅ nickname line */}
                      {s.nickname ? (
                        <div className="mt-0.5 truncate text-[12px] font-extrabold text-[#6d5efc]">
                          {displayNickname(s.nickname)}
                        </div>
                      ) : null}

                      <div className="mt-1 flex min-w-0 items-center gap-2">
                        <span className="inline-flex h-7 flex-none items-center gap-2 rounded-full border border-[#6d5efc]/25 bg-[#6d5efc]/10 px-2.5 text-[12px] font-black text-slate-900">
                          <span className="text-slate-900">
                            <RoleIcon role="supervisor" />
                          </span>
                          supervisor
                        </span>
                        <span className="min-w-0 truncate text-[12.5px] font-bold text-slate-500">{adminContact(phoneByLogin, s)}</span>
                      </div>
                    </div>
                  </button>
                );
              })}

              {visibleSupervisors.length === 0 && (
                <div className="rounded-[14px] border border-dashed border-slate-200 bg-white/70 px-3 py-2 text-[13px] font-bold text-slate-500">
                  No supervisors found.
                </div>
              )}
            </div>
          </section>

          {/* ============== Column 2: Available Talents ============== */}
          <section className="min-w-0 min-h-0 flex flex-col rounded-[18px] border border-slate-200/70 bg-white/75 p-3 shadow-[0_10px_28px_rgba(15,23,42,0.06)] backdrop-blur">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[16px] font-black text-slate-900">Available talents</div>
                <div className="mt-1 text-[12px] font-bold text-slate-500">Select talents, then Add Selected.</div>
              </div>

            </div>

            <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_140px]">
              <input
                className={cn(
                  "assign-field w-full rounded-xl border bg-white/90 px-3 py-2.5 text-[13px] font-semibold text-slate-900 outline-none",
                  "focus:border-[#6d5efc]/40 focus:ring-4 focus:ring-[#6d5efc]/10",
                  !selectedSup && "cursor-not-allowed opacity-60"
                )}
                placeholder="Search talents by name/email/nickname..."
                value={stuQ}
                onChange={(e) => setStuQ(e.target.value)}
                disabled={!selectedSup}
              />

              <select
                className={cn(
                  "assign-field w-full rounded-xl border border-slate-200 bg-white/90 px-3 py-2.5 text-[13px] font-semibold text-slate-900 outline-none",
                  "focus:border-[#6d5efc]/40 focus:ring-4 focus:ring-[#6d5efc]/10",
                  !selectedSup && "cursor-not-allowed opacity-60"
                )}
                value={stuCohort}
                onChange={(e) => setStuCohort(e.target.value)}
                disabled={!selectedSup}
              >
                <option value="all">All cohorts</option>
                {availableCohortOptions.map((cohort) => (
                  <option key={cohort} value={cohort}>
                    {cohort}
                  </option>
                ))}
              </select>
            </div>

            {selectedSup ? (
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <button
                  className={cn(
                    "h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700",
                    "hover:border-[#6d5efc]/25 hover:shadow-[0_10px_18px_rgba(15,23,42,0.08)]",
                    "disabled:cursor-not-allowed disabled:opacity-60"
                  )}
                  type="button"
                  onClick={selectAllVisible}
                  disabled={visibleStudents.length === 0}
                >
                  Select all
                </button>
                <button
                  className={cn(
                    "h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700",
                    "hover:border-[#6d5efc]/25 hover:shadow-[0_10px_18px_rgba(15,23,42,0.08)]",
                    "disabled:cursor-not-allowed disabled:opacity-60"
                  )}
                  type="button"
                  onClick={clearSelected}
                  disabled={selectedStuIds.size === 0}
                >
                  Clear
                </button>
                <button
                  type="button"
                  className={cn(
                    "inline-flex h-9 items-center rounded-2xl border border-[#6d5efc]/18 bg-white/90 px-3 text-[12px] font-black text-[#6d5efc]",
                    "shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition hover:border-[#6d5efc]/28 hover:bg-[#f7f5ff]",
                    "disabled:cursor-not-allowed disabled:opacity-70"
                  )}
                  disabled={addDisabled}
                  onClick={addSelected}
                >
                  {saving ? "Adding..." : `Add selected ${selectedStuIds.size}`}
                </button>
              </div>
            ) : null}

            {!selectedSup ? (
              <div className="rounded-[14px] border border-[#6d5efc]/20 bg-[#6d5efc]/10 px-3 py-2 text-[13px] font-bold text-slate-700">
                Select a supervisor first to enable talent selection.
              </div>
            ) : (
              <div className="mt-2 flex-1 min-h-0 min-w-0 space-y-2 overflow-y-auto pr-1 [scrollbar-width:thin]">
                {visibleStudents.map((s) => {
                  const checked = selectedStuIds.has(s.id);
                  const avatarUrl = avatarByLogin[String(s.nickname || s.email.split("@")[0]).toLowerCase()] || "";
                  return (
                    <label
                      key={s.id}
                      className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-2xl border px-3 py-2.5 transition",
                        checked && "assign-selected-add",
                        checked
                          ? "border-emerald-300/60 bg-emerald-50/50 shadow-[0_10px_22px_rgba(16,185,129,0.08)]"
                          : "border-slate-200/70 bg-white/80 hover:border-slate-300/70 hover:shadow-[0_10px_18px_rgba(15,23,42,0.08)]"
                      )}
                    >
                      <input type="checkbox" checked={checked} onChange={() => toggleStudent(s.id)} className="h-4 w-4" />

                      <UserAvatar src={avatarUrl} alt={s.full_name} fallback={initialsOf(s.full_name)} className="bg-slate-50" />

                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[14px] font-black text-slate-900">{s.full_name}</div>

                        {/* ✅ nickname line */}
                        {s.nickname ? (
                          <div className="mt-0.5 truncate text-[12px] font-extrabold text-[#6d5efc]">
                            {displayNickname(s.nickname)}
                          </div>
                        ) : null}

                        <div className="mt-1 flex min-w-0 items-center gap-2">
                          <span className="assign-role-pill inline-flex h-7 flex-none items-center gap-2 rounded-full border border-emerald-300/60 bg-emerald-50 px-2.5 text-[12px] font-black text-slate-900">
                            <span className="text-slate-900">
                              <RoleIcon role="student" />
                            </span>
                            talent
                          </span>
                          {normalizeCohort(s.cohort) ? (
                            <span className="inline-flex h-7 flex-none items-center rounded-full border border-slate-200 bg-white px-2.5 text-[12px] font-black text-slate-700">
                              {normalizeCohort(s.cohort)}
                            </span>
                          ) : null}
                          <span className="min-w-0 truncate text-[12.5px] font-bold text-slate-500">{adminContact(phoneByLogin, s)}</span>
                        </div>
                      </div>
                    </label>
                  );
                })}

                {visibleStudents.length === 0 && (
                  <div className="rounded-[14px] border border-dashed border-slate-200 bg-white/70 px-3 py-2 text-[13px] font-bold text-slate-500">
                    No available talents.
                  </div>
                )}
              </div>
            )}
          </section>

          {/* ============== Column 3: Assigned Talents ============== */}
          <section className="min-w-0 min-h-0 flex flex-col rounded-[18px] border border-slate-200/70 bg-white/75 p-3 shadow-[0_10px_28px_rgba(15,23,42,0.06)] backdrop-blur">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[16px] font-black text-slate-900">Assigned</div>
                <div className="mt-1 truncate text-[12px] font-bold text-slate-500">
                  {selectedSup ? `Assigned to ${selectedSup.full_name}` : "Select supervisor to view assigned"}
                </div>
              </div>

              {selectedSup && (
                <span className="inline-flex h-7 flex-none items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 text-[12px] font-black text-slate-600">
                  {visibleAssigned.length}
                </span>
              )}
            </div>

            {selectedSup ? (
              <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_140px]">
                <input
                  className="assign-field w-full rounded-xl border border-slate-200 bg-white/90 px-3 py-2.5 text-[13px] font-semibold text-slate-900 outline-none focus:border-[#6d5efc]/40 focus:ring-4 focus:ring-[#6d5efc]/10"
                  placeholder="Search assigned by name/email/nickname..."
                  value={assignedQ}
                  onChange={(e) => setAssignedQ(e.target.value)}
                />
                <select
                  className="assign-field w-full rounded-xl border border-slate-200 bg-white/90 px-3 py-2.5 text-[13px] font-semibold text-slate-900 outline-none focus:border-[#6d5efc]/40 focus:ring-4 focus:ring-[#6d5efc]/10"
                  value={assignedCohort}
                  onChange={(e) => setAssignedCohort(e.target.value)}
                >
                  <option value="all">All cohorts</option>
                  {assignedCohortOptions.map((cohort) => (
                    <option key={cohort} value={cohort}>
                      {cohort}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {selectedSup ? (
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className={cn(
                    "h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700",
                    "hover:border-[#6d5efc]/25 hover:shadow-[0_10px_18px_rgba(15,23,42,0.08)]",
                    "disabled:cursor-not-allowed disabled:opacity-60"
                  )}
                  onClick={selectAllAssignedVisible}
                  disabled={visibleAssigned.length === 0}
                >
                  Select all
                </button>
                <button
                  type="button"
                  className={cn(
                    "h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700",
                    "hover:border-[#6d5efc]/25 hover:shadow-[0_10px_18px_rgba(15,23,42,0.08)]",
                    "disabled:cursor-not-allowed disabled:opacity-60"
                  )}
                  onClick={clearAssignedSelection}
                  disabled={selectedAssignedIds.size === 0}
                >
                  Clear
                </button>
                <button
                  type="button"
                  className={cn(
                    "inline-flex h-9 items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-3 text-[12px] font-black text-red-700",
                    "shadow-[0_8px_18px_rgba(239,68,68,0.08)] transition hover:bg-red-100",
                    "disabled:cursor-not-allowed disabled:opacity-60"
                  )}
                  onClick={removeSelectedAssigned}
                  disabled={selectedAssignedIds.size === 0 || saving}
                >
                  <BinIcon size={14} />
                  {saving ? "Removing..." : `${selectedAssignedIds.size}`}
                </button>
              </div>
            ) : null}

            {!selectedSup ? (
              <div className="rounded-[14px] border border-[#6d5efc]/20 bg-[#6d5efc]/10 px-3 py-2 text-[13px] font-bold text-slate-700">
                Pick a supervisor first.
              </div>
            ) : loadingAssigned ? (
              <div className="rounded-[14px] border border-[#6d5efc]/20 bg-[#6d5efc]/10 px-3 py-2 text-[13px] font-bold text-slate-700">
                Loading...
              </div>
            ) : (
              <div className="mt-2 flex-1 min-h-0 min-w-0 space-y-2 overflow-y-auto pr-1 [scrollbar-width:thin]">
                {visibleAssigned.map((s) => {
                  const checked = selectedAssignedIds.has(s.id);
                  const avatarUrl = avatarByLogin[String(s.nickname || s.email.split("@")[0]).toLowerCase()] || "";
                  return (
                  <label
                    key={s.id}
                    className={cn(
                      "flex min-w-0 cursor-pointer items-center justify-between gap-3 rounded-2xl border px-3 py-2.5 transition",
                      checked && "assign-selected-remove",
                      checked
                        ? "border-red-200 bg-red-50/35 shadow-[0_10px_22px_rgba(239,68,68,0.06)]"
                        : "border-slate-200/70 bg-white/80 hover:border-slate-300/70 hover:shadow-[0_10px_18px_rgba(15,23,42,0.08)]"
                    )}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleAssigned(s.id)}
                        className="h-4 w-4 flex-none"
                      />
                      <UserAvatar src={avatarUrl} alt={s.full_name} fallback={initialsOf(s.full_name)} className="bg-slate-50" />

                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[14px] font-black text-slate-900">{s.full_name}</div>

                        {/* ✅ nickname line */}
                        {s.nickname ? (
                          <div className="mt-0.5 truncate text-[12px] font-extrabold text-[#6d5efc]">
                            {displayNickname(s.nickname)}
                          </div>
                        ) : null}

                        <div className="mt-1 flex min-w-0 items-center gap-2">
                          <span className="assign-role-pill inline-flex h-7 flex-none items-center gap-2 rounded-full border border-emerald-300/60 bg-emerald-50 px-2.5 text-[12px] font-black text-slate-900">
                            <span className="text-slate-900">
                              <RoleIcon role="student" />
                            </span>
                            talent
                          </span>
                          {normalizeCohort(s.cohort) ? (
                            <span className="inline-flex h-7 flex-none items-center rounded-full border border-slate-200 bg-white px-2.5 text-[12px] font-black text-slate-700">
                              {normalizeCohort(s.cohort)}
                            </span>
                          ) : null}
                          <span className="min-w-0 truncate text-[12.5px] font-bold text-slate-500">{adminContact(phoneByLogin, s)}</span>
                        </div>
                      </div>
                    </div>

                  </label>
                )})}

                {visibleAssigned.length === 0 && (
                  <div className="rounded-[14px] border border-dashed border-slate-200 bg-white/70 px-3 py-2 text-[13px] font-bold text-slate-500">
                    {assignedQ.trim() ? "No assigned talents match this search." : "No talents assigned yet."}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </AdminLayout>
  );
}
