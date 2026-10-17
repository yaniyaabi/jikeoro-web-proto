import { removeReportFiles, supabase } from "../app/lib/supabase-browser";

const PAGES_PREFIX = "/jikeoro-web-proto";
const LEGACY_KEY_CLEANUP_MARKER = "jikeoro-pages-legacy-keys-cleaned-v1";
const LEGACY_DATABASE_CLEANUP_MARKER = "jikeoro-pages-legacy-database-cleaned-v1";

function clearLegacyBrowserData() {
  if (window.localStorage.getItem(LEGACY_KEY_CLEANUP_MARKER) !== "complete") {
    const legacyKeys = [
      "jikeoro-pages-reports",
      "jikeoro-pages-role",
      "jikeoro-pages-users",
      "jikeoro-pages-staff-users",
      "jikeoro-pages-user",
      "jikeoro-demo-latest-report",
      "jikeoro-pending-report-id",
      "jikeoro-reward-requests-v1",
      "jikeoro-reward-phone",
      "jikeoro-map-likes",
    ];
    legacyKeys.forEach((key) => {
      window.localStorage.removeItem(key);
      window.sessionStorage.removeItem(key);
    });
    window.localStorage.setItem(LEGACY_KEY_CLEANUP_MARKER, "complete");
  }
  if (window.localStorage.getItem(LEGACY_DATABASE_CLEANUP_MARKER) === "complete") return;

  const request = window.indexedDB.deleteDatabase("jikeoro-media");
  request.onsuccess = () => window.localStorage.setItem(LEGACY_DATABASE_CLEANUP_MARKER, "complete");
  request.onerror = () => undefined;
  request.onblocked = () => undefined;
}

clearLegacyBrowserData();

type StaffRole = "research_admin" | "agency_staff";
type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: "member" | StaffRole;
  agency: string | null;
};

type ReportRow = {
  id: string;
  category: string;
  subcategory?: string | null;
  title: string;
  description: string;
  latitude?: number | null;
  longitude?: number | null;
  accuracy?: number | null;
  address?: string | null;
  place_description?: string | null;
  status: "received" | "review" | "action" | "completed";
  assigned_agency?: string | null;
  response?: string | null;
  observed_at?: string | null;
  created_at: string;
  updated_at?: string;
  weather?: unknown;
  media_count?: number | string | null;
  report_media?: Array<{ id?: string; kind: string; original_name?: string; mime_type?: string; size_bytes?: number }>;
  profiles?: { name?: string | null } | null;
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function normalizeCategory(value?: string | null) {
  if (value === "단차" || value === "적치물") return "인도";
  if (value === "포트홀") return "횡단보도";
  if (["인도", "횡단보도", "조도", "날씨 관련 위험", "기타"].includes(value ?? "")) return value as string;
  return "기타";
}

function formatLocation(report: { address?: string | null; place_description?: string | null; latitude?: number | null; longitude?: number | null }) {
  const written = report.address?.trim() || report.place_description?.trim();
  if (written) return written;
  if (report.latitude != null && report.longitude != null) return `지도에서 선택한 위치 (${report.latitude.toFixed(5)}, ${report.longitude.toFixed(5)})`;
  return "위치정보 없음";
}

function authMessage(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("invalid login credentials")) return "이메일 또는 비밀번호가 맞지 않아요.";
  if (normalized.includes("already registered") || normalized.includes("already been registered")) return "이미 가입된 이메일입니다. 로그인해주세요.";
  return "로그인 정보를 처리하지 못했어요. 잠시 후 다시 시도해주세요.";
}

async function manageStaff(body: Record<string, unknown>) {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) return { data: { error: "로그인이 필요합니다." }, status: 401 };

  const { data, error } = await supabase.functions.invoke("manage-staff", {
    body,
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!error) return { data, status: body.action === "create" ? 201 : 200 };

  let message = "운영 계정 관리 요청을 처리하지 못했습니다.";
  let status = 400;
  const context = (error as { context?: Response }).context;
  if (context) {
    status = context.status || status;
    try {
      const payload = await context.json() as { error?: string };
      if (payload.error) message = payload.error;
    } catch {
      // Supabase Functions errors do not always include a JSON response body.
    }
  }
  return { data: { error: message }, status };
}

