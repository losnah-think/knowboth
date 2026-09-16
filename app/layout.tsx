import type { Metadata } from "next";
import "./globals.css";
import RoleBridgeWorkflow from "@/components/rolebridge-workflow";

export const metadata: Metadata = {
  title: "RoleBridge · 공고에서 찾는 나의 가능성",
  description: "공고가 요구하는 역량과 내 경험을 연결하고, 보완할 역량과 새로운 도메인의 가능성을 발견하세요.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased"><RoleBridgeWorkflow>{children}</RoleBridgeWorkflow></body>
    </html>
  );
}
