import { clearEmailVerification, isEmailVerified } from "../app/lib/email-verification";

const PAGES_PREFIX = "/jikeoro-web-proto";
const REPORTS_KEY = "jikeoro-pages-reports";
const ROLE_KEY = "jikeoro-pages-role";
const USERS_KEY = "jikeoro-pages-users";
const STAFF_USERS_KEY = "jikeoro-pages-staff-users";
const USER_KEY = "jikeoro-pages-user";

// Authentication is intentionally scoped to the current tab. The previous
// localStorage implementation kept a demo role across visits, so returning
// from the map could make a visitor look logged in without a fresh login.
window.localStorage.removeItem(ROLE_KEY);

type DemoReport = {
  id: string;
  category: string;
  subcategory: string | null;
  title: string;
  description: string;
  address: string | null;
  place_description: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracy?: number | null;
  status: "received" | "review" | "action" | "completed";
  assigned_agency: string | null;
  response: string | null;
  reporter_name: string | null;
  reporter_email?: string | null;
  created_at: string;
  updated_at: string;
  observed_at?: string;
  weather?: { temperature: number; code: number; observedAt: string } | null;
  media?: Array<{ kind: "image" | "video" | "audio"; name: string; type: string; size: number }>;
};

type PrototypeAccount = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  salt: string;
  createdAt: string;
};

type StaffRole = "research_admin" | "agency_staff";

type PrototypeStaffAccount = {
  id: string;
  name: string;
  loginId: string;
  email?: string;
  passwordHash?: string;
  salt?: string;
  role: StaffRole;
  agency: string;
  active: boolean;
  createdAt: string;
};

type SessionUser = {
  id: string;
  name: string;
  email?: string;
  loginId?: string;
  role: "member" | StaffRole;
  agency: string | null;
};

const seededStaffAccounts: PrototypeStaffAccount[] = [
  { id: "staff-demo-admin", name: "배수현 연구원", loginId: "yaniyaabi@kaist.ac.kr", salt: "6a696b656f726f2d61646d696e2d32303236", passwordHash: "17c02c53234e9298ae9e2097a2612939f3a5dff9451075161059a2c480dbe835", role: "research_admin", agency: "지켜路 연구팀", active: true, createdAt: "2026-07-01T09:00:00.000Z" },
  { id: "staff-demo-agency", name: "서울 기관 담당자", loginId: "seoul@kaist.ac.kr", salt: "6a696b656f726f2d6167656e63792d3236", passwordHash: "6b42017a758eceead94d85d68b16bb15f44aa57755dc96fb22cd0b113cfaaf6e", role: "agency_staff", agency: "서울특별시 도로관리과", active: true, createdAt: "2026-07-01T09:00:00.000Z" },
];

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

async function hashPassword(password: string, salt: string) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(salt), iterations: 120_000 }, material, 256);
  return bytesToHex(new Uint8Array(bits));
}

function readAccounts(): PrototypeAccount[] {
  try {
    return JSON.parse(window.localStorage.getItem(USERS_KEY) ?? "[]") as PrototypeAccount[];
  } catch {
    return [];
  }
}

function readStaffAccounts(): PrototypeStaffAccount[] {
  try {
    const saved = window.localStorage.getItem(STAFF_USERS_KEY);
    if (!saved) return seededStaffAccounts;
    const savedAccounts = (JSON.parse(saved) as Array<PrototypeStaffAccount & { email?: string }>).map((account) => ({
      ...account,
      loginId: account.loginId || account.email || "",
    }));
    const customAccounts = savedAccounts.filter((account) => !seededStaffAccounts.some((seeded) => seeded.id === account.id));
    return [...seededStaffAccounts, ...customAccounts];
  } catch {
    return seededStaffAccounts;
  }
}

function writeStaffAccounts(accounts: PrototypeStaffAccount[]) {
  window.localStorage.setItem(STAFF_USERS_KEY, JSON.stringify(accounts));
}

function publicStaffAccount(account: PrototypeStaffAccount) {
  return {
    id: account.id,
    name: account.name,
    loginId: account.loginId,
    role: account.role,
    agency: account.agency,
    active: account.active,
    createdAt: account.createdAt,
  };
}

function readSessionUser(): SessionUser | null {
  try {
    return JSON.parse(window.sessionStorage.getItem(USER_KEY) ?? "null") as SessionUser | null;
  } catch {
    return null;
  }
}