async function currentUser(): Promise<SessionUser | null> {
  const { data: sessionData } = await supabase.auth.getSession();
  const authUser = sessionData.session?.user;
  if (!authUser) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("name,role,agency")
    .eq("id", authUser.id)
    .maybeSingle();
  const role = profile?.role === "research_admin" || profile?.role === "agency_staff" ? profile.role : "member";
  return {
    id: authUser.id,
    name: profile?.name || String(authUser.user_metadata?.name ?? "").trim() || authUser.email?.split("@")[0] || "지킴이",
    email: authUser.email ?? "",
    role,
    agency: profile?.agency ?? null,
  };
}

function memberReport(row: ReportRow) {
  return {
    id: row.id,
    type: row.category,
    subcategory: row.subcategory,
    title: row.title,
    description: row.description,
    place: formatLocation(row),
    latitude: row.latitude,
    longitude: row.longitude,
    accuracy: row.accuracy,
    status: row.status,
    response: row.response ?? "접수 내용을 확인하고 있습니다.",
    department: row.assigned_agency ?? "지켜路 운영팀",
    createdAt: row.created_at,
    observedAt: row.observed_at ?? row.created_at,
    weather: row.weather ?? null,
    mediaCount: Number(row.media_count ?? row.report_media?.length ?? 0),
  };
}

const networkFetch = window.fetch.bind(window);

