import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import placeholder from "../placeholder.png";

const AUTH_URL = "https://learn.reboot01.com/api/auth/signin";
const GQL_URL = "https://learn.reboot01.com/api/graphql-engine/v1/graphql";

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
        role
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
        role
      }
    }
  `;
  const asInt = Number(id);
  if (!Number.isFinite(asInt)) return null;
  const data = await gqlFetch(jwt, query, { id: asInt });
  return data?.user?.[0] || null;
}

export default function LoginPage() {
  const nav = useNavigate();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const role = localStorage.getItem("role");
    const email = localStorage.getItem("email");
    if (role && email) {
      if (role === "admin") nav("/admin");
      else nav("/dashboard");
    }
  }, [nav]);

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (!identifier.trim()) throw new Error("Please enter your username or email.");
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

      if (!me?.email) throw new Error("Could not find your user record in GraphQL.");

      const email = String(me.email).trim().toLowerCase();
      const login = String(me.login || ident.login || "").trim();
      const role = String(me.role || ident.roleFromClaims || "").trim().toLowerCase();

      if (!role) throw new Error("Could not read your role.");

      // 3) Save
      localStorage.setItem("jwt", jwt);
      localStorage.setItem("email", email);
      localStorage.setItem("login", login);
      localStorage.setItem("role", role);

      // 4) Redirect
      if (role === "admin") nav("/admin");
      else nav("/dashboard");
    } catch (err: any) {
      setError(err?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center p-5 bg-white">
      <div className="w-full max-w-[980px] h-auto lg:h-[560px] grid grid-cols-1 lg:grid-cols-2 rounded-[28px] overflow-hidden bg-white shadow-[0_40px_100px_rgba(0,0,0,0.25)]">
        <div
          className="relative h-[220px] lg:h-auto bg-center bg-cover"
          style={{ backgroundImage: `url(${placeholder})` }}
        >
          <div className="absolute bottom-10 left-10 text-white">
            <h2 className="text-[28px] leading-tight mb-2">Organize your workflow</h2>
            <p className="text-sm opacity-90">One board at a time.</p>
          </div>
        </div>

        <div className="grid place-items-center p-10">
          <div className="w-full max-w-[340px]">
            <h1 className="text-[28px] mb-1.5 text-[#222]">Sign In</h1>
            <p className="text-sm text-[#666] mb-6">Access your workspace</p>

            <form onSubmit={onLogin} className="space-y-4">
              <input
                type="text"
                placeholder="Username or Email"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="w-full h-[46px] px-3.5 rounded-xl border border-[#e5e5e5] text-sm outline-none transition focus:border-[#dc586d] focus:ring-4 focus:ring-[rgba(220,88,109,0.15)]"
              />

              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-[46px] px-3.5 rounded-xl border border-[#e5e5e5] text-sm outline-none transition focus:border-[#dc586d] focus:ring-4 focus:ring-[rgba(220,88,109,0.15)]"
              />

              {error && <div className="text-[13px] text-[#dc586d]">{error}</div>}

              <button
                className="w-full h-[46px] rounded-xl mt-2.5 text-white font-semibold transition disabled:opacity-70 disabled:cursor-not-allowed hover:-translate-y-0.5 hover:shadow-[0_10px_25px_rgba(76,29,61,0.3)]"
                style={{ background: "linear-gradient(135deg, #4c1d3d, #a33757)" }}
                disabled={loading}
              >
                {loading ? "Signing in..." : "Sign In"}
              </button>
            </form>

            <div className="mt-7.5 text-xs text-center text-[#999]">
              © {new Date().getFullYear()} Your App
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}