function normalizeCategory(value?: string | null) {
  if (value === "단차" || value === "적치물") return "인도";
  if (value === "포트홀") return "횡단보도";
  if (["인도", "횡단보도", "조도", "날씨 관련 위험", "기타"].includes(value ?? "")) return value as string;
  return "기타";
}

function formatReportLocation(report: Pick<DemoReport, "address" | "place_description" | "latitude" | "longitude">) {
  const writtenLocation = report.address?.trim() || report.place_description?.trim();
  if (writtenLocation) return writtenLocation;
  if (report.latitude != null && report.longitude != null) {
    return `지도에서 선택한 위치 (${report.latitude.toFixed(5)}, ${report.longitude.toFixed(5)})`;
  }
  return "위치정보 없음";
}

const seededReports: DemoReport[] = [
  {
    id: "pages-demo-1",
    category: "인도",
    subcategory: "턱·단차",
    title: "보도 경계석 단차",
    description: "보행보조기 바퀴가 걸릴 만큼 경계석의 높이 차이가 커요.",
    address: "대전광역시 서구 둔산로",
    place_description: "시청역 2번 출구 인근",
    latitude: 36.3504,
    longitude: 127.3845,
    status: "review",
    assigned_agency: "대전광역시 도로관리팀",
    response: "현장 확인 일정을 조율하고 있습니다.",
    reporter_name: "김지킴",
    reporter_email: "member@jikeoro.local",
    created_at: "2026-08-12T00:42:00.000Z",
    updated_at: "2026-08-14T00:42:00.000Z",
    observed_at: "2026-08-12T00:38:00.000Z",
    weather: { temperature: 27, code: 1, observedAt: "2026-08-12T00:38:00.000Z" },
    media: [{ kind: "image", name: "보도-경계석-현장.jpg", type: "image/jpeg", size: 842_100 }],
  },
  {
    id: "pages-demo-2",
    category: "조도",
    subcategory: "가로등 부족",
    title: "골목길 가로등 사이가 어두워요",
    description: "야간에 보행로가 잘 보이지 않아요.",
    address: "부산광역시 부산진구 시민공원로",
    place_description: "시민공원 남쪽 골목",
    latitude: 35.1667,
    longitude: 129.0556,
    status: "action",
    assigned_agency: "부산진구 공원녹지과",
    response: "조명 상태를 점검하고 보수 요청을 전달했습니다.",
    reporter_name: "김지킴",
    reporter_email: "member@jikeoro.local",
    created_at: "2026-08-11T11:18:00.000Z",
    updated_at: "2026-08-14T01:10:00.000Z",
    observed_at: "2026-08-11T11:12:00.000Z",
    weather: { temperature: 24, code: 0, observedAt: "2026-08-11T11:12:00.000Z" },
    media: [{ kind: "video", name: "어두운-골목길.mp4", type: "video/mp4", size: 3_420_000 }],
  },
  {
    id: "pages-demo-3",
    category: "횡단보도",
    subcategory: "보행 신호 짧음",
    title: "횡단보도 신호 시간이 짧아요",
    description: "보행 신호가 짧아 어르신이 건너는 중에 신호가 바뀝니다.",
    address: "서울특별시 종로구 종로",
    place_description: "종로3가역 1번 출구 앞",
    latitude: 37.5704,
    longitude: 126.992,
    status: "received",
    assigned_agency: "서울특별시 도로관리과",
    response: "현장 신호 운영 시간을 확인하고 있습니다.",
    reporter_name: "김지킴",
    reporter_email: "member@jikeoro.local",
    created_at: "2026-08-14T03:20:00.000Z",
    updated_at: "2026-08-14T03:20:00.000Z",
    observed_at: "2026-08-14T03:17:00.000Z",
    weather: { temperature: 29, code: 2, observedAt: "2026-08-14T03:17:00.000Z" },
    media: [
      { kind: "image", name: "횡단보도-현장.jpg", type: "image/jpeg", size: 734_200 },
      { kind: "audio", name: "현장설명.webm", type: "audio/webm", size: 214_500 },
    ],
  },
];

