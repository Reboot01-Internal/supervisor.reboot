import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import placeholder from "../reboot.JPG";
import logo from "./logo.png";

const AUTH_URL = "https://learn.reboot01.com/api/auth/signin";
const GQL_URL = "https://learn.reboot01.com/api/graphql-engine/v1/graphql";
const LOCAL_API = import.meta.env.VITE_API_URL || "http://localhost:8080";

function normalizeToken(raw: string) {
  return raw.trim().replace(/^"|"$/g, "");
}

function decodeJwtPayload(token: string): any | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;

    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");

    const json = atob(padded);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function getIdentityFromJwt(jwt: string): { login?: string; userId?: string; roleFromClaims?: string } {
  const payload = decodeJwtPayload(jwt) || {};
  const claims = payload["https://hasura.io/jwt/claims"] || payload["hasura"] || {};

  // Common places:
  const login =
    (payload.login as string) ||
    (payload.sub as string) ||
    (claims["x-hasura-user-id"] as string) ||
    (claims["x-hasura-userid"] as string) ||
    "";

  const roleFromClaims =
    (claims["x-hasura-default-role"] as string) ||
    (claims["x-hasura-role"] as string) ||
    (payload.role as string) ||
    "";

  // Sometimes user-id is numeric string in claims
  const userId =
    (claims["x-hasura-user-id"] as string) ||
    (payload.user_id as string) ||
    "";

  return {
    login: login ? String(login).trim() : undefined,
    userId: userId ? String(userId).trim() : undefined,
    roleFromClaims: roleFromClaims ? String(roleFromClaims).trim().toLowerCase() : undefined,
  };
}

