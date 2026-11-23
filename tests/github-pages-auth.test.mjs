import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
const myPageUrl=new URL('../app/my/page.tsx',import.meta.url);
const siteHeaderUrl=new URL('../app/components/site-header.tsx',import.meta.url);
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
test('resident mascot and evidence controls remain available',async()=>{
  const avatar=await readFile(new URL('../app/components/resident-avatar.tsx',import.meta.url),'utf8');
  const admin=await readFile(new URL('../app/admin/page.tsx',import.meta.url),'utf8');
  const login=await readFile(new URL('../app/login/page.tsx',import.meta.url),'utf8');
  assert.match(avatar,/jikeoro-logo-3d-v8\.png/);
  assert.doesNotMatch(login,/ResidentAvatarBuilder|주민 캐릭터 선택/);
  for(const label of ['사진·영상·음성','제보 시각','접수 시각','위치 좌표'])assert.ok(admin.includes(label));
});
