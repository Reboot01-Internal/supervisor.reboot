export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8080";

export function clearAuth() {
  localStorage.removeItem("jwt");
  localStorage.removeItem("role");
  localStorage.removeItem("email");
  localStorage.removeItem("login");
  localStorage.removeItem("displayName");
  localStorage.removeItem("token");
  localStorage.removeItem("user");
}

export const clearToken = clearAuth;

export function authHeaders(options: RequestInit = {}): Record<string, string> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  const hasBody = options.body !== undefined && options.body !== null;
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;

  if (hasBody && !isFormData && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const email = (localStorage.getItem("email") || "").trim();
  const role = (localStorage.getItem("role") || "").trim();
  const login = (localStorage.getItem("login") || "").trim();

  if (email) headers["X-User-Email"] = email;
  if (role) headers["X-User-Role"] = role;
  if (login) headers["X-User-Login"] = login;

  return headers;
}

export async function apiFetch(path: string, options: RequestInit = {}) {
  const headers = authHeaders(options);

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    clearAuth();
    window.dispatchEvent(new Event("auth:logout"));
    throw new Error("Session expired");
  }

  const text = await res.text();
  let data: any = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const msg = data?.error || (res.status === 413
      ? "This image exceeds the server upload limit. Try a smaller image."
      : res.status === 502 || res.status === 503 || res.status === 504
      ? "The server is temporarily unavailable. Please try again shortly."
      : `Request failed (HTTP ${res.status}). Please try again.`);
    throw new Error(msg);
  }

  return data;
}
