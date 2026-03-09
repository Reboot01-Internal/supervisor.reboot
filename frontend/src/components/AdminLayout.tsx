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
      <div className="grid min-h-screen grid-cols-[280px_1fr] max-[1050px]:grid-cols-1">
        <AdminSidebar active={active} />

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
