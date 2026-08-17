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
      enrollments: {
        Row: {
          cert_issued: boolean
          cert_url: string | null
          course_id: string
          enrolled_at: string
          id: string
          payment_amount_pkr: number | null
          payment_screenshot_url: string | null
          payment_shortfall_pkr: number | null
          rejection_reason: string | null
          sheet_pending_note: string | null
          sheet_pending_status: Database["public"]["Enums"]["enrollment_status"] | null
          status: Database["public"]["Enums"]["enrollment_status"]
          student_id: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          cert_issued?: boolean
          cert_url?: string | null
          course_id: string
          enrolled_at?: string
          id?: string
          payment_amount_pkr?: number | null
          payment_screenshot_url?: string | null
          payment_shortfall_pkr?: number | null
          rejection_reason?: string | null
          sheet_pending_note?: string | null
          sheet_pending_status?: Database["public"]["Enums"]["enrollment_status"] | null
          status?: Database["public"]["Enums"]["enrollment_status"]
          student_id: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          cert_issued?: boolean
          cert_url?: string | null
          course_id?: string
          enrolled_at?: string
          id?: string
          payment_amount_pkr?: number | null
          payment_screenshot_url?: string | null
          payment_shortfall_pkr?: number | null
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      book_mentorship_sessions: {
        Args: { p_booking_id: string; p_slots: string[] }
        Returns: number
      }
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
      user_role: "student" | "mentor" | "admin" | "super_admin"
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
      enrollment_status: ["pending", "reserved", "active", "rejected", "expired"],
      featured_item_type: ["course", "webinar"],
      feedback_program_type: ["workshop", "course"],
      feedback_question_type: ["stars", "video"],
      feedback_session_status: ["active", "closed"],
      lesson_content_type: ["video", "text", "pdf"],
      mentor_application_status: ["pending", "approved", "rejected"],
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
      user_role: ["student", "mentor", "admin", "super_admin"],
    },
  },
} as const
