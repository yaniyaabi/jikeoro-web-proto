import { ensureDatabase, getD1 } from "../../../../db";
import { getSessionUser, isAdminRole } from "../../../lib/auth";

const validStatuses = ["received", "review", "action", "completed"];

export async function GET(request: Request) {
  const user = getSessionUser(request);
  if (!user || !isAdminRole(user.role)) return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  await ensureDatabase();
  const d1 = getD1();
  const query = user.role === "agency_staff"
    ? d1.prepare(`SELECT r.*, u.name AS reporter_name FROM reports r LEFT JOIN users u ON u.id = r.user_id WHERE r.assigned_agency = ? ORDER BY r.updated_at DESC`).bind(user.agency)
    : d1.prepare(`SELECT r.*, u.name AS reporter_name FROM reports r LEFT JOIN users u ON u.id = r.user_id ORDER BY r.updated_at DESC`);
  const result = await query.all();
  return Response.json({ user, reports: result.results });
}

export async function PATCH(request: Request) {
  const user = getSessionUser(request);
  if (!user || !isAdminRole(user.role)) return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  const body = await request.json().catch(() => null) as { id?: string; status?: string; assignedAgency?: string; response?: string } | null;
  if (!body?.id || !body.status || !validStatuses.includes(body.status)) return Response.json({ error: "기록과 처리 상태를 확인해주세요." }, { status: 400 });
  await ensureDatabase();
  const d1 = getD1();
  const current = await d1.prepare(`SELECT assigned_agency FROM reports WHERE id = ?`).bind(body.id).first<{ assigned_agency: string | null }>();
  if (!current) return Response.json({ error: "기록을 찾을 수 없습니다." }, { status: 404 });
  if (user.role === "agency_staff" && current.assigned_agency !== user.agency) return Response.json({ error: "배정된 기록만 처리할 수 있습니다." }, { status: 403 });
  const agency = user.role === "agency_staff" ? user.agency : body.assignedAgency?.trim() || current.assigned_agency;
  const response = body.response?.trim() || "처리 상태가 업데이트되었습니다.";
  const now = new Date().toISOString();
  await d1.batch([
    d1.prepare(`UPDATE reports SET status = ?, assigned_agency = ?, response = ?, updated_at = ? WHERE id = ?`).bind(body.status, agency, response, now, body.id),
    d1.prepare(`INSERT INTO report_status_history (report_id,status,note,actor_user_id,created_at) VALUES (?,?,?,?,?)`).bind(body.id, body.status, response, user.id, now),
    d1.prepare(`INSERT INTO admin_audit_logs (actor_user_id,report_id,action,detail,created_at) VALUES (?,?,?,?,?)`).bind(user.id, body.id, "report_status_update", `${body.status} · ${agency ?? "미배정"}`, now),
  ]);
  return Response.json({ ok: true, updatedAt: now });
}
