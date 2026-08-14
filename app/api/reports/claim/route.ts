import { ensureDatabase, getD1 } from "../../../../db";
import { getSessionUser } from "../../../lib/auth";

export async function POST(request: Request) {
  const user = getSessionUser(request);
  if (!user || user.role !== "member") return Response.json({ error: "회원 로그인이 필요합니다." }, { status: 401 });
  const body = await request.json().catch(() => null) as { id?: string } | null;
  if (!body?.id) return Response.json({ error: "연결할 기록이 없습니다." }, { status: 400 });
  await ensureDatabase();
  const d1 = getD1();
  const existing = await d1.prepare(`SELECT user_id FROM reports WHERE id = ?`).bind(body.id).first<{ user_id: string | null }>();
  if (!existing) return Response.json({ error: "기록을 찾을 수 없습니다." }, { status: 404 });
  if (existing.user_id && existing.user_id !== user.id) return Response.json({ error: "다른 계정의 기록입니다." }, { status: 403 });
  if (!existing.user_id) {
    await d1.prepare(`UPDATE reports SET user_id = ?, updated_at = ? WHERE id = ? AND user_id IS NULL`).bind(user.id, new Date().toISOString(), body.id).run();
  }
  return Response.json({ ok: true });
}
