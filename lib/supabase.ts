import { createClient } from "@supabase/supabase-js";

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

export type Database = {
  public: {
    Tables: {
      ranch_applications: {
        Row: RanchApplicationRow;
        Insert: RanchApplicationInsert;
        Update: Partial<RanchApplicationInsert>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase 공개 환경변수가 설정되지 않았습니다.");
  }

  return createClient<Database>(supabaseUrl, supabaseAnonKey);
}
