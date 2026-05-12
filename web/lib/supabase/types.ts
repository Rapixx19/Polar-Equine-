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
      anomaly_flags: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          baseline_mean: number | null
          baseline_sd: number | null
          created_at: string | null
          horse_id: string | null
          id: string
          metric: string
          observed: number | null
          session_id: string | null
          severity: string
          suggested_action: string | null
          z_score: number | null
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          baseline_mean?: number | null
          baseline_sd?: number | null
          created_at?: string | null
          horse_id?: string | null
          id?: string
          metric: string
          observed?: number | null
          session_id?: string | null
          severity: string
          suggested_action?: string | null
          z_score?: number | null
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          baseline_mean?: number | null
          baseline_sd?: number | null
          created_at?: string | null
          horse_id?: string | null
          id?: string
          metric?: string
          observed?: number | null
          session_id?: string | null
          severity?: string
          suggested_action?: string | null
          z_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "anomaly_flags_acknowledged_by_fkey"
            columns: ["acknowledged_by"]
            isOneToOne: false
            referencedRelation: "rider_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anomaly_flags_horse_id_fkey"
            columns: ["horse_id"]
            isOneToOne: false
            referencedRelation: "horses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anomaly_flags_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      bands: {
        Row: {
          id: string
          last_seen: string | null
          mac_address: string
          model: string | null
          nickname: string | null
          paired_at: string | null
          paired_by: string | null
        }
        Insert: {
          id?: string
          last_seen?: string | null
          mac_address: string
          model?: string | null
          nickname?: string | null
          paired_at?: string | null
          paired_by?: string | null
        }
        Update: {
          id?: string
          last_seen?: string | null
          mac_address?: string
          model?: string | null
          nickname?: string | null
          paired_at?: string | null
          paired_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bands_paired_by_fkey"
            columns: ["paired_by"]
            isOneToOne: false
            referencedRelation: "rider_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      compute_jobs: {
        Row: {
          attempts: number
          created_at: string | null
          id: string
          job_type: string
          last_error: string | null
          next_run_at: string
          session_id: string
          status: string
          updated_at: string | null
        }
        Insert: {
          attempts?: number
          created_at?: string | null
          id?: string
          job_type: string
          last_error?: string | null
          next_run_at?: string
          session_id: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          attempts?: number
          created_at?: string | null
          id?: string
          job_type?: string
          last_error?: string | null
          next_run_at?: string
          session_id?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compute_jobs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      horse_daily: {
        Row: {
          date: string
          horse_id: string
          resting_hr_med: number | null
          rmssd_med: number | null
          session_count: number | null
          total_active_s: number | null
          total_workload: number | null
        }
        Insert: {
          date: string
          horse_id: string
          resting_hr_med?: number | null
          rmssd_med?: number | null
          session_count?: number | null
          total_active_s?: number | null
          total_workload?: number | null
        }
        Update: {
          date?: string
          horse_id?: string
          resting_hr_med?: number | null
          rmssd_med?: number | null
          session_count?: number | null
          total_active_s?: number | null
          total_workload?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "horse_daily_horse_id_fkey"
            columns: ["horse_id"]
            isOneToOne: false
            referencedRelation: "horses"
            referencedColumns: ["id"]
          },
        ]
      }
      horse_riders: {
        Row: {
          granted_at: string | null
          granted_by: string | null
          horse_id: string
          rider_id: string
          role: string
        }
        Insert: {
          granted_at?: string | null
          granted_by?: string | null
          horse_id: string
          rider_id: string
          role: string
        }
        Update: {
          granted_at?: string | null
          granted_by?: string | null
          horse_id?: string
          rider_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "horse_riders_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "rider_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "horse_riders_horse_id_fkey"
            columns: ["horse_id"]
            isOneToOne: false
            referencedRelation: "horses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "horse_riders_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "rider_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      horses: {
        Row: {
          breed: string | null
          created_at: string | null
          created_by: string | null
          date_of_birth: string | null
          id: string
          name: string
          notes: string | null
          owner: string | null
          photo_url: string | null
          sex: string | null
          stable_id: string | null
        }
        Insert: {
          breed?: string | null
          created_at?: string | null
          created_by?: string | null
          date_of_birth?: string | null
          id?: string
          name: string
          notes?: string | null
          owner?: string | null
          photo_url?: string | null
          sex?: string | null
          stable_id?: string | null
        }
        Update: {
          breed?: string | null
          created_at?: string | null
          created_by?: string | null
          date_of_birth?: string | null
          id?: string
          name?: string
          notes?: string | null
          owner?: string | null
          photo_url?: string | null
          sex?: string | null
          stable_id?: string | null
        }
        Relationships: []
      }
      label_corrections: {
        Row: {
          algo_version: string
          auto_confidence: number | null
          auto_end_ms: number
          auto_label_type: string
          auto_start_ms: number
          corrected_end_ms: number | null
          corrected_label_type: string | null
          corrected_start_ms: number | null
          correction_kind: string
          created_at: string | null
          id: string
          rider_id: string | null
          session_id: string
        }
        Insert: {
          algo_version: string
          auto_confidence?: number | null
          auto_end_ms: number
          auto_label_type: string
          auto_start_ms: number
          corrected_end_ms?: number | null
          corrected_label_type?: string | null
          corrected_start_ms?: number | null
          correction_kind: string
          created_at?: string | null
          id?: string
          rider_id?: string | null
          session_id: string
        }
        Update: {
          algo_version?: string
          auto_confidence?: number | null
          auto_end_ms?: number
          auto_label_type?: string
          auto_start_ms?: number
          corrected_end_ms?: number | null
          corrected_label_type?: string | null
          corrected_start_ms?: number | null
          correction_kind?: string
          created_at?: string | null
          id?: string
          rider_id?: string | null
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "label_corrections_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "rider_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "label_corrections_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      labels: {
        Row: {
          confidence: number | null
          created_at: string | null
          end_ms: number
          id: string
          jump_count: number | null
          label_type: string
          session_id: string
          source: string | null
          start_ms: number
        }
        Insert: {
          confidence?: number | null
          created_at?: string | null
          end_ms: number
          id?: string
          jump_count?: number | null
          label_type: string
          session_id: string
          source?: string | null
          start_ms: number
        }
        Update: {
          confidence?: number | null
          created_at?: string | null
          end_ms?: number
          id?: string
          jump_count?: number | null
          label_type?: string
          session_id?: string
          source?: string | null
          start_ms?: number
        }
        Relationships: [
          {
            foreignKeyName: "labels_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      rider_profiles: {
        Row: {
          consented_at: string | null
          created_at: string | null
          display_name: string
          id: string
          is_admin: boolean | null
          preferred_horse_id: string | null
          total_sessions: number | null
        }
        Insert: {
          consented_at?: string | null
          created_at?: string | null
          display_name: string
          id: string
          is_admin?: boolean | null
          preferred_horse_id?: string | null
          total_sessions?: number | null
        }
        Update: {
          consented_at?: string | null
          created_at?: string | null
          display_name?: string
          id?: string
          is_admin?: boolean | null
          preferred_horse_id?: string | null
          total_sessions?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rider_profiles_preferred_horse_id_fkey"
            columns: ["preferred_horse_id"]
            isOneToOne: false
            referencedRelation: "horses"
            referencedColumns: ["id"]
          },
        ]
      }
      samples_acc: {
        Row: {
          ax: number | null
          ay: number | null
          az: number | null
          id: number
          session_id: string
          timestamp_ms: number
        }
        Insert: {
          ax?: number | null
          ay?: number | null
          az?: number | null
          id?: number
          session_id: string
          timestamp_ms: number
        }
        Update: {
          ax?: number | null
          ay?: number | null
          az?: number | null
          id?: number
          session_id?: string
          timestamp_ms?: number
        }
        Relationships: [
          {
            foreignKeyName: "samples_acc_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      samples_ecg: {
        Row: {
          ecg_uv: number | null
          id: number
          session_id: string
          timestamp_ms: number
        }
        Insert: {
          ecg_uv?: number | null
          id?: number
          session_id: string
          timestamp_ms: number
        }
        Update: {
          ecg_uv?: number | null
          id?: number
          session_id?: string
          timestamp_ms?: number
        }
        Relationships: [
          {
            foreignKeyName: "samples_ecg_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      samples_hr: {
        Row: {
          contact: boolean | null
          hr_bpm: number | null
          id: number
          rr_ms: number | null
          session_id: string
          timestamp_ms: number
        }
        Insert: {
          contact?: boolean | null
          hr_bpm?: number | null
          id?: number
          rr_ms?: number | null
          session_id: string
          timestamp_ms: number
        }
        Update: {
          contact?: boolean | null
          hr_bpm?: number | null
          id?: number
          rr_ms?: number | null
          session_id?: string
          timestamp_ms?: number
        }
        Relationships: [
          {
            foreignKeyName: "samples_hr_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      signal_chunks: {
        Row: {
          byte_count: number
          channels: number
          chunk_index: number
          created_at: string | null
          end_t_ms: number
          id: number
          range_g: number | null
          resolution_bits: number
          sample_rate_hz: number
          session_id: string
          start_t_ms: number
          storage_path: string
          stream: string
        }
        Insert: {
          byte_count: number
          channels: number
          chunk_index: number
          created_at?: string | null
          end_t_ms: number
          id?: number
          range_g?: number | null
          resolution_bits: number
          sample_rate_hz: number
          session_id: string
          start_t_ms: number
          storage_path: string
          stream: string
        }
        Update: {
          byte_count?: number
          channels?: number
          chunk_index?: number
          created_at?: string | null
          end_t_ms?: number
          id?: number
          range_g?: number | null
          resolution_bits?: number
          sample_rate_hz?: number
          session_id?: string
          start_t_ms?: number
          storage_path?: string
          stream?: string
        }
        Relationships: [
          {
            foreignKeyName: "signal_chunks_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      session_metrics: {
        Row: {
          algo_version: string | null
          avg_hr_pct: number | null
          computed_at: string | null
          duration_s: number | null
          hr_avg: number | null
          hr_min: number | null
          hr_peak: number | null
          hr_sd: number | null
          hrv_completeness_quality: number | null
          jump_count: number | null
          pnn20_pct: number | null
          pnn50_pct: number | null
          recovery_fit_quality: number | null
          recovery_tau_s: number | null
          rmssd_ms: number | null
          rr_cleaning_quality: number | null
          sdnn_ms: number | null
          session_id: string
          time_canter_s: number | null
          time_gallop_s: number | null
          time_rest_s: number | null
          time_trot_s: number | null
          time_walk_s: number | null
          time_z1_s: number | null
          time_z2_s: number | null
          time_z3_s: number | null
          time_z4_s: number | null
          time_z5_s: number | null
          trimp_banister: number | null
          workload_quality: number | null
        }
        Insert: {
          algo_version?: string | null
          avg_hr_pct?: number | null
          computed_at?: string | null
          duration_s?: number | null
          hr_avg?: number | null
          hr_min?: number | null
          hr_peak?: number | null
          hr_sd?: number | null
          hrv_completeness_quality?: number | null
          jump_count?: number | null
          pnn20_pct?: number | null
          pnn50_pct?: number | null
          recovery_fit_quality?: number | null
          recovery_tau_s?: number | null
          rmssd_ms?: number | null
          rr_cleaning_quality?: number | null
          sdnn_ms?: number | null
          session_id: string
          time_canter_s?: number | null
          time_gallop_s?: number | null
          time_rest_s?: number | null
          time_trot_s?: number | null
          time_walk_s?: number | null
          time_z1_s?: number | null
          time_z2_s?: number | null
          time_z3_s?: number | null
          time_z4_s?: number | null
          time_z5_s?: number | null
          trimp_banister?: number | null
          workload_quality?: number | null
        }
        Update: {
          algo_version?: string | null
          avg_hr_pct?: number | null
          computed_at?: string | null
          duration_s?: number | null
          hr_avg?: number | null
          hr_min?: number | null
          hr_peak?: number | null
          hr_sd?: number | null
          hrv_completeness_quality?: number | null
          jump_count?: number | null
          pnn20_pct?: number | null
          pnn50_pct?: number | null
          recovery_fit_quality?: number | null
          recovery_tau_s?: number | null
          rmssd_ms?: number | null
          rr_cleaning_quality?: number | null
          sdnn_ms?: number | null
          session_id?: string
          time_canter_s?: number | null
          time_gallop_s?: number | null
          time_rest_s?: number | null
          time_trot_s?: number | null
          time_walk_s?: number | null
          time_z1_s?: number | null
          time_z2_s?: number | null
          time_z3_s?: number | null
          time_z4_s?: number | null
          time_z5_s?: number | null
          trimp_banister?: number | null
          workload_quality?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "session_metrics_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          activity_note: string | null
          activity_type: string
          band_id: string | null
          client_session_id: string | null
          created_at: string | null
          end_time: string | null
          horse_id: string
          id: string
          last_ingest_at: string | null
          metrics_status: string | null
          notes: string | null
          rider_id: string
          riding_subtype: string | null
          start_time: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          activity_note?: string | null
          activity_type: string
          band_id?: string | null
          client_session_id?: string | null
          created_at?: string | null
          end_time?: string | null
          horse_id: string
          id?: string
          last_ingest_at?: string | null
          metrics_status?: string | null
          notes?: string | null
          rider_id: string
          riding_subtype?: string | null
          start_time: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          activity_note?: string | null
          activity_type?: string
          band_id?: string | null
          client_session_id?: string | null
          created_at?: string | null
          end_time?: string | null
          horse_id?: string
          id?: string
          last_ingest_at?: string | null
          metrics_status?: string | null
          notes?: string | null
          rider_id?: string
          riding_subtype?: string | null
          start_time?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sessions_band_id_fkey"
            columns: ["band_id"]
            isOneToOne: false
            referencedRelation: "bands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_horse_id_fkey"
            columns: ["horse_id"]
            isOneToOne: false
            referencedRelation: "horses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "rider_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_admin_check: { Args: never; Returns: boolean }
      create_horse_for_self: {
        Args: { p_name: string }
        Returns: { id: string; name: string }[]
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
