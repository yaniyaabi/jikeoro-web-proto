export type UserRole = "member" | "research_admin" | "agency_staff";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  agency: string | null;
};

const COOKIE_NAME = "jikeoro_demo_session";

const demoSessions: Record<string, SessionUser> = {
  "member-demo-token": { id: "demo-member", name: "김지킴", email: "member@jikeoro.local", role: "member", agency: null },
  "admin-demo-token": { id: "demo-admin", name: "배수현 연구원", email: "research@jikeoro.local", role: "research_admin", agency: "지켜路 연구팀" },
  "agency-demo-token": { id: "demo-agency", name: "박성동 담당자", email: "road@sd.go.kr", role: "agency_staff", agency: "성동구청 도로과" },
};

const roleTokens: Record<UserRole, string> = {
  member: "member-demo-token",
  research_admin: "admin-demo-token",
  agency_staff: "agency-demo-token",
};

function readCookie(request: Request, name: string) {
  const cookies = request.headers.get("cookie") ?? "";
  const item = cookies.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return item ? decodeURIComponent(item.slice(name.length + 1)) : null;
}

export function getSessionUser(request: Request) {
  const token = readCookie(request, COOKIE_NAME);
  return token ? demoSessions[token] ?? null : null;
}

export function createDemoSessionCookie(role: UserRole) {
  return `${COOKIE_NAME}=${encodeURIComponent(roleTokens[role])}; Path=/; HttpOnly; SameSite=Lax; Max-Age=28800`;
}

export function clearDemoSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function isAdminRole(role: UserRole) {
  return role === "research_admin" || role === "agency_staff";
}