async function gqlFetch(jwt: string, query: string, variables?: any) {
  const res = await fetch(GQL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = await res.json();
  if (!res.ok || json.errors) {
    const msg = json?.errors?.[0]?.message || "GraphQL request failed";
    throw new Error(msg);
  }
  return json.data;
}

async function fetchUserByLogin(jwt: string, login: string) {
  // NOTE: This assumes the schema has `user` table with `login/email/role`.
  // If your schema uses `users` instead of `user`, tell me and I’ll adjust.
  const query = `
    query MeByLogin($login: String!) {
      user(where: { login: { _eq: $login } }, limit: 1) {
        email
        login
      }
    }
  `;
  const data = await gqlFetch(jwt, query, { login });
  return data?.user?.[0] || null;
}

async function fetchUserById(jwt: string, id: string) {
  const query = `
    query MeById($id: Int!) {
      user(where: { id: { _eq: $id } }, limit: 1) {
        email
        login
      }
    }
  `;
  const asInt = Number(id);
  if (!Number.isFinite(asInt)) return null;
  const data = await gqlFetch(jwt, query, { id: asInt });
  return data?.user?.[0] || null;
}

async function resolveLocalUser(identifier: string) {
  const id = identifier.trim();
  if (!id) return null;

  // Preferred endpoint (new).
  try {
    const res = await fetch(`${LOCAL_API}/auth/resolve-user?identifier=${encodeURIComponent(id)}`);
    const data = await res.json().catch(() => null);
    if (res.ok && data?.role) {
      return data as { email: string; nickname?: string; role: string } | null;
    }
  } catch {
    // fallback below
  }

  // Fallback for older backend instances: search users and match exact email/nickname.
  try {
    const res = await fetch(`${LOCAL_API}/admin/users?q=${encodeURIComponent(id)}&role=all`);
    const data = await res.json().catch(() => null);
    if (!res.ok || !Array.isArray(data)) return null;

    const needle = id.toLowerCase();
    const exact =
      data.find((u: any) => String(u?.email || "").trim().toLowerCase() === needle) ||
      data.find((u: any) => String(u?.nickname || "").trim().toLowerCase() === needle);

    if (!exact?.role) return null;
    return {
      email: String(exact.email || "").trim().toLowerCase(),
      nickname: String(exact.nickname || "").trim(),
      role: String(exact.role || "").trim().toLowerCase(),
    };
  } catch {
    return null;
  }
}

export default function LoginPage() {
  const nav = useNavigate();
  const auth = useAuth();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (auth.authenticated) {
      nav(auth.isAdmin ? "/admin" : "/dashboard");
    }
  }, [auth.authenticated, auth.isAdmin, nav]);

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (!identifier.trim()) throw new Error("Please enter your email or nickname.");
      if (!password.trim()) throw new Error("Please enter your password.");

      // 1) Sign in -> JWT
      const encoded = btoa(`${identifier.trim()}:${password}`);
      const authRes = await fetch(AUTH_URL, {
        method: "POST",
        headers: {
          Authorization: `Basic ${encoded}`,
          "Content-Type": "application/json",
        },
      });

      if (!authRes.ok) throw new Error("Invalid login. Please try again.");

      const raw = await authRes.text();
      const jwt = normalizeToken(raw);

      // 2) Identity from JWT (so we query YOUR user, not event_user[0])
      const ident = getIdentityFromJwt(jwt);

      let me: any = null;

      if (ident.login) {
        me = await fetchUserByLogin(jwt, ident.login);
      }
      if (!me && ident.userId) {
        me = await fetchUserById(jwt, ident.userId);
      }

      // Admin bypass: do not check DB for admin.
      const inputIdentifier = identifier.trim();
      const adminByInput = inputIdentifier.toLowerCase() === "admin@local.test";
      const adminByClaims = (ident.roleFromClaims || "").toLowerCase() === "admin";

      let role = "";
      let email = "";
      let login = "";

      if (adminByInput || adminByClaims) {
        role = "admin";
        email = inputIdentifier.includes("@")
          ? inputIdentifier.toLowerCase()
          : String(me?.email || "").trim().toLowerCase() || "admin@local.test";
        login = String(me?.login || ident.login || inputIdentifier).trim();
      } else {
        const candidates = [
          inputIdentifier,
          String(ident.login || "").trim(),
          String(me?.email || "").trim(),
          String(me?.login || "").trim(),
        ].filter(Boolean);

        let localUser: { email: string; nickname?: string; role: string } | null = null;
        for (const c of candidates) {
          localUser = await resolveLocalUser(c);
          if (localUser) break;
        }

        if (!localUser?.role) {
          throw new Error("Your account is not set up in TaskFlow yet. Please contact an admin to complete your access.");
        }

        role = String(localUser.role).trim().toLowerCase();
        email = String(localUser.email || me?.email || "").trim().toLowerCase();
        login = String(localUser.nickname || me?.login || ident.login || inputIdentifier).trim();
      }

      auth.setSession({ jwt, email, login, role, displayName: "" });

      if (role === "admin") nav("/admin");
      else nav("/dashboard");
    } catch (err: any) {
      setError(err?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f4f6fb] p-4 sm:p-6">
      <div className="pointer-events-none absolute -top-16 -left-24 h-72 w-72 rounded-full bg-[#6d5efc]/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-20 h-80 w-80 rounded-full bg-[#9a8cff]/20 blur-3xl" />

      <div className="mx-auto grid min-h-[calc(100vh-2rem)] max-w-[1120px] place-items-center">
        <div className="grid w-full grid-cols-1 overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/85 shadow-[0_24px_64px_rgba(15,23,42,0.14)] backdrop-blur-sm lg:grid-cols-[1.15fr_.85fr]">
          <section
            className="relative min-h-[280px] p-6 sm:p-8 lg:min-h-[640px]"
            style={{ backgroundImage: `url(${placeholder})`, backgroundSize: "cover", backgroundPosition: "center" }}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-slate-900/70 via-slate-900/45 to-[#6d5efc]/40" />
            <div className="absolute inset-0 opacity-25" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,.7) 1px, transparent 0)", backgroundSize: "20px 20px" }} />

            <div className="absolute left-5 top-5 z-10 sm:left-6 sm:top-6">
              <img
                src={logo}
                alt="TaskFlow logo"
                className="h-16 w-auto drop-shadow-[0_18px_30px_rgba(15,23,42,0.22)] sm:h-20"
              />
            </div>

            <div className="absolute bottom-8 left-6 z-10 text-left text-white drop-shadow-[0_12px_24px_rgba(15,23,42,0.28)] sm:bottom-10 sm:left-8">
              <div className="text-[15px] font-bold tracking-[-0.02em] text-white/88 sm:text-[17px]">
                Welcome to
              </div>
              <div className="mt-1 text-[30px] font-black tracking-[-0.05em] sm:text-[38px]">
                TaskFlow
              </div>
            </div>

            {/* <div className="relative z-10 flex h-full flex-col justify-between">
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/30 bg-white/20 px-3 py-1.5 text-[12px] font-extrabold text-white backdrop-blur-md">
                <span className="h-2 w-2 rounded-full bg-[#b7adff]" />
                TaskFlow Workspace
              </div>

              <div className="max-w-[420px]">
                <h2 className="text-[34px] font-black leading-[1.05] tracking-[-0.03em] text-white sm:text-[42px]">
                  Manage Boards.
                  <br />
                  Track Progress.
                </h2>
                <p className="mt-3 text-[14px] font-semibold text-white/90 sm:text-[15px]">
                  One clean workspace for admins, supervisors, and talents.
                </p>
              </div>
            </div> */}
          </section>

          <section className="grid place-items-center p-6 sm:p-8 lg:p-10">
            <div className="w-full max-w-[360px]">
              <div className="mb-5">
                <h1 className="text-[32px] font-black tracking-[-0.03em] text-slate-900">Sign In</h1>
                <p className="mt-1 text-[14px] font-semibold text-slate-500">
                  Enter your nickname or email to continue.
                </p>
              </div>

              <form onSubmit={onLogin} className="space-y-3">
                <input
                  type="text"
                  placeholder="Email or Nickname"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="w-full h-[48px] rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm font-semibold text-slate-900 outline-none transition focus:border-[#6d5efc]/35 focus:bg-white focus:ring-4 focus:ring-[#6d5efc]/12"
                />

                <input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-[48px] rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm font-semibold text-slate-900 outline-none transition focus:border-[#6d5efc]/35 focus:bg-white focus:ring-4 focus:ring-[#6d5efc]/12"
                />

                {error ? (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] font-semibold text-rose-700">
                    {error}
                  </div>
                ) : null}

                <button
                  className="mt-1 h-[48px] w-full rounded-xl bg-[#6d5efc] text-white font-extrabold transition hover:bg-[#5f50f6] disabled:cursor-not-allowed disabled:opacity-70"
                  disabled={loading}
                >
                  {loading ? "Signing in..." : "Sign In"}
                </button>
              </form>

              {/* <div className="mt-6 border-t border-slate-200 pt-4 text-center text-xs font-semibold text-slate-400">
                © {new Date().getFullYear()} TaskFlow
              </div> */}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
