export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      organizations: {
        Row: {
          id: string;
          name: string;
          owner_user_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          owner_user_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          owner_user_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      intake_submissions: {
        Row: {
          id: string;
          org_id: string;
          created_at: string;
          status: "new" | "reviewed" | "converted";
          contact_name: string | null;
          contact_email: string | null;
          contact_role: string | null;
          company_name: string | null;
          form_data: Json;
        };
        Insert: {
          id?: string;
          org_id: string;
          created_at?: string;
          status?: "new" | "reviewed" | "converted";
          contact_name?: string | null;
          contact_email?: string | null;
          contact_role?: string | null;
          company_name?: string | null;
          form_data?: Json;
        };
        Update: {
          id?: string;
          org_id?: string;
          created_at?: string;
          status?: "new" | "reviewed" | "converted";
          contact_name?: string | null;
          contact_email?: string | null;
          contact_role?: string | null;
          company_name?: string | null;
          form_data?: Json;
        };
        Relationships: [];
      };
      team_members: {
        Row: {
          org_id: string;
          user_id: string;
          role: "owner" | "admin" | "member";
          invited_email: string | null;
          joined_at: string;
        };
        Insert: {
          org_id: string;
          user_id: string;
          role?: "owner" | "admin" | "member";
          invited_email?: string | null;
          joined_at?: string;
        };
        Update: {
          org_id?: string;
          user_id?: string;
          role?: "owner" | "admin" | "member";
          invited_email?: string | null;
          joined_at?: string;
        };
        Relationships: [];
      };
      projects: {
        Row: {
          id: string;
          org_id: string;
          name: string;
          description: string | null;
          client_name: string | null;
          status: string;
          marketing_context: Json;
          context_complete: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          name: string;
          description?: string | null;
          client_name?: string | null;
          status?: string;
          marketing_context?: Json;
          context_complete?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          name?: string;
          description?: string | null;
          client_name?: string | null;
          status?: string;
          marketing_context?: Json;
          context_complete?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      skill_outputs: {
        Row: {
          id: string;
          org_id: string;
          project_id: string | null;
          user_id: string;
          skill_id: string;
          skill_name: string;
          input_data: Json;
          output_text: string;
          title: string | null;
          is_starred: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          project_id?: string | null;
          user_id: string;
          skill_id: string;
          skill_name: string;
          input_data?: Json;
          output_text: string;
          title?: string | null;
          is_starred?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          project_id?: string | null;
          user_id?: string;
          skill_id?: string;
          skill_name?: string;
          input_data?: Json;
          output_text?: string;
          title?: string | null;
          is_starred?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      contacts: {
        Row: {
          id: string;
          org_id: string;
          first_name: string | null;
          last_name: string | null;
          title: string | null;
          company: string | null;
          email: string | null;
          phone: string | null;
          linkedin_url: string | null;
          website: string | null;
          city: string | null;
          state: string | null;
          country: string | null;
          industry: string | null;
          employees_range: string | null;
          fit_score: number | null;
          signals: Json;
          source: "manual" | "vibe" | "apollo";
          source_id: string | null;
          apollo_id: string | null;
          raw_data: Json;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          pipeline_stage: "lead" | "contacted" | "qualified" | "proposal" | "won" | "lost";
          deal_value: number | null;
          deal_probability: number | null;
          last_contacted_at: string | null;
          next_followup_at: string | null;
          tags: string[];
          crm_notes: string | null;
          verification_status: "unverified" | "verified" | "invalid";
          research_notes: string | null;
          research_result: string | null;
          verified_at: string | null;
        };
        Insert: {
          id?: string;
          org_id: string;
          first_name?: string | null;
          last_name?: string | null;
          title?: string | null;
          company?: string | null;
          email?: string | null;
          phone?: string | null;
          linkedin_url?: string | null;
          website?: string | null;
          city?: string | null;
          state?: string | null;
          country?: string | null;
          industry?: string | null;
          employees_range?: string | null;
          fit_score?: number | null;
          signals?: Json;
          source?: "manual" | "vibe" | "apollo";
          source_id?: string | null;
          apollo_id?: string | null;
          raw_data?: Json;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          pipeline_stage?: "lead" | "contacted" | "qualified" | "proposal" | "won" | "lost";
          deal_value?: number | null;
          deal_probability?: number | null;
          last_contacted_at?: string | null;
          next_followup_at?: string | null;
          tags?: string[];
          crm_notes?: string | null;
          verification_status?: "unverified" | "verified" | "invalid";
          research_notes?: string | null;
          research_result?: string | null;
          verified_at?: string | null;
        };
        Update: {
          id?: string;
          org_id?: string;
          first_name?: string | null;
          last_name?: string | null;
          title?: string | null;
          company?: string | null;
          email?: string | null;
          phone?: string | null;
          linkedin_url?: string | null;
          website?: string | null;
          city?: string | null;
          state?: string | null;
          country?: string | null;
          industry?: string | null;
          employees_range?: string | null;
          fit_score?: number | null;
          signals?: Json;
          source?: "manual" | "vibe" | "apollo";
          source_id?: string | null;
          apollo_id?: string | null;
          raw_data?: Json;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          pipeline_stage?: "lead" | "contacted" | "qualified" | "proposal" | "won" | "lost";
          deal_value?: number | null;
          deal_probability?: number | null;
          last_contacted_at?: string | null;
          next_followup_at?: string | null;
          tags?: string[];
          crm_notes?: string | null;
          verification_status?: "unverified" | "verified" | "invalid";
          research_notes?: string | null;
          research_result?: string | null;
          verified_at?: string | null;
        };
        Relationships: [];
      };
      contact_activities: {
        Row: {
          id: string;
          org_id: string;
          contact_id: string;
          created_by: string | null;
          created_at: string;
          type: "note" | "call" | "email" | "meeting";
          body: string;
          meta: Json;
        };
        Insert: {
          id?: string;
          org_id: string;
          contact_id: string;
          created_by?: string | null;
          created_at?: string;
          type: "note" | "call" | "email" | "meeting";
          body: string;
          meta?: Json;
        };
        Update: {
          id?: string;
          org_id?: string;
          contact_id?: string;
          created_by?: string | null;
          created_at?: string;
          type?: "note" | "call" | "email" | "meeting";
          body?: string;
          meta?: Json;
        };
        Relationships: [];
      };
      invitations: {
        Row: {
          id: string;
          org_id: string;
          invited_email: string;
          role: "owner" | "admin" | "member";
          invited_by: string | null;
          token: string;
          accepted_at: string | null;
          created_at: string;
          expires_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          invited_email: string;
          role?: "owner" | "admin" | "member";
          invited_by?: string | null;
          token?: string;
          accepted_at?: string | null;
          created_at?: string;
          expires_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          invited_email?: string;
          role?: "owner" | "admin" | "member";
          invited_by?: string | null;
          token?: string;
          accepted_at?: string | null;
          created_at?: string;
          expires_at?: string;
        };
        Relationships: [];
      };
      email_campaigns: {
        Row: {
          id: string;
          org_id: string;
          created_by: string | null;
          name: string;
          subject: string;
          preview_text: string | null;
          body_html: string;
          from_name: string;
          from_email: string;
          status: "draft" | "sending" | "sent" | "failed";
          recipient_count: number;
          sent_count: number;
          open_count: number;
          click_count: number;
          bounce_count: number;
          unsubscribe_count: number;
          created_at: string;
          updated_at: string;
          sent_at: string | null;
        };
        Insert: {
          id?: string;
          org_id: string;
          created_by?: string | null;
          name: string;
          subject?: string;
          preview_text?: string | null;
          body_html?: string;
          from_name?: string;
          from_email?: string;
          status?: "draft" | "sending" | "sent" | "failed";
          recipient_count?: number;
          sent_count?: number;
          open_count?: number;
          click_count?: number;
          bounce_count?: number;
          unsubscribe_count?: number;
          created_at?: string;
          updated_at?: string;
          sent_at?: string | null;
        };
        Update: {
          id?: string;
          org_id?: string;
          created_by?: string | null;
          name?: string;
          subject?: string;
          preview_text?: string | null;
          body_html?: string;
          from_name?: string;
          from_email?: string;
          status?: "draft" | "sending" | "sent" | "failed";
          recipient_count?: number;
          sent_count?: number;
          open_count?: number;
          click_count?: number;
          bounce_count?: number;
          unsubscribe_count?: number;
          created_at?: string;
          updated_at?: string;
          sent_at?: string | null;
        };
        Relationships: [];
      };
      email_campaign_recipients: {
        Row: {
          id: string;
          campaign_id: string;
          org_id: string;
          contact_id: string | null;
          email: string;
          first_name: string | null;
          last_name: string | null;
          company: string | null;
          title: string | null;
          status: "pending" | "sent" | "failed" | "bounced" | "unsubscribed" | "opened" | "clicked";
          sendgrid_message_id: string | null;
          sent_at: string | null;
          opened_at: string | null;
          clicked_at: string | null;
          unsubscribed_at: string | null;
          error_message: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          campaign_id: string;
          org_id: string;
          contact_id?: string | null;
          email: string;
          first_name?: string | null;
          last_name?: string | null;
          company?: string | null;
          title?: string | null;
          status?: "pending" | "sent" | "failed" | "bounced" | "unsubscribed" | "opened" | "clicked";
          sendgrid_message_id?: string | null;
          sent_at?: string | null;
          opened_at?: string | null;
          clicked_at?: string | null;
          unsubscribed_at?: string | null;
          error_message?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          campaign_id?: string;
          org_id?: string;
          contact_id?: string | null;
          email?: string;
          first_name?: string | null;
          last_name?: string | null;
          company?: string | null;
          title?: string | null;
          status?: "pending" | "sent" | "failed" | "bounced" | "unsubscribed" | "opened" | "clicked";
          sendgrid_message_id?: string | null;
          sent_at?: string | null;
          opened_at?: string | null;
          clicked_at?: string | null;
          unsubscribed_at?: string | null;
          error_message?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      email_suppressions: {
        Row: {
          id: string;
          org_id: string;
          email: string;
          reason: "unsubscribed" | "bounced" | "spam" | "invalid";
          campaign_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          email: string;
          reason?: "unsubscribed" | "bounced" | "spam" | "invalid";
          campaign_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          email?: string;
          reason?: "unsubscribed" | "bounced" | "spam" | "invalid";
          campaign_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      contact_tag_definitions: {
        Row: {
          id: string;
          org_id: string;
          name: string;
          color: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          name: string;
          color?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          name?: string;
          color?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      photo_sessions: {
        Row: {
          id: string;
          org_id: string;
          created_by: string | null;
          name: string;
          client_name: string;
          client_email: string | null;
          cc_emails: string[];
          photo_limit: number;
          extra_photo_price: number;
          allow_zip_download: boolean;
          status: "active" | "archived";
          share_token: string;
          finalized_at: string | null;
          wave_invoice_id: string | null;
          wave_invoice_url: string | null;
          invoice_type: "none" | "session" | "manual";
          session_fee: number;
          session_invoice_id: string | null;
          session_invoice_url: string | null;
          session_invoice_sent_at: string | null;
          session_invoice_paid_at: string | null;
          topup_invoice_sent_at: string | null;
          topup_invoice_paid_at: string | null;
          deliverables_ready_at: string | null;
          deliverables_notified_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          created_by?: string | null;
          name: string;
          client_name: string;
          client_email?: string | null;
          cc_emails?: string[];
          photo_limit?: number;
          extra_photo_price?: number;
          allow_zip_download?: boolean;
          status?: "active" | "archived";
          share_token?: string;
          finalized_at?: string | null;
          wave_invoice_id?: string | null;
          wave_invoice_url?: string | null;
          invoice_type?: "none" | "session" | "manual";
          session_fee?: number;
          session_invoice_id?: string | null;
          session_invoice_url?: string | null;
          session_invoice_sent_at?: string | null;
          session_invoice_paid_at?: string | null;
          topup_invoice_sent_at?: string | null;
          topup_invoice_paid_at?: string | null;
          deliverables_ready_at?: string | null;
          deliverables_notified_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          created_by?: string | null;
          name?: string;
          client_name?: string;
          client_email?: string | null;
          cc_emails?: string[];
          photo_limit?: number;
          extra_photo_price?: number;
          allow_zip_download?: boolean;
          status?: "active" | "archived";
          share_token?: string;
          finalized_at?: string | null;
          wave_invoice_id?: string | null;
          wave_invoice_url?: string | null;
          invoice_type?: "none" | "session" | "manual";
          session_fee?: number;
          session_invoice_id?: string | null;
          session_invoice_url?: string | null;
          session_invoice_sent_at?: string | null;
          session_invoice_paid_at?: string | null;
          topup_invoice_sent_at?: string | null;
          topup_invoice_paid_at?: string | null;
          deliverables_ready_at?: string | null;
          deliverables_notified_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      session_deliverables: {
        Row: {
          id: string;
          session_id: string;
          org_id: string;
          storage_path: string;
          file_name: string;
          file_size: number;
          quality: "hd" | "lr";
          mime_type: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          org_id: string;
          storage_path: string;
          file_name: string;
          file_size: number;
          quality?: "hd" | "lr";
          mime_type?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          org_id?: string;
          storage_path?: string;
          file_name?: string;
          file_size?: number;
          quality?: "hd" | "lr";
          mime_type?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      session_photos: {
        Row: {
          id: string;
          session_id: string;
          org_id: string;
          storage_path: string;
          file_name: string;
          file_size: number;
          mime_type: string;
          status: "not_selected" | "selected" | "editing" | "ready" | "ready_for_download";
          display_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          org_id: string;
          storage_path: string;
          file_name: string;
          file_size: number;
          mime_type?: string;
          status?: "not_selected" | "selected" | "editing" | "ready" | "ready_for_download";
          display_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          org_id?: string;
          storage_path?: string;
          file_name?: string;
          file_size?: number;
          mime_type?: string;
          status?: "not_selected" | "selected" | "editing" | "ready" | "ready_for_download";
          display_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      photo_comments: {
        Row: {
          id: string;
          photo_id: string;
          session_id: string;
          org_id: string;
          author_user_id: string | null;
          author_label: string;
          body: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          photo_id: string;
          session_id: string;
          org_id: string;
          author_user_id?: string | null;
          author_label?: string;
          body: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          photo_id?: string;
          session_id?: string;
          org_id?: string;
          author_user_id?: string | null;
          author_label?: string;
          body?: string;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      member_role: "owner" | "admin" | "member";
      photo_status: "not_selected" | "selected" | "editing" | "ready" | "ready_for_download";
      session_status: "active" | "archived";
    };
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

export type Organization = Tables<"organizations">;
export type Project = Tables<"projects">;
export type SkillOutputRow = Tables<"skill_outputs">;
export type TeamMember = Tables<"team_members">;
export type Profile = Tables<"profiles">;
export type Invitation = Tables<"invitations">;
export type EmailCampaign = Tables<"email_campaigns">;
export type EmailCampaignRecipient = Tables<"email_campaign_recipients">;
export type EmailSuppression = Tables<"email_suppressions">;
export type ContactTagDefinition = Tables<"contact_tag_definitions">;
export type PhotoSession = Tables<"photo_sessions">;
export type SessionPhoto = Tables<"session_photos">;
export type PhotoComment = Tables<"photo_comments">;
export type PhotoStatus = SessionPhoto["status"];
export type SessionDeliverable = Tables<"session_deliverables">;
export type DeliverableQuality = SessionDeliverable["quality"];
export type SessionStatus = PhotoSession["status"];
