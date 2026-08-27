export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      admin_actions: {
        Row: {
          action: string
          admin_id: string
          created_at: string
          id: string
          notes: string | null
          target_id: string
          target_table: string
        }
        Insert: {
          action: string
          admin_id: string
          created_at?: string
          id?: string
          notes?: string | null
          target_id: string
          target_table: string
        }
        Update: {
          action?: string
          admin_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          target_id?: string
          target_table?: string
        }
        Relationships: []
      }
      admins: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      app_config: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      email_change_log: {
        Row: {
          changed_at: string
          id: string
          new_email: string
          old_email: string
          user_id: string
        }
        Insert: {
          changed_at?: string
          id?: string
          new_email: string
          old_email: string
          user_id: string
        }
        Update: {
          changed_at?: string
          id?: string
          new_email?: string
          old_email?: string
          user_id?: string
        }
        Relationships: []
      }
      events: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          contact_email: string
          contact_email_visible: boolean
          created_at: string
          description: string
          event_at: string
          id: string
          is_society_event: boolean
          location: string
          luma_link: string
          organiser_name: string
          posted_by: string
          rejected_reason: string | null
          status: Database["public"]["Enums"]["listing_status"]
          title: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          contact_email: string
          contact_email_visible?: boolean
          created_at?: string
          description: string
          event_at: string
          id?: string
          is_society_event?: boolean
          location: string
          luma_link: string
          organiser_name: string
          posted_by: string
          rejected_reason?: string | null
          status?: Database["public"]["Enums"]["listing_status"]
          title: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          contact_email?: string
          contact_email_visible?: boolean
          created_at?: string
          description?: string
          event_at?: string
          id?: string
          is_society_event?: boolean
          location?: string
          luma_link?: string
          organiser_name?: string
          posted_by?: string
          rejected_reason?: string | null
          status?: Database["public"]["Enums"]["listing_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_posted_by_fkey"
            columns: ["posted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_events: {
        Row: {
          created_at: string
          event_type: Database["public"]["Enums"]["listing_event_type"]
          id: string
          listing_id: string
          listing_kind: Database["public"]["Enums"]["listing_event_kind"]
          viewer_id: string
        }
        Insert: {
          created_at?: string
          event_type: Database["public"]["Enums"]["listing_event_type"]
          id?: string
          listing_id: string
          listing_kind: Database["public"]["Enums"]["listing_event_kind"]
          viewer_id: string
        }
        Update: {
          created_at?: string
          event_type?: Database["public"]["Enums"]["listing_event_type"]
          id?: string
          listing_id?: string
          listing_kind?: Database["public"]["Enums"]["listing_event_kind"]
          viewer_id?: string
        }
        Relationships: []
      }
      opportunities: {
        Row: {
          application_deadline: string
          apply_method: Database["public"]["Enums"]["apply_method"]
          apply_url: string | null
          approved_at: string | null
          approved_by: string | null
          company: string
          contact_email: string
          contact_email_visible: boolean
          created_at: string
          description: string
          id: string
          location_text: string | null
          location_type: Database["public"]["Enums"]["location_type"]
          pay: string
          position_name: string
          posted_by: string
          rejected_reason: string | null
          start_month: number
          start_year: number
          status: Database["public"]["Enums"]["listing_status"]
          updated_at: string
        }
        Insert: {
          application_deadline: string
          apply_method: Database["public"]["Enums"]["apply_method"]
          apply_url?: string | null
          approved_at?: string | null
          approved_by?: string | null
          company: string
          contact_email: string
          contact_email_visible?: boolean
          created_at?: string
          description: string
          id?: string
          location_text?: string | null
          location_type: Database["public"]["Enums"]["location_type"]
          pay: string
          position_name: string
          posted_by: string
          rejected_reason?: string | null
          start_month: number
          start_year: number
          status?: Database["public"]["Enums"]["listing_status"]
          updated_at?: string
        }
        Update: {
          application_deadline?: string
          apply_method?: Database["public"]["Enums"]["apply_method"]
          apply_url?: string | null
          approved_at?: string | null
          approved_by?: string | null
          company?: string
          contact_email?: string
          contact_email_visible?: boolean
          created_at?: string
          description?: string
          id?: string
          location_text?: string | null
          location_type?: Database["public"]["Enums"]["location_type"]
          pay?: string
          position_name?: string
          posted_by?: string
          rejected_reason?: string | null
          start_month?: number
          start_year?: number
          status?: Database["public"]["Enums"]["listing_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunities_posted_by_fkey"
            columns: ["posted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_bookmarks: {
        Row: {
          created_at: string
          opportunity_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          opportunity_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          opportunity_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_bookmarks_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_sectors: {
        Row: {
          opportunity_id: string
          sector_id: number
        }
        Insert: {
          opportunity_id: string
          sector_id: number
        }
        Update: {
          opportunity_id?: string
          sector_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_sectors_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_sectors_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_skills: {
        Row: {
          opportunity_id: string
          skill_id: number
        }
        Insert: {
          opportunity_id: string
          skill_id: number
        }
        Update: {
          opportunity_id?: string
          skill_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_skills_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_skills_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
        ]
      }
      outbound_email: {
        Row: {
          attempts: number
          created_at: string
          html_body: string
          id: string
          last_attempted_at: string | null
          last_error: string | null
          max_attempts: number
          next_attempt_at: string
          provider_message_id: string | null
          reply_to: string | null
          sent_at: string | null
          subject: string
          text_body: string
          to_address: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          html_body: string
          id?: string
          last_attempted_at?: string | null
          last_error?: string | null
          max_attempts?: number
          next_attempt_at?: string
          provider_message_id?: string | null
          reply_to?: string | null
          sent_at?: string | null
          subject: string
          text_body: string
          to_address: string
        }
        Update: {
          attempts?: number
          created_at?: string
          html_body?: string
          id?: string
          last_attempted_at?: string | null
          last_error?: string | null
          max_attempts?: number
          next_attempt_at?: string
          provider_message_id?: string | null
          reply_to?: string | null
          sent_at?: string | null
          subject?: string
          text_body?: string
          to_address?: string
        }
        Relationships: []
      }
      profile_sectors: {
        Row: {
          profile_id: string
          sector_id: number
        }
        Insert: {
          profile_id: string
          sector_id: number
        }
        Update: {
          profile_id?: string
          sector_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "profile_sectors_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_sectors_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_skills: {
        Row: {
          profile_id: string
          skill_id: number
        }
        Insert: {
          profile_id: string
          skill_id: number
        }
        Update: {
          profile_id?: string
          skill_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "profile_skills_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_skills_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          bio: string | null
          course: string | null
          created_at: string
          first_name: string
          github_url: string | null
          grad_year: number | null
          id: string
          linkedin_url: string | null
          portfolio_url: string | null
          role: Database["public"]["Enums"]["user_role"]
          status: Database["public"]["Enums"]["user_status"]
          surname: string
          updated_at: string
          working_on: string | null
        }
        Insert: {
          bio?: string | null
          course?: string | null
          created_at?: string
          first_name?: string
          github_url?: string | null
          grad_year?: number | null
          id: string
          linkedin_url?: string | null
          portfolio_url?: string | null
          role: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["user_status"]
          surname?: string
          updated_at?: string
          working_on?: string | null
        }
        Update: {
          bio?: string | null
          course?: string | null
          created_at?: string
          first_name?: string
          github_url?: string | null
          grad_year?: number | null
          id?: string
          linkedin_url?: string | null
          portfolio_url?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["user_status"]
          surname?: string
          updated_at?: string
          working_on?: string | null
        }
        Relationships: []
      }
      sectors: {
        Row: {
          created_at: string
          id: number
          name: string
        }
        Insert: {
          created_at?: string
          id?: number
          name: string
        }
        Update: {
          created_at?: string
          id?: number
          name?: string
        }
        Relationships: []
      }
      skills: {
        Row: {
          created_at: string
          id: number
          name: string
        }
        Insert: {
          created_at?: string
          id?: number
          name: string
        }
        Update: {
          created_at?: string
          id?: number
          name?: string
        }
        Relationships: []
      }
      user_listing_actions: {
        Row: {
          action_type: Database["public"]["Enums"]["user_action_type"]
          created_at: string
          listing_id: string
          listing_kind: Database["public"]["Enums"]["listing_event_kind"]
          user_id: string
        }
        Insert: {
          action_type: Database["public"]["Enums"]["user_action_type"]
          created_at?: string
          listing_id: string
          listing_kind: Database["public"]["Enums"]["listing_event_kind"]
          user_id: string
        }
        Update: {
          action_type?: Database["public"]["Enums"]["user_action_type"]
          created_at?: string
          listing_id?: string
          listing_kind?: Database["public"]["Enums"]["listing_event_kind"]
          user_id?: string
        }
        Relationships: []
      }
      vcs_grants: {
        Row: {
          amount: string | null
          approved_at: string | null
          approved_by: string | null
          created_at: string
          deadline: string | null
          description: string
          id: string
          kind: Database["public"]["Enums"]["vc_grant_kind"]
          link: string
          name: string
          posted_by: string
          rejected_reason: string | null
          stage: string | null
          status: Database["public"]["Enums"]["listing_status"]
          updated_at: string
        }
        Insert: {
          amount?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          deadline?: string | null
          description: string
          id?: string
          kind: Database["public"]["Enums"]["vc_grant_kind"]
          link: string
          name: string
          posted_by: string
          rejected_reason?: string | null
          stage?: string | null
          status?: Database["public"]["Enums"]["listing_status"]
          updated_at?: string
        }
        Update: {
          amount?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          deadline?: string | null
          description?: string
          id?: string
          kind?: Database["public"]["Enums"]["vc_grant_kind"]
          link?: string
          name?: string
          posted_by?: string
          rejected_reason?: string | null
          stage?: string | null
          status?: Database["public"]["Enums"]["listing_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vcs_grants_posted_by_fkey"
            columns: ["posted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_create_event: {
        Args: {
          p_contact_email: string
          p_contact_email_visible: boolean
          p_description: string
          p_event_at: string
          p_is_society_event: boolean
          p_location: string
          p_luma_link: string
          p_organiser_name: string
          p_title: string
        }
        Returns: string
      }
      admin_create_opportunity: {
        Args: {
          p_application_deadline: string
          p_apply_method: Database["public"]["Enums"]["apply_method"]
          p_apply_url: string
          p_company: string
          p_contact_email: string
          p_contact_email_visible: boolean
          p_description: string
          p_location_text: string
          p_location_type: Database["public"]["Enums"]["location_type"]
          p_pay: string
          p_position_name: string
          p_sector_ids: number[]
          p_skill_ids: number[]
          p_start_month: number
          p_start_year: number
        }
        Returns: string
      }
      admin_create_vc_grant: {
        Args: {
          p_amount: string
          p_deadline: string
          p_description: string
          p_kind: Database["public"]["Enums"]["vc_grant_kind"]
          p_link: string
          p_name: string
          p_stage: string
        }
        Returns: string
      }
      admin_delete_graduates: {
        Args: { p_cutoff_year: number }
        Returns: {
          email: string
          first_name: string
          user_id: string
        }[]
      }
      admin_delete_user: {
        Args: { p_reason: string; p_user_id: string }
        Returns: {
          email: string
          first_name: string
        }[]
      }
      admin_get_signup_emails: {
        Args: { p_user_ids: string[] }
        Returns: {
          email: string
          user_id: string
        }[]
      }
      admin_list_pending_profiles: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: {
          bio: string
          course: string
          created_at: string
          email: string
          first_name: string
          github_url: string
          grad_year: number
          id: string
          linkedin_url: string
          portfolio_url: string
          role: Database["public"]["Enums"]["user_role"]
          sector_names: string[]
          skill_names: string[]
          surname: string
          total_count: number
          working_on: string
        }[]
      }
      admin_list_profiles: {
        Args: {
          p_courses?: string[]
          p_grad_max?: number
          p_grad_min?: number
          p_limit?: number
          p_offset?: number
          p_query?: string
          p_roles?: string[]
          p_sectors?: string[]
          p_skills?: string[]
          p_statuses?: string[]
        }
        Returns: {
          course: string
          created_at: string
          email: string
          first_name: string
          grad_year: number
          id: string
          role: Database["public"]["Enums"]["user_role"]
          sector_names: string[]
          skill_names: string[]
          status: Database["public"]["Enums"]["user_status"]
          surname: string
          total_count: number
        }[]
      }
      admin_outbound_email_stats: {
        Args: never
        Returns: {
          failed: number
          oldest_pending_age_seconds: number
          pending: number
          sent_today: number
        }[]
      }
      admin_profile_facets: {
        Args: never
        Returns: {
          courses: string[]
          grad_max: number
          grad_min: number
          sectors: string[]
          skills: string[]
          total: number
        }[]
      }
      approve_event: {
        Args: { p_event_id: string; p_notes?: string }
        Returns: undefined
      }
      approve_opportunity: {
        Args: { p_notes?: string; p_opportunity_id: string }
        Returns: undefined
      }
      approve_user: {
        Args: { p_notes?: string; p_user_id: string }
        Returns: {
          email: string
          first_name: string
        }[]
      }
      approve_vc_grant: {
        Args: { p_id: string; p_notes?: string }
        Returns: undefined
      }
      claim_outbound_email_batch: {
        Args: { p_limit?: number }
        Returns: {
          attempts: number
          html_body: string
          id: string
          max_attempts: number
          reply_to: string
          subject: string
          text_body: string
          to_address: string
        }[]
      }
      cron_drain_outbound_email: { Args: never; Returns: undefined }
      delete_my_account: { Args: never; Returns: undefined }
      enqueue_outbound_email: {
        Args: {
          p_html: string
          p_reply_to?: string
          p_subject: string
          p_text: string
          p_to: string
        }
        Returns: string
      }
      enqueue_outbound_email_bulk: { Args: { p_rows: Json }; Returns: number }
      expire_events: { Args: never; Returns: number }
      expire_opportunities: { Args: never; Returns: number }
      expire_vcs_grants: { Args: never; Returns: number }
      get_event_for_edit: {
        Args: { p_id: string }
        Returns: {
          contact_email: string
          contact_email_visible: boolean
          description: string
          event_at: string
          id: string
          location: string
          luma_link: string
          organiser_name: string
          posted_by: string
          status: Database["public"]["Enums"]["listing_status"]
          title: string
        }[]
      }
      get_my_activity: {
        Args: never
        Returns: {
          action_type: Database["public"]["Enums"]["user_action_type"]
          listing_id: string
          listing_kind: Database["public"]["Enums"]["listing_event_kind"]
          marked_at: string
          occurs_at: string
          status: string
          subtitle: string
          title: string
          url: string
        }[]
      }
      get_my_listing_actions: {
        Args: never
        Returns: {
          action_type: Database["public"]["Enums"]["user_action_type"]
          created_at: string
          listing_id: string
          listing_kind: Database["public"]["Enums"]["listing_event_kind"]
        }[]
      }
      get_my_listing_stats: {
        Args: never
        Returns: {
          click_count: number
          listing_id: string
          listing_kind: Database["public"]["Enums"]["listing_event_kind"]
          view_count: number
        }[]
      }
      get_opportunity_for_edit: {
        Args: { p_id: string }
        Returns: {
          application_deadline: string
          apply_method: Database["public"]["Enums"]["apply_method"]
          apply_url: string
          company: string
          contact_email: string
          contact_email_visible: boolean
          description: string
          id: string
          location_text: string
          location_type: Database["public"]["Enums"]["location_type"]
          pay: string
          position_name: string
          posted_by: string
          start_month: number
          start_year: number
          status: Database["public"]["Enums"]["listing_status"]
        }[]
      }
      is_admin: { Args: never; Returns: boolean }
      is_approved: { Args: never; Returns: boolean }
      is_imperial_email: { Args: { p_email: string }; Returns: boolean }
      list_approved_events: {
        Args: never
        Returns: {
          contact_email: string
          contact_email_visible: boolean
          created_at: string
          description: string
          event_at: string
          id: string
          is_society_event: boolean
          location: string
          luma_link: string
          organiser_name: string
          posted_by: string
          poster_first_name: string
          poster_linkedin_url: string
          poster_surname: string
          title: string
        }[]
      }
      list_approved_opportunities: {
        Args: never
        Returns: {
          application_deadline: string
          apply_method: Database["public"]["Enums"]["apply_method"]
          apply_url: string
          company: string
          contact_email: string
          contact_email_visible: boolean
          created_at: string
          description: string
          id: string
          location_text: string
          location_type: Database["public"]["Enums"]["location_type"]
          pay: string
          position_name: string
          posted_by: string
          poster_first_name: string
          poster_linkedin_url: string
          poster_surname: string
          sector_names: string[]
          skill_names: string[]
          start_month: number
          start_year: number
        }[]
      }
      list_directory_cards: {
        Args: {
          p_courses?: string[]
          p_grad_max?: number
          p_grad_min?: number
          p_limit?: number
          p_offset?: number
          p_query?: string
          p_roles?: string[]
          p_sectors?: string[]
          p_skills?: string[]
          p_sort?: string
        }
        Returns: {
          bio: string
          course: string
          created_at: string
          first_name: string
          grad_year: number
          id: string
          role: Database["public"]["Enums"]["user_role"]
          sector_names: string[]
          skill_names: string[]
          surname: string
          total_count: number
          working_on: string
        }[]
      }
      list_directory_facets: {
        Args: never
        Returns: {
          courses: string[]
          grad_max: number
          grad_min: number
          sectors: string[]
          skills: string[]
          total: number
        }[]
      }
      list_my_bookmarked_opportunities: {
        Args: never
        Returns: {
          application_deadline: string
          apply_method: Database["public"]["Enums"]["apply_method"]
          apply_url: string
          bookmarked_at: string
          company: string
          contact_email: string
          contact_email_visible: boolean
          created_at: string
          description: string
          id: string
          location_text: string
          location_type: Database["public"]["Enums"]["location_type"]
          pay: string
          position_name: string
          posted_by: string
          poster_first_name: string
          poster_linkedin_url: string
          poster_surname: string
          sector_names: string[]
          skill_names: string[]
          start_month: number
          start_year: number
        }[]
      }
      list_pending_events_admin: {
        Args: never
        Returns: {
          contact_email: string
          contact_email_visible: boolean
          created_at: string
          description: string
          event_at: string
          id: string
          location: string
          luma_link: string
          organiser_name: string
          posted_by: string
          poster_first_name: string
          poster_linkedin_url: string
          poster_surname: string
          title: string
        }[]
      }
      list_pending_opportunities_admin: {
        Args: never
        Returns: {
          application_deadline: string
          apply_method: Database["public"]["Enums"]["apply_method"]
          apply_url: string
          company: string
          contact_email: string
          contact_email_visible: boolean
          created_at: string
          description: string
          id: string
          location_text: string
          location_type: Database["public"]["Enums"]["location_type"]
          pay: string
          position_name: string
          posted_by: string
          poster_first_name: string
          poster_linkedin_url: string
          poster_surname: string
          sector_names: string[]
          skill_names: string[]
          start_month: number
          start_year: number
        }[]
      }
      mark_listing_action: {
        Args: {
          p_action: Database["public"]["Enums"]["user_action_type"]
          p_id: string
          p_kind: Database["public"]["Enums"]["listing_event_kind"]
        }
        Returns: undefined
      }
      purge_rejected_listings: { Args: never; Returns: number }
      record_listing_event: {
        Args: {
          p_event_type: Database["public"]["Enums"]["listing_event_type"]
          p_id: string
          p_kind: Database["public"]["Enums"]["listing_event_kind"]
        }
        Returns: undefined
      }
      reject_event: {
        Args: { p_event_id: string; p_reason: string }
        Returns: {
          email: string
          first_name: string
          title: string
        }[]
      }
      reject_opportunity: {
        Args: { p_opportunity_id: string; p_reason: string }
        Returns: {
          email: string
          first_name: string
          title: string
        }[]
      }
      reject_user: {
        Args: { p_reason: string; p_user_id: string }
        Returns: {
          email: string
          first_name: string
        }[]
      }
      reject_vc_grant: {
        Args: { p_id: string; p_reason: string }
        Returns: {
          email: string
          first_name: string
          title: string
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      submit_event: {
        Args: {
          p_contact_email: string
          p_contact_email_visible: boolean
          p_description: string
          p_event_at: string
          p_location: string
          p_luma_link: string
          p_organiser_name: string
          p_title: string
        }
        Returns: string
      }
      submit_onboarding: {
        Args: {
          p_bio: string
          p_course: string
          p_github_url: string
          p_grad_year: number
          p_linkedin_url: string
          p_portfolio_url: string
          p_sector_ids: number[]
          p_skill_ids: number[]
          p_working_on: string
        }
        Returns: undefined
      }
      submit_opportunity: {
        Args: {
          p_application_deadline: string
          p_apply_method: Database["public"]["Enums"]["apply_method"]
          p_apply_url: string
          p_company: string
          p_contact_email: string
          p_contact_email_visible: boolean
          p_description: string
          p_location_text: string
          p_location_type: Database["public"]["Enums"]["location_type"]
          p_pay: string
          p_position_name: string
          p_sector_ids: number[]
          p_skill_ids: number[]
          p_start_month: number
          p_start_year: number
        }
        Returns: string
      }
      submit_vc_grant: {
        Args: {
          p_amount: string
          p_deadline: string
          p_description: string
          p_kind: Database["public"]["Enums"]["vc_grant_kind"]
          p_link: string
          p_name: string
          p_stage: string
        }
        Returns: string
      }
      unmark_listing_action: {
        Args: {
          p_action: Database["public"]["Enums"]["user_action_type"]
          p_id: string
          p_kind: Database["public"]["Enums"]["listing_event_kind"]
        }
        Returns: undefined
      }
      update_event: {
        Args: {
          p_contact_email: string
          p_contact_email_visible: boolean
          p_description: string
          p_event_at: string
          p_id: string
          p_location: string
          p_luma_link: string
          p_organiser_name: string
          p_title: string
        }
        Returns: undefined
      }
      update_opportunity: {
        Args: {
          p_application_deadline: string
          p_apply_method: Database["public"]["Enums"]["apply_method"]
          p_apply_url: string
          p_company: string
          p_contact_email: string
          p_contact_email_visible: boolean
          p_description: string
          p_id: string
          p_location_text: string
          p_location_type: Database["public"]["Enums"]["location_type"]
          p_pay: string
          p_position_name: string
          p_sector_ids: number[]
          p_skill_ids: number[]
          p_start_month: number
          p_start_year: number
        }
        Returns: undefined
      }
      update_profile: {
        Args: {
          p_bio: string
          p_course: string
          p_first_name: string
          p_github_url: string
          p_grad_year: number
          p_linkedin_url: string
          p_portfolio_url: string
          p_sector_ids: number[]
          p_skill_ids: number[]
          p_surname: string
          p_working_on: string
        }
        Returns: undefined
      }
      update_vc_grant: {
        Args: {
          p_amount: string
          p_deadline: string
          p_description: string
          p_id: string
          p_kind: Database["public"]["Enums"]["vc_grant_kind"]
          p_link: string
          p_name: string
          p_stage: string
        }
        Returns: undefined
      }
    }
    Enums: {
      apply_method: "email" | "link"
      listing_event_kind: "opportunity" | "event" | "vc_grant"
      listing_event_type:
        | "expand"
        | "apply_click"
        | "contact_click"
        | "external_click"
      listing_status: "pending" | "approved" | "rejected" | "expired"
      location_type: "remote" | "hybrid" | "onsite"
      user_action_type: "applied" | "going"
      user_role: "student" | "alum"
      user_status:
        | "pending_onboarding"
        | "pending_review"
        | "approved"
        | "rejected"
      vc_grant_kind: "vc" | "grant"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      apply_method: ["email", "link"],
      listing_event_kind: ["opportunity", "event", "vc_grant"],
      listing_event_type: [
        "expand",
        "apply_click",
        "contact_click",
        "external_click",
      ],
      listing_status: ["pending", "approved", "rejected", "expired"],
      location_type: ["remote", "hybrid", "onsite"],
      user_action_type: ["applied", "going"],
      user_role: ["student", "alum"],
      user_status: [
        "pending_onboarding",
        "pending_review",
        "approved",
        "rejected",
      ],
      vc_grant_kind: ["vc", "grant"],
    },
  },
} as const

