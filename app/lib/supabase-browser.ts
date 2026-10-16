import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "https://opgzkyeccdkfqdvbmecja.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable__21K9olI2G4YBCc_YFX82g_yvNPOi6w";
const capturedFetch = globalThis.fetch.bind(globalThis);

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  global: { fetch: capturedFetch },
});

export type SupabaseMedia = {
  id: string;
  reportId: string;
  kind: "image" | "video" | "audio";
  name: string;
  type: string;
  size: number;
  blob: Blob;
};

type UploadAttachment = {
  kind: "image" | "video" | "audio";
  file: File;
};

function extension(name: string) {
  return name.match(/\.[a-z0-9]{1,8}$/i)?.[0].toLowerCase() ?? "";
}

export async function uploadReportMedia(reportId: string, attachments: UploadAttachment[]) {
  if (!attachments.length) return;
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) throw new Error("로그인이 필요합니다.");

  const uploadedPaths: string[] = [];
  try {
    const rows = [];
    for (const attachment of attachments) {
      const path = `${userId}/${reportId}/${crypto.randomUUID()}${extension(attachment.file.name)}`;
      const contentType = attachment.file.type.split(";")[0] || "application/octet-stream";
      const { error: uploadError } = await supabase.storage
        .from("report-media")
        .upload(path, attachment.file, { contentType, upsert: false });
      if (uploadError) throw uploadError;
      uploadedPaths.push(path);
      rows.push({
        report_id: reportId,
        user_id: userId,
        kind: attachment.kind,
        storage_path: path,
        original_name: attachment.file.name,
        mime_type: contentType,
        size_bytes: attachment.file.size,
      });
    }
    const { error: metadataError } = await supabase.from("report_media").insert(rows);
    if (metadataError) throw metadataError;
  } catch (error) {
    if (uploadedPaths.length) await supabase.storage.from("report-media").remove(uploadedPaths);
    throw error;
  }
}

export async function downloadReportMedia(reportId: string): Promise<SupabaseMedia[]> {
  const { data, error } = await supabase
    .from("report_media")
    .select("id,report_id,kind,original_name,mime_type,size_bytes,storage_path")
    .eq("report_id", reportId)
    .order("created_at", { ascending: true });
  if (error) throw error;

  const results = await Promise.all((data ?? []).map(async (item) => {
    const { data: blob, error: downloadError } = await supabase.storage.from("report-media").download(item.storage_path);
    if (downloadError) throw downloadError;
    return {
      id: item.id,
      reportId: item.report_id,
      kind: item.kind as SupabaseMedia["kind"],
      name: item.original_name,
      type: item.mime_type,
      size: item.size_bytes,
      blob,
    };
  }));
  return results;
}

export async function removeReportFiles(reportId: string) {
  const { data, error } = await supabase.from("report_media").select("storage_path").eq("report_id", reportId);
  if (error) throw error;
  const paths = (data ?? []).map((item) => item.storage_path);
  if (!paths.length) return;
  const { error: removeError } = await supabase.storage.from("report-media").remove(paths);
  if (removeError) throw removeError;
}
