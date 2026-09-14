"use client";

import { useEffect, useMemo, useState } from "react";
import { SiteHeader } from "../components/site-header";
import { SiteFooter } from "../components/site-footer";
import { sitePath } from "../lib/site-path";

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

type EarnedBadge = {
  symbol: string;
  label: string;
  tone?: "mint" | "navy";
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

  const badges: EarnedBadge[] = [];
  if (reports.length >= 1) badges.push({ symbol: "1", label: "첫 발견" });
  if (reports.length >= 3) badges.push({ symbol: "路", label: "동네지킴이", tone: "mint" });
  if (reports.some((report) => report.type === "조도")) badges.push({ symbol: "☾", label: "밤길 관찰자", tone: "navy" });

  return {
    completedCount,
    points,
    streakWeeks,
    missionProgress,
    missionCompleted,
    badges,
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
    type: "단차",
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
    type: "적치물",
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
  const [reports, setReports] = useState<UserReport[]>(userReports);
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");
  const [selectedReport, setSelectedReport] = useState<UserReport | null>(null);
  const [detailMedia, setDetailMedia] = useState<ReportMediaPreview[]>([]);
  const [detailMediaLoading, setDetailMediaLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const participation = useMemo(() => calculateParticipation(reports), [reports]);
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
                category: legacy.type || "단차",
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

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = sitePath("/");
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
          <article className="badge-card">
            <p>내가 모은 배지</p>
            {participation.badges.length ? (
              <div className="badge-row">
                {participation.badges.map((badge) => (
                  <span key={badge.label}><i className={badge.tone ? `badge-${badge.tone}` : ""}>{badge.symbol}</i><b>{badge.label}</b></span>
                ))}
              </div>
            ) : (
              <div className="empty-badges"><i>＋</i><strong>아직 모은 배지가 없어요.</strong></div>
            )}
            <small>{participation.badges.length ? "기록과 확인 활동을 이어가면 새로운 배지가 열려요." : "첫 위험 기록을 남기면 ‘첫 발견’ 배지를 받아요."}</small>
          </article>
        </div>

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
