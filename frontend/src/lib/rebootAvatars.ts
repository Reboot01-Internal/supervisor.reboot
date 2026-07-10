import { API_URL } from "./api";

const AVATAR_CACHE_KEY = "taskflow.reboot.avatarProxyCache.v3";

let cachedSessionKey = "";
const avatarCache = new Map<string, string>();

function normalizeLogin(login: string) {
  return String(login || "").trim().toLowerCase();
}

function sessionKey() {
  return [
    (localStorage.getItem("jwt") || "").trim(),
    (localStorage.getItem("role") || "").trim(),
    (localStorage.getItem("login") || "").trim(),
  ].join("|");
}

function avatarProxyURL(login: string) {
  return `${API_URL}/api/avatar?login=${encodeURIComponent(login)}`;
}

function hydrateCache() {
  const key = sessionKey();
  if (cachedSessionKey === key) return;
  cachedSessionKey = key;
  avatarCache.clear();

  try {
    const raw = sessionStorage.getItem(AVATAR_CACHE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { session?: string; avatars?: Record<string, string> };
    if (parsed?.session !== key || !parsed?.avatars || typeof parsed.avatars !== "object") return;
    Object.entries(parsed.avatars).forEach(([login, url]) => {
      if (typeof url === "string" && url) avatarCache.set(normalizeLogin(login), url);
    });
  } catch {
    // Ignore cache hydration issues.
  }
}

function persistCache() {
  try {
    sessionStorage.setItem(
      AVATAR_CACHE_KEY,
      JSON.stringify({
        session: cachedSessionKey,
        avatars: Object.fromEntries(avatarCache.entries()),
      })
    );
  } catch {
    // Ignore storage issues.
  }
}

export function getCachedRebootAvatar(login: string): string {
  if (!localStorage.getItem("jwt")) return "";
  hydrateCache();
  return avatarCache.get(normalizeLogin(login)) || "";
}

export async function fetchRebootAvatars(logins: string[]): Promise<Record<string, string>> {
  if (!localStorage.getItem("jwt") || logins.length === 0) return {};
  hydrateCache();

  const map: Record<string, string> = {};
  const uniqueLogins = Array.from(new Set(logins.map((login) => normalizeLogin(login)).filter(Boolean)));
  for (const login of uniqueLogins) {
    const cached = avatarCache.get(login);
    const url = cached || avatarProxyURL(login);
    avatarCache.set(login, url);
    map[login] = url;
  }
  persistCache();
  return map;
}

export async function fetchRebootAvatar(login: string): Promise<string> {
  const cleanLogin = normalizeLogin(login);
  if (!cleanLogin) return "";
  const cached = getCachedRebootAvatar(cleanLogin);
  if (cached) return cached;
  const avatars = await fetchRebootAvatars([cleanLogin]);
  return avatars[cleanLogin] || "";
}
