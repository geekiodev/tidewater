/**
 * Database types for the `public` schema.
 *
 * Hand-written to match supabase/migrations because `supabase gen types`
 * needs the local Supabase stack (Docker), which wasn't available when this
 * was built. Regenerate with:
 *   npx supabase gen types typescript --local > src/lib/database.types.ts
 * once the stack runs, and diff against this file.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type WorkspaceRole = "owner" | "member";

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "12";
  };
  public: {
    Tables: {
      workspaces: {
        Row: {
          id: string;
          name: string;
          created_at: string;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          plan: "starter" | "team" | null;
          subscription_status: string;
          current_period_end: string | null;
          billing_event_at: string | null;
        };
        Insert: never;
        Update: {
          name?: string;
        };
        Relationships: [];
      };
      workspace_members: {
        Row: {
          workspace_id: string;
          user_id: string;
          role: WorkspaceRole;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      workspace_invitations: {
        Row: {
          id: string;
          workspace_id: string;
          email: string;
          token_hash: string;
          invited_by: string | null;
          created_at: string;
          expires_at: string;
          accepted_at: string | null;
          accepted_by: string | null;
        };
        Insert: {
          workspace_id: string;
          email: string;
          token_hash: string;
          invited_by: string;
          expires_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      clients: {
        Row: {
          id: string;
          workspace_id: string;
          name: string;
          website: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          workspace_id: string;
          name: string;
          website?: string | null;
          created_by: string;
        };
        Update: {
          name?: string;
          website?: string | null;
        };
        Relationships: [];
      };
      contacts: {
        Row: {
          id: string;
          workspace_id: string;
          client_id: string;
          full_name: string;
          email: string | null;
          phone: string | null;
          job_title: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          workspace_id: string;
          client_id: string;
          full_name: string;
          email?: string | null;
          phone?: string | null;
          job_title?: string | null;
        };
        Update: {
          full_name?: string;
          email?: string | null;
          phone?: string | null;
          job_title?: string | null;
        };
        Relationships: [];
      };
      notes: {
        Row: {
          id: string;
          workspace_id: string;
          client_id: string;
          body: string;
          author_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          workspace_id: string;
          client_id: string;
          body: string;
          author_id: string;
        };
        Update: {
          body?: string;
        };
        Relationships: [];
      };
      ai_usage: {
        Row: {
          workspace_id: string;
          month: string;
          briefs: number;
          input_tokens: number;
          output_tokens: number;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      create_workspace: {
        Args: { p_name: string };
        Returns: string;
      };
      accept_invitation: {
        Args: { p_token: string };
        Returns: string;
      };
      list_workspace_members: {
        Args: Record<string, never>;
        Returns: { user_id: string; email: string; role: WorkspaceRole; joined_at: string }[];
      };
      apply_stripe_event: {
        Args: {
          p_event_id: string;
          p_event_type: string;
          p_event_created: string;
          p_workspace_id: string | null;
          p_customer_id: string | null;
          p_subscription_id: string | null;
          p_status: string | null;
          p_plan: string | null;
          p_current_period_end: string | null;
        };
        Returns: string;
      };
      reserve_ai_brief: {
        Args: { p_workspace_id: string; p_monthly_limit: number };
        Returns: boolean;
      };
      settle_ai_brief: {
        Args: { p_workspace_id: string; p_succeeded: boolean; p_input_tokens: number; p_output_tokens: number };
        Returns: undefined;
      };
      rate_limit_hit: {
        Args: { p_bucket: string; p_limit: number; p_window_seconds: number };
        Returns: boolean;
      };
    };
    Enums: {
      workspace_role: WorkspaceRole;
    };
    CompositeTypes: { [_ in never]: never };
  };
};
