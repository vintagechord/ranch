import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./project-hub.css";

const siteTitle = "목장의 아침 | Project Room";
const siteDescription =
  "목장의 아침에서 진행 중인 음악 프로젝트와 제작 기록을 만나는 인터랙티브 프로젝트 룸.";
const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
const siteOrigin =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (productionHost ? `https://${productionHost}` : "https://ranch-five.vercel.app");

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin),
  title: siteTitle,
  description: siteDescription,
  openGraph: {
    type: "website",
    locale: "ko_KR",
    title: siteTitle,
    description: siteDescription,
    images: [{ url: "/og-ibam.png", width: 1200, height: 630, alt: "목장의 아침 Project Room" }]
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
    images: ["/og-ibam.png"]
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#080808"
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
