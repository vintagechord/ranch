import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function LegacyAdminReleasesPage() {
  redirect("/admin/projects/vintagechord-post-production");
}
