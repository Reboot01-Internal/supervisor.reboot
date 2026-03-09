import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "../components/AdminLayout";
import { apiFetch } from "../lib/api";

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
  if (role === "supervisor") return "border-[#6d5efc]/25 bg-[#6d5efc]/10 text-slate-900";
  return "border-emerald-300 bg-emerald-50 text-emerald-800";
}

function withAt(n: string) {
  const x = (n || "").trim();
  if (!x) return "-";
  return x.startsWith("@") ? x : `@${x}`;
}

export default function AdminUsersPage() {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [role, setRole] = useState<"all" | "supervisor" | "student">("all");
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

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

  const counters = useMemo(() => {
    const sup = rows.filter((r) => r.role === "supervisor").length;
    const stu = rows.filter((r) => r.role === "student").length;
    return { all: rows.length, sup, stu };
  }, [rows]);

  return (
    <AdminLayout
      active="users"
      title="Users"
      subtitle="Browse supervisors and students with fast search."
    >
      {err ? (
        <div className="mb-3 rounded-[14px] border border-red-200 bg-red-50 px-3 py-2 text-[13px] font-semibold text-red-700">
          {err}
        </div>
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
                onClick={() => nav(`/admin/users/${u.id}/profile`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    nav(`/admin/users/${u.id}/profile`);
                  }
                }}
                className="cursor-pointer rounded-[14px] border border-slate-200 bg-slate-50 px-3 py-2.5 transition hover:border-[#6d5efc]/20 hover:bg-white focus:outline-none focus-visible:ring-4 focus-visible:ring-[#6d5efc]/15"
              >
                <div className="flex items-start gap-3">
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
