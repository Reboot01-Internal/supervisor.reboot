import SidebarAccount from "./SidebarAccount";
import WorkspaceNavIcon from "./WorkspaceNavIcon";
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminSidebar from "./AdminSidebar";
import WorkspaceBackground from "./WorkspaceBackground";
import { useAuth } from "../lib/auth";
import { useNotifications } from "../lib/notifications";
import faviconIcon from "/favicon-icon.png";
import { fetchRebootAvatar, getCachedRebootAvatar } from "../lib/rebootAvatars";



type Props = {
  active?: "dashboard" | "supervisors" | "boards" | "reports" | "profile" | "users" | "meetings" | "notifications";
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  hideHeader?: boolean;
  right?: React.ReactNode;
  children: React.ReactNode;
};

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}


function NavItem({
  label,
  icon,
  onClick,
  activeItem = false,
  tone = "slate",
  ariaLabel,
  title,
  showNotificationDot = false,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  activeItem?: boolean;
  tone?: "slate" | "amber";
  ariaLabel?: string;
  title?: string;
  showNotificationDot?: boolean;
}) {
  const toneClass =
    tone === "amber"
      ? activeItem
        ? "border-[#ead8b3] bg-[#fff8ea] text-[#b45309]"
        : "border-transparent text-slate-700 hover:border-[#ead8b3] hover:bg-[#fff8ea] hover:text-[#b45309]"
      : activeItem
      ? "border-[#6d5efc]/22 bg-[#f3f1ff] text-slate-900"
      : "border-transparent text-slate-700 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-900";

  return (
    <button
      type="button"
      onClick={onClick}
      title={title || label}
      aria-label={ariaLabel || label}
      aria-current={activeItem ? "page" : undefined}
      className={cn("workspace-nav-item flex items-center gap-3 rounded-[14px] border px-3 py-2 text-left font-extrabold transition", toneClass)}
    >
      <span className="relative grid h-8 w-8 place-items-center rounded-full border border-current/15 bg-white/70">
        <WorkspaceNavIcon label={label} fallback={icon}/>
        {showNotificationDot ? (
          <span className="absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full border border-white bg-red-500" />
        ) : null}
      </span>
      <span className="text-[14px] leading-none">{label}</span>
    </button>
  );
}

