import "server-only";

import { projects, type Project } from "@/lib/projects";
import type {
  ProjectPageLifecycle,
  ProjectPageSettingsRow,
  SiteSettingsRow
} from "@/lib/supabase";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const SITE_SETTINGS_ID = 1;

export type ProjectPageSetting = {
  projectSlug: string;
  lifecycle: ProjectPageLifecycle;
  isPublic: boolean;
  sortOrder: number;
  isPasswordProtected: boolean;
  accessVersion: number;
  createdAt: string;
  updatedAt: string;
};

export type NextMeetingSetting = {
  nextMeetingAt: string;
  venue: string;
  isVisible: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ConfiguredProject = Project & {
  lifecycle: ProjectPageLifecycle;
  isPublic: boolean;
  sortOrder: number;
  isPasswordProtected: boolean;
  accessVersion: number;
  settingUpdatedAt: string;
};

function normalizeProjectPageSetting(row: ProjectPageSettingsRow): ProjectPageSetting {
  return {
    projectSlug: row.project_slug,
    lifecycle: row.lifecycle,
    isPublic: row.is_public,
    sortOrder: row.sort_order,
    isPasswordProtected: Boolean(row.access_password_hash),
    accessVersion: row.access_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizeNextMeetingSetting(row: SiteSettingsRow): NextMeetingSetting {
  return {
    nextMeetingAt: row.next_meeting_at,
    venue: row.venue,
    isVisible: row.is_visible,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mergeProjectSetting(
  project: Project,
  setting: ProjectPageSetting
): ConfiguredProject {
  return {
    ...project,
    state: setting.lifecycle === "active" ? "active" : "archived",
    lifecycle: setting.lifecycle,
    isPublic: setting.isPublic,
    sortOrder: setting.sortOrder,
    isPasswordProtected: setting.isPasswordProtected,
    accessVersion: setting.accessVersion,
    settingUpdatedAt: setting.updatedAt
  };
}

export async function getProjectPageSettings(): Promise<ProjectPageSetting[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("project_page_settings")
    .select(
      "project_slug, lifecycle, is_public, sort_order, access_password_hash, access_version, created_at, updated_at"
    )
    .order("sort_order", { ascending: true })
    .order("project_slug", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map(normalizeProjectPageSetting);
}

export async function getAdminProjects(): Promise<ConfiguredProject[]> {
  const settings = await getProjectPageSettings();
  const settingsBySlug = new Map(settings.map((setting) => [setting.projectSlug, setting]));

  return projects
    .flatMap((project) => {
      const setting = settingsBySlug.get(project.slug);
      return setting ? [mergeProjectSetting(project, setting)] : [];
    })
    .sort(
      (left, right) =>
        left.sortOrder - right.sortOrder || left.slug.localeCompare(right.slug)
    );
}

export async function getAdminProjectBySlug(
  slug: string
): Promise<ConfiguredProject | undefined> {
  const configuredProjects = await getAdminProjects();
  return configuredProjects.find((project) => project.slug === slug);
}

export async function getPublicProjects(): Promise<ConfiguredProject[]> {
  const configuredProjects = await getAdminProjects();
  return configuredProjects.filter((project) => project.isPublic);
}

export async function getPublicActiveProjects(): Promise<ConfiguredProject[]> {
  const publicProjects = await getPublicProjects();
  return publicProjects.filter((project) => project.lifecycle === "active");
}

export async function getPublicProjectBySlug(
  slug: string
): Promise<ConfiguredProject | undefined> {
  const project = await getAdminProjectBySlug(slug);
  return project?.isPublic ? project : undefined;
}

export async function getNextMeetingSetting(): Promise<NextMeetingSetting> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("site_settings")
    .select("id, next_meeting_at, venue, is_visible, created_at, updated_at")
    .eq("id", SITE_SETTINGS_ID)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("NEXT_MEETING_SETTING_NOT_FOUND");
  }

  return normalizeNextMeetingSetting(data);
}
