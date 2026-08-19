import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const mapPageUrl = new URL("../app/map/page.tsx", import.meta.url);

test("the public map uses a direct raster source and cannot load forever", async () => {
  const mapPage = await readFile(mapPageUrl, "utf8");

  assert.match(mapPage, /https:\/\/tile\.openstreetmap\.org\/\{z\}\/\{x\}\/\{y\}\.png/);
  assert.match(mapPage, /type: "raster"/);
  assert.match(mapPage, /setMapReady\(true\)/);
  assert.match(mapPage, /window\.setTimeout/);
  assert.doesNotMatch(mapPage, /tiles\.openfreemap\.org\/styles\/positron/);
});
