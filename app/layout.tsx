import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ),
  title: "지켜路 | 우리동네 보행안전 지도",
  description: "성수동 주민과 함께 만드는 참여형 보행안전 데이터 플랫폼",
  openGraph: {
    title: "지켜路 | 우리동네 보행안전 지도",
    description: "걷다가 발견한 위험, 성수의 더 나은 길이 됩니다.",
    type: "website",
    locale: "ko_KR",
    images: [{ url: "/og.png", width: 1744, height: 907, alt: "지켜路 성수동 보행안전 지도" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "지켜路 | 우리동네 보행안전 지도",
    description: "걷다가 발견한 위험, 성수의 더 나은 길이 됩니다.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
