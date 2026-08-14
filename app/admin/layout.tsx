import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "목장의 아침 운영 관리",
  robots: {
    index: false,
    follow: false,
    nocache: true
  }
};

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
