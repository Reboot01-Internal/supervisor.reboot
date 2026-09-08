import { API_URL } from "./api";

const GQL_URL = "https://learn.reboot01.com/api/graphql-engine/v1/graphql";
const capabilities = new Map<string, Promise<boolean>>();

// The backend owns the username allowlist. This flag only selects the transport;
// every delegated request is independently authenticated by the backend.
async function usesDelegatedDirectory(jwt: string): Promise<boolean> {
  const login = (localStorage.getItem("login") || "").trim();
  if (!login) return false;
  const key = `${login}:${jwt}`;
  let pending = capabilities.get(key);
  if (!pending) {
    capabilities.clear();
    pending = fetch(`${API_URL}/auth/resolve-user?identifier=${encodeURIComponent(login)}`)
      .then(async response => {
        if (!response.ok) throw new Error("Unable to check directory access.");
        const user = await response.json();
        return user.directory_delegate === true;
      });
    capabilities.set(key, pending);
    pending.catch(() => capabilities.delete(key));
  }
  return pending;
}

export async function fetchRebootDirectory(
  operation: "search" | "user" | "phones",
  query: string,
  variables: Record<string, unknown>,
): Promise<Response> {
  const jwt = (localStorage.getItem("jwt") || "").trim();
  if (!jwt) throw new Error("Missing Reboot session.");
  const delegated = await usesDelegatedDirectory(jwt);
  return fetch(delegated ? `${API_URL}/api/delegate/directory` : GQL_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    body: JSON.stringify(delegated ? { operation, variables } : { query, variables }),
  });
}
