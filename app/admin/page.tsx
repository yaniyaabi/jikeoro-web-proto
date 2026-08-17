"use client";

import { useEffect, useMemo, useState } from "react";
import { sitePath } from "../lib/site-path";

type ReportStatus = "received" | "review" | "action" | "completed";
type AdminUser = { name: string; role: "research_admin" | "agency_staff"; agency: string | null };
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
  created_at: string;
  updated_at: string;
};

const statusLabels: Record<ReportStatus, string> = { received: "신규 접수", review: "검토 중", action: "조치 중", completed: "개선 완료" };
const statusOrder: ReportStatus[] = ["received", "review", "action", "completed"];

export default function AdminPage() {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [filter, setFilter] = useState<"all" | ReportStatus>("all");
  const [status, setStatus] = useState<ReportStatus>("received");
  const [agency, setAgency] = useState("");
  const [response, setResponse] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [ready, setReady] = useState(false);

  const loadReports = async () => {
    const apiResponse = await fetch("/api/admin/reports");
    if (!apiResponse.ok) {
      window.location.replace(sitePath("/admin/login"));
      return;
    }
    const data = await apiResponse.json();
    setUser(data.user);
    setReports(data.reports);
    setSelectedId((current) => current || data.reports[0]?.id || "");
    setReady(true);
  };

  useEffect(() => { loadReports().catch(() => window.location.replace(sitePath("/admin/login"))); }, []);

  const filteredReports = useMemo(() => filter === "all" ? reports : reports.filter((report) => report.status === filter), [filter, reports]);
  const selected = reports.find((report) => report.id === selectedId) ?? filteredReports[0] ?? null;

  useEffect(() => {
    if (!selected) return;
    setStatus(selected.status);
    setAgency(selected.assigned_agency ?? "");
    setResponse(selected.response ?? "");
    setNotice("");
  }, [selected?.id]);

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

  if (!ready) return <main className="member-page auth-loading">관리자 기록을 불러오고 있어요.</main>;

  const counts = statusOrder.reduce((result, key) => ({ ...result, [key]: reports.filter((report) => report.status === key).length }), {} as Record<ReportStatus, number>);

  return (
    <main className="admin-page">
      <header className="site-header member-header admin-header">
        <a className="brand" href={sitePath("/")} aria-label="지켜로 홈"><span className="brand-mark">路</span><span><strong>지켜路</strong><small>보행안전 운영센터</small></span></a>
        <span className="admin-console-label">관리자 콘솔</span>
        <div className="admin-account"><span>{user?.role === "research_admin" ? "研" : "官"}</span><div><b>{user?.name}</b><small>{user?.role === "research_admin" ? "연구진·관리자" : user?.agency}</small></div><button onClick={logout}>로그아웃</button></div>
      </header>

      <section className="admin-main">
        <div className="admin-title-row"><div><p className="eyebrow">REPORT OPERATIONS</p><h1>성수동 보행위험<br />처리 현황</h1></div><p>{user?.role === "research_admin" ? "전체 기록을 검토하고 담당기관을 연결합니다." : "우리 기관에 배정된 기록을 확인하고 처리 결과를 남깁니다."}</p></div>
        <div className="admin-stats">
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
              <div className="admin-form-grid">
                <label><span>처리 상태</span><select value={status} onChange={(event) => setStatus(event.target.value as ReportStatus)}>{statusOrder.map((item) => <option value={item} key={item}>{statusLabels[item]}</option>)}</select></label>
                <label><span>담당기관</span><input value={agency} onChange={(event) => setAgency(event.target.value)} placeholder="예: 성동구청 도로과" disabled={user?.role === "agency_staff"} /></label>
              </div>
              <label className="admin-response-field"><span>주민에게 보일 답변</span><textarea rows={5} value={response} onChange={(event) => setResponse(event.target.value)} placeholder="현장 확인 내용과 다음 조치 일정을 적어주세요." /></label>
              {notice && <p className={`admin-notice ${notice.includes("반영") ? "success" : ""}`} role="status">{notice}</p>}
              <button className="admin-save-button" onClick={saveReport} disabled={saving}>{saving ? "저장 중" : "처리 현황 저장하기"}<span>→</span></button>
            </> : <p className="empty-admin-list">왼쪽에서 기록을 선택해주세요.</p>}
          </section>
        </div>
        <p className="prototype-auth-note">체험 로그인은 운영 구조를 검토하기 위한 기능입니다. 실제 배포 시 기관 계정 인증과 서버 권한 정책으로 교체됩니다.</p>
      </section>
    </main>
  );
}
