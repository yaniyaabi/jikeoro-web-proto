import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  role: text("role", { enum: ["member", "research_admin", "agency_staff"] }).notNull(),
  agency: text("agency"),
  createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("idx_users_email").on(table.email)]);

export const reports = sqliteTable("reports", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id),
  category: text("category").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  latitude: real("latitude"),
  longitude: real("longitude"),
  accuracy: real("accuracy"),
  address: text("address"),
  placeDescription: text("place_description"),
  status: text("status", { enum: ["received", "review", "action", "completed"] }).notNull(),
  assignedAgency: text("assigned_agency"),
  response: text("response"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("idx_reports_user_id").on(table.userId),
  index("idx_reports_status_updated_at").on(table.status, table.updatedAt),
  index("idx_reports_assigned_agency").on(table.assignedAgency),
]);

export const reportStatusHistory = sqliteTable("report_status_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  reportId: text("report_id").notNull().references(() => reports.id),
  status: text("status", { enum: ["received", "review", "action", "completed"] }).notNull(),
  note: text("note").notNull(),
  actorUserId: text("actor_user_id").references(() => users.id),
  createdAt: text("created_at").notNull(),
}, (table) => [index("idx_report_history_report_created").on(table.reportId, table.createdAt)]);

export const adminAuditLogs = sqliteTable("admin_audit_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  actorUserId: text("actor_user_id").notNull().references(() => users.id),
  reportId: text("report_id").references(() => reports.id),
  action: text("action").notNull(),
  detail: text("detail").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [index("idx_admin_audit_actor_created").on(table.actorUserId, table.createdAt)]);
