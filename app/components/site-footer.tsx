"use client";

import { sitePath } from "../lib/site-path";

type SiteFooterProps = {
  showAdminLink?: boolean;
};

export function SiteFooter({ showAdminLink = false }: SiteFooterProps) {
  return (
    <footer className={`site-footer${showAdminLink ? " site-footer-home" : ""}`}>
      <a className="brand footer-brand" href={sitePath("/#top")}>
        <span className="brand-mark">路</span>
        <span><strong>지켜路</strong><small>우리 동네 보행안전 지도</small></span>
      </a>
      <p>KAIST Health Design Lab · 1차년도 연구 프로토타입</p>
      <div className="footer-app-download">
        <a
          href="https://yaniyaabi.github.io/jikeoro-senior-app-proto/"
          target="_blank"
          rel="noreferrer"
        >
          <span aria-hidden="true">↓</span>
          지켜路 앱 설치하기
        </a>
        <small>휴대전화에서 연 뒤 브라우저 메뉴의 ‘홈 화면에 추가’를 눌러주세요.</small>
      </div>
      <p>
        {showAdminLink && <><a className="admin-entry-link" href={sitePath("/admin/login")}>관리자·기관 로그인</a><br /></>}
        © 2026 JIKEORO. Prototype for research.
      </p>
    </footer>
  );
}
