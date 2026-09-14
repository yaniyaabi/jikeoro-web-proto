"use client";

import { useEffect, useState } from "react";
import { sitePath } from "../lib/site-path";

type HeaderSection = "home" | "map" | "my" | "admin";

export function SiteHeader({ active, inner = false }: { active: HeaderSection; inner?: boolean }) {
  const [sessionRole, setSessionRole] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((response) => response.json())
      .then((data) => setSessionRole(data.authenticated ? data.user?.role ?? null : null))
      .catch(() => setSessionRole(null));
  }, []);

  const login = async () => {
    const response = await fetch("/api/auth/demo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "member" }),
    }).catch(() => null);
    if (response?.ok) window.location.href = sitePath("/my/");
  };

  return (
    <header className={`site-header universal-header${inner ? " member-header" : ""}`}>
      <a className="brand" href={sitePath("/")} aria-label="지켜로 홈">
        <span className="brand-mark" aria-hidden="true">路</span>
        <span><strong>지켜路</strong><small>우리 동네 보행안전 지도</small></span>
      </a>

      <nav className="desktop-nav" aria-label="주요 메뉴">
        <a className={active === "home" ? "active" : ""} href={sitePath("/")}>홈</a>
        <a className={active === "map" ? "active" : ""} href={sitePath("/map/")}>위험지도</a>
        <a className={active === "my" ? "active" : ""} href={sitePath("/my/")}>내 기록</a>
      </nav>

      <div className="header-actions">
        <a className="header-cta" href={sitePath("/?report=1")}>위험요소 기록하기</a>
        {sessionRole === "member" ? (
          <a className="account-button" href={sitePath("/my/")} aria-label="내 지켜로 활동 보기"><span>김</span><b>김지킴</b></a>
        ) : sessionRole === "research_admin" || sessionRole === "agency_staff" ? (
          <a className="login-button" href={sitePath("/admin/")}>관리자</a>
        ) : (
          <button className="login-button" type="button" onClick={login}>로그인</button>
        )}
      </div>
    </header>
  );
}
