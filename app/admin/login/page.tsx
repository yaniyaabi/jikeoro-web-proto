"use client";

import { FormEvent, useState } from "react";
import { SiteHeader } from "../../components/site-header";
import { SiteFooter } from "../../components/site-footer";
import { sitePath } from "../../lib/site-path";

type AdminRole = "research_admin" | "agency_staff";

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loadingRole, setLoadingRole] = useState<AdminRole | "account" | null>(null);
  const [error, setError] = useState("");

  const loginWithAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoadingRole("account");
    setError("");
    const response = await fetch("/api/auth/admin-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }).catch(() => null);
    if (!response?.ok) {
      const data = await response?.json().catch(() => null);
      setLoadingRole(null);
      setError(data?.error ?? "로그인하지 못했어요. 입력 내용을 확인해주세요.");
      return;
    }
    window.location.href = sitePath("/admin/");
  };

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
    window.location.href = sitePath("/admin/");
  };

  return (
    <>
    <main className="admin-login-page">
      <SiteHeader active="admin" inner />
      <section className="admin-login-card">
        <p className="eyebrow">OPERATIONS SIGN IN</p>
        <h1>현장의 기록을<br />변화로 연결합니다.</h1>
        <p>관리자가 등록한 운영 계정으로 로그인하세요. 권한에 따라 확인할 수 있는 기록과 기능이 달라집니다.</p>
        <form className="admin-account-login" onSubmit={loginWithAccount}>
          <label><span>이메일</span><input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@organization.kr" required /></label>
          <label><span>비밀번호</span><input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="관리자가 전달한 초기 비밀번호" minLength={8} required /></label>
          <button type="submit" disabled={Boolean(loadingRole)}>{loadingRole === "account" ? "확인 중" : "운영 콘솔 로그인"}<i>→</i></button>
        </form>
        {error && <p className="admin-login-error" role="alert">{error}</p>}
        <div className="admin-login-divider"><span>프로토타입 빠른 체험</span></div>
        <div className="admin-role-options">
          <button onClick={() => login("research_admin")} disabled={Boolean(loadingRole)}>
            <span className="role-icon">研</span>
            <span><b>연구원 관리자</b><small>계정 생성·권한 관리, 전체 제보 검토와 기관 배정</small></span>
            <i>{loadingRole === "research_admin" ? "확인 중" : "→"}</i>
          </button>
          <button onClick={() => login("agency_staff")} disabled={Boolean(loadingRole)}>
            <span className="role-icon agency">官</span>
            <span><b>기관 담당자</b><small>우리 기관에 배정된 제보 확인과 조치 결과 등록</small></span>
            <i>{loadingRole === "agency_staff" ? "확인 중" : "→"}</i>
          </button>
        </div>
        <small className="demo-login-note">체험 로그인으로 들어가 계정·권한 관리 화면을 먼저 확인할 수 있습니다.</small>
      </section>
      <a className="back-home-link" href={sitePath("/")}>← 주민용 화면으로 돌아가기</a>
    </main>
    <SiteFooter />
    </>
  );
}
