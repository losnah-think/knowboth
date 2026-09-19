import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KnowBoth · 기업을 알고, 나를 알고",
  description: "원티드 공고와 내 경험으로 기업의 사업, 채용 배경, 필요한 역량과 지원 준비를 함께 분석하세요.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