export default function AdminLayout({
  active,
  title,
  subtitle,
  hideHeader = false,
  right,
  children,
}: Props) {
  const nav = useNavigate();
  const { isAdmin, isSupervisor, login, email, logout } = useAuth();
  const { hasUnread } = useNotifications();
  const [adminSidebarOpen, setAdminSidebarOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window === "undefined") return false;
    const savedTheme = window.localStorage.getItem("taskflow-theme");
    return savedTheme ? savedTheme === "dark" : false;
  });
  const baseName = login || email || "User";
  const avatarLogin = String(login || String(email || "").split("@")[0] || "").trim();
  const [avatarUrl, setAvatarUrl] = useState(() => getCachedRebootAvatar(avatarLogin));

  useEffect(() => {
    let cancelled = false;

    async function loadAvatar() {
      const nextLogin = avatarLogin;
      if (!nextLogin) {
        setAvatarUrl("");
        return;
      }
      try {
        const next = await fetchRebootAvatar(nextLogin);
        if (!cancelled && next !== avatarUrl) setAvatarUrl(next);
      } catch {
        if (!cancelled) setAvatarUrl("");
      }
    }

    void loadAvatar();
    return () => {
      cancelled = true;
    };
  }, [avatarLogin, avatarUrl]);

  useEffect(() => {
    if (!adminSidebarOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setAdminSidebarOpen(false);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [adminSidebarOpen]);

  useEffect(() => {
    window.localStorage.setItem("taskflow-theme", darkMode ? "dark" : "light");
    document.body.classList.toggle("admin-dark-theme", darkMode);
  }, [darkMode]);

  const nonAdminNav = !isAdmin ? (
  <aside className="sticky top-[22px] self-start max-[1050px]:hidden">
    <div className="workspace-sidebar flex min-h-[calc(100vh-44px)] w-[220px] max-w-full flex-col rounded-[22px] border border-slate-200 bg-white px-3 py-3 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={() => nav("/dashboard")}
          className="workspace-brand flex items-center gap-3 rounded-[16px] px-1 py-1 text-left transition hover:bg-slate-50"
        >
          <img
            src={faviconIcon}
            alt="TaskFlow"
            className="h-12 w-12 rounded-[18px] object-cover shadow-[0_10px_25px_rgba(15,23,42,0.08)]"
          />
          <div className="min-w-0">
            <div className="truncate text-[17px] font-black tracking-[-0.3px] text-slate-900">
              TaskFlow
            </div>
          </div>
        </button>

        <div className="workspace-section-label"><span>YOUR WORKSPACE</span><span aria-hidden="true">{ "</>" }</span></div>
        <div className="flex flex-col gap-2">
          <NavItem
            activeItem={active === "dashboard"}
            label="Dashboard"
            onClick={() => nav("/dashboard")}
            icon={
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
                <path d="M4 12c0-4.42 3.58-8 8-8h8v8c0 4.42-3.58 8-8 8H4v-8Z" stroke="#6d5efc" strokeWidth="2" strokeLinejoin="round" />
                <path d="M12 4v8h8" stroke="#6d5efc" strokeWidth="2" strokeLinejoin="round" />
              </svg>
            }
          />

          <NavItem
            activeItem={active === "boards"}
            label="Boards"
            onClick={() => nav("/admin/boards")}
            icon={
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
                <path
                  d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v13A2.5 2.5 0 0 1 17.5 21h-11A2.5 2.5 0 0 1 4 18.5v-13Z"
                  stroke="#6d5efc"
                  strokeWidth="2"
                  opacity="0.9"
                />
                <path
                  d="M8 8h8M8 12h8M8 16h5"
                  stroke="#6d5efc"
                  strokeWidth="2"
                  strokeLinecap="round"
                  opacity="0.8"
                />
              </svg>
            }
          />

          {isSupervisor ? (
            <NavItem
              activeItem={active === "users"}
              label="Users"
              onClick={() => nav("/users")}
              icon={
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
                  <path d="M16 20v-1.5A3.5 3.5 0 0 0 12.5 15h-5A3.5 3.5 0 0 0 4 18.5V20" stroke="#6d5efc" strokeWidth="2" strokeLinecap="round" />
                  <circle cx="10" cy="8" r="3.5" stroke="#6d5efc" strokeWidth="2" />
                  <path d="M20 20v-1.5A3.5 3.5 0 0 0 17 15.1" stroke="#6d5efc" strokeWidth="2" strokeLinecap="round" />
                  <path d="M15.5 4.7a3.5 3.5 0 0 1 0 6.6" stroke="#6d5efc" strokeWidth="2" strokeLinecap="round" />
                </svg>
              }
            />
          ) : null}

          <NavItem
            activeItem={active === "meetings"}
            label="Meetings"
            onClick={() => nav("/calendar")}
            ariaLabel="Open meetings calendar"
            icon={
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
                <path d="M7 3v3M17 3v3M4 9h16" stroke="#6d5efc" strokeWidth="2" strokeLinecap="round" />
                <rect x="4" y="5" width="16" height="15" rx="3" stroke="#6d5efc" strokeWidth="2" />
                <path d="M8 13h3v3H8z" fill="#6d5efc" />
              </svg>
            }
          />

          <NavItem
            activeItem={active === "notifications"}
            label="Notifications"
            onClick={() => nav("/notifications")}
            ariaLabel="Open notifications"
            showNotificationDot={hasUnread}
            icon={
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
                <path d="M15 17H5l1.4-1.4A2 2 0 0 0 7 14.2V10a5 5 0 1 1 10 0v4.2a2 2 0 0 0 .6 1.4L19 17h-4Z" stroke="#6d5efc" strokeWidth="2" strokeLinejoin="round" />
                <path d="M10 20a2 2 0 0 0 4 0" stroke="#6d5efc" strokeWidth="2" strokeLinecap="round" />
              </svg>
            }
          />

          {isSupervisor && <NavItem activeItem={active === "reports"} label="Reports" ariaLabel="Open reports" onClick={() => { nav("/admin/reports"); setAdminSidebarOpen(false); }} icon={<svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true"><path d="M5 20V10m7 10V4m7 16v-7" stroke="#6d5efc" strokeWidth="2" strokeLinecap="round"/></svg>} />}
        </div>
      </div>

      <SidebarAccount name={baseName} photo={avatarUrl} role={isSupervisor ? "Supervisor" : "Talent"} dark={darkMode} onTheme={() => setDarkMode(v => !v)} onProfile={() => {nav("/profile");setAdminSidebarOpen(false);}} onLogout={logout} />
    </div>
  </aside>
) : null;

  return (
    <div className={cn(darkMode && "admin-dark", "app-frame min-h-screen bg-[#f4f6fb] text-slate-900")}>
      <WorkspaceBackground/>
      <div
        className={cn(
          "grid min-h-screen min-w-0",
          isAdmin
            ? "grid-cols-[242px_1fr] gap-5 max-[1050px]:grid-cols-1"
            : "grid-cols-[242px_1fr] gap-5 max-[1050px]:grid-cols-1"
        )}
      >
        <>
  <button
    type="button"
    onClick={() => setAdminSidebarOpen(true)}
    className="fixed left-3 top-4 z-40 hidden h-11 w-11 place-items-center rounded-[8px] border border-[#6d5efc]/25 bg-white text-[#6d5efc] shadow-[0_12px_30px_rgba(15,23,42,0.16)] transition hover:bg-[#f3f1ff] max-[1050px]:grid"
    aria-label="Open sidebar"
    aria-expanded={adminSidebarOpen}
  >
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
      <path d="M5 7h14M5 12h14M5 17h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  </button>

  {isAdmin ? (
    <div className="max-[1050px]:hidden">
      <AdminSidebar
        active={active}
        darkMode={darkMode}
        onToggleTheme={() => setDarkMode((next) => !next)}
      />
    </div>
  ) : null}

  {adminSidebarOpen ? (
    <div className="fixed inset-0 z-50 hidden max-[1050px]:block" role="dialog" aria-modal="true" aria-label="Sidebar navigation">
      <button
        type="button"
        className="absolute inset-0 h-full w-full bg-slate-950/35"
        aria-label="Close sidebar"
        onClick={() => setAdminSidebarOpen(false)}
      />

      <div className="relative h-full w-[260px] max-w-[82vw]">
        {isAdmin ? (
          <AdminSidebar
            active={active}
            drawer
            darkMode={darkMode}
            onToggleTheme={() => setDarkMode((next) => !next)}
            onNavigate={() => setAdminSidebarOpen(false)}
          />
        ) : (
          <div className="h-full overflow-y-auto bg-transparent p-3">
            <div className="workspace-sidebar flex min-h-full w-full flex-col rounded-[22px] border border-slate-200 bg-white px-3 py-3 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => {
                    nav("/dashboard");
                    setAdminSidebarOpen(false);
                  }}
                  className="workspace-brand flex items-center gap-3 rounded-[16px] px-1 py-1 text-left transition hover:bg-slate-50"
                >
                  <img
                    src={faviconIcon}
                    alt="TaskFlow"
                    className="h-12 w-12 rounded-[18px] object-cover shadow-[0_10px_25px_rgba(15,23,42,0.08)]"
                  />
                  <div className="min-w-0">
                    <div className="truncate text-[17px] font-black tracking-[-0.3px] text-slate-900">TaskFlow</div>
                  </div>
                </button>

                <div className="workspace-section-label"><span>YOUR WORKSPACE</span><span aria-hidden="true">{ "</>" }</span></div>
                <div className="flex flex-col gap-2">
                  <NavItem
                    activeItem={active === "dashboard"}
                    label="Dashboard"
                    onClick={() => {
                      nav("/dashboard");
                      setAdminSidebarOpen(false);
                    }}
                    icon={
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
                        <path d="M4 12c0-4.42 3.58-8 8-8h8v8c0 4.42-3.58 8-8 8H4v-8Z" stroke="#6d5efc" strokeWidth="2" strokeLinejoin="round" />
                        <path d="M12 4v8h8" stroke="#6d5efc" strokeWidth="2" strokeLinejoin="round" />
                      </svg>
                    }
                  />

                  <NavItem
                    activeItem={active === "boards"}
                    label="Boards"
                    onClick={() => {
                      nav("/admin/boards");
                      setAdminSidebarOpen(false);
                    }}
                    icon={
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
                        <path
                          d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v13A2.5 2.5 0 0 1 17.5 21h-11A2.5 2.5 0 0 1 4 18.5v-13Z"
                          stroke="#6d5efc"
                          strokeWidth="2"
                        />
                        <path d="M8 8h8M8 12h8M8 16h5" stroke="#6d5efc" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    }
                  />

                  {isSupervisor ? (
                    <NavItem
                      activeItem={active === "users"}
                      label="Users"
                      onClick={() => {
                        nav("/users");
                        setAdminSidebarOpen(false);
                      }}
                      icon={
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
                          <path d="M16 20v-1.5A3.5 3.5 0 0 0 12.5 15h-5A3.5 3.5 0 0 0 4 18.5V20" stroke="#6d5efc" strokeWidth="2" strokeLinecap="round" />
                          <circle cx="10" cy="8" r="3.5" stroke="#6d5efc" strokeWidth="2" />
                          <path d="M20 20v-1.5A3.5 3.5 0 0 0 17 15.1" stroke="#6d5efc" strokeWidth="2" strokeLinecap="round" />
                          <path d="M15.5 4.7a3.5 3.5 0 0 1 0 6.6" stroke="#6d5efc" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                      }
                    />
                  ) : null}

                  <NavItem
                    activeItem={active === "meetings"}
                    label="Meetings"
                    onClick={() => {
                      nav("/calendar");
                      setAdminSidebarOpen(false);
                    }}
                    icon={
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
                        <path d="M7 3v3M17 3v3M4 9h16" stroke="#6d5efc" strokeWidth="2" strokeLinecap="round" />
                        <rect x="4" y="5" width="16" height="15" rx="3" stroke="#6d5efc" strokeWidth="2" />
                        <path d="M8 13h3v3H8z" fill="#6d5efc" />
                      </svg>
                    }
                  />

                  <NavItem
                    activeItem={active === "notifications"}
                    label="Notifications"
                    onClick={() => {
                      nav("/notifications");
                      setAdminSidebarOpen(false);
                    }}
                    showNotificationDot={hasUnread}
                    icon={
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
                        <path d="M15 17H5l1.4-1.4A2 2 0 0 0 7 14.2V10a5 5 0 1 1 10 0v4.2a2 2 0 0 0 .6 1.4L19 17h-4Z" stroke="#6d5efc" strokeWidth="2" strokeLinejoin="round" />
                        <path d="M10 20a2 2 0 0 0 4 0" stroke="#6d5efc" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    }
                  />

          {isSupervisor && <NavItem activeItem={active === "reports"} label="Reports" ariaLabel="Open reports" onClick={() => { nav("/admin/reports"); setAdminSidebarOpen(false); }} icon={<svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true"><path d="M5 20V10m7 10V4m7 16v-7" stroke="#6d5efc" strokeWidth="2" strokeLinecap="round"/></svg>} />}
                </div>
              </div>

              <SidebarAccount name={baseName} photo={avatarUrl} role={isSupervisor ? "Supervisor" : "Talent"} dark={darkMode} onTheme={() => setDarkMode(v => !v)} onProfile={() => {nav("/profile");setAdminSidebarOpen(false);}} onLogout={logout} />
            </div>
          </div>
        )}
      </div>
    </div>
  ) : null}
</>
        {!isAdmin ? nonAdminNav : null}

        <main className={cn("app-main min-w-0 px-[22px] pb-[22px] pt-[34px]", "pl-0 max-[1050px]:px-[22px] max-[1050px]:pt-[72px] max-[520px]:px-3")}>
          {!hideHeader && <header className="app-page-header mb-5 flex items-start justify-between gap-3 max-[1050px]:flex-col">
            <div>
              <div className="app-eyebrow">REBOOT / {isAdmin ? "ADMIN SPACE" : isSupervisor ? "SUPERVISOR DESK" : "TALENT SPACE"}</div>
              <h1 className="app-page-title">{title}<span aria-hidden="true">.</span></h1>
              {subtitle ? <div className="app-page-subtitle">{subtitle}</div> : null}
            </div>

            <div className="flex max-w-full flex-wrap items-center gap-2 justify-end max-[1050px]:w-full max-[1050px]:justify-start">
              {right}
            </div>
          </header>}

          {children}
        </main>
      </div>
    </div>
  );
}
