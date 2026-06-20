import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "목장의 아침 | 을왕리 에디션",
  description:
    "7월 17일부터 7월 18일까지, 을왕리에서 열리는 목장 친구들의 강력한 수퍼 페스티벌."
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f5f9fc"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
