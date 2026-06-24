// Generated from the Supabase schema. Do not edit by hand.
// Regenerate with the Supabase MCP `generate_typescript_types` (or
// `supabase gen types typescript --linked`) after each migration.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '14.5';
  };
  public: {
    Tables: {
      app_user: {
        Row: {
          created_at: string;
          dni_nif: string | null;
          email: string | null;
          full_name: string | null;
          id: string;
          org_id: string;
          role: Database['public']['Enums']['user_role'];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          dni_nif?: string | null;
          email?: string | null;
          full_name?: string | null;
          id: string;
          org_id: string;
          role?: Database['public']['Enums']['user_role'];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          dni_nif?: string | null;
          email?: string | null;
          full_name?: string | null;
          id?: string;
          org_id?: string;
          role?: Database['public']['Enums']['user_role'];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'app_user_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'org';
            referencedColumns: ['id'];
          },
        ];
      };
      org: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          type: Database['public']['Enums']['org_type'];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          type: Database['public']['Enums']['org_type'];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          type?: Database['public']['Enums']['org_type'];
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      current_org_id: { Args: never; Returns: string };
      current_user_role: {
        Args: never;
        Returns: Database['public']['Enums']['user_role'];
      };
      provision_account: {
        Args: {
          p_account_type: Database['public']['Enums']['org_type'];
          p_full_name: string;
          p_org_name: string;
        };
        Returns: {
          created_at: string;
          id: string;
          name: string;
          type: Database['public']['Enums']['org_type'];
          updated_at: string;
        };
      };
    };
    Enums: {
      org_type: 'owner' | 'company';
      user_role: 'admin' | 'technician' | 'viewer';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DefaultSchema = Database['public'];

export type Tables<T extends keyof DefaultSchema['Tables']> = DefaultSchema['Tables'][T]['Row'];
export type TablesInsert<T extends keyof DefaultSchema['Tables']> =
  DefaultSchema['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof DefaultSchema['Tables']> =
  DefaultSchema['Tables'][T]['Update'];
export type Enums<T extends keyof DefaultSchema['Enums']> = DefaultSchema['Enums'][T];