function readReports(): DemoReport[] {
  try {
    const saved = window.localStorage.getItem(REPORTS_KEY);
    const savedReports = (saved ? JSON.parse(saved) : []) as DemoReport[];
    const reports = saved
      ? [...seededReports.filter((seeded) => !savedReports.some((report) => report.id === seeded.id)), ...savedReports]
      : seededReports;
    return reports.map((report) => {
      if (report.id === "pages-demo-1") return { ...report, category: normalizeCategory(report.category), subcategory: report.subcategory ?? seededReports[0].subcategory, address: seededReports[0].address, place_description: seededReports[0].place_description, latitude: seededReports[0].latitude, longitude: seededReports[0].longitude, assigned_agency: seededReports[0].assigned_agency, reporter_name: seededReports[0].reporter_name, reporter_email: seededReports[0].reporter_email };
      if (report.id === "pages-demo-2") return { ...report, category: normalizeCategory(report.category), subcategory: report.subcategory ?? seededReports[1].subcategory, address: seededReports[1].address, place_description: seededReports[1].place_description, latitude: seededReports[1].latitude, longitude: seededReports[1].longitude, assigned_agency: seededReports[1].assigned_agency, reporter_name: seededReports[1].reporter_name, reporter_email: seededReports[1].reporter_email };
      if (report.id === "pages-demo-3") return { ...report, category: normalizeCategory(report.category), subcategory: report.subcategory ?? seededReports[2].subcategory };
      return { ...report, category: normalizeCategory(report.category), subcategory: report.subcategory ?? null };
    });
  } catch {
    return seededReports;
  }
}

