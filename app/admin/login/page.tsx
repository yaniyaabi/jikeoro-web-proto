"use client";

import { useState } from "react";
import { sitePath } from "../../lib/site-path";

type AdminRole = "research_admin" | "agency_staff";

export default function AdminLoginPage() {
  const [loadingRole, setLoadingRole] = useState<AdminRole | null>(null);
  const [error, setError] = useState("");

  const login = async (role: AdminRole) => {
    setLoadingRole(role);
    setError("");
    const response = await fetch("/api/auth/demo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    }).catch(() => null);
    if (!response?.ok) {
      setLoadingRole(null);
      setError("로그인하지 못했어요. 잠시 후 다시 시도해주세요.");
      return;
    }
    window.location.href = sitePath("/admin");
  };

  return (
    <main className="admin-login-page">
      <a className="brand admin-login-brand" href="/" aria-label="지켜로 홈">
        <span className="brand-mark" aria-hidden="true">路</span>
        <span><strong>지켜路</strong><small>우리동네 보행안전 지도</small></span>
      </a>
      <section className="admin-login-card">
        <p className="eyebrow">OPERATIONS SIGN IN</p>
        <h1>현장의 기록을<br />변화로 연결합니다.</h1>
        <p>역할에 따라 확인할 수 있는 기록과 처리 권한이 달라집니다.</p>
        <div className="admin-role-options">
          <button onClick={() => login("research_admin")} disabled={Boolean(loadingRole)}>
            <span className="role-icon">研</span>
            <span><b>연구진·관리자</b><small>전체 제보 검토, 담당기관 배정, 처리 현황 관리</small></span>
            <i>{loadingRole === "research_admin" ? "확인 중" : "→"}</i>
          </button>
          <button onClick={() => login("agency_staff")} disabled={Boolean(loadingRole)}>
            <span className="role-icon agency">官</span>
            <span><b>담당기관</b><small>배정된 제보 확인, 답변 작성, 조치 결과 등록</small></span>
            <i>{loadingRole === "agency_staff" ? "확인 중" : "→"}</i>
          </button>
        </div>
        {error && <p className="admin-login-error" role="alert">{error}</p>}
        <small className="demo-login-note">현재는 운영 흐름을 확인하기 위한 역할별 체험 로그인입니다.</small>
      </section>
      <a className="back-home-link" href="/">← 주민용 화면으로 돌아가기</a>
    </main>
  );
}
