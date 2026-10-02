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
      <p>
        {showAdminLink && <><a className="admin-entry-link" href={sitePath("/admin/login/")}>관리자·기관 로그인</a><br /></>}
        © 2026 JIKEORO. KAIST HDL.
      </p>
    </footer>
  );
}
