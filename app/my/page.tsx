"use client";

import { useEffect, useState } from "react";
import { sitePath } from "../lib/site-path";

type ReportStatus = "received" | "review" | "action" | "completed";
type ActivityFilter = "all" | "active" | "completed";
type UserReport = {
  id: number | string;
  type: string;
  title: string;
  place: string;
  submitted: string;
  status: ReportStatus;
  stage: number;
  response: string;
  department: string;
  mediaCount?: number;
};

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
    place: "성수동 연무장길 골목",
    submitted: "8월 12일",
    status: "review",
    stage: 2,
    response: "야간 현장 확인 일정이 잡혔어요. 8월 19일까지 결과를 알려드릴게요.",
    department: "성동구청 도로과",
  },
  {
    id: 98,
    type: "단차",
    title: "약국 앞 보도블록 높이 차이",
    place: "서울숲길 새봄약국 앞",
    submitted: "8월 4일",
    status: "action",
    stage: 3,
    response: "현장 확인 후 보수 대상으로 분류되어 담당 유지보수팀에 전달됐어요.",
    department: "성수1가제1동 주민센터",
  },
  {
    id: 81,
    type: "적치물",
    title: "상가 입간판이 보행로를 막아요",
    place: "성수이로 복합문화공간 앞",
    submitted: "7월 21일",
    status: "completed",
    stage: 4,
    response: "상가 안내와 현장 정비를 마쳤어요. 통행 가능 폭 1.8m를 확보했습니다.",
    department: "성수2가제3동 주민센터",
  },
];

export default function MyJikeoroPage() {
  const [authReady, setAuthReady] = useState(false);
  const [reports, setReports] = useState<UserReport[]>(userReports);
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");
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

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = sitePath("/");
  };

  if (!authReady) {
    return <main className="member-page auth-loading" aria-live="polite">로그인 상태를 확인하고 있어요.</main>;
  }

  return (
    <main className="member-page">
      <header className="site-header member-header">
        <a className="brand" href={sitePath("/")} aria-label="지켜로 홈으로 이동">
          <span className="brand-mark" aria-hidden="true">路</span>
          <span><strong>지켜路</strong><small>우리동네 보행안전 지도</small></span>
        </a>
        <nav className="desktop-nav" aria-label="주요 메뉴">
          <a href={sitePath("/")}>홈</a>
          <a href={sitePath("/#map")}>위험지도</a>
          <a href={sitePath("/#how")}>참여방법</a>
        </nav>
        <div className="header-actions">
          <a className="header-cta" href={sitePath("/?report=1")}>위험요소 기록하기</a>
          <a className="account-button" href={sitePath("/my")} aria-current="page" aria-label="내 지켜로 활동">
            <span>김</span><b>김지킴</b>
          </a>
        </div>
      </header>

      <section className="member-section standalone" id="my-jikeoro">
        <div className="member-intro">
          <div>
            <p className="eyebrow">MY JIKEORO</p>
            <h1>김지킴님의 기록이<br />동네를 바꾸고 있어요.</h1>
          </div>
          <div className="member-profile">
            <span className="profile-avatar">김</span>
            <div><strong>김지킴</strong><small>서울 성동구 성수동 · 동네지킴이 Lv.2</small></div>
            <button type="button" onClick={logout}>로그아웃</button>
          </div>
        </div>

        <div className="participation-grid">
          <article className="impact-card">
            <p>나의 참여 효과</p>
            <strong>{reports.length}<span>건</span></strong>
            <small>남긴 기록 중 1건이 실제 개선으로 이어졌어요.</small>
            <div className="impact-stats">
              <span><b>420</b> 기여 포인트</span>
              <span><b>4주</b> 연속 참여</span>
            </div>
          </article>
          <article className="mission-card">
            <div className="mission-top"><span>이번 달 동네 미션</span><b>+150P</b></div>
            <h2>우리 동네 밤길을<br />한 번 더 살펴봐요</h2>
            <p>조명이 부족한 길 3곳 기록하기</p>
            <div className="mission-progress"><i style={{ width: "66%" }} /></div>
            <div className="mission-bottom"><strong>2 / 3곳 완료</strong><a href={sitePath("/?report=1")}>한 곳 더 기록하기 →</a></div>
          </article>
          <article className="badge-card">
            <p>내가 모은 배지</p>
            <div className="badge-row">
              <span><i>1</i><b>첫 발견</b></span>
              <span><i>路</i><b>동네지킴이</b></span>
              <span><i>☾</i><b>밤길 관찰자</b></span>
            </div>
            <small>기록과 확인 활동을 이어가면 새로운 배지가 열려요.</small>
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
              <article className="member-report" key={report.id}>
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
              </article>
            ))}
          </div>
        </div>
        <p className="prototype-auth-note">현재는 로그인·대응 현황을 미리 보여주는 프로토타입입니다. 실제 운영 단계에서는 본인 계정에 저장된 기록만 안전하게 표시됩니다.</p>
      </section>
    </main>
  );
}
