export type ProjectProposalRow = {
  id: string;
  created_at: string;
  contact_name: string;
  phone: string | null;
  email: string;
  artist_name: string;
  project_title: string;
  project_type: string;
  current_stage: string;
  support_needed: string[];
  desired_schedule: string | null;
  budget_range: string | null;
  reference_url: string | null;
  details: string;
  status: string;
  privacy_agreed: boolean;
  consented_at: string;
  privacy_notice_version: string;
  idempotency_key: string;
  payload_hash: string;
  retention_until: string;
};

export type ProjectProposalInsert = {
  id?: string;
  created_at?: string;
  contact_name: string;
  phone?: string | null;
  email: string;
  artist_name: string;
  project_title: string;
  project_type: string;
  current_stage: string;
  support_needed: string[];
  desired_schedule?: string | null;
  budget_range?: string | null;
  reference_url?: string | null;
  details: string;
  status?: string;
  privacy_agreed: boolean;
  consented_at?: string;
  privacy_notice_version: string;
  idempotency_key: string;
  payload_hash: string;
  retention_until?: string;
};

export type ReleaseRoleTypeRow = {
  code: string;
  label_ko: string;
  category: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type ReleaseRoleTypeInsert = {
  code: string;
  label_ko: string;
  category: string;
  description?: string | null;
  is_active?: boolean;
  sort_order?: number;
  created_at?: string;
  updated_at?: string;
};

export type MusicReleaseRow = {
  id: string;
  project_slug: string;
  release_number: number;
  title: string;
  artist_name: string;
  release_date: string | null;
  state: string;
  youtube_video_id: string | null;
  cover_image_url: string | null;
  cover_image_path: string | null;
  summary: string | null;
  is_published: boolean;
  created_at: string;
  updated_at: string;
};

export type MusicReleaseInsert = {
  id?: string;
  project_slug: string;
  release_number: number;
  title: string;
  artist_name: string;
  release_date?: string | null;
  state?: string;
  youtube_video_id?: string | null;
  cover_image_url?: string | null;
  cover_image_path?: string | null;
  summary?: string | null;
  is_published?: boolean;
  created_at?: string;
  updated_at?: string;
};

export type ReleaseCoverCleanupQueueRow = {
  path: string;
  attempt_count: number;
  last_error: string | null;
  next_attempt_at: string;
  created_at: string;
  updated_at: string;
};

export type ReleaseCoverCleanupQueueInsert = {
  path: string;
  attempt_count?: number;
  last_error?: string | null;
  next_attempt_at?: string;
  created_at?: string;
  updated_at?: string;
};

export type AdminCreateNextPppReleaseResult = {
  status:
    | "created"
    | "duplicate"
    | "stale"
    | "conflict"
    | "number_exhausted"
    | "invalid_input";
  release_id: string | null;
  release_number: number | null;
};

export type ReleaseRoleRow = {
  id: string;
  release_id: string;
  role_type_code: string;
  state: string;
  is_public: boolean;
  brief: string | null;
  requirements: string | null;
  capacity: number;
  application_deadline: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type ReleaseRoleInsert = {
  id?: string;
  release_id: string;
  role_type_code: string;
  state?: string;
  is_public?: boolean;
  brief?: string | null;
  requirements?: string | null;
  capacity?: number;
  application_deadline?: string | null;
  sort_order?: number;
  created_at?: string;
  updated_at?: string;
};

export type ReleaseParticipationApplicationRow = {
  id: string;
  release_role_id: string;
  applicant_name: string;
  credit_name: string;
  email: string;
  phone: string | null;
  profile_url: string | null;
  portfolio_url: string | null;
  availability: string;
  message: string;
  status: string;
  admin_note: string | null;
  status_changed_at: string;
  privacy_agreed: boolean;
  consented_at: string;
  privacy_notice_version: string;
  credit_publication_agreed: boolean;
  credit_publication_consented_at: string;
  credit_publication_notice_version: string;
  idempotency_key: string;
  payload_hash: string;
  retention_until: string;
  created_at: string;
  updated_at: string;
};

export type ReleaseParticipationApplicationInsert = {
  id?: string;
  release_role_id: string;
  applicant_name: string;
  credit_name: string;
  email: string;
  phone?: string | null;
  profile_url?: string | null;
  portfolio_url?: string | null;
  availability: string;
  message: string;
  status?: string;
  admin_note?: string | null;
  status_changed_at?: string;
  privacy_agreed: boolean;
  consented_at?: string;
  privacy_notice_version: string;
  credit_publication_agreed: boolean;
  credit_publication_consented_at?: string;
  credit_publication_notice_version: string;
  idempotency_key: string;
  payload_hash: string;
  retention_until?: string;
  created_at?: string;
  updated_at?: string;
};

export type ReleaseCreditRow = {
  id: string;
  release_role_id: string;
  display_name: string;
  is_ranch_member: boolean;
  participant_slot: number | null;
  source_application_id: string | null;
  publication_basis: string;
  publication_agreed: boolean | null;
  publication_consented_at: string | null;
  publication_notice_version: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type ReleaseCreditInsert = {
  id?: string;
  release_role_id: string;
  display_name: string;
  is_ranch_member?: boolean;
  participant_slot?: number | null;
  source_application_id?: string | null;
  publication_basis?: string;
  publication_agreed?: boolean | null;
  publication_consented_at?: string | null;
  publication_notice_version?: string | null;
  sort_order?: number;
  created_at?: string;
  updated_at?: string;
};

export type ReleaseApplicationStatusEventRow = {
  id: number;
  application_id: string;
  from_status: string | null;
  to_status: string;
  note: string | null;
  created_at: string;
};

export type ReleaseApplicationStatusEventInsert = {
  id?: number;
  application_id: string;
  from_status?: string | null;
  to_status: string;
  note?: string | null;
  created_at?: string;
};

type RequestRateLimitRow = {
  scope: string;
  request_fingerprint: string;
  window_started_at: string;
  attempt_count: number;
  expires_at: string;
};

type RequestRateLimitInsert = {
  scope: string;
  request_fingerprint: string;
  window_started_at?: string;
  attempt_count?: number;
  expires_at: string;
};

type PiggyBankRow = {
  id: number;
  created_at: string;
  balance_amount: number;
  updated_at: string;
};

type PiggyBankInsert = {
  id?: number;
  created_at?: string;
  balance_amount?: number;
  updated_at?: string;
};

type OpenChatSettingsRow = {
  id: number;
  created_at: string;
  chat_url: string | null;
  updated_at: string;
};

type OpenChatSettingsInsert = {
  id?: number;
  created_at?: string;
  chat_url?: string | null;
  updated_at?: string;
};

export type Database = {
  public: {
    Tables: {
      project_proposals: {
        Row: ProjectProposalRow;
        Insert: ProjectProposalInsert;
        Update: Partial<ProjectProposalInsert>;
        Relationships: [];
      };
      release_role_types: {
        Row: ReleaseRoleTypeRow;
        Insert: ReleaseRoleTypeInsert;
        Update: Partial<ReleaseRoleTypeInsert>;
        Relationships: [];
      };
      music_releases: {
        Row: MusicReleaseRow;
        Insert: MusicReleaseInsert;
        Update: Partial<MusicReleaseInsert>;
        Relationships: [];
      };
      release_cover_cleanup_queue: {
        Row: ReleaseCoverCleanupQueueRow;
        Insert: ReleaseCoverCleanupQueueInsert;
        Update: Partial<ReleaseCoverCleanupQueueInsert>;
        Relationships: [];
      };
      release_roles: {
        Row: ReleaseRoleRow;
        Insert: ReleaseRoleInsert;
        Update: Partial<ReleaseRoleInsert>;
        Relationships: [
          {
            foreignKeyName: "release_roles_release_id_fkey";
            columns: ["release_id"];
            isOneToOne: false;
            referencedRelation: "music_releases";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "release_roles_role_type_code_fkey";
            columns: ["role_type_code"];
            isOneToOne: false;
            referencedRelation: "release_role_types";
            referencedColumns: ["code"];
          }
        ];
      };
      release_participation_applications: {
        Row: ReleaseParticipationApplicationRow;
        Insert: ReleaseParticipationApplicationInsert;
        Update: Partial<ReleaseParticipationApplicationInsert>;
        Relationships: [
          {
            foreignKeyName: "release_participation_applications_release_role_id_fkey";
            columns: ["release_role_id"];
            isOneToOne: false;
            referencedRelation: "release_roles";
            referencedColumns: ["id"];
          }
        ];
      };
      release_credits: {
        Row: ReleaseCreditRow;
        Insert: ReleaseCreditInsert;
        Update: Partial<ReleaseCreditInsert>;
        Relationships: [
          {
            foreignKeyName: "release_credits_release_role_id_fkey";
            columns: ["release_role_id"];
            isOneToOne: false;
            referencedRelation: "release_roles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "release_credits_source_application_id_fkey";
            columns: ["source_application_id"];
            isOneToOne: true;
            referencedRelation: "release_participation_applications";
            referencedColumns: ["id"];
          }
        ];
      };
      release_application_status_events: {
        Row: ReleaseApplicationStatusEventRow;
        Insert: ReleaseApplicationStatusEventInsert;
        Update: Partial<ReleaseApplicationStatusEventInsert>;
        Relationships: [
          {
            foreignKeyName: "release_application_status_events_application_id_fkey";
            columns: ["application_id"];
            isOneToOne: false;
            referencedRelation: "release_participation_applications";
            referencedColumns: ["id"];
          }
        ];
      };
      request_rate_limits: {
        Row: RequestRateLimitRow;
        Insert: RequestRateLimitInsert;
        Update: Partial<RequestRateLimitInsert>;
        Relationships: [];
      };
      piggy_bank: {
        Row: PiggyBankRow;
        Insert: PiggyBankInsert;
        Update: Partial<PiggyBankInsert>;
        Relationships: [];
      };
      open_chat_settings: {
        Row: OpenChatSettingsRow;
        Insert: OpenChatSettingsInsert;
        Update: Partial<OpenChatSettingsInsert>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      admin_create_next_ppp_release: {
        Args: {
          p_creation_id: string;
          p_expected_release_number: number;
          p_title: string;
          p_artist_name: string;
          p_release_date: string | null;
          p_youtube_video_id: string | null;
          p_summary: string | null;
        };
        Returns: AdminCreateNextPppReleaseResult;
      };
      submit_project_proposal: {
        Args: {
          p_contact_name: string;
          p_phone: string | null;
          p_email: string;
          p_artist_name: string;
          p_project_title: string;
          p_project_type: string;
          p_current_stage: string;
          p_support_needed: string[];
          p_desired_schedule: string | null;
          p_budget_range: string | null;
          p_reference_url: string | null;
          p_details: string;
          p_privacy_notice_version: string;
          p_idempotency_key: string;
          p_payload_hash: string;
          p_request_fingerprint: string;
        };
        Returns: string;
      };
      submit_release_participation_application: {
        Args: {
          p_release_role_id: string;
          p_applicant_name: string;
          p_credit_name: string;
          p_email: string;
          p_phone: string | null;
          p_profile_url: string | null;
          p_portfolio_url: string | null;
          p_availability: string;
          p_message: string;
          p_privacy_notice_version: string;
          p_credit_publication_notice_version: string;
          p_idempotency_key: string;
          p_payload_hash: string;
          p_request_fingerprint: string;
          p_email_fingerprint: string;
        };
        Returns: string;
      };
      set_release_role_state: {
        Args: {
          p_role_id: string;
          p_state: string;
        };
        Returns: string;
      };
      update_music_release_item: {
        Args: {
          p_release_id: string;
          p_title: string;
          p_artist_name: string;
          p_release_date: string | null;
          p_state: string;
          p_youtube_video_id: string | null;
          p_summary: string | null;
          p_is_published: boolean;
        };
        Returns: string;
      };
      update_release_role_configuration: {
        Args: {
          p_role_id: string;
          p_state: string;
          p_is_public: boolean;
          p_brief: string | null;
          p_requirements: string | null;
          p_application_deadline: string | null;
          p_capacity: number;
        };
        Returns: string;
      };
      review_release_participation_application: {
        Args: {
          p_application_id: string;
          p_status: string;
          p_admin_note?: string | null;
          p_credit_display_name?: string | null;
          p_credit_is_ranch_member?: boolean;
          p_credit_participant_slot?: number | null;
        };
        Returns: string;
      };
      purge_expired_release_participation_applications: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      consume_request_rate_limit: {
        Args: {
          p_scope: string;
          p_request_fingerprint: string;
          p_max_attempts: number;
          p_window_seconds: number;
        };
        Returns: boolean;
      };
      clear_request_rate_limit: {
        Args: {
          p_scope: string;
          p_request_fingerprint: string;
        };
        Returns: undefined;
      };
      purge_expired_project_proposals: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
