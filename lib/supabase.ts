import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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

export function getSupabaseClient(): SupabaseClient<Database> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const missingEnvironmentVariables = [
    !supabaseUrl ? "NEXT_PUBLIC_SUPABASE_URL" : null,
    !supabaseAnonKey ? "NEXT_PUBLIC_SUPABASE_ANON_KEY" : null
  ].filter((name): name is string => Boolean(name));

  if (missingEnvironmentVariables.length > 0) {
    throw new Error(
      `Missing Supabase environment variables: ${missingEnvironmentVariables.join(", ")}`
    );
  }

  return createClient<Database>(supabaseUrl!, supabaseAnonKey!);
}
