import type { Metadata } from "next";
import AdminNavigation from "@/app/admin/AdminNavigation";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { projects as staticProjects } from "@/lib/projects";
import { getAdminProjects } from "@/lib/projectSiteSettings.server";

export const metadata: Metadata = {
  title: "목장의 아침 운영 관리",
  robots: {
    index: false,
    follow: false,
    nocache: true
  }
};

export default async function AdminLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  const authenticated = await isAdminAuthenticated();

  if (!authenticated) {
    return children;
  }

  let navigationProjects: Array<{
    slug: string;
    shortTitle: string;
    lifecycle: "active" | "completed" | "archived";
  }> = staticProjects.map((project) => ({
    slug: project.slug,
    shortTitle: project.shortTitle,
    lifecycle: project.state === "active" ? "active" as const : "archived" as const
  }));

  try {
    navigationProjects = (await getAdminProjects()).map((project) => ({
      slug: project.slug,
      shortTitle: project.shortTitle,
      lifecycle: project.lifecycle
    }));
  } catch (error) {
    console.error("Admin navigation project load failed:", error instanceof Error ? error.message : error);
  }

  return (
    <div className="admin-console-shell">
      <AdminNavigation projects={navigationProjects} />
      <div className="admin-console-content" id="admin-main-content" tabIndex={-1}>
        {children}
      </div>
    </div>
  );
}
