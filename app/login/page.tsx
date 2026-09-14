"use client";

import { FormEvent, useEffect, useState } from "react";
import { SiteFooter } from "../components/site-footer";
import { sitePath } from "../lib/site-path";

type AuthMode = "login" | "signup";

export default function MemberLoginPage() {
  const [mode, setMode] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("mode") === "signup") setMode("signup");
    fetch("/api/auth/session")
      .then((response) => response.json())
      .then((session) => {
        if (session.authenticated && session.user?.role === "member") window.location.replace(sitePath("/my/"));
      })
      .catch(() => undefined);
  }, []);

  const changeMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setError("");
    setPassword("");
    setPasswordConfirm("");
    window.history.replaceState({}, "", sitePath(`/login/${nextMode === "signup" ? "?mode=signup" : ""}`));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password) {
      setError("이메일과 비밀번호를 입력해주세요.");
      return;
    }
    if (mode === "signup") {
      if (name.trim().length < 2) {
        setError("이름을 두 글자 이상 입력해주세요.");
        return;
      }
      if (password.length < 8) {
        setError("비밀번호는 8자 이상 입력해주세요.");
        return;
      }
      if (password !== passwordConfirm) {
        setError("비밀번호가 서로 같지 않아요.");
        return;
      }
    }

    setLoading(true);
    const response = await fetch(mode === "signup" ? "/api/auth/register" : "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), email: normalizedEmail, password }),
    }).catch(() => null);
    setLoading(false);
    if (!response?.ok) {
      const result = await response?.json().catch(() => null);
      setError(result?.error ?? "처리하지 못했어요. 잠시 후 다시 시도해주세요.");
      return;
    }
    window.location.href = sitePath("/my/");
  };

  return (
    <>
      <main className="member-auth-page">
        <header className="member-auth-header">
          <a className="brand" href={sitePath("/")} aria-label="지켜로 홈">
            <span className="brand-mark" aria-hidden="true">路</span>
            <span><strong>지켜路</strong><small>우리 동네 보행안전 지도</small></span>
          </a>
          <a href={sitePath("/")}>홈으로 돌아가기</a>
        </header>

        <section className="member-auth-layout">
          <div className="member-auth-story">
            <p className="eyebrow">TOGETHER FOR SAFER STREETS</p>
            <h1>나의 기록이<br />우리 동네를 바꿉니다.</h1>
            <p>회원으로 참여하면 내가 남긴 위험 기록과 담당기관의 답변, 개선 과정을 한곳에서 확인할 수 있어요.</p>
            <ol>
              <li><span>1</span><b>쉽게 기록하고</b><small>사진·영상·음성으로 현장을 남겨요.</small></li>
              <li><span>2</span><b>처리 과정을 보고</b><small>접수부터 개선 완료까지 확인해요.</small></li>
              <li><span>3</span><b>더 안전한 길을 만들어요</b><small>주민의 경험이 보행환경 연구에 활용돼요.</small></li>
            </ol>
          </div>

          <div className="member-auth-card">
            <div className="member-auth-tabs" role="tablist" aria-label="로그인 또는 회원가입 선택">
              <button type="button" role="tab" aria-selected={mode === "login"} className={mode === "login" ? "active" : ""} onClick={() => changeMode("login")}>로그인</button>
              <button type="button" role="tab" aria-selected={mode === "signup"} className={mode === "signup" ? "active" : ""} onClick={() => changeMode("signup")}>회원가입</button>
            </div>

            <div className="member-auth-card-heading">
              <span>{mode === "login" ? "다시 만나 반가워요" : "지켜路와 함께해요"}</span>
              <h2>{mode === "login" ? "내 기록을 확인하세요." : "새 계정을 만들어보세요."}</h2>
              <p>{mode === "login" ? "가입한 이메일과 비밀번호를 입력해주세요." : "간단한 정보만 입력하면 바로 참여할 수 있어요."}</p>
            </div>

            <form className="member-auth-form" onSubmit={submit}>
              {mode === "signup" && <label><span>이름</span><input type="text" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" placeholder="예: 김지킴" /></label>}
              <label><span>이메일</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="name@example.com" /></label>
              <label>
                <span>비밀번호</span>
                <span className="member-password-field"><input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "signup" ? "new-password" : "current-password"} placeholder={mode === "signup" ? "8자 이상 입력" : "비밀번호 입력"} /><button type="button" onClick={() => setShowPassword((current) => !current)}>{showPassword ? "숨기기" : "보기"}</button></span>
              </label>
              {mode === "signup" && <label><span>비밀번호 확인</span><input type={showPassword ? "text" : "password"} value={passwordConfirm} onChange={(event) => setPasswordConfirm(event.target.value)} autoComplete="new-password" placeholder="비밀번호를 다시 입력" /></label>}
              {error && <p className="member-auth-error" role="alert">{error}</p>}
              <button className="member-auth-submit" type="submit" disabled={loading}>{loading ? "확인 중..." : mode === "login" ? "로그인하기" : "회원가입하고 시작하기"}<span>→</span></button>
            </form>

            <p className="member-auth-switch">{mode === "login" ? "아직 계정이 없나요?" : "이미 계정이 있나요?"} <button type="button" onClick={() => changeMode(mode === "login" ? "signup" : "login")}>{mode === "login" ? "회원가입" : "로그인"}</button></p>
            <small className="member-auth-prototype-note">현재 프로토타입 계정은 이 브라우저에만 임시 보관됩니다. AWS 연결 시 정식 인증 계정으로 전환됩니다.</small>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
