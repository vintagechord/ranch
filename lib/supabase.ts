export type RanchApplicationRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  instagram: string | null;
  attendees: number | null;
  message: string | null;
  created_at: string | null;
};

export type RanchApplicationInsert = {
  id?: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  instagram?: string | null;
  attendees?: number | null;
  message?: string | null;
  created_at?: string | null;
};

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
      ranch_applications: {
        Row: RanchApplicationRow;
        Insert: RanchApplicationInsert;
        Update: Partial<RanchApplicationInsert>;
        Relationships: [];
      };
      project_proposals: {
        Row: ProjectProposalRow;
        Insert: ProjectProposalInsert;
        Update: Partial<ProjectProposalInsert>;
        Relationships: [];
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
