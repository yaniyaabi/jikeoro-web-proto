import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type StaffRole = "research_admin" | "agency_staff";
type RequestBody = {
  action?: "list" | "create" | "update";
  id?: string;
  name?: string;
  loginId?: string;
  password?: string;
  role?: StaffRole;
  agency?: string;
  active?: boolean;
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isStaffRole(value: unknown): value is StaffRole {
  return value === "research_admin" || value === "agency_staff";
}

function isActive(bannedUntil?: string | null) {
  if (!bannedUntil) return true;
  const bannedUntilTime = new Date(bannedUntil).getTime();
  return Number.isNaN(bannedUntilTime) || bannedUntilTime <= Date.now();
}

function publicAccount(
  profile: { id: string; name: string; role: StaffRole; agency: string | null; created_at: string },
  authUser?: { email?: string | null; banned_until?: string | null },
) {
  return {
    id: profile.id,
    name: profile.name,
    loginId: authUser?.email ?? "이메일 확인 불가",
    role: profile.role,
    agency: profile.agency ?? "",
    active: isActive(authUser?.banned_until),
    createdAt: profile.created_at,
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return response({ error: "지원하지 않는 요청입니다." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const authorization = request.headers.get("Authorization") ?? "";
  if (!supabaseUrl || !serviceRoleKey || !anonKey) return response({ error: "관리자 함수 설정이 완료되지 않았습니다." }, 500);
  if (!authorization.startsWith("Bearer ")) return response({ error: "로그인이 필요합니다." }, 401);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const caller = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: authorization } },
  });
  const { data: authData, error: authError } = await caller.auth.getUser();
  if (authError || !authData.user) return response({ error: "로그인 세션을 확인하지 못했습니다." }, 401);

  const { data: callerProfile, error: callerError } = await caller
    .from("profiles")
    .select("id,role")
    .eq("id", authData.user.id)
    .single();
  if (callerError || callerProfile?.role !== "research_admin") {
    return response({ error: "연구원 관리자만 운영 계정을 관리할 수 있습니다." }, 403);
  }

  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return response({ error: "요청 내용을 확인해주세요." }, 400);
  }

  if (body.action === "list") {
    const { data: profiles, error: profilesError } = await admin
      .from("profiles")
      .select("id,name,role,agency,created_at")
      .in("role", ["research_admin", "agency_staff"])
      .order("created_at", { ascending: true });
    if (profilesError) return response({ error: "계정 목록을 불러오지 못했습니다." }, 400);

    const { data: usersData, error: usersError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (usersError) return response({ error: "로그인 계정 정보를 불러오지 못했습니다." }, 400);
    const authUsers = new Map(usersData.users.map((user) => [user.id, user]));
    return response({
      accounts: (profiles ?? []).map((profile) => publicAccount(
        profile as { id: string; name: string; role: StaffRole; agency: string | null; created_at: string },
        authUsers.get(profile.id),
      )),
    });
  }

  if (body.action === "create") {
    const name = String(body.name ?? "").trim();
    const email = String(body.loginId ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const agency = String(body.agency ?? "").trim();
    const role = body.role;
    if (name.length < 2 || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8 || !agency || !isStaffRole(role)) {
      return response({ error: "이름, 이메일, 8자 이상의 비밀번호, 권한과 소속 기관을 확인해주세요." }, 400);
    }

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
    });
    if (createError || !created.user) {
      const duplicate = createError?.message.toLowerCase().includes("already") || createError?.message.toLowerCase().includes("registered");
      return response({ error: duplicate ? "이미 사용 중인 이메일입니다." : "로그인 계정을 만들지 못했습니다." }, 400);
    }

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .update({ name, role, agency })
      .eq("id", created.user.id)
      .select("id,name,role,agency,created_at")
      .single();
    if (profileError || !profile) {
      await admin.auth.admin.deleteUser(created.user.id);
      return response({ error: "계정 권한을 저장하지 못해 생성을 취소했습니다." }, 400);
    }

    await admin.from("admin_audit_logs").insert({
      actor_user_id: authData.user.id,
      action: "staff_account_created",
      detail: `${email} · ${role} · ${agency}`,
    });
    return response({ account: publicAccount(profile, created.user) }, 201);
  }

  if (body.action === "update") {
    const id = String(body.id ?? "");
    const agency = String(body.agency ?? "").trim();
    const role = body.role;
    const active = body.active !== false;
    if (!id || !agency || !isStaffRole(role)) return response({ error: "권한과 소속 기관을 확인해주세요." }, 400);
    if (id === authData.user.id && (role !== "research_admin" || !active)) {
      return response({ error: "현재 로그인한 관리자 본인의 권한을 낮추거나 사용 중지할 수 없습니다." }, 400);
    }

    const { data: previous, error: previousError } = await admin
      .from("profiles")
      .select("id,name,role,agency,created_at")
      .eq("id", id)
      .in("role", ["research_admin", "agency_staff"])
      .single();
    if (previousError || !previous) return response({ error: "운영 계정을 찾지 못했습니다." }, 404);

    const { data: authUserData, error: authUserError } = await admin.auth.admin.getUserById(id);
    if (authUserError || !authUserData.user) return response({ error: "로그인 계정을 찾지 못했습니다." }, 404);

    const { error: stateError } = await admin.auth.admin.updateUserById(id, {
      ban_duration: active ? "none" : "876000h",
    });
    if (stateError) return response({ error: "계정 상태를 변경하지 못했습니다." }, 400);

    const { data: profile, error: updateError } = await admin
      .from("profiles")
      .update({ role, agency })
      .eq("id", id)
      .select("id,name,role,agency,created_at")
      .single();
    if (updateError || !profile) {
      await admin.auth.admin.updateUserById(id, { ban_duration: isActive(authUserData.user.banned_until) ? "none" : "876000h" });
      return response({ error: "계정 권한을 저장하지 못했습니다." }, 400);
    }

    await admin.from("admin_audit_logs").insert({
      actor_user_id: authData.user.id,
      action: "staff_account_updated",
      detail: `${authUserData.user.email ?? id} · ${role} · ${agency} · ${active ? "active" : "inactive"}`,
    });
    return response({ account: publicAccount(profile, { ...authUserData.user, banned_until: active ? null : "9999-12-31T23:59:59.000Z" }) });
  }

  return response({ error: "지원하지 않는 계정 관리 작업입니다." }, 400);
});
