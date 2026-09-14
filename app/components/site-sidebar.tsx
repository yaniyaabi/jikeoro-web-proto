"use client";

import { useEffect, useState } from "react";
import { sitePath } from "../lib/site-path";

type SidebarSection = "home" | "map" | "my" | "admin";

export function SiteSidebar({ active }: { active: SidebarSection }) {
  const [open, setOpen] = useState(false);
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
    if (response?.ok) window.location.href = sitePath("/my");
  };

  const close = () => setOpen(false);

  return (
    <>
      <button className="sidebar-menu-toggle" type="button" onClick={() => setOpen((current) => !current)} aria-expanded={open} aria-controls="site-sidebar">
        <span aria-hidden="true">☰</span> 메뉴
      </button>
      {open && <button className="sidebar-scrim" type="button" onClick={close} aria-label="메뉴 닫기" />}
      <aside className={`site-sidebar${open ? " open" : ""}`} id="site-sidebar">
        <div className="sidebar-top">
          <a className="sidebar-brand" href={sitePath("/")} onClick={close} aria-label="지켜로 홈">
            <span className="brand-mark" aria-hidden="true">路</span>
            <span><strong>지켜路</strong><small>우리동네 보행안전 지도</small></span>
          </a>
          <button className="sidebar-close" type="button" onClick={close} aria-label="메뉴 닫기">×</button>
        </div>

        <nav className="sidebar-nav" aria-label="전체 메뉴">
          <a className={active === "home" ? "active" : ""} href={sitePath("/")} onClick={close}><span aria-hidden="true">⌂</span><b>홈</b></a>
          <a className={active === "map" ? "active" : ""} href={sitePath("/map/")} onClick={close}><span aria-hidden="true">⌖</span><b>위험지도</b></a>
          <a href={sitePath("/#how")} onClick={close}><span aria-hidden="true">?</span><b>참여방법</b></a>
          <a href={sitePath("/#project")} onClick={close}><span aria-hidden="true">i</span><b>프로젝트</b></a>
          <a className={active === "my" ? "active" : ""} href={sitePath("/my/")} onClick={close}><span aria-hidden="true">▤</span><b>내 기록</b></a>
        </nav>

        <div className="sidebar-bottom">
          <a className="sidebar-report-link" href={sitePath("/?report=1")} onClick={close}><span aria-hidden="true">＋</span>위험요소 기록하기</a>
          {sessionRole === "member" ? (
            <a className="sidebar-account" href={sitePath("/my/")} onClick={close}><span>김</span><b>김지킴</b><small>내 활동 보기</small></a>
          ) : sessionRole === "research_admin" || sessionRole === "agency_staff" ? (
            <a className={`sidebar-admin-link${active === "admin" ? " active" : ""}`} href={sitePath("/admin/")} onClick={close}>관리자 화면</a>
          ) : (
            <button className="sidebar-login" type="button" onClick={login}>로그인</button>
          )}
          <a className="sidebar-admin-entry" href={sitePath("/admin/login/")} onClick={close}>관리자·기관 로그인</a>
        </div>
      </aside>
    </>
  );
}
