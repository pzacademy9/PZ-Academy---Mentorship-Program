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
          register_url: string | null
          sheet_id: string | null
          slug: string
          status: Database["public"]["Enums"]["course_status"]
          tagline: string | null
          thumbnail_url: string | null
          title: string
          type: Database["public"]["Enums"]["course_type"]
        }
        Insert: {
          banner_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
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
          register_url?: string | null
          sheet_id?: string | null
          slug: string
          status?: Database["public"]["Enums"]["course_status"]
          tagline?: string | null
          thumbnail_url?: string | null
          title: string
          type?: Database["public"]["Enums"]["course_type"]
        }
        Update: {
          banner_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
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
          register_url?: string | null
          sheet_id?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["course_status"]
          tagline?: string | null
          thumbnail_url?: string | null
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
          id: string
          module_id: string
          order_index: number
          pdf_url: string | null
          resource_urls: Json
          text_content: string | null
          title: string
          video_url: string | null
        }
        Insert: {
          content_type?: Database["public"]["Enums"]["lesson_content_type"]
          created_at?: string
          id?: string
          module_id: string
          order_index?: number
          pdf_url?: string | null
          resource_urls?: Json
          text_content?: string | null
          title: string
          video_url?: string | null
        }
        Update: {
          content_type?: Database["public"]["Enums"]["lesson_content_type"]
          created_at?: string
          id?: string
          module_id?: string
          order_index?: number
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
      mentors: {
        Row: {
          availability_json: Json | null
          created_at: string
          id: string
          is_active: boolean
          profile_id: string
          specializations: string[]
          total_sessions: number
        }
        Insert: {
          availability_json?: Json | null
          created_at?: string
          id?: string
          is_active?: boolean
          profile_id: string
          specializations?: string[]
          total_sessions?: number
        }
        Update: {
          availability_json?: Json | null
          created_at?: string
          id?: string
          is_active?: boolean
          profile_id?: string
          specializations?: string[]
          total_sessions?: number
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
      sessions: {
        Row: {
          booked_at: string
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
      lesson_content_type: "video" | "text" | "pdf"
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
      lesson_content_type: ["video", "text", "pdf"],
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
