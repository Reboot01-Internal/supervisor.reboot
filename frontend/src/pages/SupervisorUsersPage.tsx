import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "../components/AdminLayout";
import { DirectoryCard, DirectoryCounter, DirectorySearch } from "../components/UserDirectory";
import { apiFetch } from "../lib/api";
import { fetchRebootAvatars } from "../lib/rebootAvatars";

type AssignedStudent = {
 is_active: boolean;
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

export default function SupervisorUsersPage() {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
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

    return rows.filter((s) => {
      return (statusFilter === "all" || (statusFilter === "active" ? s.is_active : !s.is_active)) && (
        (s.full_name || "").toLowerCase().includes(query) ||
        (s.email || "").toLowerCase().includes(query) ||
        (s.nickname || "").toLowerCase().includes(query)
      );
    });
  }, [rows, q, statusFilter]);

  return (
    <AdminLayout active="users" title="Users" subtitle="Browse your assigned talents and open their profiles.">
      {err ? (
        <div className="mb-3 rounded-[14px] border border-red-200 bg-red-50 px-3 py-2 text-[13px] font-semibold text-red-700">
          {err}
        </div>
      ) : null}

      <section className="user-directory">
        <div className="directory-overview-row directory-supervisor-overview">
          <div className="directory-toolbar"><DirectorySearch value={q} onChange={setQ}/><label className="directory-filter"><span>Account status</span><select aria-label="Filter by account status" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label></div>
          <div className="directory-counters"><DirectoryCounter label="Assigned talents" value={loading?"…":totalAssigned}/><DirectoryCounter label="Matching users" value={loading?"…":filtered.length}/></div>
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
          <div className="directory-grid">
            {filtered.map((u) => {
              const avatarUrl = avatarByLogin[String(u.nickname || u.email.split("@")[0]).toLowerCase()] || "";
              return (
                <DirectoryCard key={u.id} name={u.full_name} username={u.nickname} avatar={avatarUrl} contact={u.email}
                  onOpen={()=>nav(`/profile/${u.id}`,{state:{backTo:"/users"}})}
                  badges={<><span className="inline-flex h-7 items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 text-[11px] font-extrabold text-emerald-700">Talent</span><span className="inline-flex h-7 items-center rounded-full border border-slate-200 bg-white px-2.5 text-[11px] font-extrabold text-slate-700">{u.boards?.length||0} boards</span></>}
                />
              );
            })}
          </div>
        )}
      </section>
    </AdminLayout>
  );
}
