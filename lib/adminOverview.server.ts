import "server-only";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import type { ProjectProposalRow } from "@/lib/supabase";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const PROJECT_PROPOSALS_PER_PAGE = 24;

export type ProjectProposalSummary = Pick<
  ProjectProposalRow,
  | "id"
  | "created_at"
  | "artist_name"
  | "project_title"
  | "project_type"
  | "current_stage"
  | "support_needed"
  | "status"
>;

export type AdminIntakeOverview = {
  projectProposalCount: number;
  latestProjectProposalCreatedAt: string | null;
  releaseApplicationCount: number;
  latestReleaseApplicationCreatedAt: string | null;
};

async function assertAdminAccess() {
  if (!(await isAdminAuthenticated())) {
    throw new Error("ADMIN_AUTH_REQUIRED");
  }
}

export async function getProjectProposals(page: number) {
  await assertAdminAccess();

  const supabase = getSupabaseAdmin();
  const { error: purgeError } = await supabase.rpc("purge_expired_project_proposals", {});

  if (purgeError) {
    throw new Error(purgeError.message);
  }

  const now = new Date().toISOString();
  const { count, error: countError } = await supabase
    .from("project_proposals")
    .select("id", { count: "exact", head: true })
    .gt("retention_until", now);

  if (countError) {
    throw new Error(countError.message);
  }

  const total = count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PROJECT_PROPOSALS_PER_PAGE));

  if (page > pageCount) {
    return {
      items: [] as ProjectProposalSummary[],
      total,
      latestCreatedAt: null,
      outOfRange: true
    };
  }

  const from = (page - 1) * PROJECT_PROPOSALS_PER_PAGE;
  const to = from + PROJECT_PROPOSALS_PER_PAGE - 1;
  const [{ data, error }, { data: latest, error: latestError }] = await Promise.all([
    supabase
      .from("project_proposals")
      .select(
        "id, created_at, artist_name, project_title, project_type, current_stage, support_needed, status"
      )
      .gt("retention_until", now)
      .order("created_at", { ascending: false })
      .range(from, to),
    supabase
      .from("project_proposals")
      .select("created_at")
      .gt("retention_until", now)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
  ]);

  if (error) {
    throw new Error(error.message);
  }

  if (latestError) {
    throw new Error(latestError.message);
  }

  return {
    items: (data ?? []) as ProjectProposalSummary[],
    total,
    latestCreatedAt: latest?.created_at ?? null,
    outOfRange: false
  };
}

export async function getAdminIntakeOverview(): Promise<AdminIntakeOverview> {
  await assertAdminAccess();

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const [proposalCountResult, proposalLatestResult, applicationCountResult, applicationLatestResult] =
    await Promise.all([
      supabase
        .from("project_proposals")
        .select("id", { count: "exact", head: true })
        .gt("retention_until", now),
      supabase
        .from("project_proposals")
        .select("created_at")
        .gt("retention_until", now)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("release_participation_applications")
        .select("id", { count: "exact", head: true })
        .gt("retention_until", now),
      supabase
        .from("release_participation_applications")
        .select("created_at")
        .gt("retention_until", now)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    ]);

  const firstError = [
    proposalCountResult.error,
    proposalLatestResult.error,
    applicationCountResult.error,
    applicationLatestResult.error
  ].find(Boolean);

  if (firstError) {
    throw new Error(firstError.message);
  }

  return {
    projectProposalCount: proposalCountResult.count ?? 0,
    latestProjectProposalCreatedAt: proposalLatestResult.data?.created_at ?? null,
    releaseApplicationCount: applicationCountResult.count ?? 0,
    latestReleaseApplicationCreatedAt: applicationLatestResult.data?.created_at ?? null
  };
}
