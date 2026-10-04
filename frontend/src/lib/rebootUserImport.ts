import { fetchRebootDirectory } from "./rebootDirectory";
export type RebootCandidate = { nickname:string; email:string; full_name:string; cohort:string };
async function fetchRebootUserByLogin(login: string): Promise<RebootCandidate | null> {
  const jwt = (localStorage.getItem("jwt") || "").trim();
  if (!jwt) throw new Error("Missing Reboot session.");

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

  const res = await fetchRebootDirectory("user", query, { login });

  const json = await res.json().catch(() => null);
  if (!res.ok || json?.errors?.length) {
    throw new Error(json?.error || json?.errors?.[0]?.message || "Failed to load Reboot user.");
  }

  const user = json?.data?.user?.[0];
  if (!user?.email) return null;

  const fullName =
    `${String(user?.firstName || "").trim()} ${String(user?.lastName || "").trim()}`.trim() ||
    String(user?.login || "").trim() ||
    login;
  const userEventIDs = (json?.data?.myModuleEvents || [])
    .map((row: any) => Number(row?.eventId))
    .filter((value: number) => Number.isFinite(value))
    .sort((a: number, b: number) => a - b);
  const userEventID = userEventIDs.length ? userEventIDs[userEventIDs.length - 1] : 0;
  const moduleEventIDs = (json?.data?.allModuleCohortEvents || [])
    .map((row: any) => Number(row?.eventId))
    .filter((value: number) => Number.isFinite(value))
    .sort((a: number, b: number) => a - b)
    .filter((value: number, index: number, all: number[]) => index === 0 || value !== all[index - 1]);

  let cohort = "";
  if (userEventID > 0 && moduleEventIDs.length > 0) {
    const exactIndex = moduleEventIDs.indexOf(userEventID);
    cohort =
      exactIndex >= 0
        ? `Cohort ${exactIndex + 1}`
        : `Cohort ${moduleEventIDs.filter((id: number) => id < userEventID).length + 1}`;
  }

  return {
    nickname: String(user?.login || login).trim(),
    email: String(user?.email || "").trim().toLowerCase(),
    full_name: fullName,
    cohort,
  };
}

export async function searchRebootUsers(query: string): Promise<RebootCandidate[]> {
  const jwt = (localStorage.getItem("jwt") || "").trim();
  if (!jwt) throw new Error("Missing Reboot session.");

  const like = `%${query.trim()}%`;
  const gql = `
    query SearchUsersForTaskFlow($like: String!) {
      user(
        where: {
          _or: [
            { login: { _ilike: $like } }
            { email: { _ilike: $like } }
            { firstName: { _ilike: $like } }
            { lastName: { _ilike: $like } }
          ]
        }
        limit: 8
        order_by: [{ login: asc }]
      ) {
        login
        email
        firstName
        lastName
      }
    }
  `;

  const res = await fetchRebootDirectory("search", gql, { like });
  const json = await res.json().catch(() => null);
  if (!res.ok || json?.errors?.length) {
    throw new Error(json?.error || json?.errors?.[0]?.message || "Failed to search Reboot users.");
  }

  const seen = new Set<string>();
  const baseUsers = (json?.data?.user || [])
    .map((u: any) => {
      const nickname = String(u?.login || "").trim();
      const email = String(u?.email || "").trim().toLowerCase();
      const full_name = `${String(u?.firstName || "").trim()} ${String(u?.lastName || "").trim()}`.trim() || nickname;
      return {
        nickname,
        email,
        full_name,
        cohort: "",
      } satisfies RebootCandidate;
    })
    .filter((u: RebootCandidate) => {
      const key = `${u.nickname.toLowerCase()}::${u.email.toLowerCase()}`;
      if (!u.nickname || !u.email || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  const enriched = await Promise.all(
    baseUsers.map(async (user: RebootCandidate) => {
      try {
        return (await fetchRebootUserByLogin(user.nickname)) || user;
      } catch {
        return user;
      }
    })
  );

  return enriched;
}
