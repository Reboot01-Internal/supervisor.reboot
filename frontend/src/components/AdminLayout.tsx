import React from "react";
import AdminSidebar from "./AdminSidebar";
import { useAuth } from "../lib/auth";
import { useNavigate } from "react-router-dom";

type Props = {
  active?: "dashboard" | "supervisors" | "boards" | "assign" | "reports" | "profile" | "users" | "meetings" | "notifications";
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  showLogout?: boolean;
};

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export default function AdminLayout({
  active,
  title,
  subtitle,
  right,
  children,
  showLogout = true,
}: Props) {
  const nav = useNavigate();
  const { isAdmin, login, email, logout } = useAuth();
  const baseName = login || email || "User";
  const profileInitials = baseName
    .replace(/^@/, "")
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0]?.toUpperCase() || "")
    .join("") || "U";

  return (
    <div className="min-h-screen bg-[#f4f6fb] text-slate-900">
      <div className={cn("grid min-h-screen", isAdmin ? "grid-cols-[280px_1fr] max-[1050px]:grid-cols-1" : "grid-cols-1")}>
        {isAdmin ? <AdminSidebar active={active} /> : null}

        <main className="p-[22px]">
          <header className="mb-4 flex items-start justify-between gap-3 max-[1050px]:flex-col">
            <div>
              <div className="text-[13px] font-bold text-slate-500">Welcome back</div>

              <div className="mt-1 text-[28px] font-black tracking-[-0.6px]">{title}</div>

              {subtitle ? (
                <div className="mt-1 text-[14px] font-semibold text-slate-500">{subtitle}</div>
              ) : null}
            </div>

            <div className="flex items-center gap-2 max-[1050px]:w-full">
              {!isAdmin && active !== "profile" ? (
                <>
                  <button
                    type="button"
                    onClick={() => nav("/admin/boards")}
                    className="relative grid h-12 w-12 place-items-center rounded-full border border-[#bfd7ff] bg-[#e8f1ff] font-black text-[#334155] transition hover:border-[#93c5fd] hover:bg-[#dbeafe]"
                    title="Boards"
                    aria-label="Open boards"
                  >
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
                      <rect x="4" y="5" width="16" height="14" rx="3" stroke="#2563eb" strokeWidth="2" />
                      <path d="M8 9h8M8 13h8M8 17h5" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => nav("/calendar")}
                    className="relative grid h-12 w-12 place-items-center rounded-full border border-[#d9c8a8] bg-[#fff4de] font-black text-[#334155] transition hover:border-[#d8b56f] hover:bg-[#ffefcf]"
                    title="Meetings calendar"
                    aria-label="Open meetings calendar"
                  >
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
                      <path d="M7 3v3M17 3v3M4 9h16" stroke="#b45309" strokeWidth="2" strokeLinecap="round" />
                      <rect x="4" y="5" width="16" height="15" rx="3" stroke="#b45309" strokeWidth="2" />
                      <path d="M8 13h3v3H8z" fill="#f59e0b" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => nav("/notifications")}
                    className="relative grid h-12 w-12 place-items-center rounded-full border border-[#f2d7ad] bg-[#fff7e8] font-black text-[#334155] transition hover:border-[#f0bf6b] hover:bg-[#fff1d5]"
                    title="Notifications"
                    aria-label="Open notifications"
                  >
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
                      <path d="M15 17H5l1.4-1.4A2 2 0 0 0 7 14.2V10a5 5 0 1 1 10 0v4.2a2 2 0 0 0 .6 1.4L19 17h-4Z" stroke="#d97706" strokeWidth="2" strokeLinejoin="round" />
                      <path d="M10 20a2 2 0 0 0 4 0" stroke="#d97706" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => nav("/profile")}
                    className="relative grid h-12 w-12 place-items-center rounded-full border border-[#cfc4ff] bg-[#e9e2ff] font-black text-[#334155] transition hover:border-[#b8a8ff] hover:bg-[#e3d9ff]"
                    title="Profile"
                    aria-label="Open profile"
                  >
                    <span className="text-[20px] tracking-[-0.02em]">{profileInitials}</span>
                    <span className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full border border-slate-200 bg-white shadow-sm">
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
                        <circle cx="12" cy="8" r="4.5" stroke="#7c3aed" strokeWidth="2" />
                        <path d="M12 12.5V21M8 17h8" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    </span>
                  </button>
                </>
              ) : null}

              {right}

              {showLogout && (
                <button
                  type="button"
                  onClick={logout}
                  className={cn(
                    "h-10 rounded-[14px] border border-slate-200 bg-slate-50 px-3",
                    "font-extrabold text-slate-900 transition",
                    "hover:border-[#6d5efc]/25 hover:bg-[#f2f5ff]"
                  )}
                >
                  Logout
                </button>
              )}
            </div>
          </header>

          {children}
        </main>
      </div>
    </div>
  );
}
