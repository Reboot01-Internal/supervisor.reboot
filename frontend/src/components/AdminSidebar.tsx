import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useNotifications } from "../lib/notifications";
import faviconIcon from "/favicon-icon.png";
import { fetchRebootAvatar, getCachedRebootAvatar } from "../lib/rebootAvatars";
import UserAvatar from "./UserAvatar";

type Props = {
  active?: "dashboard" | "supervisors" | "boards" | "reports" | "profile" | "users" | "meetings" | "notifications";
  drawer?: boolean;
  darkMode?: boolean;
  onToggleTheme?: () => void;
  onNavigate?: () => void;
};

type SidebarItemProps = {
  id: NonNullable<Props["active"]>;
  currentActive?: Props["active"];
  label: string;
  to: string;
  icon: ReactNode;
  showNotificationDot?: boolean;
  onNavigate?: () => void;
};

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function SidebarItem({
  id,
  currentActive,
  label,
  to,
  icon,
  showNotificationDot = false,
  onNavigate,
}: SidebarItemProps) {
  const nav = useNavigate();
  const isActive = currentActive === id;
  return (
    <button
      type="button"
      onClick={() => {
        nav(to);
        onNavigate?.();
      }}
      className={cn(
        "flex w-full items-center gap-3 rounded-[14px] border px-3 py-2 text-left font-extrabold transition",
        isActive
          ? "border-[#6d5efc]/22 bg-[#f3f1ff] text-slate-900"
          : "border-transparent text-slate-700 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-900"
      )}
    >
      <span className="relative grid h-8 w-8 place-items-center rounded-full border border-current/15 bg-white/70">
        {icon}
        {showNotificationDot ? (
          <span className="absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full border border-white bg-red-500" />
        ) : null}
      </span>
      <span className="text-[14px] leading-none">{label}</span>
    </button>
  );
}

function SignOutIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M10 7V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6a2 2 0 0 1-2-2v-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15 12H4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="m8 8-4 4 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ThemeIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3v2.2M12 18.8V21M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M3 12h2.2M18.8 12H21M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export default function AdminSidebar({ active, drawer = false, darkMode = false, onToggleTheme, onNavigate }: Props) {
  const nav = useNavigate();
  const { isAdmin, login, email, role, displayName, setDisplayName, logout } = useAuth();
  const { hasUnread } = useNotifications();
  const fallbackName = login || email || "User";
  const avatarLogin = String(login || String(email || "").split("@")[0] || "").trim();
  const [avatarUrl, setAvatarUrl] = useState(() => getCachedRebootAvatar(avatarLogin));

  useEffect(() => {
    if (displayName) return;

    let cancelled = false;

    async function loadProfileName() {
      try {
        const profile = await apiFetch("/admin/profile/summary");
        const nextName = String(profile?.user?.full_name || "").trim();
        if (!cancelled && nextName) {
          setDisplayName(nextName);
        }
      } catch {
        // Keep the fallback login/email label if the profile request fails.
      }
    }

    loadProfileName();

    return () => {
      cancelled = true;
    };
  }, [displayName, setDisplayName]);

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

  const footerName = displayName || fallbackName;
  const footerSub = isAdmin ? "System access" : role || "workspace";
  const initials = footerName
    .replace(/^@/, "")
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0]?.toUpperCase() || "")
    .join("") || "U";

  return (
    <aside
      className={cn(
        "self-start",
        drawer ? "h-full" : "sticky top-[22px] max-[1050px]:top-0"
      )}
    >
      <div
        className={cn(
          "flex w-[220px] max-w-full flex-col border border-slate-200 bg-white px-3 py-3 shadow-[0_16px_40px_rgba(15,23,42,0.06)]",
          drawer
            ? "h-full min-h-full rounded-r-[22px]"
            : "min-h-[calc(100vh-44px)] rounded-[22px] max-[1050px]:min-h-0 max-[1050px]:w-full"
        )}
      >
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => {
              nav(isAdmin ? "/admin" : "/admin/boards");
              onNavigate?.();
            }}
            className="flex items-center gap-3 rounded-[16px] px-1 py-1 text-left transition hover:bg-slate-50"
          >
            <img
              src={faviconIcon}
              alt="TaskFlow"
              className="h-12 w-12 rounded-[18px] object-cover shadow-[0_10px_25px_rgba(15,23,42,0.08)]"
            />
            <div className="min-w-0">
              <div className="truncate text-[17px] font-black tracking-[-0.3px] text-slate-900">TaskFlow</div>
              <div className="mt-0.5 text-[12px] font-bold text-slate-500">
                {isAdmin ? "Admin Console" : "Boards Workspace"}
              </div>
            </div>
          </button>

          <nav className="flex flex-col gap-2">
          {isAdmin ? (
            <>
              <SidebarItem
                currentActive={active}
                onNavigate={onNavigate}
                id="dashboard"
                label="Dashboard"
                to="/admin"
                icon={
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
                    <path d="M4 12c0-4.42 3.58-8 8-8h8v8c0 4.42-3.58 8-8 8H4v-8Z" stroke="#6d5efc" strokeWidth="2" strokeLinejoin="round" />
                    <path d="M12 4v8h8" stroke="#6d5efc" strokeWidth="2" strokeLinejoin="round" />
                  </svg>
                }
              />
              <SidebarItem
                currentActive={active}
                onNavigate={onNavigate}
                id="supervisors"
                label="Supervisors"
                to="/admin/supervisors"
                icon={
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
                    <path d="M16 20v-1.5A3.5 3.5 0 0 0 12.5 15h-5A3.5 3.5 0 0 0 4 18.5V20" stroke="#6d5efc" strokeWidth="2" strokeLinecap="round" />
                    <circle cx="10" cy="8" r="3.5" stroke="#6d5efc" strokeWidth="2" />
                    <path d="M20 20v-1.5A3.5 3.5 0 0 0 17 15.1" stroke="#6d5efc" strokeWidth="2" strokeLinecap="round" />
                    <path d="M15.5 4.7a3.5 3.5 0 0 1 0 6.6" stroke="#6d5efc" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                }
              />
              <SidebarItem
                currentActive={active}
                onNavigate={onNavigate}
                id="boards"
                label="Boards"
                to="/admin/boards"
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
              <SidebarItem
                currentActive={active}
                onNavigate={onNavigate}
                id="users"
                label="Users"
                to="/admin/users"
                icon={
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
                    <path d="M16 20v-1.5A3.5 3.5 0 0 0 12.5 15h-5A3.5 3.5 0 0 0 4 18.5V20" stroke="#6d5efc" strokeWidth="2" strokeLinecap="round" />
                    <circle cx="10" cy="8" r="3.5" stroke="#6d5efc" strokeWidth="2" />
                    <path d="M20 20v-1.5A3.5 3.5 0 0 0 17 15.1" stroke="#6d5efc" strokeWidth="2" strokeLinecap="round" />
                    <path d="M15.5 4.7a3.5 3.5 0 0 1 0 6.6" stroke="#6d5efc" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                }
              />
              <SidebarItem
                currentActive={active}
                onNavigate={onNavigate}
                id="meetings"
                label="Meetings"
                to="/admin/meetings"
                icon={
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
                    <path d="M7 3v3M17 3v3M4 9h16" stroke="#6d5efc" strokeWidth="2" strokeLinecap="round" />
                    <rect x="4" y="5" width="16" height="15" rx="3" stroke="#6d5efc" strokeWidth="2" />
                    <path d="M8 13h3v3H8z" fill="#6d5efc" />
                  </svg>
                }
              />
              <SidebarItem
                currentActive={active}
                onNavigate={onNavigate}
                id="notifications"
                label="Notifications"
                to="/notifications"
                showNotificationDot={hasUnread}
                icon={
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
                    <path d="M15 17H5l1.4-1.4A2 2 0 0 0 7 14.2V10a5 5 0 1 1 10 0v4.2a2 2 0 0 0 .6 1.4L19 17h-4Z" stroke="#6d5efc" strokeWidth="2" strokeLinejoin="round" />
                    <path d="M10 20a2 2 0 0 0 4 0" stroke="#6d5efc" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                }
              />
              <SidebarItem
                currentActive={active}
                onNavigate={onNavigate}
                id="reports"
                label="Reports"
                to="/admin/reports"
                icon={
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
                    <path d="M7 19h10" stroke="#6d5efc" strokeWidth="2" strokeLinecap="round" />
                    <path d="M9 15V9" stroke="#6d5efc" strokeWidth="2" strokeLinecap="round" />
                    <path d="M12 15V5" stroke="#6d5efc" strokeWidth="2" strokeLinecap="round" />
                    <path d="M15 15v-3" stroke="#6d5efc" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                }
              />
            </>
          ) : (
            <>
              <SidebarItem
                currentActive={active}
                onNavigate={onNavigate}
                id="boards"
                label="Boards"
                to="/admin/boards"
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
              <SidebarItem
                currentActive={active}
                onNavigate={onNavigate}
                id="profile"
                label="Profile"
                to="/profile"
                icon={
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
                    <circle cx="12" cy="8" r="3.5" stroke="#6d5efc" strokeWidth="2" />
                    <path d="M5 20a7 7 0 0 1 14 0" stroke="#6d5efc" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                }
              />
            </>
          )}
          </nav>
        </div>

        <div className="admin-sidebar-footer mt-auto flex flex-col gap-2 border-t border-slate-200 pt-3">
          {onToggleTheme ? (
            <button
              type="button"
              onClick={onToggleTheme}
              aria-pressed={darkMode}
              className="flex items-center gap-3 rounded-[14px] border border-slate-200 bg-white px-3 py-2 font-extrabold text-slate-700 transition hover:border-[#6d5efc]/25 hover:bg-slate-50 hover:text-slate-900"
            >
              <span className="grid h-8 w-8 place-items-center rounded-full border border-current/15 bg-white/70">
                <ThemeIcon size={15} />
              </span>
              <span className="text-[14px] leading-none">Toggle Theme</span>
            </button>
          ) : null}

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => {
                nav("/profile");
                onNavigate?.();
              }}
              className="flex min-w-0 flex-1 items-center gap-3 rounded-[16px] border border-slate-200 bg-white px-3 py-2 text-left transition hover:bg-slate-50"
              title="Open profile"
              aria-label="Open profile"
            >
              <UserAvatar
                src={avatarUrl}
                alt={footerName}
                fallback={initials}
                sizeClass="h-10 w-10"
                textClass="text-[11px]"
                className="bg-[#e8ecff] text-[#6d5efc]"
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-extrabold text-slate-900">{footerName}</div>
                <div className="mt-0.5 truncate text-[12px] font-bold text-slate-500">{footerSub}</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                logout();
                onNavigate?.();
              }}
              title="Log out"
              aria-label="Log out"
              className="flex items-center gap-3 rounded-[14px] border border-slate-200 bg-white px-3 py-2 font-extrabold text-slate-700 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
            >
              <span className="grid h-8 w-8 place-items-center rounded-full border border-current/15 bg-white/70">
                <SignOutIcon size={15} />
              </span>
              <span className="text-[14px] leading-none">Log out</span>
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
