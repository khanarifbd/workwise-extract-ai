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
      jobs: {
        Row: {
          additional_works: Json | null
          address: string | null
          attachments: Json | null
          booked_date: string | null
          booking_notes: string | null
          category_id: string | null
          completion_date: string | null
          costs: Json | null
          created_at: string
          date_issued: string | null
          description: string | null
          fan_info: Json | null
          id: string
          insulation_info: Json | null
          is_completed: boolean | null
          is_flexible_booking: boolean
          is_ongoing: boolean
          job_number: string
          linked_fan_job_id: string | null
          linked_insulation_job_id: string | null
          name: string
          ongoing_reason: string | null
          phone_number: string | null
          private_notes: string | null
          progress: number | null
          progress_notes: string | null
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
          booked_date?: string | null
          booking_notes?: string | null
          category_id?: string | null
          completion_date?: string | null
          costs?: Json | null
          created_at?: string
          date_issued?: string | null
          description?: string | null
          fan_info?: Json | null
          id?: string
          insulation_info?: Json | null
          is_completed?: boolean | null
          is_flexible_booking?: boolean
          is_ongoing?: boolean
          job_number: string
          linked_fan_job_id?: string | null
          linked_insulation_job_id?: string | null
          name: string
          ongoing_reason?: string | null
          phone_number?: string | null
          private_notes?: string | null
          progress?: number | null
          progress_notes?: string | null
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
          booked_date?: string | null
          booking_notes?: string | null
          category_id?: string | null
          completion_date?: string | null
          costs?: Json | null
          created_at?: string
          date_issued?: string | null
          description?: string | null
          fan_info?: Json | null
          id?: string
          insulation_info?: Json | null
          is_completed?: boolean | null
          is_flexible_booking?: boolean
          is_ongoing?: boolean
          job_number?: string
          linked_fan_job_id?: string | null
          linked_insulation_job_id?: string | null
          name?: string
          ongoing_reason?: string | null
          phone_number?: string | null
          private_notes?: string | null
          progress?: number | null
          progress_notes?: string | null
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
      is_valid_team_id: { Args: { _team_id: string }; Returns: boolean }
      is_viewer: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "team_member" | "viewer"
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
      app_role: ["admin", "team_member", "viewer"],
    },
  },
} as const
