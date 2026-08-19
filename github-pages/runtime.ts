const PAGES_PREFIX = "/jikeoro-web-proto";
const REPORTS_KEY = "jikeoro-pages-reports";
const ROLE_KEY = "jikeoro-pages-role";

type DemoReport = {
  id: string;
  category: string;
  title: string;
  description: string;
  address: string | null;
  place_description: string | null;
  latitude: number | null;
  longitude: number | null;
  status: "received" | "review" | "action" | "completed";
  assigned_agency: string | null;
  response: string | null;
  reporter_name: string | null;
  created_at: string;
  updated_at: string;
  media?: Array<{ kind: "image" | "video" | "audio"; name: string; type: string; size: number }>;
};

const seededReports: DemoReport[] = [
  {
    id: "pages-demo-1",
    category: "단차",
    title: "보도 경계석 단차",
    description: "보행보조기 바퀴가 걸릴 만큼 경계석의 높이 차이가 커요.",
    address: "서울 성동구 성수이로",
    place_description: "성수역 2번 출구 인근",
    latitude: 37.5447,
    longitude: 127.0567,
    status: "review",
    assigned_agency: "성동구 도로관리팀",
    response: "현장 확인 일정을 조율하고 있습니다.",
    reporter_name: "김지킴",
    created_at: "2026-08-12T00:42:00.000Z",
    updated_at: "2026-08-14T00:42:00.000Z",
  },
  {
    id: "pages-demo-2",
    category: "조도",
    title: "골목길 가로등 사이가 어두워요",
    description: "야간에 보행로가 잘 보이지 않아요.",
    address: "서울숲 인근 골목",
    place_description: "서울숲 남쪽 골목",
    latitude: 37.5456,
    longitude: 127.0447,
    status: "action",
    assigned_agency: "성동구 공원녹지센터",
    response: "조명 상태를 점검하고 보수 요청을 전달했습니다.",
    reporter_name: "김지킴",
    created_at: "2026-08-11T11:18:00.000Z",
    updated_at: "2026-08-14T01:10:00.000Z",
  },
];

function readReports(): DemoReport[] {
  try {
    const saved = window.localStorage.getItem(REPORTS_KEY);
    return saved ? JSON.parse(saved) : seededReports;
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
  const role = window.localStorage.getItem(ROLE_KEY);

  if (url.pathname === "/api/auth/session") {
    return json({
      authenticated: Boolean(role),
      user: role ? { name: role === "member" ? "김지킴" : "배수현 연구원", role } : null,
    });
  }

  if (url.pathname === "/api/auth/demo" && method === "POST") {
    const body = JSON.parse(String(init?.body ?? "{}"));
    window.localStorage.setItem(ROLE_KEY, body.role ?? "member");
    return json({ ok: true });
  }

  if (url.pathname === "/api/auth/logout" && method === "POST") {
    window.localStorage.removeItem(ROLE_KEY);
    return json({ ok: true });
  }

  if (url.pathname === "/api/reports" && method === "POST") {
    const body = JSON.parse(String(init?.body ?? "{}"));
    const now = new Date().toISOString();
    const report: DemoReport = {
      id: `pages-${Date.now()}`,
      category: body.category ?? body.type ?? "기타",
      title: body.title ?? `${body.category ?? body.type ?? "위험요소"} 신고`,
      description: body.description ?? "",
      address: body.address ?? null,
      place_description: body.placeDescription ?? null,
      latitude: body.latitude ?? null,
      longitude: body.longitude ?? null,
      status: "received",
      assigned_agency: null,
      response: null,
      reporter_name: role === "member" ? "김지킴" : null,
      created_at: now,
      updated_at: now,
      media: Array.isArray(body.media) ? body.media : [],
    };
    const reports = [report, ...readReports()];
    writeReports(reports);
    return json(report, 201);
  }

  if (url.pathname === "/api/reports" && method === "GET") {
    return json({
      reports: readReports().map((report) => ({
        id: report.id,
        type: report.category,
        title: report.title,
        place: report.place_description ?? report.address ?? "성수동 위치 기록",
        status: report.status,
        response: report.response ?? "접수 내용을 확인하고 있습니다.",
        department: report.assigned_agency ?? "지켜路 운영팀",
        createdAt: report.created_at,
        mediaCount: report.media?.length ?? 0,
      })),
    });
  }

  if (url.pathname === "/api/reports/claim") return json({ ok: true });

  if (url.pathname === "/api/map/reports") {
    return json({
      reports: readReports()
        .filter((report) => report.latitude != null && report.longitude != null)
        .map((report) => ({
          id: report.id,
          type: report.category,
          title: report.title,
          description: report.description,
          latitude: report.latitude,
          longitude: report.longitude,
          accuracy: null,
          place: report.place_description ?? report.address ?? "성수동 위치 기록",
          status: report.status,
          createdAt: report.created_at,
        })),
    });
  }

  if (url.pathname === "/api/admin/reports" && method === "PATCH") {
    const body = JSON.parse(String(init?.body ?? "{}"));
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
    return json({
      user: { name: "배수현 연구원", role: role ?? "research_admin", agency: null },
      reports: readReports(),
    });
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
