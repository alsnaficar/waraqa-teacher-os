export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      academic_years: {
        Row: {
          created_at: string;
          end_date: string | null;
          id: string;
          is_active: boolean;
          label: string;
          start_date: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          end_date?: string | null;
          id?: string;
          is_active?: boolean;
          label: string;
          start_date?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          end_date?: string | null;
          id?: string;
          is_active?: boolean;
          label?: string;
          start_date?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      ai_generations: {
        Row: {
          created_at: string;
          id: string;
          kind: string;
          output: Json | null;
          prompt: string | null;
          status: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          kind: string;
          output?: Json | null;
          prompt?: string | null;
          status?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          kind?: string;
          output?: Json | null;
          prompt?: string | null;
          status?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      calendar_events: {
        Row: {
          academic_year_id: string | null;
          created_at: string;
          ends_at: string;
          event_type: string;
          id: string;
          is_remote: boolean;
          is_teaching_day: boolean;
          notes: string | null;
          semester_id: string | null;
          starts_at: string;
          title: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          academic_year_id?: string | null;
          created_at?: string;
          ends_at: string;
          event_type?: string;
          id?: string;
          is_remote?: boolean;
          is_teaching_day?: boolean;
          notes?: string | null;
          semester_id?: string | null;
          starts_at: string;
          title: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          academic_year_id?: string | null;
          created_at?: string;
          ends_at?: string;
          event_type?: string;
          id?: string;
          is_remote?: boolean;
          is_teaching_day?: boolean;
          notes?: string | null;
          semester_id?: string | null;
          starts_at?: string;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "calendar_events_academic_year_id_fkey";
            columns: ["academic_year_id"];
            isOneToOne: false;
            referencedRelation: "academic_years";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "calendar_events_semester_id_fkey";
            columns: ["semester_id"];
            isOneToOne: false;
            referencedRelation: "semesters";
            referencedColumns: ["id"];
          },
        ];
      };
      classes: {
        Row: {
          created_at: string;
          grade_id: string | null;
          id: string;
          name: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          grade_id?: string | null;
          id?: string;
          name: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          grade_id?: string | null;
          id?: string;
          name?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "classes_grade_id_fkey";
            columns: ["grade_id"];
            isOneToOne: false;
            referencedRelation: "grades";
            referencedColumns: ["id"];
          },
        ];
      };
      coupons: {
        Row: {
          code: string;
          created_at: string | null;
          expires_at: string | null;
          id: string;
          is_active: boolean | null;
          max_usage: number | null;
          starts_at: string | null;
          type: string;
          used_count: number | null;
          value: number;
        };
        Insert: {
          code: string;
          created_at?: string | null;
          expires_at?: string | null;
          id?: string;
          is_active?: boolean | null;
          max_usage?: number | null;
          starts_at?: string | null;
          type: string;
          used_count?: number | null;
          value: number;
        };
        Update: {
          code?: string;
          created_at?: string | null;
          expires_at?: string | null;
          id?: string;
          is_active?: boolean | null;
          max_usage?: number | null;
          starts_at?: string | null;
          type?: string;
          used_count?: number | null;
          value?: number;
        };
        Relationships: [];
      };
      curricula: {
        Row: {
          created_at: string;
          description: string | null;
          grade_level: string | null;
          id: string;
          subject: string | null;
          title: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          grade_level?: string | null;
          id?: string;
          subject?: string | null;
          title: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          grade_level?: string | null;
          id?: string;
          subject?: string | null;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      curriculum_files: {
        Row: {
          academic_year: string | null;
          created_at: string;
          grade: string | null;
          id: string;
          mime_type: string | null;
          original_name: string;
          semester: string | null;
          size_bytes: number | null;
          status: string;
          storage_path: string;
          subject: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          academic_year?: string | null;
          created_at?: string;
          grade?: string | null;
          id?: string;
          mime_type?: string | null;
          original_name: string;
          semester?: string | null;
          size_bytes?: number | null;
          status?: string;
          storage_path: string;
          subject?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          academic_year?: string | null;
          created_at?: string;
          grade?: string | null;
          id?: string;
          mime_type?: string | null;
          original_name?: string;
          semester?: string | null;
          size_bytes?: number | null;
          status?: string;
          storage_path?: string;
          subject?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      curriculum_lessons: {
        Row: {
          created_at: string;
          curriculum_file_id: string | null;
          id: string;
          lesson_date: string | null;
          notes: string | null;
          objectives: string | null;
          order_index: number;
          title: string;
          updated_at: string;
          user_id: string;
          week_number: number | null;
        };
        Insert: {
          created_at?: string;
          curriculum_file_id?: string | null;
          id?: string;
          lesson_date?: string | null;
          notes?: string | null;
          objectives?: string | null;
          order_index?: number;
          title: string;
          updated_at?: string;
          user_id: string;
          week_number?: number | null;
        };
        Update: {
          created_at?: string;
          curriculum_file_id?: string | null;
          id?: string;
          lesson_date?: string | null;
          notes?: string | null;
          objectives?: string | null;
          order_index?: number;
          title?: string;
          updated_at?: string;
          user_id?: string;
          week_number?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "curriculum_lessons_curriculum_file_id_fkey";
            columns: ["curriculum_file_id"];
            isOneToOne: false;
            referencedRelation: "curriculum_files";
            referencedColumns: ["id"];
          },
        ];
      };
      curriculum_units: {
        Row: {
          created_at: string;
          curriculum_id: string;
          description: string | null;
          id: string;
          order_index: number;
          title: string;
        };
        Insert: {
          created_at?: string;
          curriculum_id: string;
          description?: string | null;
          id?: string;
          order_index?: number;
          title: string;
        };
        Update: {
          created_at?: string;
          curriculum_id?: string;
          description?: string | null;
          id?: string;
          order_index?: number;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "curriculum_units_curriculum_id_fkey";
            columns: ["curriculum_id"];
            isOneToOne: false;
            referencedRelation: "curricula";
            referencedColumns: ["id"];
          },
        ];
      };
      grades: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          order_index: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          order_index?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          order_index?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      lesson_sessions: {
        Row: {
          academic_year_id: string;
          class_id: string | null;
          completed_at: string | null;
          created_at: string;
          curriculum_lesson_id: string;
          day_of_week: number;
          grade_id: string | null;
          id: string;
          lesson_locked: boolean;
          period_number: number;
          prepared_at: string | null;
          semester_id: string;
          session_date: string;
          status: string;
          teacher_id: string;
          updated_at: string;
        };
        Insert: {
          academic_year_id: string;
          class_id?: string | null;
          completed_at?: string | null;
          created_at?: string;
          curriculum_lesson_id: string;
          day_of_week: number;
          grade_id?: string | null;
          id?: string;
          lesson_locked?: boolean;
          period_number: number;
          prepared_at?: string | null;
          semester_id: string;
          session_date: string;
          status?: string;
          teacher_id: string;
          updated_at?: string;
        };
        Update: {
          academic_year_id?: string;
          class_id?: string | null;
          completed_at?: string | null;
          created_at?: string;
          curriculum_lesson_id?: string;
          day_of_week?: number;
          grade_id?: string | null;
          id?: string;
          lesson_locked?: boolean;
          period_number?: number;
          prepared_at?: string | null;
          semester_id?: string;
          session_date?: string;
          status?: string;
          teacher_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lesson_sessions_academic_year_id_fkey";
            columns: ["academic_year_id"];
            isOneToOne: false;
            referencedRelation: "academic_years";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lesson_sessions_class_id_fkey";
            columns: ["class_id"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lesson_sessions_curriculum_lesson_id_fkey";
            columns: ["curriculum_lesson_id"];
            isOneToOne: false;
            referencedRelation: "curriculum_lessons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lesson_sessions_grade_id_fkey";
            columns: ["grade_id"];
            isOneToOne: false;
            referencedRelation: "grades";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lesson_sessions_semester_id_fkey";
            columns: ["semester_id"];
            isOneToOne: false;
            referencedRelation: "semesters";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          body: string | null;
          created_at: string;
          id: string;
          read_at: string | null;
          title: string;
          user_id: string;
        };
        Insert: {
          body?: string | null;
          created_at?: string;
          id?: string;
          read_at?: string | null;
          title: string;
          user_id: string;
        };
        Update: {
          body?: string | null;
          created_at?: string;
          id?: string;
          read_at?: string | null;
          title?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      payment_methods: {
        Row: {
          created_at: string | null;
          id: string;
          is_active: boolean | null;
          name: string;
          provider: string;
          settings: Json | null;
        };
        Insert: {
          created_at?: string | null;
          id?: string;
          is_active?: boolean | null;
          name: string;
          provider: string;
          settings?: Json | null;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          is_active?: boolean | null;
          name?: string;
          provider?: string;
          settings?: Json | null;
        };
        Relationships: [];
      };
      payments: {
        Row: {
          amount: number;
          created_at: string | null;
          id: string;
          paid_at: string | null;
          payment_method_id: string | null;
          status: string;
          subscription_id: string;
          transaction_number: string | null;
        };
        Insert: {
          amount: number;
          created_at?: string | null;
          id?: string;
          paid_at?: string | null;
          payment_method_id?: string | null;
          status?: string;
          subscription_id: string;
          transaction_number?: string | null;
        };
        Update: {
          amount?: number;
          created_at?: string | null;
          id?: string;
          paid_at?: string | null;
          payment_method_id?: string | null;
          status?: string;
          subscription_id?: string;
          transaction_number?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "payments_payment_method_id_fkey";
            columns: ["payment_method_id"];
            isOneToOne: false;
            referencedRelation: "payment_methods";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_subscription_id_fkey";
            columns: ["subscription_id"];
            isOneToOne: false;
            referencedRelation: "subscriptions";
            referencedColumns: ["id"];
          },
        ];
      };
      planner_entries: {
        Row: {
          created_at: string;
          day_of_week: number;
          id: string;
          notes: string | null;
          period: number;
          subject: string | null;
          updated_at: string;
          user_id: string;
          week_start_date: string;
        };
        Insert: {
          created_at?: string;
          day_of_week: number;
          id?: string;
          notes?: string | null;
          period: number;
          subject?: string | null;
          updated_at?: string;
          user_id: string;
          week_start_date: string;
        };
        Update: {
          created_at?: string;
          day_of_week?: number;
          id?: string;
          notes?: string | null;
          period?: number;
          subject?: string | null;
          updated_at?: string;
          user_id?: string;
          week_start_date?: string;
        };
        Relationships: [];
      };
      plans: {
        Row: {
          code: string;
          created_at: string | null;
          id: string;
          is_active: boolean | null;
          name: string;
          price: number;
          starts_with: string;
          updated_at: string | null;
        };
        Insert: {
          code: string;
          created_at?: string | null;
          id?: string;
          is_active?: boolean | null;
          name: string;
          price: number;
          starts_with: string;
          updated_at?: string | null;
        };
        Update: {
          code?: string;
          created_at?: string | null;
          id?: string;
          is_active?: boolean | null;
          name?: string;
          price?: number;
          starts_with?: string;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          academic_year: string | null;
          avatar_url: string | null;
          classes: Json;
          country: string | null;
          created_at: string;
          education_system: string | null;
          full_name: string | null;
          grade: string | null;
          id: string;
          locale: string;
          onboarding_completed_at: string | null;
          school: string | null;
          semester: string | null;
          subject: string | null;
          updated_at: string;
          whatsapp: string | null;
        };
        Insert: {
          academic_year?: string | null;
          avatar_url?: string | null;
          classes?: Json;
          country?: string | null;
          created_at?: string;
          education_system?: string | null;
          full_name?: string | null;
          grade?: string | null;
          id: string;
          locale?: string;
          onboarding_completed_at?: string | null;
          school?: string | null;
          semester?: string | null;
          subject?: string | null;
          updated_at?: string;
          whatsapp?: string | null;
        };
        Update: {
          academic_year?: string | null;
          avatar_url?: string | null;
          classes?: Json;
          country?: string | null;
          created_at?: string;
          education_system?: string | null;
          full_name?: string | null;
          grade?: string | null;
          id?: string;
          locale?: string;
          onboarding_completed_at?: string | null;
          school?: string | null;
          semester?: string | null;
          subject?: string | null;
          updated_at?: string;
          whatsapp?: string | null;
        };
        Relationships: [];
      };
      semesters: {
        Row: {
          academic_year_id: string | null;
          created_at: string;
          end_date: string | null;
          id: string;
          label: string;
          order_index: number;
          start_date: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          academic_year_id?: string | null;
          created_at?: string;
          end_date?: string | null;
          id?: string;
          label: string;
          order_index?: number;
          start_date?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          academic_year_id?: string | null;
          created_at?: string;
          end_date?: string | null;
          id?: string;
          label?: string;
          order_index?: number;
          start_date?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "semesters_academic_year_id_fkey";
            columns: ["academic_year_id"];
            isOneToOne: false;
            referencedRelation: "academic_years";
            referencedColumns: ["id"];
          },
        ];
      };
      subjects: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      subscription_logs: {
        Row: {
          action: string;
          created_at: string | null;
          id: string;
          notes: string | null;
          performed_by: string | null;
          subscription_id: string;
        };
        Insert: {
          action: string;
          created_at?: string | null;
          id?: string;
          notes?: string | null;
          performed_by?: string | null;
          subscription_id: string;
        };
        Update: {
          action?: string;
          created_at?: string | null;
          id?: string;
          notes?: string | null;
          performed_by?: string | null;
          subscription_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "subscription_logs_performed_by_fkey";
            columns: ["performed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "subscription_logs_subscription_id_fkey";
            columns: ["subscription_id"];
            isOneToOne: false;
            referencedRelation: "subscriptions";
            referencedColumns: ["id"];
          },
        ];
      };
      subscriptions: {
        Row: {
          academic_year_id: string | null;
          created_at: string | null;
          expires_at: string;
          id: string;
          plan_id: string;
          renewed_from: string | null;
          semester_id: string | null;
          starts_at: string;
          status: string;
          updated_at: string | null;
          user_id: string;
        };
        Insert: {
          academic_year_id?: string | null;
          created_at?: string | null;
          expires_at: string;
          id?: string;
          plan_id: string;
          renewed_from?: string | null;
          semester_id?: string | null;
          starts_at: string;
          status?: string;
          updated_at?: string | null;
          user_id: string;
        };
        Update: {
          academic_year_id?: string | null;
          created_at?: string | null;
          expires_at?: string;
          id?: string;
          plan_id?: string;
          renewed_from?: string | null;
          semester_id?: string | null;
          starts_at?: string;
          status?: string;
          updated_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "subscriptions_academic_year_id_fkey";
            columns: ["academic_year_id"];
            isOneToOne: false;
            referencedRelation: "academic_years";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "plans";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "subscriptions_renewed_from_fkey";
            columns: ["renewed_from"];
            isOneToOne: false;
            referencedRelation: "subscriptions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "subscriptions_semester_id_fkey";
            columns: ["semester_id"];
            isOneToOne: false;
            referencedRelation: "semesters";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "subscriptions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      teacher_timetable: {
        Row: {
          active: boolean;
          class_name: string;
          classroom: string | null;
          created_at: string;
          day_of_week: number;
          ends_at: string | null;
          grade: string;
          id: string;
          period: number;
          starts_at: string | null;
          subject: string;
          teacher_id: string;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          class_name: string;
          classroom?: string | null;
          created_at?: string;
          day_of_week: number;
          ends_at?: string | null;
          grade: string;
          id?: string;
          period: number;
          starts_at?: string | null;
          subject: string;
          teacher_id: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          class_name?: string;
          classroom?: string | null;
          created_at?: string;
          day_of_week?: number;
          ends_at?: string | null;
          grade?: string;
          id?: string;
          period?: number;
          starts_at?: string | null;
          subject?: string;
          teacher_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
    };
    Enums: {
      app_role: "admin" | "teacher";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "teacher"],
    },
  },
} as const;
