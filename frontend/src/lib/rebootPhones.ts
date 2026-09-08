import { fetchRebootDirectory } from "./rebootDirectory";

function pickPhoneFromAttrs(attrs: any): string {
  if (!attrs) return "";
  let source = attrs;
  if (typeof source === "string") {
    try {
      source = JSON.parse(source);
    } catch {
      return "";
    }
  }
  if (typeof source === "object" && !Array.isArray(source)) {
    const candidates = [source.PhoneNumber, source.phoneNumber, source.phone, source.Phone];
    const found = candidates.find((v) => typeof v === "string" && v.trim());
    if (found) return String(found).trim();
  }
  return "";
}

export async function fetchRebootPhones(logins: string[]): Promise<Record<string, string>> {
  const jwt = (localStorage.getItem("jwt") || "").trim();
  const uniqueLogins = Array.from(
    new Set(
      (logins || [])
        .map((login) => String(login || "").trim())
        .filter(Boolean)
    )
  );

  if (!jwt || uniqueLogins.length === 0) return {};

  const query = `
    query UserPhones($logins: [String!]) {
      user(where: { login: { _in: $logins } }) {
        login
        number: attrs(path: "PhoneNumber")
        attrs
      }
    }
  `;

  const res = await fetchRebootDirectory("phones", query, { logins: uniqueLogins });

  const json = await res.json().catch(() => null);
  if (!res.ok || json?.errors?.length) {
    throw new Error(json?.error || json?.errors?.[0]?.message || "Failed to load Reboot phones.");
  }

  const out: Record<string, string> = {};
  for (const row of json?.data?.user || []) {
    const login = String(row?.login || "").trim().toLowerCase();
    if (!login) continue;
    const phone = String(row?.number || "").trim() || pickPhoneFromAttrs(row?.attrs);
    if (phone) out[login] = phone;
  }
  return out;
}
