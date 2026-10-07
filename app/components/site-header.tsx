"use client";

import { useEffect, useState } from "react";
import { sitePath } from "../lib/site-path";

type HeaderSection = "home" | "map" | "my" | "admin";

const CONTRAST_KEY = "jikeoro-site-high-contrast";
export function AccessibilityTools() {
  const [highContrast, setHighContrast] = useState(() => typeof window !== "undefined" && window.localStorage.getItem(CONTRAST_KEY) === "true");
  const [isSpeaking, setIsSpeaking] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.siteContrast = highContrast ? "high" : "normal";
    return () => window.speechSynthesis?.cancel();
  }, [highContrast]);

  const toggleContrast = () => {
    const next = !highContrast;
    setHighContrast(next);
    window.localStorage.setItem(CONTRAST_KEY, String(next));
    document.documentElement.dataset.siteContrast = next ? "high" : "normal";
  };

  const readPage = () => {
    if (!("speechSynthesis" in window)) return;
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }
    const main = document.querySelector("main");
    const readable = main
      ? Array.from(main.querySelectorAll("h1, h2, .hero-description, .plain-heading > span"))
        .map((element) => element.textContent?.replace(/\s+/g, " ").trim() ?? "")
        .filter((text, index, all) => text && all.indexOf(text) === index)
        .join(". ")
      : document.title;
    const utterance = new SpeechSynthesisUtterance(readable || document.title);
    utterance.lang = "ko-KR";
    utterance.rate = 0.88;
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setIsSpeaking(true);
  };

  return (
    <div className="site-accessibility" aria-label="화면 접근성 기능">
      <button type="button" onClick={readPage} className={isSpeaking ? "active" : ""} aria-pressed={isSpeaking} aria-label={isSpeaking ? "읽어주기 멈추기" : "페이지 내용 읽어주기"}>
        <span aria-hidden="true">{isSpeaking ? "■" : "♬"}</span><b>{isSpeaking ? "멈추기" : "읽어주기"}</b>
      </button>
      <button type="button" onClick={toggleContrast} className={highContrast ? "active" : ""} aria-pressed={highContrast} aria-label={highContrast ? "기본 화면으로 보기" : "고대비 화면으로 보기"}>
        <span aria-hidden="true">◐</span><b>고대비</b>
      </button>
    </div>
  );
}

export function SiteHeader({ active, inner = false }: { active: HeaderSection; inner?: boolean }) {
  const [sessionRole, setSessionRole] = useState<string | null>(null);
  const [sessionName, setSessionName] = useState("김지킴");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((response) => response.json())
      .then((data) => {
        setSessionRole(data.authenticated ? data.user?.role ?? null : null);
        if (data.authenticated && data.user?.name) setSessionName(data.user.name);
      })
      .catch(() => setSessionRole(null));
  }, []);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const closeMenu = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileMenuOpen(false);
    };
    const closeOnWideScreen = () => {
      if (window.innerWidth > 1050) setMobileMenuOpen(false);
    };
    window.addEventListener("keydown", closeMenu);
    window.addEventListener("resize", closeOnWideScreen);
    return () => {
      window.removeEventListener("keydown", closeMenu);
      window.removeEventListener("resize", closeOnWideScreen);
    };
  }, [mobileMenuOpen]);

  const closeMobileMenu = () => setMobileMenuOpen(false);

  return (
    <header className={`site-header universal-header${inner ? " member-header" : ""}`}>
      <a className="brand" href={sitePath("/")} aria-label="지켜로 홈">
        <span className="brand-mark" aria-hidden="true">路</span>
        <span><strong>지켜路</strong><small>우리 동네 보행안전 지도</small></span>
      </a>

      <nav className="desktop-nav" aria-label="주요 메뉴">
        <a className={active === "home" ? "active" : ""} href={sitePath("/")}>홈</a>
        <a className={active === "map" ? "active" : ""} href={sitePath("/map/")}>위험지도</a>
        {sessionRole === "member" && <a className={active === "my" ? "active" : ""} href={sitePath("/my/")}>내 기록</a>}
        {sessionRole === "research_admin" && <a className={active === "admin" ? "active" : ""} href={sitePath("/admin/")}>관리자 콘솔</a>}
        {sessionRole === "agency_staff" && <a className={active === "admin" ? "active" : ""} href={sitePath("/admin/")}>기관 콘솔</a>}
      </nav>

      <div className="header-actions">
        <AccessibilityTools />
        <a className="header-cta" href={sitePath("/?report=1")}>위험요소 기록하기</a>
        {sessionRole === "member" ? (
          <a className="account-button" href={sitePath("/my/")} aria-label="내 지켜로 활동 보기"><span>{sessionName.slice(0, 1)}</span><b>{sessionName}</b></a>
        ) : sessionRole === "research_admin" ? (
          <a className="login-button" href={sitePath("/admin/")}>관리자</a>
        ) : sessionRole === "agency_staff" ? (
          <a className="login-button" href={sitePath("/admin/")}>기관</a>
        ) : (
          <a className="login-button" href={sitePath("/login/")}>로그인</a>
        )}
        <button className={`mobile-menu-toggle${mobileMenuOpen ? " open" : ""}`} type="button" onClick={() => setMobileMenuOpen((value) => !value)} aria-expanded={mobileMenuOpen} aria-controls="mobile-site-menu" aria-label={mobileMenuOpen ? "메뉴 닫기" : "메뉴 열기"}>
          <span aria-hidden="true" /><span aria-hidden="true" /><span aria-hidden="true" />
        </button>
      </div>

      {mobileMenuOpen && <button className="mobile-menu-backdrop" type="button" onClick={closeMobileMenu} aria-label="메뉴 닫기" />}
      <nav id="mobile-site-menu" className={`mobile-site-menu${mobileMenuOpen ? " open" : ""}`} aria-label="모바일 주요 메뉴" aria-hidden={!mobileMenuOpen}>
        <div className="mobile-site-menu-heading"><strong>메뉴</strong><span>원하는 화면으로 이동하세요.</span></div>
        <a className={active === "home" ? "active" : ""} href={sitePath("/")} onClick={closeMobileMenu}><span>홈</span><b>→</b></a>
        <a className={active === "map" ? "active" : ""} href={sitePath("/map/")} onClick={closeMobileMenu}><span>위험지도</span><b>→</b></a>
        <a className="report" href={sitePath("/?report=1")} onClick={closeMobileMenu}><span>위험요소 기록하기</span><b>＋</b></a>
        {sessionRole === "member" && <a className={active === "my" ? "active" : ""} href={sitePath("/my/")} onClick={closeMobileMenu}><span>내 기록 · {sessionName}</span><b>→</b></a>}
        {sessionRole === "research_admin" && <a className={active === "admin" ? "active" : ""} href={sitePath("/admin/")} onClick={closeMobileMenu}><span>관리자 콘솔</span><b>→</b></a>}
        {sessionRole === "agency_staff" && <a className={active === "admin" ? "active" : ""} href={sitePath("/admin/")} onClick={closeMobileMenu}><span>기관 콘솔</span><b>→</b></a>}
        {!sessionRole && <a href={sitePath("/login/")} onClick={closeMobileMenu}><span>로그인 · 회원가입</span><b>→</b></a>}
      </nav>
    </header>
  );
}
