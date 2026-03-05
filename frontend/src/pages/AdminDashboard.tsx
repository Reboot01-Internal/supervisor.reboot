import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "../components/AdminLayout";
import { apiFetch } from "../lib/api";

type SupervisorRow = {
  supervisor_user_id: number;
  full_name: string;
  email: string;
  file_id: number;
  created_at: string;
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

const GQL_URL = "https://learn.reboot01.com/api/graphql-engine/v1/graphql";

// ✅ Your cohort mapping (eventId -> Cohort N)
const COHORT_BY_EVENT_ID: Record<number, string> = {
  20: "Cohort 1",
  72: "Cohort 2",
  250: "Cohort 3",
  763: "Cohort 4",
  1195: "Cohort 5",
  1829: "Cohort 6",
};

type RebootFetchedUser = {
  nickname: string;
  email: string;
  full_name: string;
  cohort: string;
};

async function fetchRebootUserByLogin(login: string): Promise<RebootFetchedUser | null> {
  const jwt = (localStorage.getItem("jwt") || "").trim();
  if (!jwt) throw new Error("Missing Reboot JWT in localStorage (jwt).");

  // ✅ event_user is the source of cohort (eventId mapping)
  const query = `
    query GetUserForTaskflow($login: String!) {
      user(where: { login: { _eq: $login } }, limit: 1) {
        email
        firstName
        lastName
        login
      }

      event_user(
        where: {
          userLogin: { _eq: $login }
          eventId: { _in: [20, 72, 250, 763, 1195, 1829] }
        }
        limit: 1
      ) {
        eventId
        userLogin
        level
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

  // GraphQL errors handling
  if (json?.errors?.length) {
    const msg = json.errors?.[0]?.message || "GraphQL error";
    throw new Error(msg);
  }

  const u = json?.data?.user?.[0];
  if (!u?.email) return null;

  const fullName = `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.login || login;

  const ev = json?.data?.event_user?.[0];
  const cohort =
    (ev?.eventId && COHORT_BY_EVENT_ID[Number(ev.eventId)]) ||
    "Unknown cohort";

  return {
    nickname: u.login || login,
    email: u.email,
    full_name: fullName,
    cohort,
  };
}

export default function AdminDashboard() {
  const nav = useNavigate();

  // ✅ Only field admin types
  const [nickname, setNickname] = useState("");

  // auto-filled from Reboot
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [cohort, setCohort] = useState("");

  const [role, setRole] = useState<Role>("supervisor");

  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const [checking, setChecking] = useState(false);
  const [exists, setExists] = useState(false);

  const [loading, setLoading] = useState(false);

  const [supervisors, setSupervisors] = useState<SupervisorRow[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);
  const [studentCount, setStudentCount] = useState<number>(0);

  async function loadDashboardStats() {
    setStatsLoading(true);
    try {
      const [sups, students] = await Promise.all([
        apiFetch("/admin/supervisors"),
        apiFetch("/admin/assign/students"),
      ]);

      setSupervisors(sups || []);
      setStudentCount((students || []).length);
    } catch (e: any) {
      console.error(e);
    } finally {
      setStatsLoading(false);
    }
  }

  useEffect(() => {
    loadDashboardStats();
  }, []);

  // ✅ When nickname changes -> fetch from Reboot -> check exists in DB
  useEffect(() => {
    const login = nickname.trim();
    if (!login) {
      setFullName("");
      setEmail("");
      setCohort("");
      setExists(false);
      setErr("");
      setMsg("");
      return;
    }

    let alive = true;

    async function run() {
      setChecking(true);
      setErr("");
      setMsg("");
      setExists(false);

      try {
        const u = await fetchRebootUserByLogin(login);
        if (!alive) return;

        if (!u) {
          setErr("User not found in Reboot API.");
          setFullName("");
          setEmail("");
          setCohort("");
          return;
        }

        setFullName(u.full_name);
        setEmail(u.email);
        setCohort(u.cohort);

        const res = await apiFetch(`/admin/users/exists?email=${encodeURIComponent(u.email)}`);
        if (!alive) return;

        if (res?.exists) {
          setExists(true);
          setMsg("User already added.");
        } else {
          setExists(false);
        }
      } catch (e: any) {
        setErr(e?.message || "Failed to fetch user.");
        setFullName("");
        setEmail("");
        setCohort("");
      } finally {
        setChecking(false);
      }
    }

    run();
    return () => {
      alive = false;
    };
  }, [nickname]);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    setErr("");
    setLoading(true);

    try {
      if (!nickname.trim()) throw new Error("Enter nickname/login first.");
      if (!email) throw new Error("User not found in Reboot API.");
      if (exists) throw new Error("User already added.");

      const res = await apiFetch("/admin/users", {
        method: "POST",
        body: JSON.stringify({
          nickname: nickname.trim(),
          cohort: cohort || "Unknown cohort",
          full_name: fullName,
          email,
          password: "", // backend generates
          role,
        }),
      });

      const temp = res?.temp_password ? ` Temp password: ${res.temp_password}` : "";
      setMsg(`${role === "supervisor" ? "Supervisor" : "Student"} created successfully.${temp}`);

      setNickname("");
      setFullName("");
      setEmail("");
      setCohort("");
      setExists(false);

      await loadDashboardStats();
    } catch (e: any) {
      setErr(e.message || "Failed");
    } finally {
      setLoading(false);
    }
  }

  const totalSupervisors = supervisors.length;

  const canSubmit =
    nickname.trim().length >= 2 &&
    email.trim().includes("@") &&
    !exists &&
    !checking &&
    !loading;

  const initials = useMemo(() => {
    const n = (fullName || nickname).trim();
    if (!n) return role === "supervisor" ? "SU" : "ST";
    return n
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("");
  }, [fullName, nickname, role]);

  return (
    <AdminLayout active="dashboard" title="Admin Dashboard" subtitle="Manage users and supervise the system.">
      {/* KPI row */}
      <section className="grid grid-cols-1 gap-3.5 lg:grid-cols-3">
        {/* Supervisors */}
        <div className="rounded-[18px] border border-slate-200 bg-white p-4 shadow-[0_10px_25px_rgba(15,23,42,0.06)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-extrabold text-slate-500">Supervisors</div>
              <div className="mt-1.5 text-2xl font-black text-slate-900">
                {statsLoading ? "…" : totalSupervisors}
              </div>
            </div>
            <div className="grid h-11 w-11 place-items-center rounded-[14px] border border-slate-200 bg-slate-50">
              <span className="h-2.5 w-2.5 rounded-full bg-blue-600 shadow-[0_0_0_0_rgba(37,99,235,0.25)] animate-[admPulse_1.5s_ease-in-out_infinite]" />
            </div>
          </div>
          <div className="mt-2 text-[13px] text-slate-500">Each supervisor has a workspace</div>
        </div>

        {/* Students */}
        <div className="rounded-[18px] border border-slate-200 bg-white p-4 shadow-[0_10px_25px_rgba(15,23,42,0.06)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-extrabold text-slate-500">Students</div>
              <div className="mt-1.5 text-2xl font-black text-slate-900">
                {statsLoading ? "…" : studentCount}
              </div>
            </div>
            <div className="flex h-11 w-11 items-end justify-center gap-1 rounded-[14px] border border-slate-200 bg-slate-50 px-2">
              <span className="h-2.5 w-1.5 rounded bg-emerald-500 animate-bounce [animation-duration:1.1s]" />
              <span className="h-4 w-1.5 rounded bg-emerald-500 animate-bounce [animation-duration:1.1s] [animation-delay:.12s]" />
              <span className="h-3 w-1.5 rounded bg-emerald-500 animate-bounce [animation-duration:1.1s] [animation-delay:.24s]" />
            </div>
          </div>
          <div className="mt-2 text-[13px] text-slate-500">Connect to stats endpoint later</div>
        </div>

        {/* Admin */}
        <div className="rounded-[18px] border border-slate-200 bg-white p-4 shadow-[0_10px_25px_rgba(15,23,42,0.06)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-extrabold text-slate-500">Admin</div>
              <div className="mt-1.5 text-2xl font-black text-slate-900">System</div>
            </div>
            <div className="grid h-11 w-11 place-items-center rounded-[14px] border border-slate-200 bg-slate-50">
              <span className="h-[18px] w-[18px] rounded-full border-2 border-slate-300 border-t-violet-500 animate-spin" />
            </div>
          </div>
          <div className="mt-2 text-[13px] text-slate-500">You’re managing the platform</div>
        </div>
      </section>

      {/* Create user */}
      <section className="mt-3.5">
        <div className="rounded-[18px] border border-slate-200 bg-white p-4 shadow-[0_10px_25px_rgba(15,23,42,0.06)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-base font-black text-slate-900">Create user</div>
              <div className="mt-1 text-[13px] text-slate-500">
                Type nickname/login, we’ll auto-fill from Reboot.
              </div>
            </div>

            <button
              className="h-10 rounded-[14px] border border-slate-200 bg-slate-50 px-3 text-sm font-extrabold text-slate-800 hover:border-violet-200 hover:bg-violet-50"
              type="button"
              onClick={() => {
                setNickname("");
                setFullName("");
                setEmail("");
                setCohort("");
                setErr("");
                setMsg("");
                setExists(false);
              }}
            >
              Reset
            </button>
          </div>

          {/* role selector */}
          <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
            <button
              type="button"
              onClick={() => setRole("supervisor")}
              className={[
                "flex w-full gap-3 rounded-[16px] border bg-white p-3 text-left shadow-[0_10px_26px_rgba(15,23,42,0.06)] transition",
                "hover:-translate-y-[1px] hover:shadow-[0_14px_30px_rgba(15,23,42,0.08)]",
                role === "supervisor"
                  ? "border-blue-200 shadow-[0_18px_38px_rgba(37,99,235,0.12)]"
                  : "border-slate-200",
              ].join(" ")}
            >
              <span className="grid h-[42px] w-[42px] place-items-center rounded-[14px] border border-slate-200 bg-slate-50 text-slate-800">
                <RoleIcon role="supervisor" />
              </span>
              <span className="grid">
                <span className="leading-tight font-black text-slate-900">Supervisor</span>
                <span className="mt-0.5 text-xs font-bold text-slate-500">
                  Creates a new workspace file
                </span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => setRole("student")}
              className={[
                "flex w-full gap-3 rounded-[16px] border bg-white p-3 text-left shadow-[0_10px_26px_rgba(15,23,42,0.06)] transition",
                "hover:-translate-y-[1px] hover:shadow-[0_14px_30px_rgba(15,23,42,0.08)]",
                role === "student"
                  ? "border-emerald-200 shadow-[0_18px_38px_rgba(16,185,129,0.12)]"
                  : "border-slate-200",
              ].join(" ")}
            >
              <span className="grid h-[42px] w-[42px] place-items-center rounded-[14px] border border-slate-200 bg-slate-50 text-slate-800">
                <RoleIcon role="student" />
              </span>
              <span className="grid">
                <span className="leading-tight font-black text-slate-900">Student</span>
                <span className="mt-0.5 text-xs font-bold text-slate-500">
                  Can be added to boards & tasks
                </span>
              </span>
            </button>
          </div>

          <form onSubmit={createUser} className="mt-3.5 grid gap-3">
            {/* Only nickname input */}
            <label className="grid gap-1.5">
              <span className="text-xs font-extrabold text-slate-500">Nickname / Login</span>
              <input
                className="h-11 rounded-[14px] border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-100"
                placeholder="e.g. ralhlawa"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                autoComplete="off"
              />
              {checking ? (
                <span className="text-xs font-bold text-slate-500">Checking Reboot API…</span>
              ) : (
                <span className="text-xs font-bold text-slate-500">We’ll auto-fill name + email + cohort.</span>
              )}
            </label>

            {/* Preview */}
            <div className="grid gap-1.5">
              <span className="text-xs font-extrabold text-slate-500">Preview</span>

              <div className="flex items-center gap-3 rounded-[16px] border border-slate-200 bg-slate-50 p-3">
                <div className="grid h-11 w-11 place-items-center rounded-full border border-slate-200 bg-white font-black text-slate-800">
                  {initials}
                </div>

                <div className="min-w-0">
                  <div className="truncate font-black text-slate-900">
                    {fullName ||
                      (nickname.trim()
                        ? nickname.trim()
                        : role === "supervisor"
                        ? "New Supervisor"
                        : "New Student")}
                  </div>
{nickname.trim() && (
  <div className="mt-1 text-xs font-extrabold text-slate-500">
    Nickname: <span className="text-slate-700">{nickname.trim()}</span>
  </div>
)}
                  <div className="mt-1.5 flex min-w-0 items-center gap-2">
                    <span
                      className={[
                        "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-black",
                        role === "supervisor"
                          ? "border-blue-200 bg-blue-50 text-blue-700"
                          : "border-emerald-200 bg-emerald-50 text-emerald-700",
                      ].join(" ")}
                    >
                      <RoleIcon role={role} /> {role}
                    </span>

                    <span className="min-w-0 truncate text-xs font-bold text-slate-500">
                      {email || "email@example.com"}
                    </span>
                  </div>

                  {cohort && (
                    <div className="mt-2 text-xs font-bold text-slate-600">
                      Cohort: <span className="font-extrabold">{cohort}</span>
                    </div>
                  )}

                  {exists && (
                    <div className="mt-2 text-xs font-extrabold text-amber-700">
                      Already added in TaskFlow.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {err && (
              <div className="rounded-[14px] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {err}
              </div>
            )}
            {msg && (
              <div className="rounded-[14px] border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                {msg}
              </div>
            )}

            <div className="mt-1 flex flex-wrap items-center gap-2">
              <button
                className="h-11 rounded-[14px] px-4 font-black text-white shadow-[0_18px_45px_rgba(15,23,42,0.08)] disabled:opacity-70 disabled:cursor-not-allowed"
                style={{ background: "linear-gradient(135deg, #6d5efc, #9a8cff)" }}
                disabled={!canSubmit}
              >
                {loading ? "Creating..." : `Create ${role}`}
              </button>

              <button
                type="button"
                className="h-11 rounded-[14px] border border-slate-200 bg-white px-4 font-black text-slate-900 hover:bg-slate-50"
                onClick={() => nav("/admin/supervisors")}
              >
                Open Supervisors
              </button>
            </div>
          </form>
        </div>
      </section>
    </AdminLayout>
  );
}