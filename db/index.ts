import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getD1() {
  if (!env.DB) {
    throw new Error("Cloudflare D1 binding `DB` is unavailable.");
  }
  return env.DB;
}

export function getDb() {
  return drizzle(getD1(), { schema });
}

let initialization: Promise<void> | null = null;

export function ensureDatabase() {
  if (initialization) return initialization;
  const d1 = getD1();
  initialization = (async () => {
    const schemaStatements = [
      `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY NOT NULL, email TEXT NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('member','research_admin','agency_staff')), agency TEXT, created_at TEXT NOT NULL)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email)`,
      `CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY NOT NULL, user_id TEXT REFERENCES users(id), category TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL, latitude REAL, longitude REAL, accuracy REAL, address TEXT, place_description TEXT, status TEXT NOT NULL CHECK(status IN ('received','review','action','completed')), assigned_agency TEXT, response TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
      `CREATE INDEX IF NOT EXISTS idx_reports_user_id ON reports(user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_reports_status_updated_at ON reports(status, updated_at)`,
      `CREATE INDEX IF NOT EXISTS idx_reports_assigned_agency ON reports(assigned_agency)`,
      `CREATE TABLE IF NOT EXISTS report_status_history (id INTEGER PRIMARY KEY AUTOINCREMENT, report_id TEXT NOT NULL REFERENCES reports(id), status TEXT NOT NULL CHECK(status IN ('received','review','action','completed')), note TEXT NOT NULL, actor_user_id TEXT REFERENCES users(id), created_at TEXT NOT NULL)`,
      `CREATE INDEX IF NOT EXISTS idx_report_history_report_created ON report_status_history(report_id, created_at)`,
      `CREATE TABLE IF NOT EXISTS admin_audit_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, actor_user_id TEXT NOT NULL REFERENCES users(id), report_id TEXT REFERENCES reports(id), action TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL)`,
      `CREATE INDEX IF NOT EXISTS idx_admin_audit_actor_created ON admin_audit_logs(actor_user_id, created_at)`,
    ];
    await d1.batch(schemaStatements.map((statement) => d1.prepare(statement)));

    const seedStatements = [
      d1.prepare(`INSERT OR IGNORE INTO users (id,email,name,role,agency,created_at) VALUES (?,?,?,?,?,?)`).bind("demo-member", "member@jikeoro.local", "김지킴", "member", null, "2026-07-01T09:00:00.000Z"),
      d1.prepare(`INSERT INTO users (id,email,name,role,agency,created_at) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name = excluded.name`).bind("demo-admin", "research@jikeoro.local", "배수현 연구원", "research_admin", "지켜路 연구팀", "2026-07-01T09:00:00.000Z"),
      d1.prepare(`INSERT OR IGNORE INTO users (id,email,name,role,agency,created_at) VALUES (?,?,?,?,?,?)`).bind("demo-agency", "road@sd.go.kr", "박성동 담당자", "agency_staff", "성동구청 도로과", "2026-07-01T09:00:00.000Z"),
      d1.prepare(`INSERT OR IGNORE INTO reports (id,user_id,category,title,description,address,place_description,status,assigned_agency,response,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind("rpt-103", "demo-member", "조도", "골목길 가로등 사이가 어두워요", "가로등 사이 구간이 어두워 바닥 상태를 확인하기 어렵습니다.", null, "성수동 연무장길 골목", "review", "성동구청 도로과", "야간 현장 확인 일정이 잡혔어요. 8월 19일까지 결과를 알려드릴게요.", "2026-08-12T11:00:00.000Z", "2026-08-14T02:00:00.000Z"),
      d1.prepare(`INSERT OR IGNORE INTO reports (id,user_id,category,title,description,address,place_description,status,assigned_agency,response,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind("rpt-98", "demo-member", "단차", "약국 앞 보도블록 높이 차이", "보행보조기 바퀴가 걸릴 수 있는 높이 차이가 있습니다.", null, "서울숲길 새봄약국 앞", "action", "성수1가제1동 주민센터", "현장 확인 후 보수 대상으로 분류되어 담당 유지보수팀에 전달됐어요.", "2026-08-04T08:30:00.000Z", "2026-08-10T03:00:00.000Z"),
      d1.prepare(`INSERT OR IGNORE INTO reports (id,user_id,category,title,description,address,place_description,status,assigned_agency,response,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind("rpt-81", "demo-member", "적치물", "상가 입간판이 보행로를 막아요", "입간판 때문에 보행 유효폭이 좁아졌습니다.", null, "성수이로 복합문화공간 앞", "completed", "성수2가제3동 주민센터", "상가 안내와 현장 정비를 마쳤어요. 통행 가능 폭 1.8m를 확보했습니다.", "2026-07-21T06:00:00.000Z", "2026-07-29T05:00:00.000Z"),
    ];
    await d1.batch(seedStatements);
  })();
  return initialization;
}
