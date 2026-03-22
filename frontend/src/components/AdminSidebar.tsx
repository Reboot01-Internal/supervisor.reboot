import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import faviconIcon from "/favicon-icon.png";

type Props = { active?: "dashboard" | "supervisors" | "boards" | "reports" | "assign" | "profile" | "users" | "meetings" | "notifications" };

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export default function AdminSidebar({ active }: Props) {
  const nav = useNavigate();
  const { isAdmin, login, email, role } = useAuth();
  const fallbackName = login || email || "User";
  const footerName = isAdmin ? "Admin" : fallbackName;
  const footerSub = isAdmin ? "System access" : role || "workspace";
  const initials = fallbackName
    .replace(/^@/, "")
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0]?.toUpperCase() || "")
    .join("") || "U";

  const Item = ({
    id,
    label,
    to,
  }: {
    id: NonNullable<Props["active"]>;
    label: string;
    to: string;
  }) => {
    const isActive = active === id;
    return (
      <button
        type="button"
        onClick={() => nav(to)}
        className={cn(
          "h-10 w-full rounded-[14px] border px-3 text-left font-extrabold transition",
          "flex items-center gap-3",
          isActive
            ? "border-[#6d5efc]/25 bg-[#6d5efc]/10 text-slate-900"
            : "border-transparent bg-transparent text-slate-900 hover:border-slate-200 hover:bg-slate-50"
        )}
      >
        <span
          className={cn("h-2.5 w-2.5 rounded-full", isActive ? "bg-[#6d5efc]" : "bg-slate-300")}
        />
        {label}
      </button>
    );
  };

  return (
    <aside
      className={cn(
        "w-[240px] border-r border-slate-200 bg-white p-[18px]",
        "h-screen sticky top-0 self-start",
        "overflow-y-auto overscroll-contain",
        "max-[1050px]:w-full max-[1050px]:h-auto max-[1050px]:sticky max-[1050px]:top-0 max-[1050px]:overflow-visible"
      )}
    >
      <div className="grid h-full grid-rows-[auto_1fr_auto] gap-2">
        <div
          onClick={() => nav(isAdmin ? "/admin" : "/admin/boards")}
          className="flex cursor-pointer items-center gap-3 rounded-[14px] px-2 py-2"
        >
          <img src={faviconIcon} alt="Reboot" className="h-10 w-10 rounded-[14px] object-cover shadow-[0_10px_25px_rgba(15,23,42,0.06)]" />
          <div>
            <div className="font-black tracking-[-0.2px] text-slate-900">TaskFlow</div>
            <div className="mt-0.5 text-[12px] font-bold text-slate-500">
              {isAdmin ? "Admin Console" : "Boards Workspace"}
            </div>
          </div>
        </div>

        <nav className="grid content-start auto-rows-min gap-1.5 px-2 py-2">
          {isAdmin ? (
            <>
              <Item id="dashboard" label="Dashboard" to="/admin" />
              <Item id="supervisors" label="Supervisors" to="/admin/supervisors" />
              <Item id="boards" label="Boards" to="/admin/boards" />
              <Item id="assign" label="Assign" to="/admin/assign" />
              <Item id="users" label="Users" to="/admin/users" />
              <Item id="meetings" label="Meetings" to="/admin/meetings" />
              <Item id="notifications" label="Notifications" to="/notifications" />
              <Item id="reports" label="Reports" to="/admin/reports" />
            </>
          ) : (
            <>
              <Item id="boards" label="Boards" to="/admin/boards" />
              <Item id="profile" label="Profile" to="/profile" />
            </>
          )}
        </nav>

        <div className="border-t border-slate-200 p-2">
          <div className="mb-3 flex items-center gap-3">
            <div className="h-9 w-9 rounded-full border border-slate-200 bg-[#e8ecff] flex items-center justify-center flex-shrink-0">
              <span className="text-[11px] font-extrabold text-[#6d5efc]">{initials}</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-extrabold text-slate-900">{footerName}</div>
              <div className="mt-0.5 truncate text-[12px] font-bold text-slate-500">{footerSub}</div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
