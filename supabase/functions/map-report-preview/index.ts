import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { ImageMagick, initializeImageMagick, MagickFormat } from "npm:@imagemagick/magick-wasm@0.0.46";

// Public, reduced-size previews only. Never return original files, paths or user IDs.
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
let ready: Promise<void> | undefined;
const previews = new Map<string, Uint8Array>();

async function resize(bytes: Uint8Array, detail: boolean): Promise<Uint8Array> {
  ready ??= (async () => {
    const wasm = await Deno.readFile(new URL(import.meta.resolve("npm:@imagemagick/magick-wasm@0.0.46/magick.wasm")));
    await initializeImageMagick(wasm);
  })();
  await ready;
  return ImageMagick.read(bytes, (image) => {
    image.autoOrient();
    const scale = Math.min(1, (detail ? 1920 : 280) / image.width, (detail ? 1920 : 208) / image.height);
    image.resize(Math.max(1, Math.round(image.width * scale)), Math.max(1, Math.round(image.height * scale)));
    image.strip(); // Includes EXIF/GPS metadata.
    image.quality = detail ? 88 : 75;
    return image.write(MagickFormat.Jpeg, (data) => Uint8Array.from(data));
  });
}

function empty(status = 404) {
  return new Response(null, { status, headers: { ...cors, "Cache-Control": "no-store" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "GET") return empty(405);
  const params = new URL(req.url).searchParams;
  const reportId = params.get("reportId") ?? "";
  const view = params.get("view") ?? "thumbnail";
  if (view !== "thumbnail" && view !== "detail") return empty(400);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reportId)) return empty(400);

  try {
    // Match the public map's eligibility; recheck before using a cached preview.
    const { data: media, error } = await admin.rpc("get_map_report_preview_sources", { p_report_id: reportId });
    if (error) throw error;
    for (const item of media ?? []) {
      // Bound downloads; a missing/unsupported attachment must not hide the next photo.
      if (item.size_bytes > 20 * 1024 * 1024) continue;
      const cacheKey = `${item.id}:${view}`;
      let preview = previews.get(cacheKey);
      if (!preview) {
        try {
          const { data: blob, error: downloadError } = await admin.storage.from("report-media").download(item.storage_path);
          if (downloadError || !blob || blob.size > 20 * 1024 * 1024) continue;
          preview = await resize(new Uint8Array(await blob.arrayBuffer()), view === "detail");
          if (previews.size >= 32) previews.delete(previews.keys().next().value!);
          previews.set(cacheKey, preview);
        } catch (error) {
          console.warn("Map preview could not be generated:", error instanceof Error ? error.message : "unknown error");
          continue;
        }
      }
      return new Response(Uint8Array.from(preview), {
        headers: { ...cors, "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=300", "X-Content-Type-Options": "nosniff" },
      });
    }
    return empty();
  } catch (error) {
    console.error("Map preview lookup failed:", error instanceof Error ? error.message : JSON.stringify(error));
    return empty(503);
  }
});
