import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const runtimeUrl = new URL("../github-pages/runtime.ts", import.meta.url);

test("GitHub Pages demo authentication requires an explicit login per tab", async () => {
  const runtime = await readFile(runtimeUrl, "utf8");

  assert.match(runtime, /window\.localStorage\.removeItem\(ROLE_KEY\)/);
  assert.match(runtime, /window\.sessionStorage\.getItem\(ROLE_KEY\)/);
  assert.match(runtime, /window\.sessionStorage\.setItem\(ROLE_KEY, body\.role \?\? "member"\)/);
  assert.match(runtime, /window\.sessionStorage\.removeItem\(ROLE_KEY\)/);
  assert.doesNotMatch(runtime, /window\.localStorage\.setItem\(ROLE_KEY/);
  assert.doesNotMatch(runtime, /const role = window\.localStorage\.getItem\(ROLE_KEY\)/);
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
