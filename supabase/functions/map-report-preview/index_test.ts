// Run: deno test --allow-env --allow-read index_test.ts
import { ImageMagick } from "npm:@imagemagick/magick-wasm@0.0.46";

const id = "00000000-0000-4000-8000-000000000001";
const photo = await Deno.readFile(new URL("../../../public/og.png", import.meta.url));
let eligible = true;
let calls = 0;
let media: { id: string; storage_path: string; size_bytes: number }[] = [];
let handler: (req: Request) => Promise<Response>;
const realServe = Deno.serve;
const realFetch = globalThis.fetch;
Deno.env.set("SUPABASE_URL", "https://example.supabase.co");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-server-key");
Object.defineProperty(Deno, "serve", { value: (fn: typeof handler) => { handler = fn; }, configurable: true });
globalThis.fetch = async (input) => {
  calls++;
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input : input.url);
  if (url.pathname === "/rest/v1/rpc/get_map_report_preview_sources") return Response.json(eligible ? media : []);
  if (url.pathname.endsWith("/missing.png")) return Response.json({ message: "missing" }, { status: 404 });
  if (url.pathname.includes("/storage/")) return new Response(photo, { headers: { "Content-Type": "image/png" } });
  throw new Error(`Unexpected request: ${url.pathname}`);
};
try {
  await import("./index.ts");
} finally {
  Object.defineProperty(Deno, "serve", { value: realServe, configurable: true });
}

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

Deno.test("public preview rejects arbitrary paths and unsupported methods before reading storage", async () => {
  const before = calls;
  assert((await handler(new Request("https://example.test/?reportId=../../private"))).status === 400, "Invalid ID accepted");
  assert((await handler(new Request(`https://example.test/?reportId=${id}`, { method: "POST" }))).status === 405, "POST accepted");
  assert((await handler(new Request(`https://example.test/?reportId=${id}&view=original`))).status === 400, "Arbitrary original mode accepted");
  assert((await handler(new Request(`https://example.test/?reportId=${id}&view=detail`))).status === 400, "Removed enlargement mode accepted");
  assert(calls === before, "Invalid input queried private data");
});

Deno.test("only map reports are eligible, and broken photos do not hide a valid photo", async () => {
  eligible = false;
  assert((await handler(new Request(`https://example.test/?reportId=${id}`))).status === 404, "Nonpublic report exposed");
  eligible = true;
  media = [{ id: "missing", storage_path: "missing.png", size_bytes: 100 }, { id: "photo", storage_path: "photo.png", size_bytes: photo.length }];
  const response = await handler(new Request(`https://example.test/?reportId=${id}`));
  assert(response.status === 200, "Valid photo was hidden");
  assert(response.headers.get("Content-Type") === "image/jpeg", "Original format returned");
  const bytes = new Uint8Array(await response.arrayBuffer());
  // The same initialized WASM module is shared with the handler.
  ImageMagick.read(bytes, (image) => {
    assert(image.width <= 280 && image.height <= 208, "Full-size original exposed");
    assert(!image.getProfile("exif"), "EXIF metadata exposed");
  });
  assert(bytes.length < photo.length, "Preview was not reduced");
  eligible = false;
  assert((await handler(new Request(`https://example.test/?reportId=${id}`))).status === 404, "Cached deleted report remained accessible");
  globalThis.fetch = realFetch;
});