function writeReports(reports: DemoReport[]) {
  window.localStorage.setItem(REPORTS_KEY, JSON.stringify(reports));
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const networkFetch = window.fetch.bind(window);

window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const url = new URL(raw, window.location.origin);
  if (!url.pathname.startsWith("/api/")) return networkFetch(input, init);

  const method = (init?.method ?? "GET").toUpperCase();
  const sessionUser = readSessionUser();
  const role = sessionUser?.role ?? window.sessionStorage.getItem(ROLE_KEY);

  if (url.pathname === "/api/auth/session") {
    return json({
      authenticated: Boolean(role),
      user: sessionUser ?? (role ? { name: role === "member" ? "김지킴" : "배수현 연구원", role } : null),
    });
  }

  if (url.pathname === "/api/auth/register" && method === "POST") {
    const body = JSON.parse(String(init?.body ?? "{}"));
    const name = String(body.name ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    if (name.length < 2 || !email.includes("@") || password.length < 8) return json({ error: "이름, 이메일, 8자 이상의 비밀번호를 확인해주세요." }, 400);
    if (!isEmailVerified(email)) return json({ error: "이메일 인증을 먼저 완료해주세요." }, 400);
    const accounts = readAccounts();
    if (accounts.some((account) => account.email === email)) return json({ error: "이미 가입된 이메일입니다. 로그인해주세요." }, 409);
    const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
    const account: PrototypeAccount = {
      id: `member-${crypto.randomUUID()}`,
      name,
      email,
      salt,
      passwordHash: await hashPassword(password, salt),
      createdAt: new Date().toISOString(),
    };
    window.localStorage.setItem(USERS_KEY, JSON.stringify([...accounts, account]));
    const user: SessionUser = { id: account.id, name: account.name, email: account.email, role: "member", agency: null };
    window.sessionStorage.setItem(USER_KEY, JSON.stringify(user));
    window.sessionStorage.setItem(ROLE_KEY, "member");
    clearEmailVerification();
    return json({ ok: true, user }, 201);
  }

  if (url.pathname === "/api/auth/login" && method === "POST") {
    const body = JSON.parse(String(init?.body ?? "{}"));
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const account = readAccounts().find((candidate) => candidate.email === email);
    if (!account || await hashPassword(password, account.salt) !== account.passwordHash) return json({ error: "이메일 또는 비밀번호가 맞지 않아요." }, 401);
    const user: SessionUser = { id: account.id, name: account.name, email: account.email, role: "member", agency: null };
    window.sessionStorage.setItem(USER_KEY, JSON.stringify(user));
    window.sessionStorage.setItem(ROLE_KEY, "member");
    return json({ ok: true, user });
  }

  if (url.pathname === "/api/auth/admin-login" && method === "POST") {
    const body = JSON.parse(String(init?.body ?? "{}"));
    const loginId = String(body.loginId ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const account = readStaffAccounts().find((candidate) => candidate.loginId.toLowerCase() === loginId);
    if (!account || !account.active || !account.salt || !account.passwordHash || await hashPassword(password, account.salt) !== account.passwordHash) {
      return json({ error: "이메일 또는 비밀번호를 확인해주세요. 사용 중지된 계정은 로그인할 수 없습니다." }, 401);
    }
    const user: SessionUser = { id: account.id, name: account.name, loginId: account.loginId, role: account.role, agency: account.agency || null };
    window.sessionStorage.setItem(USER_KEY, JSON.stringify(user));
    window.sessionStorage.setItem(ROLE_KEY, account.role);
    return json({ ok: true, user });
  }

  if (url.pathname === "/api/auth/demo" && method === "POST") {
    const body = JSON.parse(String(init?.body ?? "{}"));
    if (body.role !== "member") return json({ error: "운영 계정은 발급된 아이디와 비밀번호로 로그인해주세요." }, 403);
    const role = "member";
    const user: SessionUser = { id: "demo-member", name: "김지킴", email: "member@jikeoro.local", role, agency: null };
    window.sessionStorage.setItem(USER_KEY, JSON.stringify(user));
    window.sessionStorage.setItem(ROLE_KEY, role);
    return json({ ok: true, user });
  }

  if (url.pathname === "/api/auth/logout" && method === "POST") {
    window.sessionStorage.removeItem(ROLE_KEY);
    window.sessionStorage.removeItem(USER_KEY);
    window.localStorage.removeItem(ROLE_KEY);
    return json({ ok: true });
  }

  if (url.pathname === "/api/reports" && method === "POST") {
    const body = JSON.parse(String(init?.body ?? "{}"));
    const now = new Date().toISOString();
    const report: DemoReport = {
      id: `pages-${Date.now()}`,
      category: normalizeCategory(body.category ?? body.type),
      subcategory: typeof body.subcategory === "string" ? body.subcategory : null,
      title: body.title ?? `${normalizeCategory(body.category ?? body.type)} 신고`,
      description: body.description ?? "",
      address: body.address ?? null,
      place_description: body.placeDescription ?? null,
      latitude: body.latitude ?? null,
      longitude: body.longitude ?? null,
      accuracy: body.accuracy ?? null,
      status: "received",
      assigned_agency: null,
      response: null,
      reporter_name: role === "member" ? sessionUser?.name ?? "김지킴" : null,
      reporter_email: role === "member" ? sessionUser?.email ?? "member@jikeoro.local" : null,
      created_at: now,
      updated_at: now,
      observed_at: body.observedAt ?? now,
      weather: body.weather ?? null,
      media: Array.isArray(body.media) ? body.media : [],
    };
    const reports = [report, ...readReports()];
    writeReports(reports);
    return json(report, 201);
  }

  if (url.pathname === "/api/reports" && method === "GET") {
    const accountEmail = sessionUser?.email ?? (role === "member" ? "member@jikeoro.local" : null);
    const accountReports = accountEmail ? readReports().filter((report) => report.reporter_email === accountEmail) : readReports();
    return json({
      reports: accountReports.map((report) => ({
        id: report.id,
        type: report.category,
        subcategory: report.subcategory,
        title: report.title,
        description: report.description,
        place: formatReportLocation(report),
        latitude: report.latitude,
        longitude: report.longitude,
        status: report.status,
        response: report.response ?? "접수 내용을 확인하고 있습니다.",
        department: report.assigned_agency ?? "지켜路 운영팀",
        createdAt: report.created_at,
        observedAt: report.observed_at ?? report.created_at,
        weather: report.weather ?? null,
        mediaCount: report.media?.length ?? 0,
      })),
    });
  }

  if (url.pathname === "/api/reports" && method === "DELETE") {
    if (role !== "member") return json({ error: "회원 로그인이 필요합니다." }, 401);
    const body = JSON.parse(String(init?.body ?? "{}"));
    const reports = readReports();
    const accountEmail = sessionUser?.email ?? "member@jikeoro.local";
    const exists = reports.some((report) => report.id === body.id && report.reporter_email === accountEmail);
    if (!exists) return json({ error: "기록을 찾을 수 없거나 삭제 권한이 없습니다." }, 404);
    writeReports(reports.filter((report) => report.id !== body.id));
    return json({ ok: true });
  }

  if (url.pathname === "/api/reports/claim" && method === "POST") {
    const body = JSON.parse(String(init?.body ?? "{}"));
    writeReports(readReports().map((report) => report.id === body.id ? { ...report, reporter_name: sessionUser?.name ?? "김지킴", reporter_email: sessionUser?.email ?? "member@jikeoro.local" } : report));
    return json({ ok: true });
  }

  if (url.pathname === "/api/map/reports") {
    return json({
      reports: readReports()
        .filter((report) => report.latitude != null && report.longitude != null)
        .map((report) => ({
          id: report.id,
          type: report.category,
          subcategory: report.subcategory,
          title: report.title,
          description: report.description,
          latitude: report.latitude,
          longitude: report.longitude,
          accuracy: null,
          place: formatReportLocation(report),
          status: report.status,
          createdAt: report.created_at,
          mediaCount: report.media?.filter((item) => item.kind === "image" || item.kind === "video").length ?? 0,
        })),
    });
  }

  if (url.pathname === "/api/admin/reports" && method === "PATCH") {
    if (role !== "research_admin" && role !== "agency_staff") return json({ error: "운영 계정 로그인이 필요합니다." }, 403);
    const body = JSON.parse(String(init?.body ?? "{}"));
    const current = readReports().find((report) => report.id === body.id);
    if (role === "agency_staff" && current?.assigned_agency !== sessionUser?.agency) return json({ error: "우리 기관에 배정된 기록만 처리할 수 있습니다." }, 403);
    const reports = readReports().map((report) =>
      report.id === body.id
        ? {
            ...report,
            status: body.status ?? report.status,
            assigned_agency: body.assignedAgency ?? report.assigned_agency,
            response: body.response ?? report.response,
            updated_at: new Date().toISOString(),
          }
        : report,
    );
    writeReports(reports);
    return json({ ok: true });
  }

  if (url.pathname === "/api/admin/reports") {
    if (role !== "research_admin" && role !== "agency_staff") return json({ error: "운영 계정 로그인이 필요합니다." }, 403);
    const reports = role === "agency_staff"
      ? readReports().filter((report) => report.assigned_agency === sessionUser?.agency)
      : readReports();
    return json({
      user: sessionUser,
      reports,
    });
  }

  if (url.pathname === "/api/admin/accounts" && method === "GET") {
    if (role !== "research_admin") return json({ error: "연구원 관리자만 계정을 관리할 수 있습니다." }, 403);
    return json({ accounts: readStaffAccounts().map(publicStaffAccount) });
  }

  if (url.pathname === "/api/admin/accounts" && method === "POST") {
    if (role !== "research_admin") return json({ error: "연구원 관리자만 계정을 만들 수 있습니다." }, 403);
    const body = JSON.parse(String(init?.body ?? "{}"));
    const name = String(body.name ?? "").trim();
    const loginId = String(body.loginId ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const accountRole: StaffRole = body.role === "research_admin" ? "research_admin" : "agency_staff";
    const agency = String(body.agency ?? "").trim();
    if (name.length < 2 || !/^[a-z0-9@._-]{4,50}$/.test(loginId) || password.length < 4 || !agency) return json({ error: "이름, 영문·숫자 4자 이상의 로그인 아이디, 4자 이상의 비밀번호와 소속 기관을 확인해주세요." }, 400);
    const accounts = readStaffAccounts();
    if (accounts.some((account) => account.loginId.toLowerCase() === loginId)) return json({ error: "이미 사용 중인 로그인 아이디입니다." }, 409);
    const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
    const account: PrototypeStaffAccount = {
      id: `staff-${crypto.randomUUID()}`,
      name,
      loginId,
      salt,
      passwordHash: await hashPassword(password, salt),
      role: accountRole,
      agency,
      active: true,
      createdAt: new Date().toISOString(),
    };
    writeStaffAccounts([...accounts, account]);
    return json({ account: publicStaffAccount(account) }, 201);
  }

  if (url.pathname === "/api/admin/accounts" && method === "PATCH") {
    if (role !== "research_admin") return json({ error: "연구원 관리자만 권한을 변경할 수 있습니다." }, 403);
    const body = JSON.parse(String(init?.body ?? "{}"));
    const accountRole: StaffRole = body.role === "research_admin" ? "research_admin" : "agency_staff";
    const agency = String(body.agency ?? "").trim();
    if (!agency) return json({ error: "소속 기관을 입력해주세요." }, 400);
    let updated: PrototypeStaffAccount | null = null;
    const accounts = readStaffAccounts().map((account) => {
      if (account.id !== body.id) return account;
      updated = { ...account, role: accountRole, agency, active: body.active !== false };
      return updated;
    });
    if (!updated) return json({ error: "계정을 찾을 수 없습니다." }, 404);
    writeStaffAccounts(accounts);
    return json({ account: publicStaffAccount(updated) });
  }

  return json({ error: "GitHub Pages demo endpoint" }, 404);
};

document.addEventListener("click", (event) => {
  const target = event.target as HTMLElement | null;
  const link = target?.closest("a");
  const href = link?.getAttribute("href");
  if (!href || !href.startsWith("/") || href.startsWith(PAGES_PREFIX)) return;
  event.preventDefault();
  window.location.href = `${PAGES_PREFIX}${href}`;
});
