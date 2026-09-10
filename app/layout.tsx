import type { Metadata } from "next";
import { Noto_Sans_KR, JetBrains_Mono } from "next/font/google";
import "./globals.css";

/**
 * 매출 대시보드 · 확장 진행판과 같은 얼굴을 쓴다. 세 화면을 오가는 사람이
 * 매번 다른 서체를 만나지 않게 하는 게 목적이다.
 * 가변 폰트라 weight 를 나열하지 않는다 — 나열하면 next/font 가 거절한다.
 */
const sans = Noto_Sans_KR({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

/** 목표·실적·달성률·기한은 전부 JetBrains Mono. 자리폭이 고정이라 세로로 훑을 때 줄이 맞는다. */
const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-mono",
  display: "swap",
});

/** 어떤 커밋이 서빙 중인지 밖에서 확인할 수 있게 심는다. Vercel 이 빌드 때 주입한다. */
export const BUILD_SHA = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local";

export const metadata: Metadata = {
  title: "글로벌 온라인 플랫폼팀 KPI 보드",
  description: "마켓별 월 목표 · 프로젝트 · 담당자별 업무를 한 장에서 본다",
  other: { "x-build": BUILD_SHA },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
