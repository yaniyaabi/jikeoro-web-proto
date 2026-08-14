import { ensureDatabase, getD1 } from "../../../../db";

export async function GET() {
  await ensureDatabase();
  const result = await getD1().prepare(
    `SELECT id, category AS type, title, description,
      latitude, longitude, accuracy,
      COALESCE(address, place_description, '성수동 현장 기록') AS place,
      status, created_at AS createdAt
     FROM reports
     WHERE latitude IS NOT NULL AND longitude IS NOT NULL
     ORDER BY created_at DESC`,
  ).all();

  return Response.json({ reports: result.results });
}
