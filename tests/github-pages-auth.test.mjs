import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const runtimeUrl = new URL("../github-pages/runtime.ts", import.meta.url);
const myPageUrl = new URL("../app/my/page.tsx", import.meta.url);
const siteHeaderUrl = new URL("../app/components/site-header.tsx", import.meta.url);
const manageStaffUrl = new URL("../supabase/functions/manage-staff/index.ts", import.meta.url);

test("GitHub Pages authentication uses the shared Supabase session", async () => {
  const runtime = await readFile(runtimeUrl, "utf8");

  assert.match(runtime, /supabase\.auth\.getSession\(\)/);
  assert.match(runtime, /supabase\.auth\.signInWithPassword/);
  assert.match(runtime, /supabase\.auth\.signOut\(\)/);
  assert.match(runtime, /window\.localStorage\.removeItem\(key\)/);
  assert.doesNotMatch(runtime, /window\.localStorage\.setItem\("jikeoro-pages-role"/);
});

test("research administrators can create staff accounts with role-based access", async () => {
  const runtime = await readFile(runtimeUrl, "utf8");
  const adminPage = await readFile(new URL("../app/admin/page.tsx", import.meta.url), "utf8");
  const adminLogin = await readFile(new URL("../app/admin/login/page.tsx", import.meta.url), "utf8");
  const manageStaff = await readFile(manageStaffUrl, "utf8");

  assert.match(runtime, /\/api\/auth\/admin-login/);
  assert.match(runtime, /\/api\/admin\/accounts/);
  assert.match(runtime, /supabase\.functions\.invoke\("manage-staff"/);
  assert.match(adminPage, /계정·권한 관리/);
  assert.match(adminPage, /로그인 이메일/);
  assert.match(adminPage, /초기 비밀번호/);
  assert.match(adminPage, /minLength=\{8\}/);
  assert.match(adminPage, /연구원 관리자/);
  assert.match(adminPage, /기관 담당자/);
  assert.match(adminPage, /filter === "all" \? "active"/);
  assert.match(adminPage, /<small>전체<\/small>/);
  assert.match(adminLogin, /운영 콘솔 로그인/);
  assert.doesNotMatch(adminLogin, /프로토타입 빠른 체험/);
  assert.match(manageStaff, /callerProfile\?\.role !== "research_admin"/);
  assert.match(manageStaff, /auth\.admin\.createUser/);
  assert.match(manageStaff, /auth\.admin\.updateUserById/);
  assert.match(manageStaff, /현재 로그인한 관리자 본인의 권한을 낮추거나 사용 중지할 수 없습니다/);
});

test("member credentials are handled by Supabase Auth instead of browser storage", async () => {
  const runtime = await readFile(runtimeUrl, "utf8");

  assert.match(runtime, /\/api\/auth\/register/);
  assert.match(runtime, /\/api\/auth\/login/);
  assert.match(runtime, /supabase\.auth\.signUp/);
  assert.match(runtime, /supabase\.auth\.signInWithPassword/);
  assert.doesNotMatch(runtime, /passwordHash/);
  assert.doesNotMatch(runtime, /window\.localStorage\.setItem\([^\n]*password/);
});

test("member participation starts empty and is derived from that member's reports", async () => {
  const myPage = await readFile(myPageUrl, "utf8");

  assert.match(myPage, /reports\.length \* 100/);
  assert.match(myPage, /lightingReportsThisMonth >= 3/);
  assert.match(myPage, /weekStarts\.length \? 1 : 0/);
});

test("the role-specific navigation item is rendered in the shared account menu position", async () => {
  const siteHeader = await readFile(siteHeaderUrl, "utf8");

  assert.match(siteHeader, /sessionRole === "member" && <a[^>]+>내 기록<\/a>/);
  assert.match(siteHeader, /sessionRole === "research_admin" && <a[^>]+>관리자 콘솔<\/a>/);
  assert.match(siteHeader, /sessionRole === "agency_staff" && <a[^>]+>기관 콘솔<\/a>/);
});

test("administrator and agency report details include evidence and field context", async () => {
  const runtime = await readFile(runtimeUrl, "utf8");
  const adminPage = await readFile(new URL("../app/admin/page.tsx", import.meta.url), "utf8");
  const reportsApi = await readFile(new URL("../app/api/reports/route.ts", import.meta.url), "utf8");

  assert.match(adminPage, /사진·영상·음성/);
  assert.match(adminPage, /readReportMedia/);
  assert.match(adminPage, /제보 시각/);
  assert.match(adminPage, /접수 시각/);
  assert.match(adminPage, /describeWeather/);
  assert.match(adminPage, /위치 좌표/);
  assert.match(runtime, /observed_at/);
  assert.match(runtime, /weather:/);
  assert.match(runtime, /media:/);
  assert.match(reportsApi, /weather_json/);
  assert.match(reportsApi, /media_json/);
});
