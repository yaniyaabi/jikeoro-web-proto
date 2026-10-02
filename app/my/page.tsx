"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import { SiteHeader } from "../components/site-header";
import { SiteFooter } from "../components/site-footer";
import { sitePath } from "../lib/site-path";
import { normalizeHazardCategory } from "../lib/hazard-categories";

type ReportStatus = "received" | "review" | "action" | "completed";
type ActivityFilter = "all" | "active" | "completed";
type UserReport = {
  id: number | string;
  type: string;
  title: string;
  description?: string;
  place: string;
  submitted: string;
  createdAt?: string;
  observedAt?: string;
  latitude?: number | null;
  longitude?: number | null;
  accuracy?: number | null;
  weather?: { temperature: number; code: number; observedAt: string } | null;
  status: ReportStatus;
  stage: number;
  response: string;
  department: string;
  mediaCount?: number;
};

type StoredReportMedia = {
  id: string;
  reportId: string;
  kind: "image" | "video" | "audio";
  name: string;
  type: string;
  blob: Blob;
};

type ReportMediaPreview = StoredReportMedia & { previewUrl: string };

const REWARD_EXCHANGE_MINIMUM = 10_000;
const REWARD_FORM_URL = "https://docs.google.com/forms/d/e/1FAIpQLSd6PApYqiWa-HbE5LyGA8bKAecQshSCMu38oAD6E1xlUOWRVQ/viewform";
const REWARD_FORM_ENTRIES = {
  name: "entry.1605426205",
  email: "entry.1819571806",
  phone: "entry.1254984587",
  points: "entry.103413830",
};

function startOfWeek(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const day = date.getDay();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - ((day + 6) % 7));
  return date;
}

function calculateParticipation(reports: UserReport[]) {
  const completedCount = reports.filter((report) => report.status === "completed").length;
  const now = new Date();
  const lightingReportsThisMonth = reports.filter((report) => {
    if (report.type !== "조도" || !report.createdAt) return false;
    const createdAt = new Date(report.createdAt);
    return !Number.isNaN(createdAt.getTime())
      && createdAt.getFullYear() === now.getFullYear()
      && createdAt.getMonth() === now.getMonth();
  }).length;
  const missionProgress = Math.min(lightingReportsThisMonth, 3);
  const missionCompleted = lightingReportsThisMonth >= 3;
  const points = reports.length * 100 + completedCount * 50 + (missionCompleted ? 150 : 0);

  const weekStarts = Array.from(new Set(reports
    .map((report) => report.createdAt ? startOfWeek(report.createdAt)?.getTime() : null)
    .filter((value): value is number => value != null)))
    .sort((a, b) => b - a);
  let streakWeeks = weekStarts.length ? 1 : 0;
  for (let index = 1; index < weekStarts.length; index += 1) {
    const previousWeek = weekStarts[index - 1];
    const currentWeek = weekStarts[index];
    if (Math.round((previousWeek - currentWeek) / 604_800_000) !== 1) break;
    streakWeeks += 1;
  }

  return {
    completedCount,
    points,
    streakWeeks,
    missionProgress,
    missionCompleted,
    level: reports.length === 0 ? 0 : Math.floor((reports.length - 1) / 3) + 1,
  };
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

async function deleteReportMedia(reportId: string) {
  if (!("indexedDB" in window)) return;
  await new Promise<void>((resolve) => {
    const request = window.indexedDB.open("jikeoro-media", 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("media")) database.createObjectStore("media", { keyPath: "id" });
    };
    request.onerror = () => resolve();
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction("media", "readwrite");
      const store = transaction.objectStore("media");
      const getAllKeys = store.getAllKeys();
      getAllKeys.onsuccess = () => {
        getAllKeys.result.forEach((key) => {
          if (String(key).startsWith(`${reportId}-`)) store.delete(key);
        });
      };
      transaction.oncomplete = () => { database.close(); resolve(); };
      transaction.onerror = () => { database.close(); resolve(); };
    };
  });
}

