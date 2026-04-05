import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "../components/AdminLayout";
import UserAvatar from "../components/UserAvatar";
import { apiFetch } from "../lib/api";
import { fetchRebootAvatars } from "../lib/rebootAvatars";

type AssignedStudent = {
  id: number;
  full_name: string;
  nickname: string;
  email: string;
  boards: { id: number; name: string }[];
};

type ProfileSummary = {
  supervisor?: {
    assigned_students_overall: number;
    assigned_students: AssignedStudent[];
  };
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

function withAt(n: string) {
  const x = (n || "").trim();
  if (!x) return "-";
  return x.startsWith("@") ? x : `@${x}`;
}

export default function SupervisorUsersPage() {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<AssignedStudent[]>([]);
  const [totalAssigned, setTotalAssigned] = useState(0);
  const [avatarByLogin, setAvatarByLogin] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      setErr("");
      try {
        const res: ProfileSummary = await apiFetch("/admin/profile/summary");
        if (!alive) return;
        setRows(res?.supervisor?.assigned_students || []);
        setTotalAssigned(res?.supervisor?.assigned_students_overall || 0);
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message || "Failed to load users");
        setRows([]);
        setTotalAssigned(0);
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;

    async function loadAvatars() {
      const logins = rows.map((row) => row.nickname || row.email.split("@")[0]).filter(Boolean);
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
  }, [rows]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((s) => {
      return (
        (s.full_name || "").toLowerCase().includes(query) ||
        (s.email || "").toLowerCase().includes(query) ||
        (s.nickname || "").toLowerCase().includes(query)
      );
    });
  }, [rows, q]);

  return (
    <AdminLayout active="users" title="Users" subtitle="Browse your assigned talents and open their profiles.">
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
          <div className="rounded-[12px] border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">Assigned</div>
            <div className="mt-1 text-[20px] font-black tracking-[-0.02em] text-slate-900">{loading ? "..." : totalAssigned}</div>
          </div>
        </div>

        {loading ? (
          <div className="rounded-[14px] border border-slate-200 bg-slate-50 px-3 py-3 text-[13px] font-semibold text-slate-600">
            Loading users...
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-[14px] border border-slate-200 bg-slate-50 px-3 py-3 text-[13px] font-semibold text-slate-600">
            No users found.
          </div>
        ) : (
          <div className="grid gap-2 lg:grid-cols-2">
            {filtered.map((u) => {
              const avatarUrl = avatarByLogin[String(u.nickname || u.email.split("@")[0]).toLowerCase()] || "";
              return (
                <article
                  key={u.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => nav(`/profile/${u.id}`, { state: { backTo: "/users" } })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      nav(`/profile/${u.id}`, { state: { backTo: "/users" } });
                    }
                  }}
                  className="cursor-pointer rounded-[14px] border border-slate-200 bg-slate-50 px-3 py-2.5 transition hover:border-[#6d5efc]/20 hover:bg-white focus:outline-none focus-visible:ring-4 focus-visible:ring-[#6d5efc]/15"
                >
                  <div className="flex items-start gap-3">
                    <UserAvatar src={avatarUrl} alt={u.full_name} fallback={initialsOf(u.full_name)} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] font-black text-slate-900">{u.full_name}</div>
                      <div className="truncate text-[12px] font-semibold text-slate-500">{u.email}</div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span className="inline-flex h-7 items-center rounded-full border border-slate-200 bg-white px-2.5 text-[11px] font-extrabold text-[#6d5efc]">
                          {withAt(u.nickname)}
                        </span>
                        <span className="inline-flex h-7 items-center rounded-full border border-emerald-300 bg-emerald-50 px-2.5 text-[11px] font-extrabold text-emerald-800">
                          talent
                        </span>
                        <span className="inline-flex h-7 items-center rounded-full border border-slate-200 bg-white px-2.5 text-[11px] font-extrabold text-slate-700">
                          {u.boards?.length || 0} board{(u.boards?.length || 0) === 1 ? "" : "s"}
                        </span>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </AdminLayout>
  );
}
