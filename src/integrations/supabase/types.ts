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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      admin_personal_notes: {
        Row: {
          admin_name: string
          alert_date: string | null
          alert_dismissed: boolean
          category: string
          created_at: string
          id: string
          job_id: string | null
          note_text: string
          updated_at: string
        }
        Insert: {
          admin_name: string
          alert_date?: string | null
          alert_dismissed?: boolean
          category?: string
          created_at?: string
          id?: string
          job_id?: string | null
          note_text: string
          updated_at?: string
        }
        Update: {
          admin_name?: string
          alert_date?: string | null
          alert_dismissed?: boolean
          category?: string
          created_at?: string
          id?: string
          job_id?: string | null
          note_text?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_personal_notes_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          created_at: string
          field_changed: string | null
          id: string
          metadata: Json | null
          new_value: string | null
          old_value: string | null
          record_id: string | null
          table_name: string
          user_email: string | null
          user_id: string | null
          user_role: string | null
        }
        Insert: {
          action: string
          created_at?: string
          field_changed?: string | null
          id?: string
          metadata?: Json | null
          new_value?: string | null
          old_value?: string | null
          record_id?: string | null
          table_name: string
          user_email?: string | null
          user_id?: string | null
          user_role?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          field_changed?: string | null
          id?: string
          metadata?: Json | null
          new_value?: string | null
          old_value?: string | null
          record_id?: string | null
          table_name?: string
          user_email?: string | null
          user_id?: string | null
          user_role?: string | null
        }
        Relationships: []
      }
      categories: {
        Row: {
          color: string | null
          created_at: string
          id: string
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      category_guidelines: {
        Row: {
          category_id: string
          content: string
          created_at: string
          id: string
          mobile_content: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          category_id: string
          content?: string
          created_at?: string
          id?: string
          mobile_content?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          category_id?: string
          content?: string
          created_at?: string
          id?: string
          mobile_content?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      contact_history: {
        Row: {
          contact_date: string
          created_at: string
          created_by: string | null
          id: string
          job_id: string
          next_action: string | null
          next_action_date: string | null
          notes: string | null
          outcome: string
        }
        Insert: {
          contact_date?: string
          created_at?: string
          created_by?: string | null
          id?: string
          job_id: string
          next_action?: string | null
          next_action_date?: string | null
          notes?: string | null
          outcome: string
        }
        Update: {
          contact_date?: string
          created_at?: string
          created_by?: string | null
          id?: string
          job_id?: string
          next_action?: string | null
          next_action_date?: string | null
          notes?: string | null
          outcome?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_history_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      danni_notes: {
        Row: {
          alert_date: string | null
          alert_dismissed: boolean
          created_at: string
          id: string
          job_id: string | null
          note_text: string
          team_name: string | null
          updated_at: string
        }
        Insert: {
          alert_date?: string | null
          alert_dismissed?: boolean
          created_at?: string
          id?: string
          job_id?: string | null
          note_text?: string
          team_name?: string | null
          updated_at?: string
        }
        Update: {
          alert_date?: string | null
          alert_dismissed?: boolean
          created_at?: string
          id?: string
          job_id?: string | null
          note_text?: string
          team_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "danni_notes_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      eod_reports: {
        Row: {
          created_at: string
          general_notes: string | null
          id: string
          jobs_completed: Json
          jobs_open: Json
          jobs_visited: Json
          open_reasons: string | null
          report_date: string
          submitted_at: string
          submitted_by: string | null
          team_id: string
          team_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          general_notes?: string | null
          id?: string
          jobs_completed?: Json
          jobs_open?: Json
          jobs_visited?: Json
          open_reasons?: string | null
          report_date?: string
          submitted_at?: string
          submitted_by?: string | null
          team_id: string
          team_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          general_notes?: string | null
          id?: string
          jobs_completed?: Json
          jobs_open?: Json
          jobs_visited?: Json
          open_reasons?: string | null
          report_date?: string
          submitted_at?: string
          submitted_by?: string | null
          team_id?: string
          team_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      geocode_cache: {
        Row: {
          address: string
          address_hash: string
          created_at: string
          geocode_error: boolean | null
          id: string
          lat: number | null
          lng: number | null
          updated_at: string
        }
        Insert: {
          address: string
          address_hash: string
          created_at?: string
          geocode_error?: boolean | null
          id?: string
          lat?: number | null
          lng?: number | null
          updated_at?: string
        }
        Update: {
          address?: string
          address_hash?: string
          created_at?: string
          geocode_error?: boolean | null
          id?: string
          lat?: number | null
          lng?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      job_sub_tasks: {
        Row: {
          assigned_team: string | null
          booked_date: string | null
          completion_date: string | null
          created_at: string
          created_by: string | null
          deadline_date: string | null
          description: string | null
          id: string
          notes: string | null
          parent_job_id: string
          photos: string[] | null
          portal_updated: boolean
          property_address: string | null
          signed_off: boolean
          status: string
          task_type: string
          tenant_name: string | null
          trade: string
          updated_at: string
        }
        Insert: {
          assigned_team?: string | null
          booked_date?: string | null
          completion_date?: string | null
          created_at?: string
          created_by?: string | null
          deadline_date?: string | null
          description?: string | null
          id?: string
          notes?: string | null
          parent_job_id: string
          photos?: string[] | null
          portal_updated?: boolean
          property_address?: string | null
          signed_off?: boolean
          status?: string
          task_type?: string
          tenant_name?: string | null
          trade: string
          updated_at?: string
        }
        Update: {
          assigned_team?: string | null
          booked_date?: string | null
          completion_date?: string | null
          created_at?: string
          created_by?: string | null
          deadline_date?: string | null
          description?: string | null
          id?: string
          notes?: string | null
          parent_job_id?: string
          photos?: string[] | null
          portal_updated?: boolean
          property_address?: string | null
          signed_off?: boolean
          status?: string
          task_type?: string
          tenant_name?: string | null
          trade?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_sub_tasks_parent_job_id_fkey"
            columns: ["parent_job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          additional_works: Json | null
          address: string | null
          attachments: Json | null
          blocker_chase_date: string | null
          blocker_notes: string | null
          blocker_set_at: string | null
          blocker_type: string | null
          booked_date: string | null
          booking_notes: string | null
          category_id: string | null
          completion_date: string | null
          costs: Json | null
          created_at: string
          date_issued: string | null
          deleted_at: string | null
          description: string | null
          expected_completion_date: string | null
          fan_info: Json | null
          fire_door_info: Json | null
          flooring_info: Json | null
          id: string
          insulation_info: Json | null
          is_completed: boolean | null
          is_flexible_booking: boolean
          is_ongoing: boolean
          job_number: string
          linked_fan_job_id: string | null
          linked_fire_door_job_id: string | null
          linked_flooring_job_id: string | null
          linked_insulation_job_id: string | null
          linked_roofing_job_id: string | null
          name: string
          ongoing_reason: string | null
          phone_number: string | null
          private_notes: string | null
          progress: number | null
          progress_notes: string | null
          refer_back: boolean
          refer_back_date: string | null
          refer_back_reason: string | null
          roofing_info: Json | null
          scheduled_trades: Json | null
          start_date: string | null
          status: string | null
          summary_of_works: string | null
          team: string | null
          team2: string | null
          updated_at: string
          work_items: Json | null
        }
        Insert: {
          additional_works?: Json | null
          address?: string | null
          attachments?: Json | null
          blocker_chase_date?: string | null
          blocker_notes?: string | null
          blocker_set_at?: string | null
          blocker_type?: string | null
          booked_date?: string | null
          booking_notes?: string | null
          category_id?: string | null
          completion_date?: string | null
          costs?: Json | null
          created_at?: string
          date_issued?: string | null
          deleted_at?: string | null
          description?: string | null
          expected_completion_date?: string | null
          fan_info?: Json | null
          fire_door_info?: Json | null
          flooring_info?: Json | null
          id?: string
          insulation_info?: Json | null
          is_completed?: boolean | null
          is_flexible_booking?: boolean
          is_ongoing?: boolean
          job_number: string
          linked_fan_job_id?: string | null
          linked_fire_door_job_id?: string | null
          linked_flooring_job_id?: string | null
          linked_insulation_job_id?: string | null
          linked_roofing_job_id?: string | null
          name: string
          ongoing_reason?: string | null
          phone_number?: string | null
          private_notes?: string | null
          progress?: number | null
          progress_notes?: string | null
          refer_back?: boolean
          refer_back_date?: string | null
          refer_back_reason?: string | null
          roofing_info?: Json | null
          scheduled_trades?: Json | null
          start_date?: string | null
          status?: string | null
          summary_of_works?: string | null
          team?: string | null
          team2?: string | null
          updated_at?: string
          work_items?: Json | null
        }
        Update: {
          additional_works?: Json | null
          address?: string | null
          attachments?: Json | null
          blocker_chase_date?: string | null
          blocker_notes?: string | null
          blocker_set_at?: string | null
          blocker_type?: string | null
          booked_date?: string | null
          booking_notes?: string | null
          category_id?: string | null
          completion_date?: string | null
          costs?: Json | null
          created_at?: string
          date_issued?: string | null
          deleted_at?: string | null
          description?: string | null
          expected_completion_date?: string | null
          fan_info?: Json | null
          fire_door_info?: Json | null
          flooring_info?: Json | null
          id?: string
          insulation_info?: Json | null
          is_completed?: boolean | null
          is_flexible_booking?: boolean
          is_ongoing?: boolean
          job_number?: string
          linked_fan_job_id?: string | null
          linked_fire_door_job_id?: string | null
          linked_flooring_job_id?: string | null
          linked_insulation_job_id?: string | null
          linked_roofing_job_id?: string | null
          name?: string
          ongoing_reason?: string | null
          phone_number?: string | null
          private_notes?: string | null
          progress?: number | null
          progress_notes?: string | null
          refer_back?: boolean
          refer_back_date?: string | null
          refer_back_reason?: string | null
          roofing_info?: Json | null
          scheduled_trades?: Json | null
          start_date?: string | null
          status?: string | null
          summary_of_works?: string | null
          team?: string | null
          team2?: string | null
          updated_at?: string
          work_items?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_linked_fan_job_id_fkey"
            columns: ["linked_fan_job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      materials_reports: {
        Row: {
          created_at: string
          created_by: string | null
          filters: Json
          id: string
          job_count: number
          job_ids: string[]
          report_data: Json
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          filters?: Json
          id?: string
          job_count?: number
          job_ids?: string[]
          report_data?: Json
          title?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          filters?: Json
          id?: string
          job_count?: number
          job_ids?: string[]
          report_data?: Json
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      notification_history: {
        Row: {
          created_at: string
          id: string
          job_id: string | null
          job_number: string
          message: string
          sent_via: string
          status: string
          team_name: string
          whatsapp_number: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          job_id?: string | null
          job_number: string
          message: string
          sent_via?: string
          status?: string
          team_name: string
          whatsapp_number?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          job_id?: string | null
          job_number?: string
          message?: string
          sent_via?: string
          status?: string
          team_name?: string
          whatsapp_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_history_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      offline_sync_queue: {
        Row: {
          action_type: string
          created_at: string
          id: string
          payload: Json
          synced: boolean
          synced_at: string | null
          team_id: string
        }
        Insert: {
          action_type: string
          created_at?: string
          id?: string
          payload: Json
          synced?: boolean
          synced_at?: string | null
          team_id: string
        }
        Update: {
          action_type?: string
          created_at?: string
          id?: string
          payload?: Json
          synced?: boolean
          synced_at?: string | null
          team_id?: string
        }
        Relationships: []
      }
      ops_manager_notes: {
        Row: {
          category: string | null
          created_at: string
          created_by: string
          created_by_name: string
          enhanced_text: string
          id: string
          is_resolved: boolean
          job_id: string | null
          job_number: string | null
          original_audio_url: string | null
          resolved_at: string | null
          team_association: string | null
          title: string
          transcribed_text: string
          updated_at: string
          urgency: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by: string
          created_by_name: string
          enhanced_text: string
          id?: string
          is_resolved?: boolean
          job_id?: string | null
          job_number?: string | null
          original_audio_url?: string | null
          resolved_at?: string | null
          team_association?: string | null
          title: string
          transcribed_text: string
          updated_at?: string
          urgency?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string
          created_by_name?: string
          enhanced_text?: string
          id?: string
          is_resolved?: boolean
          job_id?: string | null
          job_number?: string | null
          original_audio_url?: string | null
          resolved_at?: string | null
          team_association?: string | null
          title?: string
          transcribed_text?: string
          updated_at?: string
          urgency?: string
        }
        Relationships: [
          {
            foreignKeyName: "ops_manager_notes_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      photo_folders: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          job_id: string
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          job_id: string
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          job_id?: string
          name?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "photo_folders_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      progressor_access_codes: {
        Row: {
          code: string
          created_at: string
          display_name: string
          email: string
          id: string
          is_active: boolean
        }
        Insert: {
          code: string
          created_at?: string
          display_name: string
          email: string
          id?: string
          is_active?: boolean
        }
        Update: {
          code?: string
          created_at?: string
          display_name?: string
          email?: string
          id?: string
          is_active?: boolean
        }
        Relationships: []
      }
      progressor_diary_entries: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_done: boolean
          job_id: string | null
          notes: string
          notified: boolean
          notify_at: string | null
          notify_enabled: boolean
          scheduled_at: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_done?: boolean
          job_id?: string | null
          notes?: string
          notified?: boolean
          notify_at?: string | null
          notify_enabled?: boolean
          scheduled_at: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_done?: boolean
          job_id?: string | null
          notes?: string
          notified?: boolean
          notify_at?: string | null
          notify_enabled?: boolean
          scheduled_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      progressor_team_codes: {
        Row: {
          access_code: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          team_name: string
          updated_at: string
        }
        Insert: {
          access_code: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          team_name: string
          updated_at?: string
        }
        Update: {
          access_code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          team_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      progressor_todos: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          custom_text: string | null
          id: string
          is_completed: boolean
          is_custom: boolean
          job_id: string
          label: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          custom_text?: string | null
          id?: string
          is_completed?: boolean
          is_custom?: boolean
          job_id: string
          label: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          custom_text?: string | null
          id?: string
          is_completed?: boolean
          is_custom?: boolean
          job_id?: string
          label?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "progressor_todos_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      roadmap_items: {
        Row: {
          assigned_team: string | null
          collapsed: boolean
          color: string
          created_at: string
          depends_on: string | null
          end_date: string
          id: string
          is_milestone: boolean
          label: string
          last_notified_at: string | null
          notes: string
          notify_lead_minutes: number
          notify_on_end: boolean
          notify_on_start: boolean
          parent_id: string | null
          progress: number
          roadmap_id: string
          sort_order: number
          start_date: string
          symbol: string | null
          updated_at: string
        }
        Insert: {
          assigned_team?: string | null
          collapsed?: boolean
          color?: string
          created_at?: string
          depends_on?: string | null
          end_date: string
          id?: string
          is_milestone?: boolean
          label: string
          last_notified_at?: string | null
          notes?: string
          notify_lead_minutes?: number
          notify_on_end?: boolean
          notify_on_start?: boolean
          parent_id?: string | null
          progress?: number
          roadmap_id: string
          sort_order?: number
          start_date: string
          symbol?: string | null
          updated_at?: string
        }
        Update: {
          assigned_team?: string | null
          collapsed?: boolean
          color?: string
          created_at?: string
          depends_on?: string | null
          end_date?: string
          id?: string
          is_milestone?: boolean
          label?: string
          last_notified_at?: string | null
          notes?: string
          notify_lead_minutes?: number
          notify_on_end?: boolean
          notify_on_start?: boolean
          parent_id?: string | null
          progress?: number
          roadmap_id?: string
          sort_order?: number
          start_date?: string
          symbol?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "roadmap_items_depends_on_fkey"
            columns: ["depends_on"]
            isOneToOne: false
            referencedRelation: "roadmap_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roadmap_items_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "roadmap_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roadmap_items_roadmap_id_fkey"
            columns: ["roadmap_id"]
            isOneToOne: false
            referencedRelation: "roadmaps"
            referencedColumns: ["id"]
          },
        ]
      }
      roadmaps: {
        Row: {
          category_id: string | null
          created_at: string
          created_by: string | null
          end_date: string
          id: string
          job_id: string | null
          name: string
          notes: string
          start_date: string
          time_unit: string
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          end_date: string
          id?: string
          job_id?: string | null
          name: string
          notes?: string
          start_date: string
          time_unit?: string
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          end_date?: string
          id?: string
          job_id?: string | null
          name?: string
          notes?: string
          start_date?: string
          time_unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "roadmaps_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      team_access_codes: {
        Row: {
          access_code: string
          created_at: string
          id: string
          is_active: boolean
          is_ops_manager: boolean
          language_preference: string | null
          team_id: string
          team_name: string
          updated_at: string
        }
        Insert: {
          access_code: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_ops_manager?: boolean
          language_preference?: string | null
          team_id: string
          team_name: string
          updated_at?: string
        }
        Update: {
          access_code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_ops_manager?: boolean
          language_preference?: string | null
          team_id?: string
          team_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      team_availability: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          reason: string | null
          team_id: string
          unavailable_date: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          reason?: string | null
          team_id: string
          unavailable_date: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          reason?: string | null
          team_id?: string
          unavailable_date?: string
        }
        Relationships: []
      }
      team_fcm_tokens: {
        Row: {
          created_at: string
          fcm_token: string
          id: string
          platform: string | null
          team_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          fcm_token: string
          id?: string
          platform?: string | null
          team_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          fcm_token?: string
          id?: string
          platform?: string | null
          team_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      team_job_updates: {
        Row: {
          created_at: string
          id: string
          job_id: string
          notes: string | null
          photos: string[] | null
          progress: number | null
          status: string | null
          synced_at: string | null
          team_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          job_id: string
          notes?: string | null
          photos?: string[] | null
          progress?: number | null
          status?: string | null
          synced_at?: string | null
          team_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          job_id?: string
          notes?: string | null
          photos?: string[] | null
          progress?: number | null
          status?: string | null
          synced_at?: string | null
          team_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_job_updates_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      team_messages: {
        Row: {
          audio_url: string | null
          created_at: string
          id: string
          is_read: boolean
          message_text: string | null
          message_type: string
          read_at: string | null
          sender_name: string
          team_id: string
          team_name: string
          updated_at: string
        }
        Insert: {
          audio_url?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          message_text?: string | null
          message_type?: string
          read_at?: string | null
          sender_name?: string
          team_id: string
          team_name: string
          updated_at?: string
        }
        Update: {
          audio_url?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          message_text?: string | null
          message_type?: string
          read_at?: string | null
          sender_name?: string
          team_id?: string
          team_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      team_notification_settings: {
        Row: {
          category_id: string | null
          color: string | null
          created_at: string
          id: string
          is_custom: boolean | null
          is_paused: boolean
          team_id: string
          team_name: string
          team_type: string | null
          updated_at: string
          whatsapp_group: string | null
        }
        Insert: {
          category_id?: string | null
          color?: string | null
          created_at?: string
          id?: string
          is_custom?: boolean | null
          is_paused?: boolean
          team_id: string
          team_name: string
          team_type?: string | null
          updated_at?: string
          whatsapp_group?: string | null
        }
        Update: {
          category_id?: string | null
          color?: string | null
          created_at?: string
          id?: string
          is_custom?: boolean | null
          is_paused?: boolean
          team_id?: string
          team_name?: string
          team_type?: string | null
          updated_at?: string
          whatsapp_group?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_notification_settings_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      team_push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          team_id: string
          updated_at: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          team_id: string
          updated_at?: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          team_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      team_sign_off_notifications: {
        Row: {
          created_at: string
          documents_count: number
          id: string
          is_read: boolean
          job_id: string
          job_name: string
          job_number: string
          photos_count: number
          progress_notes: string | null
          team_id: string
          team_name: string
          videos_count: number
          work_items_modified: number
          work_items_total: number
        }
        Insert: {
          created_at?: string
          documents_count?: number
          id?: string
          is_read?: boolean
          job_id: string
          job_name: string
          job_number: string
          photos_count?: number
          progress_notes?: string | null
          team_id: string
          team_name: string
          videos_count?: number
          work_items_modified?: number
          work_items_total?: number
        }
        Update: {
          created_at?: string
          documents_count?: number
          id?: string
          is_read?: boolean
          job_id?: string
          job_name?: string
          job_number?: string
          photos_count?: number
          progress_notes?: string | null
          team_id?: string
          team_name?: string
          videos_count?: number
          work_items_modified?: number
          work_items_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "team_sign_off_notifications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      team_sign_offs: {
        Row: {
          created_at: string
          documents_count: number
          id: string
          job_id: string
          photos_count: number
          progress_notes: string | null
          signed_off_at: string
          team_id: string
          team_name: string
          videos_count: number
          work_items_modified: number
          work_items_total: number
        }
        Insert: {
          created_at?: string
          documents_count?: number
          id?: string
          job_id: string
          photos_count?: number
          progress_notes?: string | null
          signed_off_at?: string
          team_id: string
          team_name: string
          videos_count?: number
          work_items_modified?: number
          work_items_total?: number
        }
        Update: {
          created_at?: string
          documents_count?: number
          id?: string
          job_id?: string
          photos_count?: number
          progress_notes?: string | null
          signed_off_at?: string
          team_id?: string
          team_name?: string
          videos_count?: number
          work_items_modified?: number
          work_items_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "team_sign_offs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      trade_companies: {
        Row: {
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          phone: string | null
          trade: string
          updated_at: string
        }
        Insert: {
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          trade: string
          updated_at?: string
        }
        Update: {
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          trade?: string
          updated_at?: string
        }
        Relationships: []
      }
      trade_types: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_admin_access: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_job_progressor: { Args: { _user_id: string }; Returns: boolean }
      is_valid_team_id: { Args: { _team_id: string }; Returns: boolean }
      is_viewer: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "team_member" | "viewer" | "job_progressor"
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
      app_role: ["admin", "team_member", "viewer", "job_progressor"],
    },
  },
} as const