window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const url = new URL(raw, window.location.origin);
  if (!url.pathname.startsWith("/api/")) return networkFetch(input, init);

  const method = (init?.method ?? "GET").toUpperCase();
  const body = init?.body ? JSON.parse(String(init.body)) : {};

  if (url.pathname === "/api/auth/session") {
    const user = await currentUser();
    return json({ authenticated: Boolean(user), user });
  }

  if (url.pathname === "/api/auth/register" && method === "POST") {
    const name = String(body.name ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    if (name.length < 2 || !email.includes("@") || password.length < 8) return json({ error: "이름, 이메일, 8자 이상의 비밀번호를 확인해주세요." }, 400);
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { name } } });
    if (error) return json({ error: authMessage(error.message) }, 400);
    if (!data.session) return json({ error: "회원가입은 완료됐지만 바로 로그인하지 못했어요. 이메일 확인 설정을 점검해주세요." }, 409);
    return json({ ok: true, user: await currentUser() }, 201);
  }

  if ((url.pathname === "/api/auth/login" || url.pathname === "/api/auth/admin-login") && method === "POST") {
    const email = String(body.email ?? body.loginId ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return json({ error: authMessage(error.message) }, 401);
    const user = await currentUser();
    if (url.pathname === "/api/auth/admin-login" && user?.role !== "research_admin" && user?.role !== "agency_staff") {
      await supabase.auth.signOut();
      return json({ error: "운영 권한이 없는 계정입니다." }, 403);
    }
    return json({ ok: true, user });
  }

  if (url.pathname === "/api/auth/logout" && method === "POST") {
    await supabase.auth.signOut();
    return json({ ok: true });
  }

  if (url.pathname === "/api/reports" && method === "POST") {
    const user = await currentUser();
    if (!user) return json({ error: "제보를 저장하려면 먼저 로그인해주세요." }, 401);
    const category = normalizeCategory(body.category ?? body.type);
    const now = new Date().toISOString();
    const { data, error } = await supabase.from("reports").insert({
      user_id: user.id,
      source: "website",
      category,
      subcategory: typeof body.subcategory === "string" ? body.subcategory : null,
      title: String(body.title ?? `${category} 위험요소를 발견했어요`),
      description: String(body.description ?? ""),
      latitude: body.latitude ?? null,
      longitude: body.longitude ?? null,
      accuracy: body.accuracy ?? null,
      address: body.address || null,
      place_description: body.placeDescription || null,
      status: "received",
      response: "기록이 안전하게 접수됐어요. 위치와 내용을 확인한 뒤 담당 기관을 연결할게요.",
      observed_at: body.observedAt ?? now,
      weather: body.weather ?? null,
    }).select("id").single();
    if (error) return json({ error: "제보를 저장하지 못했어요." }, 400);
    return json({ ok: true, id: data.id, linkedToAccount: true }, 201);
  }

  if (url.pathname === "/api/reports" && method === "GET") {
    const user = await currentUser();
    if (!user) return json({ error: "로그인이 필요합니다." }, 401);
    const { data, error } = await supabase
      .from("reports")
      .select("*, report_media(id,kind)")
      .order("created_at", { ascending: false });
    if (error) return json({ error: "기록을 불러오지 못했어요." }, 400);
    return json({ reports: (data ?? []).map(memberReport) });
  }

  if (url.pathname === "/api/reports" && method === "DELETE") {
    const user = await currentUser();
    if (!user) return json({ error: "로그인이 필요합니다." }, 401);
    const reportId = String(body.id ?? "");
    try {
      await removeReportFiles(reportId);
      const { error } = await supabase.from("reports").delete().eq("id", reportId);
      if (error) throw error;
      return json({ ok: true });
    } catch {
      return json({ error: "기록을 삭제하지 못했어요." }, 400);
    }
  }

  if (url.pathname === "/api/reports/claim" && method === "POST") return json({ ok: true });

  if (url.pathname === "/api/map/reports") {
    let { data, error } = await supabase.rpc("get_public_map_reports");
    if (error) {
      const user = await currentUser();
      if (!user) return json({ reports: [] });
      const fallback = await supabase
        .from("reports")
        .select("*, report_media(id,kind)")
        .not("latitude", "is", null)
        .not("longitude", "is", null)
        .order("created_at", { ascending: false });
      data = fallback.data;
      error = fallback.error;
    }
    if (error) return json({ reports: [] });
    return json({
      reports: ((data ?? []) as ReportRow[]).map(memberReport),
    });
  }

  if (url.pathname === "/api/admin/reports" && method === "PATCH") {
    const user = await currentUser();
    if (user?.role !== "research_admin" && user?.role !== "agency_staff") return json({ error: "운영 계정 로그인이 필요합니다." }, 403);
    const update = {
      status: body.status,
      assigned_agency: body.assignedAgency || null,
      response: body.response || null,
    };
    const { error } = await supabase.from("reports").update(update).eq("id", body.id);
    if (error) return json({ error: "처리 상태를 저장하지 못했어요." }, 400);
    await supabase.from("report_status_history").insert({
      report_id: body.id,
      status: body.status,
      note: body.response || null,
      actor_user_id: user.id,
    });
    await supabase.from("admin_audit_logs").insert({
      actor_user_id: user.id,
      report_id: body.id,
      action: "report_status_update",
      detail: `${body.status} · ${body.assignedAgency || "미배정"}`,
    });
    return json({ ok: true });
  }

  if (url.pathname === "/api/admin/reports") {
    const user = await currentUser();
    if (user?.role !== "research_admin" && user?.role !== "agency_staff") return json({ error: "운영 계정 로그인이 필요합니다." }, 403);
    let query = supabase
      .from("reports")
      .select("*, profiles(name), report_media(kind,original_name,mime_type,size_bytes)")
      .order("updated_at", { ascending: false });
    if (user.role === "agency_staff" && user.agency) query = query.eq("assigned_agency", user.agency);
    const { data, error } = await query;
    if (error) return json({ error: "기록을 불러오지 못했어요." }, 400);
    return json({
      user,
      reports: ((data ?? []) as ReportRow[]).map((report) => ({
        ...report,
        reporter_name: report.profiles?.name ?? null,
        media: (report.report_media ?? []).map((item) => ({
          kind: item.kind,
          name: item.original_name,
          type: item.mime_type,
          size: item.size_bytes,
        })),
      })),
    });
  }

  if (url.pathname === "/api/admin/accounts" && method === "GET") {
    const result = await manageStaff({ action: "list" });
    return json(result.data, result.status);
  }

  if (url.pathname === "/api/admin/accounts" && method === "POST") {
    const result = await manageStaff({ action: "create", ...body });
    return json(result.data, result.status);
  }

  if (url.pathname === "/api/admin/accounts" && method === "PATCH") {
    const result = await manageStaff({ action: "update", ...body });
    return json(result.data, result.status);
  }

  return json({ error: "지원하지 않는 API입니다." }, 404);
};

document.addEventListener("click", (event) => {
  const target = event.target as HTMLElement | null;
  const link = target?.closest("a");
  const href = link?.getAttribute("href");
  if (!href || !href.startsWith("/") || href.startsWith(PAGES_PREFIX)) return;
  event.preventDefault();
  window.location.href = `${PAGES_PREFIX}${href}`;
});
