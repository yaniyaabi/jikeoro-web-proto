import { ensureDatabase } from "../../../../db";
import { createDemoSessionCookie, type UserRole } from "../../../lib/auth";

const allowedRoles: UserRole[] = ["member", "research_admin", "agency_staff"];

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { role?: UserRole } | null;
  if (!body?.role || !allowedRoles.includes(body.role)) {
    return Response.json({ error: "지원하지 않는 역할입니다." }, { status: 400 });
  }
  await ensureDatabase();
  return Response.json(
    { ok: true, role: body.role },
    { headers: { "Set-Cookie": createDemoSessionCookie(body.role) } },
  );
}
