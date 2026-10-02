"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { SiteHeader } from "../components/site-header";
import { SiteFooter } from "../components/site-footer";
import { HazardIllustration } from "../components/hazard-illustration";
import { sitePath } from "../lib/site-path";

type ReportStatus = "received" | "review" | "action" | "completed";
type StaffRole = "research_admin" | "agency_staff";
type AdminUser = { id?: string; name: string; email?: string; role: StaffRole; agency: string | null };
type StaffAccount = { id: string; name: string; loginId: string; role: StaffRole; agency: string; active: boolean; createdAt: string };
type WeatherSnapshot = { temperature: number; code: number; observedAt?: string };
type MediaMetadata = { kind: "image" | "video" | "audio"; name: string; type?: string; size?: number };
type StoredReportMedia = MediaMetadata & { id: string; reportId: string; blob: Blob };
type ReportMediaPreview = StoredReportMedia & { previewUrl: string };
type AdminReport = {
  id: string;
  category: string;
  title: string;
  description: string;
  address: string | null;
  place_description: string | null;
  status: ReportStatus;
  assigned_agency: string | null;
  response: string | null;
  reporter_name: string | null;
  latitude?: number | null;
  longitude?: number | null;
  accuracy?: number | null;
  observed_at?: string | null;
  weather?: WeatherSnapshot | null;
  media?: MediaMetadata[];
  created_at: string;
  updated_at: string;
};

const statusLabels: Record<ReportStatus, string> = { received: "신규 접수", review: "검토 중", action: "조치 중", completed: "개선 완료" };
const statusOrder: ReportStatus[] = ["received", "review", "action", "completed"];

function describeWeather(code: number) {
  if (code === 0) return "맑음";
  if (code <= 3) return "구름";
  if (code === 45 || code === 48) return "안개";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "비";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "눈";
  if (code >= 95) return "뇌우";
  return "날씨 기록";
}

function formatReportDate(value?: string | null) {
  if (!value) return "기록 없음";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "기록 없음";
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

async function readReportMedia(reportId: string) {
  if (!("indexedDB" in window)) return [] as StoredReportMedia[];
  return new Promise<StoredReportMedia[]>((resolve) => {
    const request = window.indexedDB.open("jikeoro-media", 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("media")) database.createObjectStore("media", { keyPath: "id" });
    };
    request.onerror = () => resolve([]);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction("media", "readonly");
      const getAll = transaction.objectStore("media").getAll();
      getAll.onsuccess = () => resolve((getAll.result as StoredReportMedia[]).filter((item) => item.reportId === reportId));
      getAll.onerror = () => resolve([]);
      transaction.oncomplete = () => database.close();
    };
  });
}

