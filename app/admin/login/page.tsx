"use client";

import { FormEvent, useState } from "react";
import { SiteFooter } from "../../components/site-footer";
import { sitePath } from "../../lib/site-path";

export default function AdminLoginPage() {
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loginWithAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    const response = await fetch("/api/auth/admin-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ loginId, password }),
    }).catch(() => null);
    if (!response?.ok) {
      const data = await response?.json().catch(() => null);
      setLoading(false);
      setError(data?.error ?? "로그인하지 못했어요. 입력 내용을 확인해주세요.");
      return;
    }
    window.location.href = sitePath("/admin/");
  };

  return (
    <>
    <main className="admin-login-page">
      <section className="admin-login-card">
        <p className="eyebrow">OPERATIONS SIGN IN</p>
        <h1>현장의 기록을<br />변화로 연결합니다.</h1>
        <p>관리자가 발급한 아이디와 비밀번호로 로그인하세요. 부여된 권한에 따라 사용할 수 있는 기능이 달라집니다.</p>
        <form className="admin-account-login" onSubmit={loginWithAccount}>
          <label><span>로그인 아이디</span><input autoComplete="username" value={loginId} onChange={(event) => setLoginId(event.target.value)} placeholder="관리자가 발급한 아이디" required /></label>
          <label><span>비밀번호</span><input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="관리자가 전달한 비밀번호" minLength={4} required /></label>
          <button type="submit" disabled={loading}>{loading ? "확인 중" : "운영 콘솔 로그인"}<i>→</i></button>
        </form>
        {error && <p className="admin-login-error" role="alert">{error}</p>}
        <small className="admin-login-help">계정이 없다면 연구원 관리자에게 아이디와 권한 발급을 요청해주세요.</small>
      </section>
      <a className="back-home-link" href={sitePath("/")}>← 주민용 화면으로 돌아가기</a>
    </main>
    <SiteFooter />
    </>
  );
}
