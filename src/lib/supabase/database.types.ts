export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agents: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          token: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          token: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          token?: string
        }
        Relationships: []
      }
      attendance: {
        Row: {
          course_id: string
          id: string
          marked_at: string
          marked_by: string | null
          session_code: string | null
          session_date: string
          student_id: string
        }
        Insert: {
          course_id: string
          id?: string
          marked_at?: string
          marked_by?: string | null
          session_code?: string | null
          session_date: string
          student_id: string
        }
        Update: {
          course_id?: string
          id?: string
          marked_at?: string
          marked_by?: string | null
          session_code?: string | null
          session_date?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_marked_by_fkey"
            columns: ["marked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_events: {
        Row: {
          attendance_mode: string
          attendance_tab: string
          cover_image_file_id: string | null
          cover_image_url: string | null
          created_at: string
          created_by: string | null
          id: string
          live_session_number: number
          logo_url: string | null
          reg_email_col: number
          reg_name_col: number
          registration_link: string | null
          registration_tab: string | null
          require_registration: boolean
          slug: string
          spreadsheet_id: string
          title: string
          type: string
          window_minutes: number
        }
        Insert: {
          attendance_mode?: string
          attendance_tab?: string
          cover_image_file_id?: string | null
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          live_session_number?: number
          logo_url?: string | null
          reg_email_col?: number
          reg_name_col?: number
          registration_link?: string | null
          registration_tab?: string | null
          require_registration?: boolean
          slug: string
          spreadsheet_id: string
          title: string
          type: string
          window_minutes?: number
        }
        Update: {
          attendance_mode?: string
          attendance_tab?: string
          cover_image_file_id?: string | null
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          live_session_number?: number
          logo_url?: string | null
          reg_email_col?: number
          reg_name_col?: number
          registration_link?: string | null
          registration_tab?: string | null
          require_registration?: boolean
          slug?: string
          spreadsheet_id?: string
          title?: string
          type?: string
          window_minutes?: number
        }
        Relationships: [
          {
            foreignKeyName: "attendance_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_sessions: {
        Row: {
          close_label: string | null
          countdown_target: string | null
          event_id: string
          id: string
          open_label: string | null
          session_date: string | null
          session_number: number
          time_label: string | null
        }
        Insert: {
          close_label?: string | null
          countdown_target?: string | null
          event_id: string
          id?: string
          open_label?: string | null
          session_date?: string | null
          session_number: number
          time_label?: string | null
        }
        Update: {
          close_label?: string | null
          countdown_target?: string | null
          event_id?: string
          id?: string
          open_label?: string | null
          session_date?: string | null
          session_number?: number
          time_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_sessions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "attendance_events"
            referencedColumns: ["id"]
          },
        ]
      }
      auth_email_logs: {
        Row: {
          created_at: string
          error_details: Json | null
          error_message: string
          event_type: string
          final_attempt_at: string | null
          id: string
          retry_count: number
          user_email: string
        }
        Insert: {
          created_at?: string
          error_details?: Json | null
          error_message: string
          event_type: string
          final_attempt_at?: string | null
          id?: string
          retry_count?: number
          user_email: string
        }
        Update: {
          created_at?: string
          error_details?: Json | null
          error_message?: string
          event_type?: string
          final_attempt_at?: string | null
          id?: string
          retry_count?: number
          user_email?: string
        }
        Relationships: []
      }
      batch_quiz_decisions: {
        Row: {
          choice: string
          created_at: string
          id: string
          key: string
          kind: string
          person_id: string | null
          session_id: string
        }
        Insert: {
          choice?: string
          created_at?: string
          id?: string
          key: string
          kind: string
          person_id?: string | null
          session_id: string
        }
        Update: {
          choice?: string
          created_at?: string
          id?: string
          key?: string
          kind?: string
          person_id?: string | null
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "batch_quiz_decisions_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "pz_people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_quiz_decisions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "batch_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      batch_quiz_results: {
        Row: {
          correct: number
          created_at: string
          id: string
          imported: boolean
          incorrect: number
          person_id: string
          player: string
          score: number
          session_id: string
        }
        Insert: {
          correct?: number
          created_at?: string
          id?: string
          imported?: boolean
          incorrect?: number
          person_id: string
          player?: string
          score: number
          session_id: string
        }
        Update: {
          correct?: number
          created_at?: string
          id?: string
          imported?: boolean
          incorrect?: number
          person_id?: string
          player?: string
          score?: number
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "batch_quiz_results_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "pz_people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_quiz_results_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "batch_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      batch_session_marks: {
        Row: {
          id: string
          marked_at: string
          marked_by: string | null
          person_id: string
          session_id: string
          source: string
        }
        Insert: {
          id?: string
          marked_at?: string
          marked_by?: string | null
          person_id: string
          session_id: string
          source: string
        }
        Update: {
          id?: string
          marked_at?: string
          marked_by?: string | null
          person_id?: string
          session_id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "batch_session_marks_marked_by_fkey"
            columns: ["marked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_session_marks_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "pz_people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_session_marks_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "batch_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      batch_sessions: {
        Row: {
          created_at: string | null
          email_enabled: boolean
          email_lead_minutes: number
          id: string
          include_attendance_link: boolean
          include_kahoot: boolean
          kahoot_url: string
          number: number
          page_id: string
          public_code: string
          quiz_file_name: string | null
          quiz_max_score: number | null
          quiz_saved_at: string | null
          starts_at: string
          title: string
          window_override: string
          zoom_url: string
        }
        Insert: {
          created_at?: string | null
          email_enabled?: boolean
          email_lead_minutes?: number
          id?: string
          include_attendance_link?: boolean
          include_kahoot?: boolean
          kahoot_url?: string
          number: number
          page_id: string
          public_code: string
          quiz_file_name?: string | null
          quiz_max_score?: number | null
          quiz_saved_at?: string | null
          starts_at: string
          title?: string
          window_override?: string
          zoom_url?: string
        }
        Update: {
          created_at?: string | null
          email_enabled?: boolean
          email_lead_minutes?: number
          id?: string
          include_attendance_link?: boolean
          include_kahoot?: boolean
          kahoot_url?: string
          number?: number
          page_id?: string
          public_code?: string
          quiz_file_name?: string | null
          quiz_max_score?: number | null
          quiz_saved_at?: string | null
          starts_at?: string
          title?: string
          window_override?: string
          zoom_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "batch_sessions_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "landing_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      banners: {
        Row: {
          active_from: string | null
          active_until: string | null
          created_at: string
          created_by: string | null
          cta_link: string
          cta_text: string
          headline: string
          id: string
          image_url: string | null
          is_active: boolean
          order_index: number
          slot: Database["public"]["Enums"]["banner_slot"]
        }
        Insert: {
          active_from?: string | null
          active_until?: string | null
          created_at?: string
          created_by?: string | null
          cta_link: string
          cta_text: string
          headline: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          order_index?: number
          slot?: Database["public"]["Enums"]["banner_slot"]
        }
        Update: {
          active_from?: string | null
          active_until?: string | null
          created_at?: string
          created_by?: string | null
          cta_link?: string
          cta_text?: string
          headline?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          order_index?: number
          slot?: Database["public"]["Enums"]["banner_slot"]
        }
        Relationships: [
          {
            foreignKeyName: "banners_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_recipients: {
        Row: {
          campaign_id: string
          contact_id: string
          created_at: string
          email_queue_id: string | null
          id: string
          status: string
        }
        Insert: {
          campaign_id: string
          contact_id: string
          created_at?: string
          email_queue_id?: string | null
          id?: string
          status?: string
        }
        Update: {
          campaign_id?: string
          contact_id?: string
          created_at?: string
          email_queue_id?: string | null
          id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_recipients_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_recipients_email_queue_id_fkey"
            columns: ["email_queue_id"]
            isOneToOne: false
            referencedRelation: "email_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          completed_at: string | null
          conversion_course_id: string | null
          conversion_label_match: string | null
          created_at: string
          created_by: string | null
          html_content: string
          id: string
          name: string
          scheduled_at: string | null
          segment: Json
          started_at: string | null
          status: Database["public"]["Enums"]["crm_campaign_status"]
          subject: string
        }
        Insert: {
          completed_at?: string | null
          conversion_course_id?: string | null
          conversion_label_match?: string | null
          created_at?: string
          created_by?: string | null
          html_content?: string
          id?: string
          name: string
          scheduled_at?: string | null
          segment?: Json
          started_at?: string | null
          status?: Database["public"]["Enums"]["crm_campaign_status"]
          subject?: string
        }
        Update: {
          completed_at?: string | null
          conversion_course_id?: string | null
          conversion_label_match?: string | null
          created_at?: string
          created_by?: string | null
          html_content?: string
          id?: string
          name?: string
          scheduled_at?: string | null
          segment?: Json
          started_at?: string | null
          status?: Database["public"]["Enums"]["crm_campaign_status"]
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_conversion_course_id_fkey"
            columns: ["conversion_course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      certificates: {
        Row: {
          cert_url: string | null
          course_id: string
          created_at: string
          id: string
          issued_at: string | null
          student_id: string
        }
        Insert: {
          cert_url?: string | null
          course_id: string
          created_at?: string
          id?: string
          issued_at?: string | null
          student_id: string
        }
        Update: {
          cert_url?: string | null
          course_id?: string
          created_at?: string
          id?: string
          issued_at?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "certificates_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_activities: {
        Row: {
          agent_id: string | null
          body: string | null
          burst_pos: number | null
          contact_id: string
          created_at: string
          id: string
          is_new_chat: boolean
          kind: string
          next_unlock_at: string | null
          number_id: string | null
        }
        Insert: {
          agent_id?: string | null
          body?: string | null
          burst_pos?: number | null
          contact_id: string
          created_at?: string
          id?: string
          is_new_chat?: boolean
          kind: string
          next_unlock_at?: string | null
          number_id?: string | null
        }
        Update: {
          agent_id?: string | null
          body?: string | null
          burst_pos?: number | null
          contact_id?: string
          created_at?: string
          id?: string
          is_new_chat?: boolean
          kind?: string
          next_unlock_at?: string | null
          number_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_activities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_activities_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_activities_number_id_fkey"
            columns: ["number_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_numbers"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_purchases: {
        Row: {
          amount: number | null
          contact_id: string
          course_id: string | null
          created_at: string
          currency: string | null
          id: string
          import_batch_id: string | null
          is_early_bird: boolean
          product_label: string
          promo_code: string | null
          purchased_at: string | null
          row_type: Database["public"]["Enums"]["crm_row_type"]
          source_row_ref: string
          source_sheet_id: string
        }
        Insert: {
          amount?: number | null
          contact_id: string
          course_id?: string | null
          created_at?: string
          currency?: string | null
          id?: string
          import_batch_id?: string | null
          is_early_bird?: boolean
          product_label?: string
          promo_code?: string | null
          purchased_at?: string | null
          row_type?: Database["public"]["Enums"]["crm_row_type"]
          source_row_ref: string
          source_sheet_id: string
        }
        Update: {
          amount?: number | null
          contact_id?: string
          course_id?: string | null
          created_at?: string
          currency?: string | null
          id?: string
          import_batch_id?: string | null
          is_early_bird?: boolean
          product_label?: string
          promo_code?: string | null
          purchased_at?: string | null
          row_type?: Database["public"]["Enums"]["crm_row_type"]
          source_row_ref?: string
          source_sheet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_purchases_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_purchases_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_purchases_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          claimed_at: string | null
          consent_basis: Database["public"]["Enums"]["crm_consent_basis"]
          country: string | null
          created_at: string
          discovery_source: Database["public"]["Enums"]["crm_discovery_source"]
          email: string | null
          email_unsubscribed_at: string | null
          full_name: string
          id: string
          owner_id: string | null
          next_followup_at: string | null
          last_outcome: string | null
          do_not_contact_at: string | null
          phone_e164: string | null
          phone_raw: string | null
          profession: string | null
          profile_id: string | null
          unsubscribe_token: string
          updated_at: string
          whatsapp_unsubscribed_at: string | null
        }
        Insert: {
          claimed_at?: string | null
          consent_basis?: Database["public"]["Enums"]["crm_consent_basis"]
          country?: string | null
          created_at?: string
          discovery_source?: Database["public"]["Enums"]["crm_discovery_source"]
          email?: string | null
          email_unsubscribed_at?: string | null
          full_name?: string
          id?: string
          owner_id?: string | null
          next_followup_at?: string | null
          last_outcome?: string | null
          do_not_contact_at?: string | null
          phone_e164?: string | null
          phone_raw?: string | null
          profession?: string | null
          profile_id?: string | null
          unsubscribe_token?: string
          updated_at?: string
          whatsapp_unsubscribed_at?: string | null
        }
        Update: {
          claimed_at?: string | null
          consent_basis?: Database["public"]["Enums"]["crm_consent_basis"]
          country?: string | null
          created_at?: string
          discovery_source?: Database["public"]["Enums"]["crm_discovery_source"]
          email?: string | null
          email_unsubscribed_at?: string | null
          full_name?: string
          id?: string
          owner_id?: string | null
          next_followup_at?: string | null
          last_outcome?: string | null
          do_not_contact_at?: string | null
          phone_e164?: string | null
          phone_raw?: string | null
          profession?: string | null
          profile_id?: string | null
          unsubscribe_token?: string
          updated_at?: string
          whatsapp_unsubscribed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          banner_url: string | null
          created_at: string
          created_by: string | null
          description: string | null
          duration_text: string | null
          duration_weeks: number | null
          faqs: Json
          features: string[]
          gas_webapp_url: string | null
          id: string
          is_published: boolean
          level: string | null
          mentor_avatar_url: string | null
          mentor_bio: string | null
          mentor_name: string | null
          mentor_title: string | null
          outcomes: string[]
          portal_url: string | null
          price_pkr: number
          public_video_url: string | null
          register_url: string | null
          sheet_id: string | null
          slug: string
          status: Database["public"]["Enums"]["course_status"]
          tagline: string | null
          thumbnail_url: string | null
          timings: string | null
          title: string
          type: Database["public"]["Enums"]["course_type"]
        }
        Insert: {
          banner_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_text?: string | null
          duration_weeks?: number | null
          faqs?: Json
          features?: string[]
          gas_webapp_url?: string | null
          id?: string
          is_published?: boolean
          level?: string | null
          mentor_avatar_url?: string | null
          mentor_bio?: string | null
          mentor_name?: string | null
          mentor_title?: string | null
          outcomes?: string[]
          portal_url?: string | null
          price_pkr?: number
          public_video_url?: string | null
          register_url?: string | null
          sheet_id?: string | null
          slug: string
          status?: Database["public"]["Enums"]["course_status"]
          tagline?: string | null
          thumbnail_url?: string | null
          timings?: string | null
          title: string
          type?: Database["public"]["Enums"]["course_type"]
        }
        Update: {
          banner_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_text?: string | null
          duration_weeks?: number | null
          faqs?: Json
          features?: string[]
          gas_webapp_url?: string | null
          id?: string
          is_published?: boolean
          level?: string | null
          mentor_avatar_url?: string | null
          mentor_bio?: string | null
          mentor_name?: string | null
          mentor_title?: string | null
          outcomes?: string[]
          portal_url?: string | null
          price_pkr?: number
          public_video_url?: string | null
          register_url?: string | null
          sheet_id?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["course_status"]
          tagline?: string | null
          thumbnail_url?: string | null
          timings?: string | null
          title?: string
          type?: Database["public"]["Enums"]["course_type"]
        }
        Relationships: [
          {
            foreignKeyName: "courses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      email_metrics: {
        Row: {
          bounce_type: string | null
          brevo_message_id: string | null
          complaint_type: string | null
          created_at: string
          email_queue_id: string | null
          event_timestamp: string
          event_type: string
          id: string
          ip_address: string | null
          user_agent: string | null
          user_email: string
        }
        Insert: {
          bounce_type?: string | null
          brevo_message_id?: string | null
          complaint_type?: string | null
          created_at?: string
          email_queue_id?: string | null
          event_timestamp: string
          event_type: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_email: string
        }
        Update: {
          bounce_type?: string | null
          brevo_message_id?: string | null
          complaint_type?: string | null
          created_at?: string
          email_queue_id?: string | null
          event_timestamp?: string
          event_type?: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_metrics_email_queue_id_fkey"
            columns: ["email_queue_id"]
            isOneToOne: false
            referencedRelation: "email_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      email_queue: {
        Row: {
          brevo_message_id: string | null
          created_at: string
          created_minute: string
          event_type: string
          html_content: string
          id: string
          last_error: string | null
          last_error_at: string | null
          next_retry_at: string | null
          retry_count: number
          sent_at: string | null
          status: string
          subject: string
          user_email: string
          user_id: string | null
        }
        Insert: {
          brevo_message_id?: string | null
          created_at?: string
          created_minute: string
          event_type: string
          html_content: string
          id?: string
          last_error?: string | null
          last_error_at?: string | null
          next_retry_at?: string | null
          retry_count?: number
          sent_at?: string | null
          status?: string
          subject: string
          user_email: string
          user_id?: string | null
        }
        Update: {
          brevo_message_id?: string | null
          created_at?: string
          created_minute?: string
          event_type?: string
          html_content?: string
          id?: string
          last_error?: string | null
          last_error_at?: string | null
          next_retry_at?: string | null
          retry_count?: number
          sent_at?: string | null
          status?: string
          subject?: string
          user_email?: string
          user_id?: string | null
        }
        Relationships: []
      }
      enrollment_modules: {
        Row: {
          enrollment_id: string
          module_id: string
        }
        Insert: {
          enrollment_id: string
          module_id: string
        }
        Update: {
          enrollment_id?: string
          module_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollment_modules_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollment_modules_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["id"]
          },
        ]
      }
      enrollment_open_modules: {
        Row: {
          enrollment_id: string
          module_id: string
          opened_at: string
        }
        Insert: {
          enrollment_id: string
          module_id: string
          opened_at?: string
        }
        Update: {
          enrollment_id?: string
          module_id?: string
          opened_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollment_open_modules_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollment_open_modules_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["id"]
          },
        ]
      }
      enrollments: {
        Row: {
          access_level: string | null
          cert_issued: boolean
          cert_url: string | null
          course_id: string
          enrolled_at: string
          id: string
          landing_registration_id: string | null
          payment_amount_pkr: number | null
          payment_screenshot_url: string | null
          payment_shortfall_pkr: number | null
          portal_open: boolean
          rejection_reason: string | null
          sheet_pending_note: string | null
          sheet_pending_status: Database["public"]["Enums"]["enrollment_status"] | null
          status: Database["public"]["Enums"]["enrollment_status"]
          student_id: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          access_level?: string | null
          cert_issued?: boolean
          cert_url?: string | null
          course_id: string
          enrolled_at?: string
          id?: string
          landing_registration_id?: string | null
          payment_amount_pkr?: number | null
          payment_screenshot_url?: string | null
          payment_shortfall_pkr?: number | null
          portal_open?: boolean
          rejection_reason?: string | null
          sheet_pending_note?: string | null
          sheet_pending_status?: Database["public"]["Enums"]["enrollment_status"] | null
          status?: Database["public"]["Enums"]["enrollment_status"]
          student_id: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          access_level?: string | null
          cert_issued?: boolean
          cert_url?: string | null
          course_id?: string
          enrolled_at?: string
          id?: string
          landing_registration_id?: string | null
          payment_amount_pkr?: number | null
          payment_screenshot_url?: string | null
          payment_shortfall_pkr?: number | null
          portal_open?: boolean
          rejection_reason?: string | null
          sheet_pending_note?: string | null
          sheet_pending_status?: Database["public"]["Enums"]["enrollment_status"] | null
          status?: Database["public"]["Enums"]["enrollment_status"]
          student_id?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_landing_registration_id_fkey"
            columns: ["landing_registration_id"]
            isOneToOne: false
            referencedRelation: "landing_registrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_registrations: {
        Row: {
          event_name: string
          id: string
          payment_verified_at: string | null
          registered_at: string
          sheets_row_ref: string | null
          student_email: string
          synced_to_platform: boolean
        }
        Insert: {
          event_name: string
          id?: string
          payment_verified_at?: string | null
          registered_at?: string
          sheets_row_ref?: string | null
          student_email: string
          synced_to_platform?: boolean
        }
        Update: {
          event_name?: string
          id?: string
          payment_verified_at?: string | null
          registered_at?: string
          sheets_row_ref?: string | null
          student_email?: string
          synced_to_platform?: boolean
        }
        Relationships: []
      }
      featured_items: {
        Row: {
          id: string
          is_featured: boolean
          item_id: string
          item_type: Database["public"]["Enums"]["featured_item_type"]
          order_index: number
        }
        Insert: {
          id?: string
          is_featured?: boolean
          item_id: string
          item_type: Database["public"]["Enums"]["featured_item_type"]
          order_index?: number
        }
        Update: {
          id?: string
          is_featured?: boolean
          item_id?: string
          item_type?: Database["public"]["Enums"]["featured_item_type"]
          order_index?: number
        }
        Relationships: []
      }
      feedback_answers: {
        Row: {
          id: string
          question_id: string
          response_id: string
          star_value: number | null
          video_url: string | null
        }
        Insert: {
          id?: string
          question_id: string
          response_id: string
          star_value?: number | null
          video_url?: string | null
        }
        Update: {
          id?: string
          question_id?: string
          response_id?: string
          star_value?: number | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feedback_answers_response_id_fkey"
            columns: ["response_id"]
            isOneToOne: false
            referencedRelation: "feedback_responses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "feedback_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_audit_log: {
        Row: {
          action: string
          actor_profile_id: string | null
          created_at: string
          detail: string
          id: string
        }
        Insert: {
          action: string
          actor_profile_id?: string | null
          created_at?: string
          detail?: string
          id?: string
        }
        Update: {
          action?: string
          actor_profile_id?: string | null
          created_at?: string
          detail?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_audit_log_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_programs: {
        Row: {
          cover_url: string | null
          created_at: string
          id: string
          name: string
          share_token: string | null
          type: Database["public"]["Enums"]["feedback_program_type"]
        }
        Insert: {
          cover_url?: string | null
          created_at?: string
          id?: string
          name: string
          share_token?: string | null
          type: Database["public"]["Enums"]["feedback_program_type"]
        }
        Update: {
          cover_url?: string | null
          created_at?: string
          id?: string
          name?: string
          share_token?: string | null
          type?: Database["public"]["Enums"]["feedback_program_type"]
        }
        Relationships: []
      }
      feedback_question_bank: {
        Row: {
          default_order: number
          id: string
          is_mentorship_default: boolean
          text: string
          type: Database["public"]["Enums"]["feedback_question_type"]
        }
        Insert: {
          default_order: number
          id?: string
          is_mentorship_default?: boolean
          text: string
          type?: Database["public"]["Enums"]["feedback_question_type"]
        }
        Update: {
          default_order?: number
          id?: string
          is_mentorship_default?: boolean
          text?: string
          type?: Database["public"]["Enums"]["feedback_question_type"]
        }
        Relationships: []
      }
      feedback_questions: {
        Row: {
          feedback_session_id: string
          id: string
          question_order: number
          text: string
          type: Database["public"]["Enums"]["feedback_question_type"]
        }
        Insert: {
          feedback_session_id: string
          id?: string
          question_order: number
          text: string
          type?: Database["public"]["Enums"]["feedback_question_type"]
        }
        Update: {
          feedback_session_id?: string
          id?: string
          question_order?: number
          text?: string
          type?: Database["public"]["Enums"]["feedback_question_type"]
        }
        Relationships: [
          {
            foreignKeyName: "feedback_questions_feedback_session_id_fkey"
            columns: ["feedback_session_id"]
            isOneToOne: false
            referencedRelation: "feedback_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_responses: {
        Row: {
          comments: string
          feedback_session_id: string
          id: string
          is_featured: boolean
          is_public: boolean
          participant_email: string | null
          participant_name: string
          participant_profile_id: string | null
          submitted_at: string
        }
        Insert: {
          comments?: string
          feedback_session_id: string
          id?: string
          is_featured?: boolean
          is_public?: boolean
          participant_email?: string | null
          participant_name?: string
          participant_profile_id?: string | null
          submitted_at?: string
        }
        Update: {
          comments?: string
          feedback_session_id?: string
          id?: string
          is_featured?: boolean
          is_public?: boolean
          participant_email?: string | null
          participant_name?: string
          participant_profile_id?: string | null
          submitted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_responses_feedback_session_id_fkey"
            columns: ["feedback_session_id"]
            isOneToOne: false
            referencedRelation: "feedback_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_responses_participant_profile_id_fkey"
            columns: ["participant_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_sessions: {
        Row: {
          cover_url: string | null
          created_at: string
          id: string
          mentor_id: string | null
          mentorship_session_id: string | null
          name: string
          program_id: string | null
          program_order: number | null
          session_date: string | null
          share_token: string | null
          slug: string
          speaker_name: string
          status: Database["public"]["Enums"]["feedback_session_status"]
        }
        Insert: {
          cover_url?: string | null
          created_at?: string
          id?: string
          mentor_id?: string | null
          mentorship_session_id?: string | null
          name: string
          program_id?: string | null
          program_order?: number | null
          session_date?: string | null
          share_token?: string | null
          slug: string
          speaker_name: string
          status?: Database["public"]["Enums"]["feedback_session_status"]
        }
        Update: {
          cover_url?: string | null
          created_at?: string
          id?: string
          mentor_id?: string | null
          mentorship_session_id?: string | null
          name?: string
          program_id?: string | null
          program_order?: number | null
          session_date?: string | null
          share_token?: string | null
          slug?: string
          speaker_name?: string
          status?: Database["public"]["Enums"]["feedback_session_status"]
        }
        Relationships: [
          {
            foreignKeyName: "feedback_sessions_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "feedback_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_sessions_mentorship_session_id_fkey"
            columns: ["mentorship_session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_sessions_mentor_id_fkey"
            columns: ["mentor_id"]
            isOneToOne: false
            referencedRelation: "mentors"
            referencedColumns: ["id"]
          },
        ]
      }
      gas_sync_log: {
        Row: {
          course_slug: string
          error_message: string | null
          id: string
          student_email: string
          supabase_user_id: string | null
          sync_status: string
          synced_at: string
        }
        Insert: {
          course_slug: string
          error_message?: string | null
          id?: string
          student_email: string
          supabase_user_id?: string | null
          sync_status: string
          synced_at?: string
        }
        Update: {
          course_slug?: string
          error_message?: string | null
          id?: string
          student_email?: string
          supabase_user_id?: string | null
          sync_status?: string
          synced_at?: string
        }
        Relationships: []
      }
      import_batch_contacts: {
        Row: {
          contact_id: string
          import_batch_id: string
        }
        Insert: {
          contact_id: string
          import_batch_id: string
        }
        Update: {
          contact_id?: string
          import_batch_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_batch_contacts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_batch_contacts_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      import_batches: {
        Row: {
          column_mapping: Json
          contacts_created: number
          contacts_merged: number
          course_id: string | null
          created_at: string
          created_by: string | null
          id: string
          kind: "imported" | "closed_paid" | "closed_interested"
          rows_imported: number
          rows_skipped: number
          rows_total: number
          sheet_id: string
          sheet_name: string
          source_page_id: string | null
          status: Database["public"]["Enums"]["crm_import_status"]
          tab_name: string
        }
        Insert: {
          column_mapping?: Json
          contacts_created?: number
          contacts_merged?: number
          course_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: "imported" | "closed_paid" | "closed_interested"
          rows_imported?: number
          rows_skipped?: number
          rows_total?: number
          sheet_id: string
          sheet_name?: string
          source_page_id?: string | null
          status?: Database["public"]["Enums"]["crm_import_status"]
          tab_name: string
        }
        Update: {
          column_mapping?: Json
          contacts_created?: number
          contacts_merged?: number
          course_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: "imported" | "closed_paid" | "closed_interested"
          rows_imported?: number
          rows_skipped?: number
          rows_total?: number
          sheet_id?: string
          sheet_name?: string
          source_page_id?: string | null
          status?: Database["public"]["Enums"]["crm_import_status"]
          tab_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_batches_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_batches_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_batches_source_page_id_fkey"
            columns: ["source_page_id"]
            isOneToOne: false
            referencedRelation: "landing_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      landing_agent_links: {
        Row: {
          agent_id: string
          code: string
          created_at: string
          id: string
        }
        Insert: {
          agent_id: string
          code: string
          created_at?: string
          id?: string
        }
        Update: {
          agent_id?: string
          code?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "landing_agent_links_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      landing_funnel_events: {
        Row: {
          agent_id: string | null
          at: string
          id: number
          page_id: string
          session_id: string
          type: string
          utm: Json
        }
        Insert: {
          agent_id?: string | null
          at?: string
          id?: never
          page_id: string
          session_id: string
          type: string
          utm?: Json
        }
        Update: {
          agent_id?: string | null
          at?: string
          id?: never
          page_id?: string
          session_id?: string
          type?: string
          utm?: Json
        }
        Relationships: [
          {
            foreignKeyName: "landing_funnel_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "landing_funnel_events_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "landing_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      landing_batch_state: {
        Row: {
          finished_at: string
          finished_by: string | null
          id: string
          module_id: string | null
          page_id: string
        }
        Insert: {
          finished_at?: string
          finished_by?: string | null
          id?: string
          module_id?: string | null
          page_id: string
        }
        Update: {
          finished_at?: string
          finished_by?: string | null
          id?: string
          module_id?: string | null
          page_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "landing_batch_state_finished_by_fkey"
            columns: ["finished_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "landing_batch_state_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "landing_batch_state_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "landing_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      landing_email_log: {
        Row: {
          claimed_at: string
          id: string
          kind: string
          registration_id: string
          sent_at: string
          state: string
          to_email: string
        }
        Insert: {
          claimed_at?: string
          id?: string
          kind: string
          registration_id: string
          sent_at?: string
          state?: string
          to_email: string
        }
        Update: {
          claimed_at?: string
          id?: string
          kind?: string
          registration_id?: string
          sent_at?: string
          state?: string
          to_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "landing_email_log_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "landing_registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      landing_jobs: {
        Row: {
          attempts: number
          created_at: string
          id: string
          last_error: string | null
          next_run_at: string
          registration_id: string
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          id?: string
          last_error?: string | null
          next_run_at?: string
          registration_id: string
          status?: string
          type: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          id?: string
          last_error?: string | null
          next_run_at?: string
          registration_id?: string
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "landing_jobs_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "landing_registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      landing_meta_events: {
        Row: {
          created_at: string
          currency: string | null
          detail: string
          event_id: string
          registration_id: string
          sent_at: string | null
          state: string
          value: number | null
        }
        Insert: {
          created_at?: string
          currency?: string | null
          detail?: string
          event_id: string
          registration_id: string
          sent_at?: string | null
          state: string
          value?: number | null
        }
        Update: {
          created_at?: string
          currency?: string | null
          detail?: string
          event_id?: string
          registration_id?: string
          sent_at?: string | null
          state?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "landing_meta_events_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: true
            referencedRelation: "landing_registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      landing_page_versions: {
        Row: {
          content: Json
          created_at: string
          created_by: string | null
          id: string
          page_id: string
          version: number
        }
        Insert: {
          content: Json
          created_at?: string
          created_by?: string | null
          id?: string
          page_id: string
          version: number
        }
        Update: {
          content?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          page_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "landing_page_versions_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "landing_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      landing_page_variants: {
        Row: {
          created_at: string
          draft: Json
          enabled: boolean
          id: string
          module_key: string | null
          page_id: string
          published: Json | null
          published_at: string | null
          region_key: string | null
          revision: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          draft?: Json
          enabled?: boolean
          id?: string
          module_key?: string | null
          page_id: string
          published?: Json | null
          published_at?: string | null
          region_key?: string | null
          revision?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          draft?: Json
          enabled?: boolean
          id?: string
          module_key?: string | null
          page_id?: string
          published?: Json | null
          published_at?: string | null
          region_key?: string | null
          revision?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "landing_page_variants_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "landing_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      landing_pages: {
        Row: {
          attendance_min_pct: number
          course_id: string | null
          created_at: string
          created_by: string | null
          draft: Json
          drive_folder_id: string | null
          id: string
          kind: string
          is_main_page: boolean
          published: Json | null
          published_at: string | null
          ref_prefix: string | null
          revision: number
          sheet_id: string | null
          slug: string
          status: string
          title: string
          updated_at: string
          sheet_last_scanned_at: string | null
          sheet_sync_state: string
          sheet_sync_waiting: number
        }
        Insert: {
          attendance_min_pct?: number
          course_id?: string | null
          created_at?: string
          created_by?: string | null
          draft: Json
          drive_folder_id?: string | null
          id?: string
          kind: string
          is_main_page?: boolean
          published?: Json | null
          published_at?: string | null
          ref_prefix?: string | null
          revision?: number
          sheet_id?: string | null
          slug: string
          status?: string
          title: string
          updated_at?: string
          sheet_last_scanned_at?: string | null
          sheet_sync_state?: string
          sheet_sync_waiting?: number
        }
        Update: {
          attendance_min_pct?: number
          course_id?: string | null
          created_at?: string
          created_by?: string | null
          draft?: Json
          drive_folder_id?: string | null
          id?: string
          kind?: string
          is_main_page?: boolean
          published?: Json | null
          published_at?: string | null
          ref_prefix?: string | null
          revision?: number
          sheet_id?: string | null
          slug?: string
          status?: string
          title?: string
          updated_at?: string
          sheet_last_scanned_at?: string | null
          sheet_sync_state?: string
          sheet_sync_waiting?: number
        }
        Relationships: [
          {
            foreignKeyName: "landing_pages_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      landing_promo_codes: {
        Row: {
          active: boolean
          code: string
          created_at: string
          created_by: string | null
          ends_at: string | null
          fixed_amounts: Json
          id: string
          max_discount_percent: number
          max_uses: number | null
          one_per_email: boolean
          option_keys: string[]
          owner_agent_id: string | null
          page_ids: string[]
          starts_at: string | null
          type: string
          updated_at: string
          used_count: number
          value: number
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          fixed_amounts?: Json
          id?: string
          max_discount_percent?: number
          max_uses?: number | null
          one_per_email?: boolean
          option_keys?: string[]
          owner_agent_id?: string | null
          page_ids?: string[]
          starts_at?: string | null
          type: string
          updated_at?: string
          used_count?: number
          value?: number
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          fixed_amounts?: Json
          id?: string
          max_discount_percent?: number
          max_uses?: number | null
          one_per_email?: boolean
          option_keys?: string[]
          owner_agent_id?: string | null
          page_ids?: string[]
          starts_at?: string | null
          type?: string
          updated_at?: string
          used_count?: number
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "landing_promo_codes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "landing_promo_codes_owner_agent_id_fkey"
            columns: ["owner_agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      landing_ref_counters: {
        Row: {
          last_number: number
          prefix: string
          updated_at: string
        }
        Insert: {
          last_number?: number
          prefix: string
          updated_at?: string
        }
        Update: {
          last_number?: number
          prefix?: string
          updated_at?: string
        }
        Relationships: []
      }
      landing_variant_versions: {
        Row: {
          content: Json
          created_at: string
          created_by: string | null
          id: string
          variant_id: string
          version: number
        }
        Insert: {
          content: Json
          created_at?: string
          created_by?: string | null
          id?: string
          variant_id: string
          version: number
        }
        Update: {
          content?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          variant_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "landing_variant_versions_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "landing_page_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      landing_registrations: {
        Row: {
          agent_id: string | null
          amount_received: number | null
          city: string
          consent: boolean
          created_at: string
          currency: string
          discovery: string
          email: string
          email_status: string
          event_id: string
          expected_amount: number
          fbc: string
          fbp: string
          group_size: number
          id: string
          is_test: boolean
          lead_registration_id: string | null
          mode: string
          name: string
          option_keys: string[]
          option_label: string
          page_id: string
          payment_method: string
          person_id: string | null
          profession: string
          promo_code_id: string | null
          promo_code_text: string
          ref_id: string | null
          referral_code: string
          region: string
          row_type: string
          session_id: string
          status: string
          status_changed_at: string | null
          status_source: string
          student_id: string | null
          tier_key: string
          updated_at: string
          utm: Json
          variant_key: string
          voucher_url: string
          whatsapp: string
        }
        Insert: {
          agent_id?: string | null
          amount_received?: number | null
          city?: string
          consent?: boolean
          created_at?: string
          currency: string
          discovery?: string
          email: string
          email_status?: string
          event_id?: string
          expected_amount?: number
          fbc?: string
          fbp?: string
          group_size?: number
          id?: string
          is_test?: boolean
          lead_registration_id?: string | null
          mode?: string
          name: string
          option_keys?: string[]
          option_label?: string
          page_id: string
          payment_method?: string
          person_id?: string | null
          profession?: string
          promo_code_id?: string | null
          promo_code_text?: string
          ref_id?: string | null
          referral_code?: string
          region: string
          row_type: string
          session_id?: string
          status?: string
          status_changed_at?: string | null
          status_source?: string
          student_id?: string | null
          tier_key?: string
          updated_at?: string
          utm?: Json
          variant_key?: string
          voucher_url?: string
          whatsapp?: string
        }
        Update: {
          agent_id?: string | null
          amount_received?: number | null
          city?: string
          consent?: boolean
          created_at?: string
          currency?: string
          discovery?: string
          email?: string
          email_status?: string
          event_id?: string
          expected_amount?: number
          fbc?: string
          fbp?: string
          group_size?: number
          id?: string
          is_test?: boolean
          lead_registration_id?: string | null
          mode?: string
          name?: string
          option_keys?: string[]
          option_label?: string
          page_id?: string
          payment_method?: string
          person_id?: string | null
          profession?: string
          promo_code_id?: string | null
          promo_code_text?: string
          ref_id?: string | null
          referral_code?: string
          region?: string
          row_type?: string
          session_id?: string
          status?: string
          status_changed_at?: string | null
          status_source?: string
          student_id?: string | null
          tier_key?: string
          updated_at?: string
          utm?: Json
          variant_key?: string
          voucher_url?: string
          whatsapp?: string
        }
        Relationships: [
          {
            foreignKeyName: "landing_registrations_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "landing_registrations_lead_registration_id_fkey"
            columns: ["lead_registration_id"]
            isOneToOne: false
            referencedRelation: "landing_registrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "landing_registrations_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "landing_pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "landing_registrations_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "pz_people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "landing_registrations_promo_code_id_fkey"
            columns: ["promo_code_id"]
            isOneToOne: false
            referencedRelation: "landing_promo_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "landing_registrations_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      landing_sheet_snapshots: {
        Row: {
          amount_received: number | null
          email: string | null
          name: string | null
          registration_id: string
          status: string | null
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          amount_received?: number | null
          email?: string | null
          name?: string | null
          registration_id: string
          status?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          amount_received?: number | null
          email?: string | null
          name?: string | null
          registration_id?: string
          status?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "landing_sheet_snapshots_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: true
            referencedRelation: "landing_registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      landing_sheet_sync_log: {
        Row: {
          app_value: string | null
          created_at: string
          detail: string
          field: string
          id: string
          outcome: string
          page_id: string
          ref_id: string
          registration_id: string | null
          row_number: number | null
          scan_id: string
          sheet_value: string | null
        }
        Insert: {
          app_value?: string | null
          created_at?: string
          detail?: string
          field: string
          id?: string
          outcome: string
          page_id: string
          ref_id?: string
          registration_id?: string | null
          row_number?: number | null
          scan_id: string
          sheet_value?: string | null
        }
        Update: {
          app_value?: string | null
          created_at?: string
          detail?: string
          field?: string
          id?: string
          outcome?: string
          page_id?: string
          ref_id?: string
          registration_id?: string | null
          row_number?: number | null
          scan_id?: string
          sheet_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "landing_sheet_sync_log_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "landing_pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "landing_sheet_sync_log_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "landing_registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      landing_status_events: {
        Row: {
          at: string
          changed_by: string | null
          from_status: string | null
          id: string
          registration_id: string
          source: string
          to_status: string
        }
        Insert: {
          at?: string
          changed_by?: string | null
          from_status?: string | null
          id?: string
          registration_id: string
          source: string
          to_status: string
        }
        Update: {
          at?: string
          changed_by?: string | null
          from_status?: string | null
          id?: string
          registration_id?: string
          source?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "landing_status_events_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "landing_status_events_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "landing_registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      landing_media: {
        Row: {
          created_at: string
          created_by: string | null
          drive_file_id: string
          folder: string
          height: number | null
          id: string
          name: string
          orientation: string | null
          size_bytes: number | null
          url: string
          width: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          drive_file_id: string
          folder?: string
          height?: number | null
          id?: string
          name: string
          orientation?: string | null
          size_bytes?: number | null
          url: string
          width?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          drive_file_id?: string
          folder?: string
          height?: number | null
          id?: string
          name?: string
          orientation?: string | null
          size_bytes?: number | null
          url?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "landing_media_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      landing_whatsapp_numbers: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          label: string
          number: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          label: string
          number: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string
          number?: string
        }
        Relationships: [
          {
            foreignKeyName: "landing_whatsapp_numbers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_campaigns: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          agent_id: string | null
          created_at: string
          email: string | null
          id: string
          lead_campaign_id: string | null
          name: string | null
          notes: string | null
          phone: string
          profession: string | null
          status: string
          updated_at: string
        }
        Insert: {
          agent_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          lead_campaign_id?: string | null
          name?: string | null
          notes?: string | null
          phone: string
          profession?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          agent_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          lead_campaign_id?: string | null
          name?: string | null
          notes?: string | null
          phone?: string
          profession?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_lead_campaign_id_fkey"
            columns: ["lead_campaign_id"]
            isOneToOne: false
            referencedRelation: "lead_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_notes: {
        Row: {
          content_html: string
          content_text: string
          course_id: string
          id: string
          lesson_id: string
          student_id: string
          updated_at: string
        }
        Insert: {
          content_html?: string
          content_text?: string
          course_id: string
          id?: string
          lesson_id: string
          student_id: string
          updated_at?: string
        }
        Update: {
          content_html?: string
          content_text?: string
          course_id?: string
          id?: string
          lesson_id?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_notes_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_notes_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_notes_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_progress: {
        Row: {
          completed_at: string | null
          id: string
          lesson_id: string
          status: Database["public"]["Enums"]["progress_status"]
          student_id: string
        }
        Insert: {
          completed_at?: string | null
          id?: string
          lesson_id: string
          status?: Database["public"]["Enums"]["progress_status"]
          student_id: string
        }
        Update: {
          completed_at?: string | null
          id?: string
          lesson_id?: string
          status?: Database["public"]["Enums"]["progress_status"]
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_progress_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_progress_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lessons: {
        Row: {
          content_type: Database["public"]["Enums"]["lesson_content_type"]
          created_at: string
          documents: Json
          id: string
          module_id: string
          order_index: number
          pdf_file_id: string | null
          pdf_url: string | null
          resource_urls: Json
          text_content: string | null
          title: string
          video_url: string | null
          video_url_2: string | null
        }
        Insert: {
          content_type?: Database["public"]["Enums"]["lesson_content_type"]
          created_at?: string
          documents?: Json
          id?: string
          module_id: string
          order_index?: number
          pdf_file_id?: string | null
          pdf_url?: string | null
          resource_urls?: Json
          text_content?: string | null
          title: string
          video_url?: string | null
          video_url_2?: string | null
        }
        Update: {
          content_type?: Database["public"]["Enums"]["lesson_content_type"]
          created_at?: string
          documents?: Json
          id?: string
          module_id?: string
          order_index?: number
          pdf_file_id?: string | null
          pdf_url?: string | null
          resource_urls?: Json
          text_content?: string | null
          title?: string
          video_url?: string | null
          video_url_2?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lessons_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["id"]
          },
        ]
      }
      mentor_applications: {
        Row: {
          applicant_id: string | null
          country: string | null
          created_at: string
          cv_url: string | null
          email: string
          expertise: string | null
          full_name: string
          id: string
          linkedin_url: string | null
          organization: string | null
          phone: string
          photo_urls: string[]
          position: string | null
          profession: string | null
          rejection_reason: string | null
          roles: string | null
          status: Database["public"]["Enums"]["mentor_application_status"]
          status_changed_at: string | null
          value_provide: string | null
          why_join: string | null
          years_experience: string | null
        }
        Insert: {
          applicant_id?: string | null
          country?: string | null
          created_at?: string
          cv_url?: string | null
          email: string
          expertise?: string | null
          full_name: string
          id?: string
          linkedin_url?: string | null
          organization?: string | null
          phone: string
          photo_urls?: string[]
          position?: string | null
          profession?: string | null
          rejection_reason?: string | null
          roles?: string | null
          status?: Database["public"]["Enums"]["mentor_application_status"]
          status_changed_at?: string | null
          value_provide?: string | null
          why_join?: string | null
          years_experience?: string | null
        }
        Update: {
          applicant_id?: string | null
          country?: string | null
          created_at?: string
          cv_url?: string | null
          email?: string
          expertise?: string | null
          full_name?: string
          id?: string
          linkedin_url?: string | null
          organization?: string | null
          phone?: string
          photo_urls?: string[]
          position?: string | null
          profession?: string | null
          rejection_reason?: string | null
          roles?: string | null
          status?: Database["public"]["Enums"]["mentor_application_status"]
          status_changed_at?: string | null
          value_provide?: string | null
          why_join?: string | null
          years_experience?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mentor_applications_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mentor_conversations: {
        Row: {
          created_at: string
          id: string
          last_message_at: string | null
          mentor_id: string
          mentor_last_read_at: string | null
          student_id: string
          student_last_read_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          last_message_at?: string | null
          mentor_id: string
          mentor_last_read_at?: string | null
          student_id: string
          student_last_read_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          last_message_at?: string | null
          mentor_id?: string
          mentor_last_read_at?: string | null
          student_id?: string
          student_last_read_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mentor_conversations_mentor_id_fkey"
            columns: ["mentor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mentor_conversations_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mentor_messages: {
        Row: {
          body: string
          conversation_id: string
          created_at: string
          hidden_for_mentor: boolean
          hidden_for_student: boolean
          id: string
          sender_id: string
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string
          hidden_for_mentor?: boolean
          hidden_for_student?: boolean
          id?: string
          sender_id: string
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string
          hidden_for_mentor?: boolean
          hidden_for_student?: boolean
          id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mentor_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "mentor_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mentor_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mentors: {
        Row: {
          availability_json: Json | null
          availability_text: string | null
          created_at: string
          credentials: Json
          domain: string | null
          expertise: string | null
          experience: string | null
          format: string | null
          full_bio: string[]
          id: string
          intro_video_url: string | null
          language: string | null
          lead_time: string | null
          lead_time_hours: number
          linkedin_url: string | null
          name: string
          order_index: number
          packages: Json
          photo_url: string | null
          price_per_session_pkr: number
          profile_id: string | null
          session_duration_minutes: number
          session_duration_text: string | null
          short_bio: string | null
          show_reviews: boolean
          skills: string[]
          slug: string
          social_links: Json
          testimonials: Json
          tier: Database["public"]["Enums"]["mentor_tier"]
          tier_computed: Database["public"]["Enums"]["mentor_tier"]
          tier_computed_at: string | null
          tier_override: Database["public"]["Enums"]["mentor_tier"] | null
          tier_rating_avg: number | null
          tier_review_count: number
          tier_score: number
          tier_session_count: number
          timezone: string | null
          title: string | null
          total_sessions: number
          updated_at: string
          visibility: Database["public"]["Enums"]["mentor_visibility"]
        }
        Insert: {
          availability_json?: Json | null
          availability_text?: string | null
          created_at?: string
          credentials?: Json
          domain?: string | null
          expertise?: string | null
          experience?: string | null
          format?: string | null
          full_bio?: string[]
          id?: string
          intro_video_url?: string | null
          language?: string | null
          lead_time?: string | null
          lead_time_hours?: number
          linkedin_url?: string | null
          name?: string
          order_index?: number
          packages?: Json
          photo_url?: string | null
          price_per_session_pkr?: number
          profile_id?: string | null
          session_duration_minutes?: number
          session_duration_text?: string | null
          short_bio?: string | null
          show_reviews?: boolean
          skills?: string[]
          slug: string
          social_links?: Json
          testimonials?: Json
          tier_computed?: Database["public"]["Enums"]["mentor_tier"]
          tier_computed_at?: string | null
          tier_override?: Database["public"]["Enums"]["mentor_tier"] | null
          tier_rating_avg?: number | null
          tier_review_count?: number
          tier_score?: number
          tier_session_count?: number
          timezone?: string | null
          title?: string | null
          total_sessions?: number
          updated_at?: string
          visibility?: Database["public"]["Enums"]["mentor_visibility"]
        }
        Update: {
          availability_json?: Json | null
          availability_text?: string | null
          created_at?: string
          credentials?: Json
          domain?: string | null
          expertise?: string | null
          experience?: string | null
          format?: string | null
          full_bio?: string[]
          id?: string
          intro_video_url?: string | null
          language?: string | null
          lead_time?: string | null
          lead_time_hours?: number
          linkedin_url?: string | null
          name?: string
          order_index?: number
          packages?: Json
          photo_url?: string | null
          price_per_session_pkr?: number
          profile_id?: string | null
          session_duration_minutes?: number
          session_duration_text?: string | null
          short_bio?: string | null
          show_reviews?: boolean
          skills?: string[]
          slug?: string
          social_links?: Json
          testimonials?: Json
          tier_computed?: Database["public"]["Enums"]["mentor_tier"]
          tier_computed_at?: string | null
          tier_override?: Database["public"]["Enums"]["mentor_tier"] | null
          tier_rating_avg?: number | null
          tier_review_count?: number
          tier_score?: number
          tier_session_count?: number
          timezone?: string | null
          title?: string | null
          total_sessions?: number
          updated_at?: string
          visibility?: Database["public"]["Enums"]["mentor_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "mentors_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mentorship_bookings: {
        Row: {
          cancellation_reason: string | null
          created_at: string
          email: string
          full_name: string
          goals: string | null
          id: string
          mentor_name: string
          mentor_slug: string
          package_name: string
          payment_screenshot_url: string | null
          phone: string
          sessions_total: number | null
          status: Database["public"]["Enums"]["mentorship_booking_status"]
          status_changed_at: string | null
          student_id: string | null
        }
        Insert: {
          cancellation_reason?: string | null
          created_at?: string
          email: string
          full_name: string
          goals?: string | null
          id?: string
          mentor_name: string
          mentor_slug: string
          package_name: string
          payment_screenshot_url?: string | null
          phone: string
          sessions_total?: number | null
          status?: Database["public"]["Enums"]["mentorship_booking_status"]
          status_changed_at?: string | null
          student_id?: string | null
        }
        Update: {
          cancellation_reason?: string | null
          created_at?: string
          email?: string
          full_name?: string
          goals?: string | null
          id?: string
          mentor_name?: string
          mentor_slug?: string
          package_name?: string
          payment_screenshot_url?: string | null
          phone?: string
          sessions_total?: number | null
          status?: Database["public"]["Enums"]["mentorship_booking_status"]
          status_changed_at?: string | null
          student_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mentorship_bookings_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      merge_candidates: {
        Row: {
          confidence: number
          contact_a_id: string
          contact_b_id: string
          created_at: string
          id: string
          reason: string
          resolved_at: string | null
          resolved_by: string | null
          status: Database["public"]["Enums"]["crm_merge_status"]
        }
        Insert: {
          confidence?: number
          contact_a_id: string
          contact_b_id: string
          created_at?: string
          id?: string
          reason: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["crm_merge_status"]
        }
        Update: {
          confidence?: number
          contact_a_id?: string
          contact_b_id?: string
          created_at?: string
          id?: string
          reason?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["crm_merge_status"]
        }
        Relationships: [
          {
            foreignKeyName: "merge_candidates_contact_a_id_fkey"
            columns: ["contact_a_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merge_candidates_contact_b_id_fkey"
            columns: ["contact_b_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merge_candidates_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      module_notes: {
        Row: {
          documents: Json
          module_id: string
          resource_urls: Json
          updated_at: string | null
        }
        Insert: {
          documents?: Json
          module_id: string
          resource_urls?: Json
          updated_at?: string | null
        }
        Update: {
          documents?: Json
          module_id?: string
          resource_urls?: Json
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "module_notes_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: true
            referencedRelation: "modules"
            referencedColumns: ["id"]
          },
        ]
      }
      modules: {
        Row: {
          course_id: string
          created_at: string
          id: string
          order_index: number
          title: string
        }
        Insert: {
          course_id: string
          created_at?: string
          id?: string
          order_index?: number
          title: string
        }
        Update: {
          course_id?: string
          created_at?: string
          id?: string
          order_index?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "modules_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          is_read: boolean
          link: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      participant_email_prefs: {
        Row: {
          created_at: string | null
          email: string
          token: string
          unsubscribed_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          token?: string
          unsubscribed_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          token?: string
          unsubscribed_at?: string | null
        }
        Relationships: [
        ]
      }
      participant_send_recipients: {
        Row: {
          claimed_at: string | null
          email: string
          id: string
          is_member: boolean
          name: string
          phone: string
          reason: string
          registration_id: string
          send_id: string
          sent_at: string | null
          state: string
          status_at_send: string
        }
        Insert: {
          claimed_at?: string | null
          email?: string
          id?: string
          is_member?: boolean
          name: string
          phone?: string
          reason?: string
          registration_id: string
          send_id: string
          sent_at?: string | null
          state?: string
          status_at_send: string
        }
        Update: {
          claimed_at?: string | null
          email?: string
          id?: string
          is_member?: boolean
          name?: string
          phone?: string
          reason?: string
          registration_id?: string
          send_id?: string
          sent_at?: string | null
          state?: string
          status_at_send?: string
        }
        Relationships: [
          {
            foreignKeyName: "participant_send_recipients_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "landing_registrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participant_send_recipients_send_id_fkey"
            columns: ["send_id"]
            isOneToOne: false
            referencedRelation: "participant_sends"
            referencedColumns: ["id"]
          },
        ]
      }
      participant_sends: {
        Row: {
          body: string
          channel: string
          created_at: string | null
          created_by: string | null
          id: string
          not_paid_confirmed: boolean
          not_paid_count: number
          page_id: string
          recipient_count: number
          session_id: string | null
          session_kind: string | null
          subject: string
          template_id: string | null
        }
        Insert: {
          body: string
          channel: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          not_paid_confirmed?: boolean
          not_paid_count?: number
          page_id: string
          recipient_count: number
          session_id?: string | null
          session_kind?: string | null
          subject?: string
          template_id?: string | null
        }
        Update: {
          body?: string
          channel?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          not_paid_confirmed?: boolean
          not_paid_count?: number
          page_id?: string
          recipient_count?: number
          session_id?: string | null
          session_kind?: string | null
          subject?: string
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "participant_sends_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participant_sends_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "landing_pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participant_sends_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "batch_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participant_sends_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "participant_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      participant_templates: {
        Row: {
          created_at: string | null
          created_by: string | null
          email_body: string
          id: string
          name: string
          subject: string
          updated_at: string | null
          whatsapp_body: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          email_body?: string
          id?: string
          name: string
          subject?: string
          updated_at?: string | null
          whatsapp_body?: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          email_body?: string
          id?: string
          name?: string
          subject?: string
          updated_at?: string | null
          whatsapp_body?: string
        }
        Relationships: [
          {
            foreignKeyName: "participant_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_accounts: {
        Row: {
          active: boolean
          created_at: string
          display_text: string
          key: string
          kind: string
          label: string
          rows: Json
          sort: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          display_text?: string
          key: string
          kind: string
          label: string
          rows?: Json
          sort?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          display_text?: string
          key?: string
          kind?: string
          label?: string
          rows?: Json
          sort?: number
          updated_at?: string
        }
        Relationships: []
      }
      payment_countries: {
        Row: {
          active: boolean
          created_at: string
          name: string
          region_key: string
          sort: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          name: string
          region_key: string
          sort?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          name?: string
          region_key?: string
          sort?: number
          updated_at?: string
        }
        Relationships: []
      }
      payment_country_accounts: {
        Row: {
          account_key: string
          region_key: string
          sort: number
        }
        Insert: {
          account_key: string
          region_key: string
          sort?: number
        }
        Update: {
          account_key?: string
          region_key?: string
          sort?: number
        }
        Relationships: [
          {
            foreignKeyName: "payment_country_accounts_account_key_fkey"
            columns: ["account_key"]
            isOneToOne: false
            referencedRelation: "payment_accounts"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "payment_country_accounts_region_key_fkey"
            columns: ["region_key"]
            isOneToOne: false
            referencedRelation: "payment_countries"
            referencedColumns: ["region_key"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          city: string | null
          created_at: string
          full_name: string
          id: string
          phone: string | null
          profession: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          created_at?: string
          full_name?: string
          id: string
          phone?: string | null
          profession?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          created_at?: string
          full_name?: string
          id?: string
          phone?: string | null
          profession?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      pz_id_aliases: {
        Row: {
          alias_norm: string
          created_at: string
          person_id: string
          source: string
        }
        Insert: {
          alias_norm: string
          created_at?: string
          person_id: string
          source: string
        }
        Update: {
          alias_norm?: string
          created_at?: string
          person_id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "pz_id_aliases_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "pz_people"
            referencedColumns: ["id"]
          },
        ]
      }
      pz_people: {
        Row: {
          created_at: string
          display_name: string
          id: string
          pz_id: string
        }
        Insert: {
          created_at?: string
          display_name: string
          id?: string
          pz_id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          pz_id?: string
        }
        Relationships: [
        ]
      }
      pz_person_emails: {
        Row: {
          email: string
          person_id: string
        }
        Insert: {
          email: string
          person_id: string
        }
        Update: {
          email?: string
          person_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pz_person_emails_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "pz_people"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_attempts: {
        Row: {
          attempt_number: number
          created_at: string
          id: string
          lesson_id: string
          passed: boolean
          score: number
          student_id: string
          total: number
        }
        Insert: {
          attempt_number: number
          created_at?: string
          id?: string
          lesson_id: string
          passed: boolean
          score: number
          student_id: string
          total: number
        }
        Update: {
          attempt_number?: number
          created_at?: string
          id?: string
          lesson_id?: string
          passed?: boolean
          score?: number
          student_id?: string
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "quiz_attempts_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_attempts_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_questions: {
        Row: {
          correct_index: number
          created_at: string
          id: string
          lesson_id: string
          options: Json
          order_index: number
          question: string
        }
        Insert: {
          correct_index: number
          created_at?: string
          id?: string
          lesson_id: string
          options: Json
          order_index?: number
          question: string
        }
        Update: {
          correct_index?: number
          created_at?: string
          id?: string
          lesson_id?: string
          options?: Json
          order_index?: number
          question?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_questions_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      sheet_leads: {
        Row: {
          course_id: string
          created_at: string
          id: string
          payment_amount_pkr: number | null
          payment_confirmation: string
          raw_row: Json
          resolved_at: string | null
          resolved_enrollment_id: string | null
          row_email: string
          row_name: string | null
          row_phone: string | null
          sheet_id: string
        }
        Insert: {
          course_id: string
          created_at?: string
          id?: string
          payment_amount_pkr?: number | null
          payment_confirmation: string
          raw_row?: Json
          resolved_at?: string | null
          resolved_enrollment_id?: string | null
          row_email: string
          row_name?: string | null
          row_phone?: string | null
          sheet_id: string
        }
        Update: {
          course_id?: string
          created_at?: string
          id?: string
          payment_amount_pkr?: number | null
          payment_confirmation?: string
          raw_row?: Json
          resolved_at?: string | null
          resolved_enrollment_id?: string | null
          row_email?: string
          row_name?: string | null
          row_phone?: string | null
          sheet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sheet_leads_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sheet_leads_resolved_enrollment_id_fkey"
            columns: ["resolved_enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          booked_at: string
          booking_id: string | null
          duration_min: number | null
          id: string
          mentor_id: string
          mentor_notes: string | null
          rating: number | null
          scheduled_at: string | null
          session_type: Database["public"]["Enums"]["session_type"]
          status: Database["public"]["Enums"]["session_status"]
          student_feedback: string | null
          student_id: string
        }
        Insert: {
          booked_at?: string
          booking_id?: string | null
          duration_min?: number | null
          id?: string
          mentor_id: string
          mentor_notes?: string | null
          rating?: number | null
          scheduled_at?: string | null
          session_type?: Database["public"]["Enums"]["session_type"]
          status?: Database["public"]["Enums"]["session_status"]
          student_feedback?: string | null
          student_id: string
        }
        Update: {
          booked_at?: string
          booking_id?: string | null
          duration_min?: number | null
          id?: string
          mentor_id?: string
          mentor_notes?: string | null
          rating?: number | null
          scheduled_at?: string | null
          session_type?: Database["public"]["Enums"]["session_type"]
          status?: Database["public"]["Enums"]["session_status"]
          student_feedback?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "mentorship_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_mentor_id_fkey"
            columns: ["mentor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      webinars: {
        Row: {
          created_at: string
          credentials: string | null
          held_at: string | null
          id: string
          is_upcoming: boolean
          slug: string | null
          speaker_name: string
          title: string
          topic: string | null
          youtube_url: string | null
        }
        Insert: {
          created_at?: string
          credentials?: string | null
          held_at?: string | null
          id?: string
          is_upcoming?: boolean
          slug?: string | null
          speaker_name: string
          title: string
          topic?: string | null
          youtube_url?: string | null
        }
        Update: {
          created_at?: string
          credentials?: string | null
          held_at?: string | null
          id?: string
          is_upcoming?: boolean
          slug?: string | null
          speaker_name?: string
          title?: string
          topic?: string | null
          youtube_url?: string | null
        }
        Relationships: []
      }
      whatsapp_batch_recipients: {
        Row: {
          batch_id: string
          contact_id: string | null
          created_at: string
          full_name: string
          id: string
          phone_e164: string
          sent_at: string | null
          sent_by: string | null
          status: Database["public"]["Enums"]["whatsapp_send_status"]
        }
        Insert: {
          batch_id: string
          contact_id?: string | null
          created_at?: string
          full_name: string
          id?: string
          phone_e164: string
          sent_at?: string | null
          sent_by?: string | null
          status?: Database["public"]["Enums"]["whatsapp_send_status"]
        }
        Update: {
          batch_id?: string
          contact_id?: string | null
          created_at?: string
          full_name?: string
          id?: string
          phone_e164?: string
          sent_at?: string | null
          sent_by?: string | null
          status?: Database["public"]["Enums"]["whatsapp_send_status"]
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_batch_recipients_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_batch_recipients_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_batch_recipients_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_blocked_attempts: {
        Row: {
          agent_id: string | null
          contact_id: string | null
          created_at: string
          id: string
          number_id: string | null
          reason: string
        }
        Insert: {
          agent_id?: string | null
          contact_id?: string | null
          created_at?: string
          id?: string
          number_id?: string | null
          reason: string
        }
        Update: {
          agent_id?: string | null
          contact_id?: string | null
          created_at?: string
          id?: string
          number_id?: string | null
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_blocked_attempts_number_id_fkey"
            columns: ["number_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_numbers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_blocked_attempts_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_blocked_attempts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_number_agents: {
        Row: {
          agent_id: string
          created_at: string
          number_id: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          number_id: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          number_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_number_agents_number_id_fkey"
            columns: ["number_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_numbers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_number_agents_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_numbers: {
        Row: {
          created_at: string
          daily_cap: number | null
          frozen_until: string | null
          hourly_cap: number | null
          id: string
          label: string
          phone_e164: string | null
          status: string
          warmup_started_on: string
        }
        Insert: {
          created_at?: string
          daily_cap?: number | null
          frozen_until?: string | null
          hourly_cap?: number | null
          id?: string
          label: string
          phone_e164?: string | null
          status?: string
          warmup_started_on?: string
        }
        Update: {
          created_at?: string
          daily_cap?: number | null
          frozen_until?: string | null
          hourly_cap?: number | null
          id?: string
          label?: string
          phone_e164?: string | null
          status?: string
          warmup_started_on?: string
        }
        Relationships: []
      }
      whatsapp_safety_settings: {
        Row: {
          agents_can_claim: boolean
          burst_break_min: number
          burst_size: number
          daily_cap: number
          freeze_hours: number
          hourly_cap: number
          hourly_warn_at: number
          id: boolean
          quiet_end_hour: number
          quiet_start_hour: number
          spacing_max_s: number
          spacing_min_s: number
          timezone: string
          updated_at: string
          warmup_start: number
          warmup_step: number
        }
        Insert: {
          agents_can_claim?: boolean
          burst_break_min?: number
          burst_size?: number
          daily_cap?: number
          freeze_hours?: number
          hourly_cap?: number
          hourly_warn_at?: number
          id?: boolean
          quiet_end_hour?: number
          quiet_start_hour?: number
          spacing_max_s?: number
          spacing_min_s?: number
          timezone?: string
          updated_at?: string
          warmup_start?: number
          warmup_step?: number
        }
        Update: {
          agents_can_claim?: boolean
          burst_break_min?: number
          burst_size?: number
          daily_cap?: number
          freeze_hours?: number
          hourly_cap?: number
          hourly_warn_at?: number
          id?: boolean
          quiet_end_hour?: number
          quiet_start_hour?: number
          spacing_max_s?: number
          spacing_min_s?: number
          timezone?: string
          updated_at?: string
          warmup_start?: number
          warmup_step?: number
        }
        Relationships: []
      }
      crm_message_templates: {
        Row: {
          body: string
          channel: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          subject: string | null
        }
        Insert: {
          body: string
          channel: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          subject?: string | null
        }
        Update: {
          body?: string
          channel?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_message_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_batches: {
        Row: {
          conversion_course_id: string | null
          conversion_label_match: string | null
          created_at: string
          created_by: string | null
          followup_in_hours: number | null
          id: string
          message_template: string
          name: string
          number_id: string | null
          owner_agent_id: string | null
          paused_reason: string | null
          recipient_count: number
          segment: Json
          sent_count: number
          status: string
          updated_at: string
        }
        Insert: {
          conversion_course_id?: string | null
          conversion_label_match?: string | null
          created_at?: string
          created_by?: string | null
          followup_in_hours?: number | null
          id?: string
          message_template: string
          name: string
          number_id?: string | null
          owner_agent_id?: string | null
          paused_reason?: string | null
          recipient_count?: number
          segment?: Json
          sent_count?: number
          status?: string
          updated_at?: string
        }
        Update: {
          conversion_course_id?: string | null
          conversion_label_match?: string | null
          created_at?: string
          created_by?: string | null
          followup_in_hours?: number | null
          id?: string
          message_template?: string
          name?: string
          number_id?: string | null
          owner_agent_id?: string | null
          paused_reason?: string | null
          recipient_count?: number
          segment?: Json
          sent_count?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_batches_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_batches_number_id_fkey"
            columns: ["number_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_numbers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_batches_owner_agent_id_fkey"
            columns: ["owner_agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_batches_conversion_course_id_fkey"
            columns: ["conversion_course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      crm_campaign_stats: {
        Row: {
          bounced: number | null
          campaign_id: string | null
          clicked: number | null
          completed_at: string | null
          created_at: string | null
          delivered: number | null
          failed: number | null
          name: string | null
          opened: number | null
          recipients: number | null
          sent: number | null
          status: Database["public"]["Enums"]["crm_campaign_status"] | null
        }
        Relationships: []
      }
      crm_contact_segment_source: {
        Row: {
          consent_basis: Database["public"]["Enums"]["crm_consent_basis"] | null
          country: string | null
          course_ids: string[] | null
          created_at: string | null
          discovery_source:
            | Database["public"]["Enums"]["crm_discovery_source"]
            | null
          email: string | null
          first_purchase_at: string | null
          full_name: string | null
          has_platform_account: boolean | null
          id: string | null
          import_batch_ids: string[] | null
          is_sendable: boolean | null
          last_purchase_at: string | null
          phone_e164: string | null
          product_labels: string[] | null
          product_labels_text: string | null
          profession: string | null
          promo_codes: string[] | null
          purchase_count: number | null
          row_types: string[] | null
          total_pkr: number | null
          unsubscribe_token: string | null
          whatsapp_unsubscribed_at: string | null
          do_not_contact_at: string | null
        }
        Relationships: []
      }
      manual_conversions: {
        Row: {
          contact_id: string
          converted_at: string
          course_id: string | null
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          program_label: string | null
        }
        Insert: {
          contact_id: string
          converted_at?: string
          course_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          program_label?: string | null
        }
        Update: {
          contact_id?: string
          converted_at?: string
          course_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          program_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "manual_conversions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manual_conversions_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      book_mentorship_sessions: {
        Args: { p_booking_id: string; p_slots: string[] }
        Returns: number
      }
      can_access_module: { Args: { p_module: string }; Returns: boolean }
      check_quiz_answer: { Args: { p_question_id: string }; Returns: number }
      complete_lesson: { Args: { p_lesson_id: string }; Returns: number }
      course_curriculum: {
        Args: { p_course_id: string }
        Returns: {
          content_type: Database["public"]["Enums"]["lesson_content_type"]
          has_quiz: boolean
          lesson_id: string
          lesson_order: number
          lesson_title: string
          module_id: string
          module_order: number
          module_title: string
          status: Database["public"]["Enums"]["progress_status"]
        }[]
      }
      crm_import_commit: {
        Args: {
          p_sheet_id: string
          p_sheet_name: string
          p_tab_name: string
          p_column_mapping: Json
          p_course_id: string | null
          p_created_by: string | null
          p_rows: Json
        }
        Returns: Json
      }
      landing_close_batch: {
        Args: {
          p_page_id: string
          p_page_title: string
          p_course_id: string | null
          p_created_by: string | null
          p_rows: Json
        }
        Returns: Json
      }
      feedback_session_stats: {
        Args: { p_session_ids: string[] }
        Returns: {
          avg_star: number | null
          feedback_session_id: string
          response_count: number
        }[]
      }
      find_user_id_by_email: {
        Args: { p_email: string }
        Returns: string | null
      }
      get_my_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      get_quiz: {
        Args: { p_lesson_id: string }
        Returns: {
          options: Json
          order_index: number
          question: string
          question_id: string
        }[]
      }
      landing_set_main_page: {
        Args: {
          p_page_id: string
          p_course_id: string | null
          p_main: boolean
        }
        Returns: undefined
      }
      landing_apply_status: {
        Args: {
          p_actor: string | null
          p_amount: number | null
          p_expected_from: string
          p_registration_id: string
          p_source: string
          p_to_status: string
        }
        Returns: Json
      }
      landing_create_registration: {
        Args: {
          p_capacity?: number
          p_is_test?: boolean
          p_page_id: string
          p_promo_id?: string | null
          p_rows: Json
        }
        Returns: Json
      }
      landing_publish_page: {
        Args: { p_page_id: string; p_revision?: number; p_user: string }
        Returns: number
      }
      landing_publish_variant: {
        Args: { p_revision?: number; p_user: string; p_variant_id: string }
        Returns: number
      }
      landing_rollback_page: {
        Args: { p_page_id: string; p_user: string; p_version: number }
        Returns: number
      }
      landing_rollback_variant: {
        Args: { p_user: string; p_variant_id: string; p_version: number }
        Returns: number
      }
      landing_agent_link_stats: {
        Args: { p_agent_id: string }
        Returns: {
          page_id: string
          views: number
          registered: number
          paid: number
        }[]
      }
      landing_leaderboard: {
        Args: { p_from?: string | null }
        Returns: {
          agent_id: string
          name: string
          registered: number
          paid: number
          revenue: Json
        }[]
      }
      landing_set_country_accounts: {
        Args: { p_account_keys: string[]; p_region_key: string }
        Returns: undefined
      }
      mentor_review_stats: {
        Args: { p_mentor_ids: string[] }
        Returns: {
          mentor_id: string
          response_count: number
          avg_star: number | null
          star_1: number
          star_2: number
          star_3: number
          star_4: number
          star_5: number
        }[]
      }
      mentor_tier_inputs: {
        Args: { p_mentor_ids: string[] }
        Returns: {
          mentor_id: string
          rating_avg: number | null
          review_count: number
          session_count: number
        }[]
      }
      batch_quiz_save: {
        Args: { p_file: string; p_max: number; p_rows: Json; p_session: string }
        Returns: number
      }
      pz_merge_people: {
        Args: { p_keep: string; p_drop: string }
        Returns: undefined
      }
      resync_course_progress: {
        Args: { p_course_id: string }
        Returns: undefined
      }
      submit_quiz_attempt: {
        Args: { p_answers: number[]; p_lesson_id: string }
        Returns: Json
      }
      update_own_mentor_availability: {
        Args: { p_timezone: string | null; p_weekly_ranges: Json | null }
        Returns: boolean
      }
      update_own_mentor_profile: {
        Args: {
          p_short_bio: string | null
          p_full_bio: string[] | null
          p_photo_url: string | null
          p_availability_text: string | null
          p_intro_video_url: string | null
          p_linkedin_url: string | null
          p_social_links: Json | null
          p_skills: string[] | null
          p_credentials: Json | null
          p_timezone: string | null
          p_session_duration_text: string | null
        }
        Returns: boolean
      }
    }
    Enums: {
      banner_slot: "hero" | "mid_page" | "sidebar" | "footer"
      course_status: "draft" | "open" | "closed" | "archived"
      course_type: "course" | "workshop" | "webinar" | "mentorship"
      crm_campaign_status: "draft" | "scheduled" | "sending" | "sent" | "cancelled"
      crm_consent_basis: "purchase" | "enquiry"
      crm_discovery_source:
        | "instagram"
        | "facebook"
        | "whatsapp"
        | "other"
        | "unknown"
      crm_import_status: "draft" | "previewed" | "committed" | "failed"
      crm_merge_status: "pending" | "merged" | "rejected"
      crm_row_type: "individual" | "group_leader" | "group_member"
      enrollment_status:
        | "pending"
        | "reserved"
        | "active"
        | "rejected"
        | "expired"
      featured_item_type: "course" | "webinar"
      feedback_program_type: "workshop" | "course"
      feedback_question_type: "stars" | "video"
      feedback_session_status: "active" | "closed"
      lesson_content_type: "video" | "text" | "pdf"
      mentor_application_status: "pending" | "approved" | "rejected"
      mentor_tier: "standard" | "premium" | "platinum" | "elite"
      mentor_visibility: "draft" | "published" | "hidden"
      mentorship_booking_status: "pending" | "confirmed" | "cancelled"
      progress_status: "locked" | "unlocked" | "completed"
      session_status: "pending" | "confirmed" | "completed" | "cancelled"
      session_type:
        | "1on1"
        | "group"
        | "cv_review"
        | "interview_prep"
        | "career_guidance"
      user_role: "student" | "mentor" | "admin" | "super_admin" | "sales_agent"
      whatsapp_send_status: "pending" | "sent" | "skipped" | "blocked"
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
  public: {
    Enums: {
      banner_slot: ["hero", "mid_page", "sidebar", "footer"],
      course_status: ["draft", "open", "closed", "archived"],
      course_type: ["course", "workshop", "webinar", "mentorship"],
      crm_campaign_status: ["draft", "scheduled", "sending", "sent", "cancelled"],
      crm_consent_basis: ["purchase", "enquiry"],
      crm_discovery_source: ["instagram", "facebook", "whatsapp", "other", "unknown"],
      crm_import_status: ["draft", "previewed", "committed", "failed"],
      crm_merge_status: ["pending", "merged", "rejected"],
      crm_row_type: ["individual", "group_leader", "group_member"],
      enrollment_status: ["pending", "reserved", "active", "rejected", "expired"],
      featured_item_type: ["course", "webinar"],
      feedback_program_type: ["workshop", "course"],
      feedback_question_type: ["stars", "video"],
      feedback_session_status: ["active", "closed"],
      lesson_content_type: ["video", "text", "pdf"],
      mentor_application_status: ["pending", "approved", "rejected"],
      mentor_tier: ["standard", "premium", "platinum", "elite"],
      mentor_visibility: ["draft", "published", "hidden"],
      mentorship_booking_status: ["pending", "confirmed", "cancelled"],
      progress_status: ["locked", "unlocked", "completed"],
      session_status: ["pending", "confirmed", "completed", "cancelled"],
      session_type: [
        "1on1",
        "group",
        "cv_review",
        "interview_prep",
        "career_guidance",
      ],
      user_role: ["student", "mentor", "admin", "super_admin", "sales_agent"],
    },
  },
} as const
