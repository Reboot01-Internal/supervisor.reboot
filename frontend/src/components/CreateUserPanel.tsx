import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "../lib/api";
import { useConfirm } from "../lib/useConfirm";

type Role = "supervisor" | "student";

type Props = {
  onUserCreated?: () => Promise<void> | void;
};

function RoleIcon({ role }: { role: Role }) {
  if (role === "supervisor") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 2l7 4v6c0 5-3 9-7 10-4-1-7-5-7-10V6l7-4Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        <path d="M9.5 12.5l1.8 1.8L15.8 9.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3l10 5-10 5L2 8l10-5Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M6 10.5V16c0 1.5 3 3 6 3s6-1.5 6-3v-5.5" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M22 8v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

const GQL_URL = "https://learn.reboot01.com/api/graphql-engine/v1/graphql";

type RebootFetchedUser = {
  nickname: string;
  email: string;
  full_name: string;
  cohort: string;
};

async function fetchRebootUserByLogin(login: string): Promise<RebootFetchedUser | null> {
  const jwt = (localStorage.getItem("jwt") || "").trim();
  if (!jwt) throw new Error("Missing Reboot JWT in localStorage (jwt).");

  const query = `
    query GetUserForTaskflow($login: String!) {
      user(where: { login: { _eq: $login } }, limit: 1) {
        email
        firstName
        lastName
        login
      }
      myModuleEvents: event_user(
        where: {
          userLogin: { _eq: $login }
          event: { path: { _eq: "/bahrain/bh-module" } }
        }
        order_by: [{ eventId: asc }]
      ) {
        eventId
      }
      allModuleCohortEvents: event_user(
        where: { event: { path: { _eq: "/bahrain/bh-module" } } }
        distinct_on: eventId
        order_by: [{ eventId: asc }]
      ) {
        eventId
      }
    }
  `;

  const res = await fetch(GQL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables: { login } }),
  });

  const json = await res.json();
  if (json?.errors?.length) {
    const msg = json.errors?.[0]?.message || "GraphQL error";
    throw new Error(msg);
  }

  const u = json?.data?.user?.[0];
  if (!u?.email) return null;

  const fullName = `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.login || login;
  const userEventIDs = (json?.data?.myModuleEvents || [])
    .map((r: any) => Number(r?.eventId))
    .filter((n: number) => Number.isFinite(n))
    .sort((a: number, b: number) => a - b);
  const userEventID = userEventIDs.length ? userEventIDs[userEventIDs.length - 1] : 0;
  const moduleEventIDs = (json?.data?.allModuleCohortEvents || [])
    .map((r: any) => Number(r?.eventId))
    .filter((n: number) => Number.isFinite(n))
    .sort((a: number, b: number) => a - b)
    .filter((n: number, i: number, arr: number[]) => i === 0 || n !== arr[i - 1]);

  let cohort = "Unknown cohort";
  if (userEventID > 0 && moduleEventIDs.length > 0) {
    const exactIndex = moduleEventIDs.indexOf(userEventID);
    cohort = exactIndex >= 0 ? `Cohort ${exactIndex + 1}` : `Cohort ${moduleEventIDs.filter((id: number) => id < userEventID).length + 1}`;
  }

  return {
    nickname: u.login || login,
    email: u.email,
    full_name: fullName,
    cohort,
  };
}

export default function CreateUserPanel({ onUserCreated }: Props) {
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [nickname, setNickname] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [cohort, setCohort] = useState("");
  const [role, setRole] = useState<Role>("supervisor");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [checking, setChecking] = useState(false);
  const [exists, setExists] = useState(false);
  const [accountExists, setAccountExists] = useState(false);
  const existsCheckSeq = useRef(0);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const login = nickname.trim();
    if (!login) {
      existsCheckSeq.current += 1;
      setFullName("");
      setEmail("");
      setCohort("");
      setExists(false);
      setAccountExists(false);
      setErr("");
      return;
    }

    let alive = true;
    async function run() {
      const seq = ++existsCheckSeq.current;
      setChecking(true);
      setErr("");
      setExists(false);

      try {
        const u = await fetchRebootUserByLogin(login);
        if (!alive || seq !== existsCheckSeq.current) return;
        if (!u) {
          setErr("User not found in Reboot API.");
          setFullName("");
          setEmail("");
          setCohort("");
          return;
        }

        setFullName(u.full_name);
        setEmail(u.email);
        setCohort(u.cohort);

        const res = await apiFetch(`/admin/users/exists?email=${encodeURIComponent(u.email)}&role=${encodeURIComponent(role)}`);
        if (!alive || seq !== existsCheckSeq.current) return;
        setAccountExists(!!res?.any_exists);
        if (res?.exists) {
          setExists(true);
          setMsg(`${role === "supervisor" ? "Supervisor" : "Talent"} role already added.`);
        } else {
          setExists(false);
          setMsg(res?.any_exists ? `Account exists. You can add the ${role} role.` : "");
        }
      } catch (e: any) {
        if (!alive || seq !== existsCheckSeq.current) return;
        setErr(e?.message || "Failed to fetch user.");
        setFullName("");
        setEmail("");
        setCohort("");
      } finally {
        if (alive && seq === existsCheckSeq.current) setChecking(false);
      }
    }

    void run();
    return () => {
      alive = false;
    };
  }, [nickname, role]);

  async function refreshParent() {
    await onUserCreated?.();
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    setErr("");
    setLoading(true);

    try {
      if (!nickname.trim()) throw new Error("Enter nickname/login first.");
      if (!email) throw new Error("User not found in Reboot API.");
      if (exists) throw new Error(`${role === "supervisor" ? "Supervisor" : "Talent"} role already added.`);

      await apiFetch("/admin/users", {
        method: "POST",
        body: JSON.stringify({
          nickname: nickname.trim(),
          cohort: cohort || "Unknown cohort",
          full_name: fullName,
          email,
          password: "",
          role,
        }),
      });

      setMsg(`${role === "supervisor" ? "Supervisor" : "Talent"} ${accountExists ? "role added successfully." : "created successfully."}`);
      setNickname("");
      setFullName("");
      setEmail("");
      setCohort("");
      setExists(false);
      setAccountExists(false);
      await refreshParent();
    } catch (e: any) {
      setErr(e.message || "Failed");
    } finally {
      setLoading(false);
    }
  }

  async function deleteExistingUser() {
    setMsg("");
    setErr("");

    try {
      if (!exists) throw new Error("User does not exist in TaskFlow.");
      if (!email) throw new Error("No user email to delete.");
      const ok = await confirm({
        title: `Delete ${role} access`,
        message: accountExists ? `Remove ${role} access for ${email}? Admin access will stay.` : `Delete ${email} from TaskFlow? This cannot be undone.`,
      });
      if (!ok) return;

      setDeleting(true);
      existsCheckSeq.current += 1;
      await apiFetch("/admin/users/delete", {
        method: "POST",
        body: JSON.stringify({ email, role }),
      });

      const verify = await apiFetch(`/admin/users/exists?email=${encodeURIComponent(email)}&role=${encodeURIComponent(role)}`);
      const stillHasRole = !!verify?.exists;
      setExists(stillHasRole);
      setAccountExists(!!verify?.any_exists);
      setMsg(stillHasRole ? "Delete requested, but the role still exists." : `${role} access removed successfully.`);
      if (!verify?.any_exists) {
        setNickname("");
        setFullName("");
        setEmail("");
        setCohort("");
        setAccountExists(false);
      }
      await refreshParent();
    } catch (e: any) {
      setErr(e?.message || "Failed to delete user.");
    } finally {
      setDeleting(false);
    }
  }

  const canSubmit = nickname.trim().length >= 2 && email.trim().includes("@") && !exists && !checking && !loading;
  const initials = useMemo(() => {
    const n = (fullName || nickname).trim();
    if (!n) return role === "supervisor" ? "SU" : "ST";
    return n.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
  }, [fullName, nickname, role]);

  return (
    <>
      {confirmDialog}
      <section className="rounded-[18px] border border-slate-200 bg-white p-4 shadow-[0_10px_25px_rgba(15,23,42,0.06)]">
        <div className="flex items-start justify-between gap-3">
          <div className="text-base font-black text-slate-900">Create user</div>
          <button
            className="h-10 rounded-[14px] border border-slate-200 bg-slate-50 px-3 text-sm font-extrabold text-slate-800 hover:border-violet-200 hover:bg-violet-50"
            type="button"
            onClick={() => {
              setNickname("");
              setFullName("");
              setEmail("");
              setCohort("");
              setErr("");
              setMsg("");
              setExists(false);
              setAccountExists(false);
            }}
          >
            Reset
          </button>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <button
            type="button"
            onClick={() => setRole("supervisor")}
            className={[
              "flex w-full gap-3 rounded-[16px] border bg-white p-3 text-left shadow-[0_10px_26px_rgba(15,23,42,0.06)] transition",
              "hover:-translate-y-[1px] hover:shadow-[0_14px_30px_rgba(15,23,42,0.08)]",
              role === "supervisor" ? "border-blue-200 shadow-[0_18px_38px_rgba(37,99,235,0.12)]" : "border-slate-200",
            ].join(" ")}
          >
            <span className="grid h-[42px] w-[42px] place-items-center rounded-[14px] border border-slate-200 bg-slate-50 text-slate-800">
              <RoleIcon role="supervisor" />
            </span>
            <span className="grid">
              <span className="leading-tight font-black text-slate-900">Supervisor</span>
              <span className="mt-0.5 text-xs font-bold text-slate-500">Creates a new workspace file</span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => setRole("student")}
            className={[
              "flex w-full gap-3 rounded-[16px] border bg-white p-3 text-left shadow-[0_10px_26px_rgba(15,23,42,0.06)] transition",
              "hover:-translate-y-[1px] hover:shadow-[0_14px_30px_rgba(15,23,42,0.08)]",
              role === "student" ? "border-emerald-200 shadow-[0_18px_38px_rgba(16,185,129,0.12)]" : "border-slate-200",
            ].join(" ")}
          >
            <span className="grid h-[42px] w-[42px] place-items-center rounded-[14px] border border-slate-200 bg-slate-50 text-slate-800">
              <RoleIcon role="student" />
            </span>
            <span className="grid">
              <span className="leading-tight font-black text-slate-900">Talent</span>
              <span className="mt-0.5 text-xs font-bold text-slate-500">Can be added to boards & tasks</span>
            </span>
          </button>
        </div>

        <form onSubmit={createUser} className="mt-3.5 grid gap-3">
          <label className="grid gap-1.5">
            <span className="text-xs font-extrabold text-slate-500">Nickname / Login</span>
            <input
              className="h-11 rounded-[14px] border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-100"
              placeholder="e.g. ralhlawa"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              autoComplete="off"
            />
            {checking ? <span className="text-xs font-bold text-slate-500">Checking Reboot API...</span> : <span className="text-xs font-bold text-slate-500"></span>}
          </label>

          <div className="grid gap-1.5">
            <span className="text-xs font-extrabold text-slate-500">Preview</span>
            <div className="flex items-center gap-3 rounded-[16px] border border-slate-200 bg-slate-50 p-3">
              <div className="grid h-11 w-11 place-items-center rounded-full border border-slate-200 bg-white font-black text-slate-800">
                {initials}
              </div>
              <div className="min-w-0">
                <div className="truncate font-black text-slate-900">
                  {fullName || (nickname.trim() ? nickname.trim() : role === "supervisor" ? "New Supervisor" : "New Talent")}
                </div>
                {nickname.trim() ? (
                  <div className="mt-1 text-xs font-extrabold text-slate-500">
                    Nickname: <span className="text-slate-700">{nickname.trim()}</span>
                  </div>
                ) : null}
                <div className="mt-1.5 flex min-w-0 items-center gap-2">
                  <span
                    className={[
                      "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-black",
                      role === "supervisor" ? "border-blue-200 bg-blue-50 text-blue-700" : "border-emerald-200 bg-emerald-50 text-emerald-700",
                    ].join(" ")}
                  >
                    <RoleIcon role={role} /> {role}
                  </span>
                  <span className="min-w-0 truncate text-xs font-bold text-slate-500">{email || "email@example.com"}</span>
                </div>
                {cohort ? (
                  <div className="mt-2 text-xs font-bold text-slate-600">
                    Cohort: <span className="font-extrabold">{cohort}</span>
                  </div>
                ) : null}
                {exists ? (
                  <div className="mt-2 text-xs font-extrabold text-amber-700">
                    {role === "supervisor" ? "Supervisor" : "Talent"} access already added.
                  </div>
                ) : null}
                {!exists && accountExists ? (
                  <div className="mt-2 text-xs font-extrabold text-blue-700">
                    Account already exists. Creating now will add only the {role} role.
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {err ? <div className="rounded-[14px] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div> : null}
          {msg ? <div className="rounded-[14px] border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{msg}</div> : null}

          <div className="mt-1 flex flex-wrap items-center gap-2">
            <button
              className="h-11 rounded-[14px] px-4 font-black text-white shadow-[0_18px_45px_rgba(15,23,42,0.08)] disabled:cursor-not-allowed disabled:opacity-70"
              style={{ background: "linear-gradient(135deg, #6d5efc, #9a8cff)" }}
              disabled={!canSubmit}
            >
              {loading ? "Creating..." : `Create ${role}`}
            </button>

            {exists ? (
              <button
                type="button"
                onClick={deleteExistingUser}
                disabled={deleting || loading || checking}
                className="h-11 rounded-[14px] border border-rose-200 bg-rose-50 px-4 font-black text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {deleting ? "Deleting..." : `Delete ${role} access`}
              </button>
            ) : null}
          </div>
        </form>
      </section>
    </>
  );
}
