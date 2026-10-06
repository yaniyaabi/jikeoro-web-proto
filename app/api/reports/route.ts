import { ensureDatabase, getD1 } from "../../../db";
import { getSessionUser } from "../../lib/auth";
import { normalizeHazardCategory, normalizeHazardDetail } from "../../lib/hazard-categories";

type NewReportBody = {
  category?: string;
  subcategory?: string;
  title?: string;
  description?: string;
  latitude?: number | null;
  longitude?: number | null;
  accuracy?: number | null;
  address?: string;
  placeDescription?: string;
  observedAt?: string;
  weather?: { temperature?: number; code?: number; observedAt?: string } | null;
  media?: Array<{ kind?: string; name?: string; type?: string; size?: number }>;
};

function parseStoredJson(value: unknown) {
  if (typeof value !== "string" || !value) return value ?? null;
  try { return JSON.parse(value); } catch { return null; }
}

export async function GET(request: Request) {
  const user = getSessionUser(request);
  if (!user) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  await ensureDatabase();
  const result = await getD1().prepare(
    `SELECT id, category AS type, subcategory, title, description, COALESCE(address, place_description, '위치 확인 중') AS place,
      latitude, longitude, accuracy, created_at AS createdAt, COALESCE(observed_at, created_at) AS observedAt,
      weather_json AS weather, media_json AS media, status, assigned_agency AS department,
      COALESCE(response, '기록이 접수되어 내용을 확인하고 있어요.') AS response
     FROM reports WHERE user_id = ? ORDER BY created_at DESC`,
  ).bind(user.id).all();
  return Response.json({ reports: result.results.map((report) => ({
    ...report,
    weather: parseStoredJson(report.weather),
    media: parseStoredJson(report.media) ?? [],
    mediaCount: Array.isArray(parseStoredJson(report.media)) ? parseStoredJson(report.media).length : 0,
  })) });
}

export async function DELETE(request: Request) {
  const user = getSessionUser(request);
  if (!user || user.role !== "member") return Response.json({ error: "회원 로그인이 필요합니다." }, { status: 401 });
  const body = await request.json().catch(() => null) as { id?: string } | null;
  if (!body?.id) return Response.json({ error: "삭제할 기록이 없습니다." }, { status: 400 });

  await ensureDatabase();
  const d1 = getD1();
  const report = await d1.prepare(`SELECT id FROM reports WHERE id = ? AND user_id = ?`).bind(body.id, user.id).first<{ id: string }>();
  if (!report) return Response.json({ error: "기록을 찾을 수 없거나 삭제 권한이 없습니다." }, { status: 404 });

  await d1.batch([
    d1.prepare(`DELETE FROM admin_audit_logs WHERE report_id = ?`).bind(body.id),
    d1.prepare(`DELETE FROM report_status_history WHERE report_id = ?`).bind(body.id),
    d1.prepare(`DELETE FROM reports WHERE id = ? AND user_id = ?`).bind(body.id, user.id),
  ]);
  return Response.json({ ok: true });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as NewReportBody | null;
  if (!body?.category || (!body.address?.trim() && !body.placeDescription?.trim() && (body.latitude == null || body.longitude == null))) {
    return Response.json({ error: "위험 유형과 위치정보가 필요합니다." }, { status: 400 });
  }
  await ensureDatabase();
  const user = getSessionUser(request);
  const id = `rpt-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const category = normalizeHazardCategory(body.category);
  const subcategory = normalizeHazardDetail(category, body.subcategory);
  if (!subcategory) return Response.json({ error: "세부 유형을 선택해주세요." }, { status: 400 });
  const title = body.title?.trim() || `${category} 위험요소를 발견했어요`;
  const description = body.description?.trim() || "주민이 현장에서 위험요소를 기록했습니다.";
  const d1 = getD1();
  await d1.batch([
    d1.prepare(
      `INSERT INTO reports (id,user_id,category,subcategory,title,description,latitude,longitude,accuracy,address,place_description,status,assigned_agency,response,observed_at,weather_json,media_json,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(id, user?.role === "member" ? user.id : null, category, subcategory, title, description, body.latitude ?? null, body.longitude ?? null, body.accuracy ?? null, body.address?.trim() || null, body.placeDescription?.trim() || null, "received", null, "기록이 안전하게 접수됐어요. 위치와 내용을 확인한 뒤 담당 기관을 연결할게요.", body.observedAt || now, body.weather ? JSON.stringify(body.weather) : null, Array.isArray(body.media) ? JSON.stringify(body.media) : "[]", now, now),
    d1.prepare(`INSERT INTO report_status_history (report_id,status,note,actor_user_id,created_at) VALUES (?,?,?,?,?)`).bind(id, "received", "주민 제보가 접수되었습니다.", user?.id ?? null, now),
  ]);
  return Response.json({ ok: true, id, linkedToAccount: user?.role === "member" }, { status: 201 });
}