function describeWeather(code: number) {
  if (code === 0) return "맑음";
  if (code <= 3) return "구름";
  if (code === 45 || code === 48) return "안개";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "비";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "눈";
  if (code >= 95) return "뇌우";
  return "날씨 기록";
}

const statusLabels: Record<ReportStatus, string> = {
  received: "접수 완료",
  review: "현장 검토 중",
  action: "조치 요청",
  completed: "개선 완료",
};

const userReports: UserReport[] = [
  {
    id: 103,
    type: "조도",
    title: "골목길 가로등 사이가 어두워요",
    place: "우리 동네 골목길",
    submitted: "8월 12일",
    status: "review",
    stage: 2,
    response: "야간 현장 확인 일정이 잡혔어요. 8월 19일까지 결과를 알려드릴게요.",
    department: "관할 도로관리과",
  },
  {
    id: 98,
    type: "인도",
    title: "약국 앞 보도블록 높이 차이",
    place: "새봄약국 앞",
    submitted: "8월 4일",
    status: "action",
    stage: 3,
    response: "현장 확인 후 보수 대상으로 분류되어 담당 유지보수팀에 전달됐어요.",
    department: "우리 동네 주민센터",
  },
  {
    id: 81,
    type: "기타",
    title: "상가 입간판이 보행로를 막아요",
    place: "복합문화공간 앞",
    submitted: "7월 21일",
    status: "completed",
    stage: 4,
    response: "상가 안내와 현장 정비를 마쳤어요. 통행 가능 폭 1.8m를 확보했습니다.",
    department: "관할 도로관리기관",
  },
];

