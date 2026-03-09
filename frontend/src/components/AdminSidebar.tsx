import { useNavigate } from "react-router-dom";

type Props = { active?: "dashboard" | "supervisors" | "boards" | "reports" | "assign" | "profile" | "users" };

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export default function AdminSidebar({ active }: Props) {
  const nav = useNavigate();
  const role = (localStorage.getItem("role") || "").trim().toLowerCase();
  const isAdmin = role === "admin";
  const login = (localStorage.getItem("login") || "").trim();
  const email = (localStorage.getItem("email") || "").trim();
  const fallbackName = login || email || "User";
  const footerName = isAdmin ? "Admin" : fallbackName;
  const footerSub = isAdmin ? "System access" : role || "workspace";

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
          "h-11 w-full rounded-[14px] border px-3 text-left font-extrabold transition",
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
        "w-[280px] border-r border-slate-200 bg-white p-[18px]",

        "h-screen sticky top-0 self-start",

        "overflow-y-auto overscroll-contain",

        "max-[1050px]:w-full max-[1050px]:h-auto max-[1050px]:sticky max-[1050px]:top-0 max-[1050px]:overflow-visible"
      )}
    >
      <div className="grid h-full grid-rows-[auto_1fr_auto] gap-2">
        {/* Brand */}
        <div
          onClick={() => nav(isAdmin ? "/admin" : "/admin/boards")}
          className="flex cursor-pointer items-center gap-3 rounded-[14px] px-2 py-2"
        >
          <div className="h-10 w-10 rounded-[14px] bg-gradient-to-br from-[#6d5efc] to-[#9a8cff] shadow-[0_10px_25px_rgba(15,23,42,0.06)]" />
          <div>
            <div className="font-black tracking-[-0.2px] text-slate-900">TaskFlow</div>
            <div className="mt-0.5 text-[12px] font-bold text-slate-500">
              {isAdmin ? "Admin Console" : "Boards Workspace"}
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="grid gap-2 px-2 py-2">
          {isAdmin ? (
            <>
              <Item id="dashboard" label="Dashboard" to="/admin" />
              <Item id="supervisors" label="Supervisors" to="/admin/supervisors" />
              <Item id="boards" label="Boards" to="/admin/boards" />
              <Item id="assign" label="Assign" to="/admin/assign" />
              <Item id="users" label="Users" to="/admin/users" />
              <Item id="reports" label="Reports" to="/admin/reports" />
            </>
          ) : (
            <>
              <Item id="boards" label="Boards" to="/admin/boards" />
              <Item id="profile" label="Profile" to="/profile" />
            </>
          )}
        </nav>

        {/* Footer */}
        <div className="border-t border-slate-200 p-2">
          <div className="mb-3 flex items-center gap-3">
            <div className="h-9 w-9 rounded-full border border-slate-200 bg-[#e8ecff]" />
            <div className="min-w-0">
              <div className="truncate text-[13px] font-extrabold text-slate-900">{footerName}</div>
              <div className="mt-0.5 truncate text-[12px] font-bold text-slate-500">{footerSub}</div>
            </div>
          </div>

          {isAdmin ? (
            <button
              type="button"
              onClick={() => nav("/admin/supervisors")}
              className={cn(
                "h-11 w-full rounded-[14px] border border-slate-200 bg-slate-50",
                "font-extrabold text-slate-900 transition",
                "hover:border-[#6d5efc]/25 hover:bg-[#f2f5ff]"
              )}
            >
              Manage supervisors
            </button>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
