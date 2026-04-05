import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";
import AdminLayout from "../components/AdminLayout";
import UserAvatar from "../components/UserAvatar";
import { fetchRebootAvatars } from "../lib/rebootAvatars";

type SupervisorRow = {
  supervisor_user_id: number;
  full_name: string;
  email: string;
  nickname?: string;
  file_id: number;
  created_at: string;
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("");
}

function SearchIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16Z" stroke="currentColor" strokeWidth="2" />
      <path
        d="M21 21l-4.3-4.3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function FolderIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 6a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v9a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M3 10h18" stroke="currentColor" strokeWidth="2" opacity="0.6" />
    </svg>
  );
}

function MailIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 6h16v12H4V6Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="m4 7 8 6 8-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ShieldCheckIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
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

function UserPlusIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M5 20a7 7 0 0 1 14 0"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M19 8h4M21 6v4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ViewGridIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="4" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="2" />
      <rect x="13" y="4" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="2" />
      <rect x="4" y="13" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="2" />
      <rect x="13" y="13" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export default function SupervisorsPage() {
  const nav = useNavigate();

  const [data, setData] = useState<SupervisorRow[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [viewMode, setViewMode] = useState<"cards" | "workspaces">("cards");
  const [avatarByLogin, setAvatarByLogin] = useState<Record<string, string>>({});

  async function load() {
    setErr("");
    setLoading(true);
    try {
      const res = await apiFetch("/admin/supervisors");
      setData(res);
    } catch (e: any) {
      setErr(e.message || "Failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    let alive = true;

    async function loadAvatars() {
      const logins = data.map((row) => row.nickname || row.email.split("@")[0]).filter(Boolean);
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
  }, [data]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return data;
    return data.filter(
      (s) =>
        s.full_name.toLowerCase().includes(query) ||
        s.email.toLowerCase().includes(query) ||
        (s.nickname || "").toLowerCase().includes(query)
    );
  }, [data, q]);

  const subtitle = useMemo(() => {
    if (loading) return "Loading…";
    if (q.trim()) return `${filtered.length} result(s)`;
    return `${data.length} supervisor(s)`;
  }, [loading, filtered.length, data.length, q]);

  return (
    <AdminLayout
      active="supervisors"
      title="Supervisors"
      subtitle={subtitle}
      right={
        <div className="flex items-center gap-2">
          <button
            className="inline-flex h-10 items-center gap-2 rounded-2xl border border-[#6d5efc]/18 bg-white/90 px-3.5 text-[13px] font-black text-[#6d5efc] shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition hover:-translate-y-[1px] hover:border-[#6d5efc]/28 hover:bg-[#f7f5ff]"
            onClick={() => nav("/admin/assign")}
          >
            <UserPlusIcon size={15} />
            Assign Talents
          </button>
          {/* <BackButton onClick={() => nav("/admin")} /> */}
        </div>
      }
    >
      <div className="mb-5 flex items-center justify-between gap-3 max-[1180px]:flex-col max-[1180px]:items-stretch">
        <div className="flex min-w-0 flex-[1.2] items-center gap-3 max-[1180px]:flex-col max-[1180px]:items-stretch">
          <div className="flex h-12 min-w-[420px] flex-1 items-center gap-3 rounded-2xl border border-slate-200/90 bg-white/90 px-4 shadow-[0_10px_24px_rgba(15,23,42,0.05)] backdrop-blur max-[1180px]:min-w-0">
            <span className="text-slate-400" aria-hidden="true">
              <SearchIcon size={18} />
            </span>
            <input
              className="w-full bg-transparent text-[14px] font-bold text-slate-900 outline-none placeholder:font-semibold placeholder:text-slate-400"
              placeholder="Search by name, email, or username..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            {q.trim() ? (
              <button
                type="button"
                onClick={() => setQ("")}
                className="inline-flex h-8 items-center rounded-full border border-slate-200 bg-slate-50 px-3 text-[11px] font-black text-slate-500 transition hover:border-slate-300 hover:bg-white hover:text-slate-700"
              >
                Clear
              </button>
            ) : null}
          </div>

          <div className="inline-flex items-center gap-1 rounded-2xl border border-slate-200 bg-white/90 p-1 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
            <button
              type="button"
              onClick={() => setViewMode("cards")}
              className={[
                "inline-flex h-10 items-center gap-2 rounded-[14px] px-3.5 text-[13px] font-black transition",
                viewMode === "cards"
                  ? "border border-[#6d5efc]/18 bg-white text-[#6d5efc] shadow-[0_8px_18px_rgba(15,23,42,0.05)]"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
              ].join(" ")}
            >
              <ViewGridIcon />
              Cards
            </button>
            <button
              type="button"
              onClick={() => setViewMode("workspaces")}
              className={[
                "inline-flex h-10 items-center gap-2 rounded-[14px] px-3.5 text-[13px] font-black transition",
                viewMode === "workspaces"
                  ? "border border-[#6d5efc]/18 bg-white text-[#6d5efc] shadow-[0_8px_18px_rgba(15,23,42,0.05)]"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
              ].join(" ")}
            >
              <FolderIcon size={15} />
              Workspaces
            </button>
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2.5 max-[1180px]:justify-start">
          <div className="inline-flex items-center gap-3 rounded-2xl border border-[#6d5efc]/18 bg-white/90 px-4 py-2 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
            <span className="grid h-11 w-11 place-items-center rounded-full border border-[#6d5efc]/20 bg-[#f7f5ff] text-[#6d5efc]">
              <FolderIcon size={18} />
            </span>
            <div className="leading-none">
              <div className="text-[24px] font-black tracking-[-0.03em] text-slate-900">
                {loading ? "..." : filtered.length}
              </div>
              <div className="mt-1 text-[12px] font-black text-slate-500">Supervisors</div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_10px_25px_rgba(15,23,42,0.06)]">
        {err && (
          <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
            {err}
          </div>
        )}

        {loading ? (
          <div className="text-sm font-semibold text-slate-500">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="text-sm font-semibold text-slate-500">No supervisors found.</div>
        ) : viewMode === "workspaces" ? (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((s) => {
              const workspaceName = (s.nickname || "").trim() || s.full_name.split(/\s+/)[0] || "workspace";
              const avatarUrl =
                avatarByLogin[String((s.nickname || "").trim() || s.email.split("@")[0]).toLowerCase()] || "";
              return (
                <button
                  key={s.supervisor_user_id}
                  type="button"
                  onClick={() => nav(`/admin/files/${s.file_id}`)}
                  title="Open workspace"
                  className="group relative flex flex-col items-center rounded-[22px] p-2.5 text-center transition duration-200 hover:-translate-y-[2px]"
                >
                  <div className="relative h-[88px] w-[128px] cursor-pointer origin-bottom [perspective:1500px] sm:h-[96px] sm:w-[144px]">
                    <div className="absolute inset-0">
                      <div className="absolute inset-x-0 bottom-0 h-full origin-top rounded-[16px] rounded-tl-none bg-[#c7bfff] transition-all duration-300 ease-out after:absolute after:bottom-[99%] after:left-0 after:h-2.5 after:w-12 after:rounded-t-[12px] after:bg-[#c7bfff] after:content-[''] before:absolute before:-top-[9px] before:left-[44px] before:h-2.5 before:w-2.5 before:bg-[#c7bfff] before:[clip-path:polygon(0_35%,0%_100%,50%_100%)] before:content-[''] group-hover:shadow-[0_16px_28px_rgba(109,94,252,0.10)]" />
                      <div className="absolute inset-1 origin-bottom rounded-[16px] bg-[#ece8ff] transition-all duration-300 ease-out select-none group-hover:[transform:rotateX(-18deg)]" />
                      <div className="absolute inset-1 origin-bottom rounded-[16px] bg-[#f5f3ff] transition-all duration-300 ease-out group-hover:[transform:rotateX(-28deg)]" />
                      <div className="absolute inset-1 origin-bottom rounded-[16px] bg-[#fbfaff] transition-all duration-300 ease-out group-hover:[transform:rotateX(-36deg)]" />
                      <div className="absolute bottom-0 flex h-[84px] w-full origin-bottom items-end rounded-[16px] rounded-tr-none bg-gradient-to-t from-[#a79dff] to-[#d8d2ff] transition-all duration-300 ease-out after:absolute after:bottom-[99%] after:right-0 after:h-2.5 after:w-[82px] after:rounded-t-[12px] after:bg-[#d8d2ff] after:content-[''] before:absolute before:-top-[7px] before:right-[79px] before:size-2 before:bg-[#d8d2ff] before:[clip-path:polygon(100%_14%,50%_100%,100%_100%)] before:content-[''] group-hover:shadow-[inset_0_16px_28px_rgba(255,255,255,0.38),_inset_0_-16px_28px_rgba(109,94,252,0.08)] group-hover:[transform:rotateX(-46deg)_translateY(1px)]">
                        <div className="flex w-full items-end px-3 pb-3">
                          <div className="min-w-0">
                            <div className="text-[8px] font-black uppercase tracking-[0.16em] text-white/80">
                              Workspace
                            </div>
                            <div className="mt-1 max-w-[72px] truncate text-[11px] font-black text-white">
                              {workspaceName}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-2.5">
                    <div className="mb-2 flex justify-center">
                      <UserAvatar
                        src={avatarUrl}
                        alt={s.full_name}
                        fallback={initials(s.full_name)}
                        sizeClass="h-11 w-11"
                        className="bg-slate-100"
                        previewable
                      />
                    </div>
                    <div className="text-[14px] font-black text-slate-900">{s.full_name}</div>
                    <div className="mt-0.5 text-[11px] font-bold text-[#8d82ff]">
                      @{(s.nickname || "").trim() || s.email.split("@")[0]}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="grid gap-2.5">
            {filtered.map((s) => {
              const avatarUrl =
                avatarByLogin[String((s.nickname || "").trim() || s.email.split("@")[0]).toLowerCase()] || "";
              return (
                <button
                  key={s.supervisor_user_id}
                  onClick={() => nav(`/admin/files/${s.file_id}`)}
                  title="Open workspace"
                  className="group flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-[0_10px_26px_rgba(15,23,42,0.06)] transition hover:-translate-y-[1px] hover:border-violet-200 hover:bg-violet-50/30 hover:shadow-[0_16px_32px_rgba(109,94,252,0.12)] active:translate-y-0 active:shadow-[0_10px_24px_rgba(15,23,42,0.06)]"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <UserAvatar
                      src={avatarUrl}
                      alt={s.full_name}
                      fallback={initials(s.full_name)}
                      sizeClass="h-11 w-11"
                      className="bg-slate-100"
                      previewable
                    />

                    <div className="min-w-0">
                      <div className="truncate text-sm font-black text-slate-900">
                        {s.full_name}
                      </div>

                      <div className="mt-0.5 truncate text-xs font-extrabold text-[#6d5efc]">
                        @{(s.nickname || "").trim() || s.email.split("@")[0]}
                      </div>

                      <div className="mt-1.5 flex min-w-0 flex-wrap gap-2">
                        <span className="inline-flex max-w-full items-center gap-2 truncate rounded-full border border-[#6d5efc]/20 bg-[#6d5efc]/10 px-2.5 py-1 text-xs font-black text-slate-900">
                          <ShieldCheckIcon /> supervisor
                        </span>

                        <span className="inline-flex max-w-full items-center gap-2 truncate rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-extrabold text-slate-600">
                          <MailIcon /> <span className="truncate">{s.email}</span>
                        </span>

                        <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-extrabold text-slate-600">
                          <FolderIcon /> Workspace
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-none items-center gap-2">
                    <span className="inline-flex items-center justify-center rounded-full border border-violet-200 bg-violet-100/60 px-3 py-1 text-xs font-black text-violet-700">
                      Open
                    </span>
                    <span className="text-2xl font-semibold text-slate-300 transition group-hover:translate-x-[2px] group-hover:text-violet-400">
                      ›
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