export default function MyJikeoroPage() {
  const [authReady, setAuthReady] = useState(false);
  const [memberName, setMemberName] = useState("김지킴");
  const [memberEmail, setMemberEmail] = useState("member@jikeoro.local");
  const [reports, setReports] = useState<UserReport[]>(userReports);
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");
  const [selectedReport, setSelectedReport] = useState<UserReport | null>(null);
  const [detailMedia, setDetailMedia] = useState<ReportMediaPreview[]>([]);
  const [detailMediaLoading, setDetailMediaLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [rewardFormOpen, setRewardFormOpen] = useState(false);
  const [rewardPhone, setRewardPhone] = useState("");
  const [rewardFormError, setRewardFormError] = useState("");
  const participation = useMemo(() => calculateParticipation(reports), [reports]);
  const rewardExchangeRemaining = Math.max(0, REWARD_EXCHANGE_MINIMUM - participation.points);
  const rewardExchangeProgress = Math.min(100, (participation.points / REWARD_EXCHANGE_MINIMUM) * 100);
  const canExchangeReward = participation.points >= REWARD_EXCHANGE_MINIMUM;
  const visibleReports = reports.filter((report) => {
    if (activityFilter === "completed") return report.status === "completed";
    if (activityFilter === "active") return report.status !== "completed";
    return true;
  });

  useEffect(() => {
    const loadMemberData = async () => {
      try {
        const sessionResponse = await fetch("/api/auth/session");
        const session = await sessionResponse.json();
        if (!session.authenticated) {
          window.location.replace(sitePath("/"));
          return;
        }
        if (session.user?.role !== "member") {
          window.location.replace(sitePath("/admin"));
          return;
        }
        if (session.user?.name) setMemberName(session.user.name);
        if (session.user?.email) setMemberEmail(session.user.email);

        const pendingReportId = window.sessionStorage.getItem("jikeoro-pending-report-id");
        if (pendingReportId) {
          const claimResponse = await fetch("/api/reports/claim", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: pendingReportId }),
          });
          if (claimResponse.ok) window.sessionStorage.removeItem("jikeoro-pending-report-id");
        }

        const legacyReport = window.sessionStorage.getItem("jikeoro-demo-latest-report");
        if (legacyReport) {
          try {
            const legacy = JSON.parse(legacyReport) as { type?: string; title?: string; place?: string };
            const migrationResponse = await fetch("/api/reports", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                category: normalizeHazardCategory(legacy.type),
                title: legacy.title || "이전에 남긴 위험 기록",
                description: legacy.title || "DB 연결 전에 남긴 기록을 복구했습니다.",
                placeDescription: legacy.place || "기록 당시 입력한 위치",
              }),
            });
            if (migrationResponse.ok) window.sessionStorage.removeItem("jikeoro-demo-latest-report");
          } catch {
            window.sessionStorage.removeItem("jikeoro-demo-latest-report");
          }
        }

        const reportsResponse = await fetch("/api/reports");
        if (reportsResponse.ok) {
          const data = await reportsResponse.json();
          const stageByStatus: Record<ReportStatus, number> = { received: 1, review: 2, action: 3, completed: 4 };
          setReports(data.reports.map((report: UserReport & { createdAt: string }) => ({
            ...report,
            type: normalizeHazardCategory(report.type),
            submitted: new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric" }).format(new Date(report.createdAt)),
            stage: stageByStatus[report.status],
            department: report.department || "지켜路 운영팀",
          })));
        }
        setAuthReady(true);
      } catch {
        window.location.replace(sitePath("/"));
      }
    };
    loadMemberData();
  }, []);

  useEffect(() => {
    if (!selectedReport) return;
    let disposed = false;
    let previewUrls: string[] = [];
    setDetailMedia([]);
    setDetailMediaLoading(true);
    setDeleteError("");
    readReportMedia(String(selectedReport.id)).then((items) => {
      if (disposed) return;
      const previews = items.map((item) => ({ ...item, previewUrl: URL.createObjectURL(item.blob) }));
      previewUrls = previews.map((item) => item.previewUrl);
      setDetailMedia(previews);
      setDetailMediaLoading(false);
    });
    return () => {
      disposed = true;
      previewUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [selectedReport]);

  useEffect(() => {
    if (!selectedReport) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !deleting) setSelectedReport(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selectedReport, deleting]);

  useEffect(() => {
    if (!rewardFormOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setRewardFormOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [rewardFormOpen]);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = sitePath("/");
  };

  const openRewardForm = () => {
    setRewardPhone(window.localStorage.getItem("jikeoro-reward-phone") ?? "");
    setRewardFormError("");
    setRewardFormOpen(true);
  };

  const submitRewardForm = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedPhone = rewardPhone.replace(/\D/g, "");
    if (normalizedPhone.length < 10 || normalizedPhone.length > 11) {
      setRewardFormError("휴대전화 번호를 정확히 입력해주세요.");
      return;
    }
    if (REWARD_FORM_URL.includes("FORM_ID")) {
      setRewardFormError("신청 양식을 연결하는 중입니다. 잠시 후 다시 시도해주세요.");
      return;
    }
    window.localStorage.setItem("jikeoro-reward-phone", rewardPhone.trim());
    const formUrl = new URL(REWARD_FORM_URL);
    formUrl.searchParams.set("usp", "pp_url");
    formUrl.searchParams.set(REWARD_FORM_ENTRIES.name, memberName);
    formUrl.searchParams.set(REWARD_FORM_ENTRIES.email, memberEmail);
    formUrl.searchParams.set(REWARD_FORM_ENTRIES.phone, rewardPhone.trim());
    formUrl.searchParams.set(REWARD_FORM_ENTRIES.points, `${participation.points}P`);
    window.open(formUrl.toString(), "_blank", "noopener,noreferrer");
    setRewardFormOpen(false);
  };

  const deleteSelectedReport = async () => {
    if (!selectedReport || deleting) return;
    if (!window.confirm("이 기록과 이 기기에 저장된 첨부파일을 삭제할까요? 삭제한 기록은 되돌릴 수 없습니다.")) return;
    setDeleting(true);
    setDeleteError("");
    const response = await fetch("/api/reports", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: String(selectedReport.id) }),
    }).catch(() => null);
    if (!response?.ok) {
      const result = await response?.json().catch(() => null);
      setDeleteError(result?.error ?? "기록을 삭제하지 못했어요. 잠시 후 다시 시도해주세요.");
      setDeleting(false);
      return;
    }
    await deleteReportMedia(String(selectedReport.id));
    setReports((current) => current.filter((report) => String(report.id) !== String(selectedReport.id)));
    setSelectedReport(null);
    setDetailMedia([]);
    setDeleting(false);
  };

  if (!authReady) {
    return <main className="member-page auth-loading" aria-live="polite">로그인 상태를 확인하고 있어요.</main>;
  }

  return (
    <>
    <main className="member-page">
      <SiteHeader active="my" inner />

      <section className="member-section standalone" id="my-jikeoro">
        <div className="member-intro">
          <div>
            <p className="eyebrow">MY JIKEORO</p>
            <h1>{memberName}님의 기록이<br />동네를 바꾸고 있어요.</h1>
          </div>
          <div className="member-profile">
            <span className="profile-avatar">{memberName.slice(0, 1)}</span>
            <div><strong>{memberName}</strong><small>우리 동네 주민 · 동네지킴이 Lv.{participation.level}</small></div>
            <button type="button" onClick={logout}>로그아웃</button>
          </div>
        </div>

        <div className="participation-grid">
          <article className="impact-card">
            <p>나의 참여 효과</p>
            <strong>{reports.length}<span>건</span></strong>
            <small>{reports.length ? `남긴 기록 중 ${participation.completedCount}건이 개선 완료됐어요.` : "첫 번째 위험 기록을 남겨 우리 동네를 살펴보세요."}</small>
            <div className="impact-stats">
              <span><b>{participation.points}</b> 기여 포인트</span>
              <span><b>{participation.streakWeeks}주</b> 연속 참여</span>
            </div>
            <small className="point-rule">기록 1건당 100P · 개선 완료 시 50P 추가</small>
          </article>
          <article className="mission-card">
            <div className="mission-top"><span>이번 달 동네 미션</span><b>+150P</b></div>
            <h2>우리 동네 밤길을<br />한 번 더 살펴봐요</h2>
            <p>조명이 부족한 길 3곳 기록하기</p>
            <div className="mission-progress"><i style={{ width: `${(participation.missionProgress / 3) * 100}%` }} /></div>
            <div className="mission-bottom">
              <strong>{participation.missionProgress} / 3곳 완료</strong>
              <a href={sitePath("/?report=1")}>{participation.missionCompleted ? "미션 완료 ✓" : participation.missionProgress ? "한 곳 더 기록하기 →" : "첫 조명 기록하기 →"}</a>
            </div>
          </article>
        </div>

        <section className="reward-exchange" aria-labelledby="reward-exchange-title">
          <div className="reward-exchange-copy">
            <p className="eyebrow">MILEAGE REWARD</p>
            <h2 id="reward-exchange-title">모은 마일리지를<br />우리 동네에서 사용해요.</h2>
            <p>10,000P부터 온누리상품권 등 지역상품권으로 교환할 수 있도록 준비하고 있어요.</p>
            <div className="reward-exchange-balance"><span>현재 보유</span><strong>{participation.points.toLocaleString()}P</strong></div>
          </div>
          <article className="reward-voucher-card">
            <div className="reward-voucher-top"><span>디지털 온누리상품권</span><b>교환 준비 중</b></div>
            <div className="reward-voucher-mark"><i><img src={sitePath("/onnuri-logo-3d.png")} alt="디지털 온누리상품권" /></i><div><small>교환 시작 기준</small><strong>10,000P</strong></div></div>
            <div className="reward-exchange-progress" aria-label={`상품권 교환까지 ${Math.round(rewardExchangeProgress)}%`}><i style={{ width: `${rewardExchangeProgress}%` }} /></div>
            <div className="reward-exchange-bottom">
              <p>{canExchangeReward ? "교환 가능한 마일리지가 모였어요." : `${rewardExchangeRemaining.toLocaleString()}P를 더 모으면 교환할 수 있어요.`}</p>
              <button type="button" disabled={!canExchangeReward} aria-describedby="reward-exchange-note" onClick={openRewardForm}>{canExchangeReward ? "교환 신청하기" : "10,000P부터 신청"}</button>
            </div>
            <small id="reward-exchange-note">신청서를 보내면 담당자가 확인한 뒤 입력한 휴대전화로 상품권을 발송합니다.</small>
          </article>
        </section>

        <div className="activity-board">
          <div className="activity-heading">
            <div><p className="eyebrow">MY REPORTS</p><h2>내가 남긴 기록과 대응 현황</h2></div>
            <div className="activity-filters" role="group" aria-label="내 기록 상태 필터">
              <button className={activityFilter === "all" ? "active" : ""} onClick={() => setActivityFilter("all")}>전체 {reports.length}</button>
              <button className={activityFilter === "active" ? "active" : ""} onClick={() => setActivityFilter("active")}>처리 중</button>
              <button className={activityFilter === "completed" ? "active" : ""} onClick={() => setActivityFilter("completed")}>완료</button>
            </div>
          </div>
          <div className="member-report-list" aria-live="polite">
            {visibleReports.map((report) => (
              <article
                className="member-report"
                key={report.id}
                role="button"
                tabIndex={0}
                aria-label={`${report.title} 상세 내용 보기`}
                onClick={() => setSelectedReport(report)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedReport(report);
                  }
                }}
              >
                <div className="report-main">
                  <div className="report-meta"><span className={`status-chip status-${report.status}`}>{statusLabels[report.status]}</span><small>{report.submitted} · {report.type}</small></div>
                  <h3>{report.title}</h3>
                  <p>⌖ {report.place}</p>
                  {Boolean(report.mediaCount) && <span className="report-media-count">사진·영상·음성 {report.mediaCount}개 첨부</span>}
                </div>
                <div className="response-box"><small>{report.department} 답변</small><p>{report.response}</p></div>
                <ol className="status-track" aria-label={`${report.title} 처리 단계`}>
                  {["접수", "현장 검토", "조치 전달", "개선 완료"].map((label, index) => (
                    <li className={index < report.stage ? "done" : ""} key={label}><i>{index < report.stage ? "✓" : index + 1}</i><span>{label}</span></li>
                  ))}
                </ol>
                <span className="member-report-open-hint">상세 보기 <b>→</b></span>
              </article>
            ))}
            {!visibleReports.length && <p className="empty-member-reports">아직 해당하는 기록이 없어요.<a href={sitePath("/?report=1")}>첫 위험요소 기록하기 →</a></p>}
          </div>
        </div>
        <p className="prototype-auth-note">현재는 로그인·대응 현황을 미리 보여주는 프로토타입입니다. 실제 운영 단계에서는 본인 계정에 저장된 기록만 안전하게 표시됩니다.</p>
      </section>

      {rewardFormOpen && (
        <div className="reward-form-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setRewardFormOpen(false)}>
          <section className="reward-form-modal" role="dialog" aria-modal="true" aria-labelledby="reward-form-title">
            <button className="reward-form-close" type="button" onClick={() => setRewardFormOpen(false)} aria-label="교환 신청 닫기">×</button>
            <img className="reward-form-logo" src={sitePath("/onnuri-logo-3d.png")} alt="디지털 온누리상품권" />
            <p className="eyebrow">10,000P REWARD</p>
            <h2 id="reward-form-title">상품권 교환을 신청할까요?</h2>
            <p>회원 정보와 연락처가 입력된 Google Form이 열립니다. 내용을 확인해 제출하면 담당자가 확인 후 휴대전화로 보내드려요.</p>
            <form onSubmit={submitRewardForm}>
              <div className="reward-applicant-summary"><span><small>이름</small><strong>{memberName}</strong></span><span><small>이메일</small><strong>{memberEmail}</strong></span></div>
              <label><span>상품권 받을 휴대전화 번호</span><input type="tel" inputMode="tel" autoComplete="tel" value={rewardPhone} onChange={(event) => { setRewardPhone(event.target.value); setRewardFormError(""); }} placeholder="010-1234-5678" /></label>
              {rewardFormError && <p className="reward-form-error" role="alert">{rewardFormError}</p>}
              <button type="submit">Google Form에서 신청 계속하기 <span>→</span></button>
            </form>
            <small>Google Form 제출 전까지 포인트는 차감되지 않습니다.</small>
          </section>
        </div>
      )}

      {selectedReport && (
        <div className="member-detail-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !deleting && setSelectedReport(null)}>
          <section className="member-detail-modal" role="dialog" aria-modal="true" aria-labelledby="member-detail-title">
            <button className="member-detail-close" type="button" onClick={() => setSelectedReport(null)} disabled={deleting} aria-label="상세 내용 닫기">×</button>

            <header className="member-detail-heading">
              <div className="report-meta">
                <span className={`status-chip status-${selectedReport.status}`}>{statusLabels[selectedReport.status]}</span>
                <small>{selectedReport.type} · {selectedReport.submitted}</small>
              </div>
              <h2 id="member-detail-title">{selectedReport.title}</h2>
              <p>내가 남긴 위험 기록의 내용과 첨부자료를 확인할 수 있어요.</p>
            </header>

            <div className="member-detail-grid">
              <div className="member-detail-main">
                <section className="member-detail-section">
                  <h3>제보 내용</h3>
                  <p>{selectedReport.description?.trim() || selectedReport.title}</p>
                </section>

                <section className="member-detail-section">
                  <div className="member-detail-section-title">
                    <h3>첨부자료</h3>
                    <span>{detailMedia.length || selectedReport.mediaCount || 0}개</span>
                  </div>
                  {detailMediaLoading && <p className="member-media-message">첨부자료를 불러오고 있어요.</p>}
                  {!detailMediaLoading && detailMedia.length > 0 && (
                    <div className="member-media-gallery">
                      {detailMedia.map((media, index) => (
                        <figure className={`member-media-item media-${media.kind}`} key={media.id}>
                          {media.kind === "image" && <img src={media.previewUrl} alt={`${selectedReport.title} 첨부 사진 ${index + 1}`} />}
                          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                          {media.kind === "video" && <video src={media.previewUrl} controls preload="metadata" />}
                          {media.kind === "audio" && <div className="member-audio-preview"><span>●</span><audio src={media.previewUrl} controls /></div>}
                          <figcaption><b>{media.kind === "image" ? "사진" : media.kind === "video" ? "영상" : "음성"}</b><span>{media.name}</span></figcaption>
                        </figure>
                      ))}
                    </div>
                  )}
                  {!detailMediaLoading && detailMedia.length === 0 && (
                    <p className="member-media-message">
                      {selectedReport.mediaCount ? "첨부 원본은 제보에 사용한 같은 기기와 브라우저에서만 확인할 수 있어요." : "이 기록에는 첨부자료가 없어요."}
                    </p>
                  )}
                </section>
              </div>

              <aside className="member-detail-side">
                <dl className="member-detail-facts">
                  <div><dt>위험유형</dt><dd>{selectedReport.type}</dd></div>
                  <div><dt>위치</dt><dd>{selectedReport.place}</dd></div>
                  {(selectedReport.latitude != null && selectedReport.longitude != null) && <div><dt>위치 좌표</dt><dd>{selectedReport.latitude.toFixed(5)}, {selectedReport.longitude.toFixed(5)}</dd></div>}
                  <div><dt>제보 시각</dt><dd>{selectedReport.createdAt ? new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(selectedReport.createdAt)) : selectedReport.submitted}</dd></div>
                  {selectedReport.weather && <div><dt>날씨</dt><dd>{describeWeather(selectedReport.weather.code)} · {Math.round(selectedReport.weather.temperature)}°C</dd></div>}
                </dl>
                <div className="member-detail-response">
                  <small>{selectedReport.department} 답변</small>
                  <p>{selectedReport.response}</p>
                </div>
              </aside>
            </div>

            {deleteError && <p className="member-delete-error" role="alert">{deleteError}</p>}
            <div className="member-detail-actions">
              <button type="button" className="member-delete-button" onClick={deleteSelectedReport} disabled={deleting}>{deleting ? "삭제 중..." : "기록 삭제"}</button>
              <button type="button" className="member-detail-done" onClick={() => setSelectedReport(null)} disabled={deleting}>확인</button>
            </div>
          </section>
        </div>
      )}
    </main>
    <SiteFooter />
    </>
  );
}
