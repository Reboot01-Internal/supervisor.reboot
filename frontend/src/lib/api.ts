const API_URL = "http://localhost:8080";

export function clearAuth() {
  localStorage.removeItem("role");
  localStorage.removeItem("email");
  localStorage.removeItem("login");
}

function buildHeaders(options: RequestInit): Record<string, string> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  // ✅ Only set JSON content-type when we actually send JSON body
  // (Setting it on GET triggers OPTIONS preflight frequently)
  const hasBody = options.body !== undefined && options.body !== null;
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;

  if (hasBody && !isFormData && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  // ✅ Identity headers for backend actorID()
  const email = (localStorage.getItem("email") || "").trim();
  const role = (localStorage.getItem("role") || "").trim();
  const login = (localStorage.getItem("login") || "").trim();

  if (email) headers["X-User-Email"] = email;
  if (role) headers["X-User-Role"] = role;
  if (login) headers["X-User-Login"] = login;

  return headers;
}

export async function apiFetch(path: string, options: RequestInit = {}) {
  const headers = buildHeaders(options);

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  const text = await res.text();
  let data: any = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const msg = data?.error || "Request failed";
    throw new Error(msg);
  }

  return data;
}