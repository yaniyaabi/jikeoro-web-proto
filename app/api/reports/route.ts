import { ensureDatabase, getD1 } from "../../../db";
import { getSessionUser } from "../../lib/auth";

type NewReportBody = {
  category?: string;
  title?: string;
  description?: string;
  latitude?: number | null;
  longitude?: number | null;
  accuracy?: number | null;
  address?: string;
  placeDescription?: string;
};

export async function GET(request: Request) {
  const user = getSessionUser(request);
  if (!user) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  await ensureDatabase();
  const result = await getD1().prepare(
    `SELECT id, category AS type, title, description, COALESCE(address, place_description, '위치 확인 중') AS place,
      created_at AS createdAt, status, assigned_agency AS department, COALESCE(response, '기록이 접수되어 내용을 확인하고 있어요.') AS response
     FROM reports WHERE user_id = ? ORDER BY created_at DESC`,
  ).bind(user.id).all();
  return Response.json({ reports: result.results });
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
  const title = body.title?.trim() || `${body.category} 위험요소를 발견했어요`;
  const description = body.description?.trim() || "주민이 현장에서 위험요소를 기록했습니다.";
  const d1 = getD1();
  await d1.batch([
    d1.prepare(
      `INSERT INTO reports (id,user_id,category,title,description,latitude,longitude,accuracy,address,place_description,status,assigned_agency,response,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(id, user?.role === "member" ? user.id : null, body.category, title, description, body.latitude ?? null, body.longitude ?? null, body.accuracy ?? null, body.address?.trim() || null, body.placeDescription?.trim() || null, "received", null, "기록이 안전하게 접수됐어요. 위치와 내용을 확인한 뒤 담당 기관을 연결할게요.", now, now),
    d1.prepare(`INSERT INTO report_status_history (report_id,status,note,actor_user_id,created_at) VALUES (?,?,?,?,?)`).bind(id, "received", "주민 제보가 접수되었습니다.", user?.id ?? null, now),
  ]);
  return Response.json({ ok: true, id, linkedToAccount: user?.role === "member" }, { status: 201 });
}