export default function AdminPage() {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [view, setView] = useState<"reports" | "accounts">("reports");
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [accounts, setAccounts] = useState<StaffAccount[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [filter, setFilter] = useState<"all" | ReportStatus>("all");
  const [status, setStatus] = useState<ReportStatus>("received");
  const [agency, setAgency] = useState("");
  const [response, setResponse] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [accountNotice, setAccountNotice] = useState("");
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [savingAccountId, setSavingAccountId] = useState("");
  const [accountDraft, setAccountDraft] = useState({ name: "", loginId: "", password: "", role: "agency_staff" as StaffRole, agency: "" });
  const [ready, setReady] = useState(false);
  const [detailMedia, setDetailMedia] = useState<ReportMediaPreview[]>([]);
  const [detailMediaLoading, setDetailMediaLoading] = useState(false);

  const loadReports = async () => {
    const apiResponse = await fetch("/api/admin/reports");
    if (!apiResponse.ok) {
      window.location.replace(sitePath("/admin/login/"));
      return;
    }
    const data = await apiResponse.json();
    setUser(data.user);
    setReports(data.reports);
    setSelectedId((current) => current || data.reports[0]?.id || "");
    setReady(true);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadReports().catch(() => window.location.replace(sitePath("/admin/login/")));
  }, []);

  useEffect(() => {
    if (user?.role !== "research_admin") return;
    fetch("/api/admin/accounts")
      .then(async (response) => {
        if (!response.ok) throw new Error("계정 목록을 불러오지 못했어요.");
        return response.json();
      })
      .then((data) => setAccounts(data.accounts ?? []))
      .catch((error) => setAccountNotice(error instanceof Error ? error.message : "계정 목록을 불러오지 못했어요."));
  }, [user?.role]);

  const filteredReports = useMemo(() => filter === "all" ? reports : reports.filter((report) => report.status === filter), [filter, reports]);
  const selected = reports.find((report) => report.id === selectedId) ?? filteredReports[0] ?? null;

  useEffect(() => {
    if (!selected) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStatus(selected.status);
    setAgency(selected.assigned_agency ?? "");
    setResponse(selected.response ?? "");
    setNotice("");
  }, [selected]);

  useEffect(() => {
    let active = true;
    const previewUrls: string[] = [];
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDetailMedia([]);
    if (!selected) return () => undefined;
    setDetailMediaLoading(true);
    readReportMedia(selected.id).then((items) => {
      if (!active) return;
      const previews = items.map((item) => {
        const previewUrl = URL.createObjectURL(item.blob);
        previewUrls.push(previewUrl);
        return { ...item, previewUrl };
      });
      setDetailMedia(previews);
      setDetailMediaLoading(false);
    });
    return () => {
      active = false;
      previewUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [selected]);

  const saveReport = async () => {
    if (!selected) return;
    setSaving(true);
    setNotice("");
    const apiResponse = await fetch("/api/admin/reports", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: selected.id, status, assignedAgency: agency, response }),
    });
    setSaving(false);
    if (!apiResponse.ok) {
      const data = await apiResponse.json().catch(() => null);
      setNotice(data?.error ?? "저장하지 못했어요.");
      return;
    }
    setReports((current) => current.map((report) => report.id === selected.id ? { ...report, status, assigned_agency: agency || report.assigned_agency, response, updated_at: new Date().toISOString() } : report));
    setNotice("처리 현황이 저장되고 주민 화면에 반영됐어요.");
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = sitePath("/");
  };

  const createAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreatingAccount(true);
    setAccountNotice("");
    const response = await fetch("/api/admin/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(accountDraft),
    });
    const data = await response.json().catch(() => null);
    setCreatingAccount(false);
    if (!response.ok) {
      setAccountNotice(data?.error ?? "계정을 만들지 못했어요.");
      return;
    }
    setAccounts((current) => [...current, data.account]);
    setAccountDraft({ name: "", loginId: "", password: "", role: "agency_staff", agency: "" });
    setAccountNotice(`${data.account.name}님의 운영 계정을 만들었습니다.`);
  };

  const saveAccount = async (account: StaffAccount) => {
    setSavingAccountId(account.id);
    setAccountNotice("");
    const response = await fetch("/api/admin/accounts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: account.id, role: account.role, agency: account.agency, active: account.active }),
    });
    const data = await response.json().catch(() => null);
    setSavingAccountId("");
    if (!response.ok) {
      setAccountNotice(data?.error ?? "권한을 저장하지 못했어요.");
      return;
    }
    setAccounts((current) => current.map((item) => item.id === account.id ? data.account : item));
    setAccountNotice(`${data.account.name}님의 권한을 저장했습니다.`);
  };

  if (!ready) return <main className="member-page auth-loading">관리자 기록을 불러오고 있어요.</main>;

  const counts = statusOrder.reduce((result, key) => ({ ...result, [key]: reports.filter((report) => report.status === key).length }), {} as Record<ReportStatus, number>);

  return (
    <>
    <main className="admin-page">
      <SiteHeader active="admin" inner />

      <section className="admin-main">
        <div className="admin-context-bar"><span className="admin-console-label">{user?.role === "research_admin" ? "관리자 콘솔" : "기관 콘솔"}</span><div className="admin-account"><span>{user?.role === "research_admin" ? "研" : "官"}</span><div><b>{user?.name}</b><small>{user?.role === "research_admin" ? "연구원 관리자" : user?.agency}</small></div><button onClick={logout}>로그아웃</button></div></div>
        <div className="admin-title-row">
          <div><p className="eyebrow">{view === "reports" ? "REPORT OPERATIONS" : "ACCESS & PEOPLE"}</p><h1>{view === "reports" ? (user?.role === "research_admin" ? <>전국 보행위험<br />처리 현황</> : <>우리 기관 보행위험<br />처리 현황</>) : <>운영 계정과<br />권한 관리</>}</h1></div>
          <p>{view === "reports" ? (user?.role === "research_admin" ? "전체 기록을 검토하고 담당기관을 연결합니다." : "우리 기관에 배정된 기록을 확인하고 처리 결과를 남깁니다.") : "연구원과 기관 담당자를 등록하고 각자 필요한 권한만 부여합니다."}</p>
        </div>

        <div className="admin-view-tabs" role="tablist" aria-label="관리자 콘솔 메뉴">
          <button type="button" className={view === "reports" ? "active" : ""} onClick={() => setView("reports")}>제보 관리 <span>{reports.length}</span></button>
          {user?.role === "research_admin" && <button type="button" className={view === "accounts" ? "active" : ""} onClick={() => setView("accounts")}>계정·권한 관리 <span>{accounts.length}</span></button>}
        </div>

        {view === "reports" ? <>
          <div className="admin-stats">
            <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}><span>ALL</span><b>{reports.length}</b><small>전체</small></button>
            {statusOrder.map((key, index) => <button key={key} className={filter === key ? "active" : ""} onClick={() => setFilter(filter === key ? "all" : key)}><span>0{index + 1}</span><b>{counts[key]}</b><small>{statusLabels[key]}</small></button>)}
          </div>

          <div className="admin-workspace">
            <section className="admin-list-panel">
              <div className="admin-panel-heading"><div><h2>제보 목록</h2><span>{filteredReports.length}건</span></div><button onClick={() => setFilter("all")}>전체 보기</button></div>
              <div className="admin-report-list">
                {filteredReports.map((report) => (
                  <button className={selected?.id === report.id ? "selected" : ""} key={report.id} onClick={() => setSelectedId(report.id)}>
                    <div><span className={`status-chip status-${report.status}`}>{statusLabels[report.status]}</span><small>{new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric" }).format(new Date(report.created_at))}</small></div>
                    <h3>{report.title}</h3><p>⌖ {report.address || report.place_description || "위치 확인 중"}</p>
                    <div className="admin-list-footer"><span>{report.category}</span><b>{report.assigned_agency || "담당기관 미배정"}</b></div>
                  </button>
                ))}
                {!filteredReports.length && <p className="empty-admin-list">해당 상태의 기록이 없습니다.</p>}
              </div>
            </section>

            <section className="admin-detail-panel">
              {selected ? <>
                <div className="admin-detail-top"><div><span className={`status-chip status-${selected.status}`}>{statusLabels[selected.status]}</span><small>{selected.id}</small></div><p>제보자 {selected.reporter_name || "익명"} · {new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" }).format(new Date(selected.created_at))}</p></div>
                <h2>{selected.title}</h2><p className="admin-location">⌖ {selected.address || selected.place_description || "위치 확인 중"}</p>
                <div className="admin-description"><small>주민 설명</small><p>{selected.description}</p></div>
                <section className="admin-evidence-section" aria-labelledby="admin-evidence-title">
                  <div className="admin-evidence-heading"><div><small>현장 첨부자료</small><h3 id="admin-evidence-title">사진·영상·음성</h3></div><span>{detailMedia.length || selected.media?.length || 0}개</span></div>
                  {detailMediaLoading && <p className="admin-media-message">첨부자료를 불러오고 있어요.</p>}
                  {!detailMediaLoading && detailMedia.length > 0 && <div className="admin-media-gallery">
                    {detailMedia.map((media, index) => <figure className={`admin-media-item media-${media.kind}`} key={media.id}>
                      {media.kind === "image" && <img src={media.previewUrl} alt={`${selected.title} 현장 사진 ${index + 1}`} />}
                      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                      {media.kind === "video" && <video src={media.previewUrl} controls preload="metadata" />}
                      {media.kind === "audio" && <div className="admin-audio-preview"><span>●</span><audio src={media.previewUrl} controls><track kind="captions" /></audio></div>}
                      <figcaption><b>{media.kind === "image" ? "사진" : media.kind === "video" ? "영상" : "음성"}</b><span>{media.name}</span></figcaption>
                    </figure>)}
                  </div>}
                  {!detailMediaLoading && detailMedia.length === 0 && (selected.media?.length ?? 0) > 0 && <div className="admin-media-metadata">
                    <div className="admin-evidence-placeholder"><HazardIllustration type={selected.category} /><span>현장 첨부자료 {selected.media?.length}개</span></div>
                    <ul>{selected.media?.map((media, index) => <li key={`${media.name}-${index}`}><b>{media.kind === "image" ? "사진" : media.kind === "video" ? "영상" : "음성"}</b><span>{media.name}</span></li>)}</ul>
                    <p>현재 프로토타입에서는 원본 파일이 제보에 사용한 브라우저에 보관됩니다. 클라우드 연결 후에는 다른 기기에서도 바로 재생됩니다.</p>
                  </div>}
                  {!detailMediaLoading && detailMedia.length === 0 && !(selected.media?.length ?? 0) && <p className="admin-media-message">이 기록에는 첨부자료가 없어요.</p>}
                </section>
                <dl className="admin-report-facts">
                  <div><dt>위험유형</dt><dd>{selected.category}</dd></div>
                  <div><dt>제보 시각</dt><dd>{formatReportDate(selected.observed_at || selected.created_at)}</dd></div>
                  <div><dt>날씨</dt><dd>{selected.weather ? `${describeWeather(selected.weather.code)} · ${Math.round(selected.weather.temperature)}°C` : "날씨 기록 없음"}</dd></div>
                  <div><dt>위치</dt><dd>{selected.address || selected.place_description || "위치 확인 중"}</dd></div>
                  {(selected.latitude != null && selected.longitude != null) && <div><dt>위치 좌표</dt><dd>{selected.latitude.toFixed(5)}, {selected.longitude.toFixed(5)}{selected.accuracy ? ` · 오차 약 ${Math.round(selected.accuracy)}m` : ""}</dd></div>}
                  <div><dt>접수 시각</dt><dd>{formatReportDate(selected.created_at)}</dd></div>
                </dl>
                <div className="admin-form-grid">
                  <label><span>처리 상태</span><select value={status} onChange={(event) => setStatus(event.target.value as ReportStatus)}>{statusOrder.map((item) => <option value={item} key={item}>{statusLabels[item]}</option>)}</select></label>
                  <label><span>담당기관</span><input value={agency} onChange={(event) => setAgency(event.target.value)} placeholder="예: 관할 도로관리과" disabled={user?.role === "agency_staff"} /></label>
                </div>
                <label className="admin-response-field"><span>주민에게 보일 답변</span><textarea rows={5} value={response} onChange={(event) => setResponse(event.target.value)} placeholder="현장 확인 내용과 다음 조치 일정을 적어주세요." /></label>
                {notice && <p className={`admin-notice ${notice.includes("반영") ? "success" : ""}`} role="status">{notice}</p>}
                <button className="admin-save-button" onClick={saveReport} disabled={saving}>{saving ? "저장 중" : "처리 현황 저장하기"}<span>→</span></button>
              </> : <p className="empty-admin-list">왼쪽에서 기록을 선택해주세요.</p>}
            </section>
          </div>
        </> : <section className="admin-accounts-workspace">
          <form className="staff-create-card" onSubmit={createAccount}>
            <div className="staff-card-heading"><span>권한 부여</span><h2>로그인 계정을 발급하세요.</h2><p>사용할 아이디와 비밀번호를 직접 정하고 역할과 소속 기관을 지정합니다.</p></div>
            <div className="staff-create-fields">
              <label><span>이름</span><input value={accountDraft.name} onChange={(event) => setAccountDraft((current) => ({ ...current, name: event.target.value }))} placeholder="예: 김한길 담당자" required /></label>
              <label><span>로그인 아이디</span><input value={accountDraft.loginId} onChange={(event) => setAccountDraft((current) => ({ ...current, loginId: event.target.value }))} placeholder="예: daejeon01 또는 name@agency.kr" minLength={4} maxLength={50} pattern="[A-Za-z0-9@._-]+" required /></label>
              <label><span>로그인 비밀번호</span><input type="password" minLength={4} value={accountDraft.password} onChange={(event) => setAccountDraft((current) => ({ ...current, password: event.target.value }))} placeholder="4자 이상" required /></label>
              <label><span>권한</span><select value={accountDraft.role} onChange={(event) => setAccountDraft((current) => ({ ...current, role: event.target.value as StaffRole }))}><option value="agency_staff">기관 담당자</option><option value="research_admin">연구원 관리자</option></select></label>
              <label className="staff-agency-field"><span>소속 기관·조직</span><input value={accountDraft.agency} onChange={(event) => setAccountDraft((current) => ({ ...current, agency: event.target.value }))} placeholder="예: 대전광역시 도로관리과" required /></label>
            </div>
            <button className="staff-create-button" type="submit" disabled={creatingAccount}>{creatingAccount ? "계정 생성 중" : "계정 만들기"}<span>＋</span></button>
          </form>

          <div className="staff-list-card">
            <div className="staff-list-heading"><div><span>운영 계정</span><h2>등록된 연구원·기관 담당자</h2></div><b>{accounts.filter((account) => account.active).length}명 사용 중</b></div>
            <div className="staff-account-list">
              {accounts.map((account) => <article className={!account.active ? "inactive" : ""} key={account.id}>
                <div className={`staff-avatar ${account.role === "agency_staff" ? "agency" : ""}`}>{account.role === "research_admin" ? "研" : "官"}</div>
                <div className="staff-identity"><strong>{account.name}</strong><span>아이디 · {account.loginId}</span><small>{account.id.startsWith("staff-demo-") ? "기본 체험 계정" : new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" }).format(new Date(account.createdAt)) + " 등록"}</small></div>
                <label><span>권한</span><select value={account.role} onChange={(event) => setAccounts((current) => current.map((item) => item.id === account.id ? { ...item, role: event.target.value as StaffRole } : item))}><option value="research_admin">연구원 관리자</option><option value="agency_staff">기관 담당자</option></select></label>
                <label><span>소속 기관</span><input value={account.agency} onChange={(event) => setAccounts((current) => current.map((item) => item.id === account.id ? { ...item, agency: event.target.value } : item))} /></label>
                <label><span>계정 상태</span><select value={account.active ? "active" : "inactive"} onChange={(event) => setAccounts((current) => current.map((item) => item.id === account.id ? { ...item, active: event.target.value === "active" } : item))}><option value="active">사용 중</option><option value="inactive">사용 중지</option></select></label>
                <button type="button" onClick={() => saveAccount(account)} disabled={savingAccountId === account.id}>{savingAccountId === account.id ? "저장 중" : "권한 저장"}</button>
              </article>)}
            </div>
          </div>
          {accountNotice && <p className={`admin-account-notice ${accountNotice.includes("했습니다") ? "success" : ""}`} role="status">{accountNotice}</p>}
        </section>}
        <p className="prototype-auth-note">현재 운영 계정은 이 브라우저에 안전한 검증값으로 저장됩니다. 실제 배포 시 AWS 계정 DB와 서버 권한 정책으로 교체됩니다.</p>
      </section>
    </main>
    <SiteFooter />
    </>
  );
}
