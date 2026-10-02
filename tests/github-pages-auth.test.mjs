import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const runtimeUrl = new URL("../github-pages/runtime.ts", import.meta.url);
const myPageUrl = new URL("../app/my/page.tsx", import.meta.url);
const siteHeaderUrl = new URL("../app/components/site-header.tsx", import.meta.url);

test("GitHub Pages demo authentication requires an explicit login per tab", async () => {
  const runtime = await readFile(runtimeUrl, "utf8");

  assert.match(runtime, /window\.localStorage\.removeItem\(ROLE_KEY\)/);
  assert.match(runtime, /window\.sessionStorage\.getItem\(ROLE_KEY\)/);
  assert.match(runtime, /window\.sessionStorage\.setItem\(ROLE_KEY, role\)/);
  assert.match(runtime, /window\.sessionStorage\.removeItem\(ROLE_KEY\)/);
  assert.doesNotMatch(runtime, /window\.localStorage\.setItem\(ROLE_KEY/);
  assert.doesNotMatch(runtime, /const role = window\.localStorage\.getItem\(ROLE_KEY\)/);
});

test("research administrators can create staff accounts with role-based access", async () => {
  const runtime = await readFile(runtimeUrl, "utf8");
  const adminPage = await readFile(new URL("../app/admin/page.tsx", import.meta.url), "utf8");
  const adminLogin = await readFile(new URL("../app/admin/login/page.tsx", import.meta.url), "utf8");

  assert.match(runtime, /\/api\/auth\/admin-login/);
  assert.match(runtime, /\/api\/admin\/accounts/);
  assert.match(runtime, /role !== "research_admin"/);
  assert.match(runtime, /candidate\.loginId\.toLowerCase\(\) === loginId/);
  assert.match(runtime, /passwordHash: await hashPassword/);
  assert.match(adminPage, /계정·권한 관리/);
  assert.match(adminPage, /로그인 아이디/);
  assert.match(adminPage, /로그인 비밀번호/);
  assert.match(adminPage, /연구원 관리자/);
  assert.match(adminPage, /기관 담당자/);
  assert.match(adminPage, /filter === "all" \? "active"/);
  assert.match(adminPage, /<small>전체<\/small>/);
  assert.match(adminLogin, /운영 콘솔 로그인/);
  assert.doesNotMatch(adminLogin, /프로토타입 빠른 체험/);
  assert.match(runtime, /loginId: "yaniyaabi@kaist\.ac\.kr"/);
  assert.match(runtime, /loginId: "seoul@kaist\.ac\.kr"/);
  assert.match(runtime, /body\.role !== "member"/);
});

test("prototype member accounts store a verifier instead of the raw password", async () => {
  const runtime = await readFile(runtimeUrl, "utf8");

  assert.match(runtime, /\/api\/auth\/register/);
  assert.match(runtime, /\/api\/auth\/login/);
  assert.match(runtime, /name: "PBKDF2"/);
  assert.match(runtime, /passwordHash: await hashPassword/);
  assert.match(runtime, /window\.sessionStorage\.setItem\(USER_KEY/);
  assert.doesNotMatch(runtime, /password:\s*password/);
});

test("member participation starts empty and is derived from that member's reports", async () => {
  const myPage = await readFile(myPageUrl, "utf8");

  assert.match(myPage, /reports\.length \* 100/);
  assert.match(myPage, /reports\.length >= 1/);
  assert.match(myPage, /reports\.length >= 3/);
  assert.match(myPage, /아직 모은 배지가 없어요/);
  assert.doesNotMatch(myPage, /<b>420<\/b>/);
  assert.doesNotMatch(myPage, /<b>4주<\/b>/);
  assert.doesNotMatch(myPage, /width: "66%"/);
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
