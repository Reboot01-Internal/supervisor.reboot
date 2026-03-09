import React from "react";
import { useNavigate } from "react-router-dom";
import AdminSidebar from "./AdminSidebar";

type Props = {
  active?: "dashboard" | "supervisors" | "boards" | "assign" | "reports" | "profile" | "users";
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
  const role = (localStorage.getItem("role") || "").trim().toLowerCase();
  const isAdmin = role === "admin";
  const login = (localStorage.getItem("login") || "").trim();
  const email = (localStorage.getItem("email") || "").trim();
  const baseName = login || email || "User";
  const profileInitials = baseName
    .replace(/^@/, "")
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0]?.toUpperCase() || "")
    .join("") || "U";

  function logout() {
    // ✅ remove the keys you actually use now
    localStorage.removeItem("jwt");
    localStorage.removeItem("role");

    // (optional) clear old leftovers if they exist
    localStorage.removeItem("token");
    localStorage.removeItem("user");

    // ✅ go to login
    nav("/login", { replace: true });
  }

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
