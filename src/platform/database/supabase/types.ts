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
      billing_academic_years: {
        Row: {
          code: string;
          created_at: string;
          ends_on: string;
          id: string;
          is_current: boolean;
          label: string;
          starts_on: string;
          updated_at: string;
        };
        Insert: {
          code: string;
          created_at?: string;
          ends_on: string;
          id?: string;
          is_current?: boolean;
          label: string;
          starts_on: string;
          updated_at?: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          ends_on?: string;
          id?: string;
          is_current?: boolean;
          label?: string;
          starts_on?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      billing_audit_log: {
        Row: {
          action: string;
          actor_id: string | null;
          created_at: string;
          entity_id: string | null;
          entity_type: string;
          id: string;
          new_value: Json | null;
          old_value: Json | null;
          reason: string | null;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type: string;
          id?: string;
          new_value?: Json | null;
          old_value?: Json | null;
          reason?: string | null;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string;
          id?: string;
          new_value?: Json | null;
          old_value?: Json | null;
          reason?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "billing_audit_log_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      billing_semesters: {
        Row: {
          academic_year_id: string;
          code: string;
          created_at: string;
          ends_on: string;
          id: string;
          is_current: boolean;
          label: string;
          sequence: number;
          starts_on: string;
          updated_at: string;
        };
        Insert: {
          academic_year_id: string;
          code: string;
          created_at?: string;
          ends_on: string;
          id?: string;
          is_current?: boolean;
          label: string;
          sequence: number;
          starts_on: string;
          updated_at?: string;
        };
        Update: {
          academic_year_id?: string;
          code?: string;
          created_at?: string;
          ends_on?: string;
          id?: string;
          is_current?: boolean;
          label?: string;
          sequence?: number;
          starts_on?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "billing_semesters_academic_year_id_fkey";
            columns: ["academic_year_id"];
            isOneToOne: false;
            referencedRelation: "billing_academic_years";
            referencedColumns: ["id"];
          },
        ];
      };
      billing_settings: {
        Row: {
          active_electronic_provider: string | null;
          created_at: string;
          id: number;
          updated_at: string;
        };
        Insert: {
          active_electronic_provider?: string | null;
          created_at?: string;
          id?: number;
          updated_at?: string;
        };
        Update: {
          active_electronic_provider?: string | null;
          created_at?: string;
          id?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      ai_generations: {
        Row: {
          created_at: string;
          grade: string | null;
          id: string;
          kind: string;
          lesson_id: string | null;
          lesson_session_id: string | null;
          lesson_title: string | null;
          output: Json | null;
          prompt: string | null;
          status: string;
          subject: string | null;
          updated_at: string | null;
          user_id: string;
          version: number;
        };
        Insert: {
          created_at?: string;
          grade?: string | null;
          id?: string;
          kind: string;
          lesson_id?: string | null;
          lesson_session_id?: string | null;
          lesson_title?: string | null;
          output?: Json | null;
          prompt?: string | null;
          status?: string;
          subject?: string | null;
          updated_at?: string | null;
          user_id: string;
          version?: number;
        };
        Update: {
          created_at?: string;
          grade?: string | null;
          id?: string;
          kind?: string;
          lesson_id?: string | null;
          lesson_session_id?: string | null;
          lesson_title?: string | null;
          output?: Json | null;
          prompt?: string | null;
          status?: string;
          subject?: string | null;
          updated_at?: string | null;
          user_id?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "ai_generations_lesson_session_id_fkey";
            columns: ["lesson_session_id"];
            isOneToOne: false;
            referencedRelation: "lesson_sessions";
            referencedColumns: ["id"];
          },
        ];
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
      calendar_exceptions: {
        Row: {
          academic_year_id: string;
          action: string;
          created_at: string;
          ends_at: string;
          id: string;
          is_remote: boolean;
          is_teaching_day: boolean;
          kind: string;
          replaces_exception_id: string | null;
          semester_id: string | null;
          starts_at: string;
          title: string;
          updated_at: string;
          variant_id: string;
        };
        Insert: {
          academic_year_id: string;
          action: string;
          created_at?: string;
          ends_at: string;
          id?: string;
          is_remote?: boolean;
          is_teaching_day?: boolean;
          kind: string;
          replaces_exception_id?: string | null;
          semester_id?: string | null;
          starts_at: string;
          title: string;
          updated_at?: string;
          variant_id: string;
        };
        Update: {
          academic_year_id?: string;
          action?: string;
          created_at?: string;
          ends_at?: string;
          id?: string;
          is_remote?: boolean;
          is_teaching_day?: boolean;
          kind?: string;
          replaces_exception_id?: string | null;
          semester_id?: string | null;
          starts_at?: string;
          title?: string;
          updated_at?: string;
          variant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "calendar_exceptions_academic_year_id_fkey";
            columns: ["academic_year_id"];
            isOneToOne: false;
            referencedRelation: "academic_years";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "calendar_exceptions_replaces_exception_id_fkey";
            columns: ["replaces_exception_id"];
            isOneToOne: false;
            referencedRelation: "calendar_exceptions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "calendar_exceptions_semester_id_fkey";
            columns: ["semester_id"];
            isOneToOne: false;
            referencedRelation: "semesters";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "calendar_exceptions_variant_id_fkey";
            columns: ["variant_id"];
            isOneToOne: false;
            referencedRelation: "calendar_variants";
            referencedColumns: ["id"];
          },
        ];
      };
      calendar_term_overrides: {
        Row: {
          created_at: string;
          end_date: string | null;
          id: string;
          semester_id: string;
          start_date: string | null;
          updated_at: string;
          variant_id: string;
        };
        Insert: {
          created_at?: string;
          end_date?: string | null;
          id?: string;
          semester_id: string;
          start_date?: string | null;
          updated_at?: string;
          variant_id: string;
        };
        Update: {
          created_at?: string;
          end_date?: string | null;
          id?: string;
          semester_id?: string;
          start_date?: string | null;
          updated_at?: string;
          variant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "calendar_term_overrides_semester_id_fkey";
            columns: ["semester_id"];
            isOneToOne: false;
            referencedRelation: "semesters";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "calendar_term_overrides_variant_id_fkey";
            columns: ["variant_id"];
            isOneToOne: false;
            referencedRelation: "calendar_variants";
            referencedColumns: ["id"];
          },
        ];
      };
      calendar_variants: {
        Row: {
          code: string;
          created_at: string;
          id: string;
          is_default: boolean;
          is_selectable: boolean;
          label: string;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          code: string;
          created_at?: string;
          id?: string;
          is_default?: boolean;
          is_selectable?: boolean;
          label: string;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          id?: string;
          is_default?: boolean;
          is_selectable?: boolean;
          label?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [];
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
          applies_to_upgrades: boolean;
          code: string;
          created_at: string | null;
          expires_at: string | null;
          id: string;
          is_active: boolean;
          max_redemptions_per_user: number;
          max_usage: number;
          starts_at: string | null;
          type: string;
          updated_at: string | null;
          used_count: number;
          value: number;
        };
        Insert: {
          applies_to_upgrades?: boolean;
          code: string;
          created_at?: string | null;
          expires_at?: string | null;
          id?: string;
          is_active?: boolean;
          max_redemptions_per_user?: number;
          max_usage?: number;
          starts_at?: string | null;
          type: string;
          updated_at?: string | null;
          used_count?: number;
          value: number;
        };
        Update: {
          applies_to_upgrades?: boolean;
          code?: string;
          created_at?: string | null;
          expires_at?: string | null;
          id?: string;
          is_active?: boolean;
          max_redemptions_per_user?: number;
          max_usage?: number;
          starts_at?: string | null;
          type?: string;
          updated_at?: string | null;
          used_count?: number;
          value?: number;
        };
        Relationships: [];
      };
      coupon_plans: {
        Row: {
          coupon_id: string;
          created_at: string;
          plan_id: string;
        };
        Insert: {
          coupon_id: string;
          created_at?: string;
          plan_id: string;
        };
        Update: {
          coupon_id?: string;
          created_at?: string;
          plan_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "coupon_plans_coupon_id_fkey";
            columns: ["coupon_id"];
            isOneToOne: false;
            referencedRelation: "coupons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "coupon_plans_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "plans";
            referencedColumns: ["id"];
          },
        ];
      };
      coupon_redemptions: {
        Row: {
          coupon_id: string;
          created_at: string;
          id: string;
          payment_id: string;
          user_id: string;
        };
        Insert: {
          coupon_id: string;
          created_at?: string;
          id?: string;
          payment_id: string;
          user_id: string;
        };
        Update: {
          coupon_id?: string;
          created_at?: string;
          id?: string;
          payment_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "coupon_redemptions_coupon_id_fkey";
            columns: ["coupon_id"];
            isOneToOne: false;
            referencedRelation: "coupons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "coupon_redemptions_payment_id_fkey";
            columns: ["payment_id"];
            isOneToOne: false;
            referencedRelation: "payments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "coupon_redemptions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
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
      distribution_snapshot_items: {
        Row: {
          created_at: string;
          curriculum_lesson_id: string | null;
          id: string;
          lesson: string;
          notes: string;
          order_index: number;
          periods: number;
          snapshot_id: string;
          unit: string;
        };
        Insert: {
          created_at?: string;
          curriculum_lesson_id?: string | null;
          id?: string;
          lesson: string;
          notes?: string;
          order_index: number;
          periods: number;
          snapshot_id: string;
          unit?: string;
        };
        Update: {
          created_at?: string;
          curriculum_lesson_id?: string | null;
          id?: string;
          lesson?: string;
          notes?: string;
          order_index?: number;
          periods?: number;
          snapshot_id?: string;
          unit?: string;
        };
        Relationships: [
          {
            foreignKeyName: "distribution_snapshot_items_curriculum_lesson_id_fkey";
            columns: ["curriculum_lesson_id"];
            isOneToOne: false;
            referencedRelation: "curriculum_lessons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "distribution_snapshot_items_snapshot_id_fkey";
            columns: ["snapshot_id"];
            isOneToOne: false;
            referencedRelation: "distribution_snapshots";
            referencedColumns: ["id"];
          },
        ];
      };
      distribution_snapshots: {
        Row: {
          approved_at: string;
          approved_by: string;
          created_at: string;
          id: string;
          is_current: boolean;
          item_count: number;
          semester_plan_id: string;
          semester_plan_version_id: string;
          source: string;
          spreadsheet_id: string;
          total_periods: number;
          worksheet_name: string;
        };
        Insert: {
          approved_at?: string;
          approved_by: string;
          created_at?: string;
          id?: string;
          is_current?: boolean;
          item_count: number;
          semester_plan_id: string;
          semester_plan_version_id: string;
          source?: string;
          spreadsheet_id: string;
          total_periods: number;
          worksheet_name: string;
        };
        Update: {
          approved_at?: string;
          approved_by?: string;
          created_at?: string;
          id?: string;
          is_current?: boolean;
          item_count?: number;
          semester_plan_id?: string;
          semester_plan_version_id?: string;
          source?: string;
          spreadsheet_id?: string;
          total_periods?: number;
          worksheet_name?: string;
        };
        Relationships: [
          {
            foreignKeyName: "distribution_snapshots_semester_plan_id_fkey";
            columns: ["semester_plan_id"];
            isOneToOne: false;
            referencedRelation: "semester_plans";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "distribution_snapshots_semester_plan_version_id_fkey";
            columns: ["semester_plan_version_id"];
            isOneToOne: false;
            referencedRelation: "semester_plan_versions";
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
      homework: {
        Row: {
          class_name: string | null;
          created_at: string;
          due_date: string | null;
          grade: string | null;
          id: string;
          instructions: string;
          lesson_session_id: string | null;
          status: string;
          subject: string | null;
          teacher_id: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          class_name?: string | null;
          created_at?: string;
          due_date?: string | null;
          grade?: string | null;
          id?: string;
          instructions?: string;
          lesson_session_id?: string | null;
          status?: string;
          subject?: string | null;
          teacher_id: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          class_name?: string | null;
          created_at?: string;
          due_date?: string | null;
          grade?: string | null;
          id?: string;
          instructions?: string;
          lesson_session_id?: string | null;
          status?: string;
          subject?: string | null;
          teacher_id?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "homework_lesson_session_id_fkey";
            columns: ["lesson_session_id"];
            isOneToOne: false;
            referencedRelation: "lesson_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      homework_submissions: {
        Row: {
          created_at: string;
          feedback: string | null;
          graded_at: string | null;
          homework_id: string;
          id: string;
          score: number | null;
          status: string;
          student_id: string;
          submitted_at: string | null;
          teacher_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          feedback?: string | null;
          graded_at?: string | null;
          homework_id: string;
          id?: string;
          score?: number | null;
          status?: string;
          student_id: string;
          submitted_at?: string | null;
          teacher_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          feedback?: string | null;
          graded_at?: string | null;
          homework_id?: string;
          id?: string;
          score?: number | null;
          status?: string;
          student_id?: string;
          submitted_at?: string | null;
          teacher_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "homework_submissions_homework_id_fkey";
            columns: ["homework_id"];
            isOneToOne: false;
            referencedRelation: "homework";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "homework_submissions_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
      lesson_sessions: {
        Row: {
          academic_year_id: string;
          class_id: string | null;
          completed_at: string | null;
          created_at: string;
          curriculum_lesson_id: string;
          curriculum_lesson_source: "plan" | "manual";
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
          curriculum_lesson_source?: "plan" | "manual";
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
          curriculum_lesson_source?: "plan" | "manual";
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
          amount_sar: number;
          coupon_id: string | null;
          created_at: string | null;
          currency: string;
          discount_sar: number;
          id: string;
          idempotency_key: string | null;
          net_sar: number;
          paid_at: string | null;
          payment_method_id: string | null;
          provider: string;
          provider_payment_id: string | null;
          receipt_path: string | null;
          rejection_reason: string | null;
          status: string;
          subscription_id: string | null;
          transaction_number: string | null;
          transfer_reference: string | null;
          updated_at: string | null;
          user_id: string;
          verified_at: string | null;
          verified_by: string | null;
        };
        Insert: {
          amount?: number;
          amount_sar?: number;
          coupon_id?: string | null;
          created_at?: string | null;
          currency?: string;
          discount_sar?: number;
          id?: string;
          idempotency_key?: string | null;
          net_sar?: number;
          paid_at?: string | null;
          payment_method_id?: string | null;
          provider?: string;
          provider_payment_id?: string | null;
          receipt_path?: string | null;
          rejection_reason?: string | null;
          status?: string;
          subscription_id?: string | null;
          transaction_number?: string | null;
          transfer_reference?: string | null;
          updated_at?: string | null;
          user_id?: string;
          verified_at?: string | null;
          verified_by?: string | null;
        };
        Update: {
          amount?: number;
          amount_sar?: number;
          coupon_id?: string | null;
          created_at?: string | null;
          currency?: string;
          discount_sar?: number;
          id?: string;
          idempotency_key?: string | null;
          net_sar?: number;
          paid_at?: string | null;
          payment_method_id?: string | null;
          provider?: string;
          provider_payment_id?: string | null;
          receipt_path?: string | null;
          rejection_reason?: string | null;
          status?: string;
          subscription_id?: string | null;
          transaction_number?: string | null;
          transfer_reference?: string | null;
          updated_at?: string | null;
          user_id?: string;
          verified_at?: string | null;
          verified_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "payments_coupon_id_fkey";
            columns: ["coupon_id"];
            isOneToOne: false;
            referencedRelation: "coupons";
            referencedColumns: ["id"];
          },
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
          {
            foreignKeyName: "payments_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_verified_by_fkey";
            columns: ["verified_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
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
          semester_plan_id: string | null;
          semester_plan_version_id: string | null;
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
          semester_plan_id?: string | null;
          semester_plan_version_id?: string | null;
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
          semester_plan_id?: string | null;
          semester_plan_version_id?: string | null;
          subject?: string | null;
          updated_at?: string;
          user_id?: string;
          week_start_date?: string;
        };
        Relationships: [
          {
            foreignKeyName: "planner_entries_semester_plan_id_fkey";
            columns: ["semester_plan_id"];
            isOneToOne: false;
            referencedRelation: "semester_plans";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "planner_entries_semester_plan_version_id_fkey";
            columns: ["semester_plan_version_id"];
            isOneToOne: false;
            referencedRelation: "semester_plan_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      plans: {
        Row: {
          code: string;
          created_at: string | null;
          currency: string;
          id: string;
          is_active: boolean;
          name: string;
          price: number;
          price_sar: number;
          product: string;
          sort_order: number;
          starts_with: string;
          term_kind: string;
          tier: string;
          updated_at: string | null;
          vat_included: boolean;
        };
        Insert: {
          code: string;
          created_at?: string | null;
          currency?: string;
          id?: string;
          is_active?: boolean;
          name: string;
          price?: number;
          price_sar?: number;
          product?: string;
          sort_order?: number;
          starts_with: string;
          term_kind?: string;
          tier?: string;
          updated_at?: string | null;
          vat_included?: boolean;
        };
        Update: {
          code?: string;
          created_at?: string | null;
          currency?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
          price?: number;
          price_sar?: number;
          product?: string;
          sort_order?: number;
          starts_with?: string;
          term_kind?: string;
          tier?: string;
          updated_at?: string | null;
          vat_included?: boolean;
        };
        Relationships: [];
      };
      plan_entitlements: {
        Row: {
          created_at: string;
          feature_key: string;
          id: string;
          plan_id: string;
        };
        Insert: {
          created_at?: string;
          feature_key: string;
          id?: string;
          plan_id: string;
        };
        Update: {
          created_at?: string;
          feature_key?: string;
          id?: string;
          plan_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "plan_entitlements_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "plans";
            referencedColumns: ["id"];
          },
        ];
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
      semester_plans: {
        Row: {
          academic_year_id: string | null;
          approved_at: string | null;
          archived_at: string | null;
          calendar_variant_id: string | null;
          completed_at: string | null;
          created_at: string;
          current_version: number;
          grade: string;
          id: string;
          semester_id: string | null;
          status: Database["public"]["Enums"]["semester_plan_status"];
          subject: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          academic_year_id?: string | null;
          approved_at?: string | null;
          archived_at?: string | null;
          calendar_variant_id?: string | null;
          completed_at?: string | null;
          created_at?: string;
          current_version?: number;
          grade?: string;
          id?: string;
          semester_id?: string | null;
          status?: Database["public"]["Enums"]["semester_plan_status"];
          subject: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          academic_year_id?: string | null;
          approved_at?: string | null;
          archived_at?: string | null;
          calendar_variant_id?: string | null;
          completed_at?: string | null;
          created_at?: string;
          current_version?: number;
          grade?: string;
          id?: string;
          semester_id?: string | null;
          status?: Database["public"]["Enums"]["semester_plan_status"];
          subject?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "semester_plans_academic_year_id_fkey";
            columns: ["academic_year_id"];
            isOneToOne: false;
            referencedRelation: "academic_years";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "semester_plans_calendar_variant_id_fkey";
            columns: ["calendar_variant_id"];
            isOneToOne: false;
            referencedRelation: "calendar_variants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "semester_plans_semester_id_fkey";
            columns: ["semester_id"];
            isOneToOne: false;
            referencedRelation: "semesters";
            referencedColumns: ["id"];
          },
        ];
      };
      semester_plan_versions: {
        Row: {
          approved_at: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          semester_plan_id: string;
          snapshot: Json;
          status: Database["public"]["Enums"]["semester_plan_version_status"];
          version_number: number;
        };
        Insert: {
          approved_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          semester_plan_id: string;
          snapshot?: Json;
          status?: Database["public"]["Enums"]["semester_plan_version_status"];
          version_number: number;
        };
        Update: {
          approved_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          semester_plan_id?: string;
          snapshot?: Json;
          status?: Database["public"]["Enums"]["semester_plan_version_status"];
          version_number?: number;
        };
        Relationships: [
          {
            foreignKeyName: "semester_plan_versions_semester_plan_id_fkey";
            columns: ["semester_plan_id"];
            isOneToOne: false;
            referencedRelation: "semester_plans";
            referencedColumns: ["id"];
          },
        ];
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
      students: {
        Row: {
          active: boolean;
          class_id: string | null;
          created_at: string;
          full_name: string;
          grade_id: string | null;
          id: string;
          student_code: string | null;
          teacher_id: string;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          class_id?: string | null;
          created_at?: string;
          full_name: string;
          grade_id?: string | null;
          id?: string;
          student_code?: string | null;
          teacher_id: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          class_id?: string | null;
          created_at?: string;
          full_name?: string;
          grade_id?: string | null;
          id?: string;
          student_code?: string | null;
          teacher_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "students_class_id_fkey";
            columns: ["class_id"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "students_grade_id_fkey";
            columns: ["grade_id"];
            isOneToOne: false;
            referencedRelation: "grades";
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
          activated_at: string | null;
          billing_academic_year_id: string | null;
          billing_semester_id: string | null;
          created_at: string | null;
          created_from_payment_id: string | null;
          ends_on: string;
          expires_at: string;
          id: string;
          plan_id: string;
          product: string;
          renewed_from: string | null;
          semester_id: string | null;
          starts_at: string;
          starts_on: string;
          status: string;
          suspend_reason: string | null;
          suspended_at: string | null;
          updated_at: string | null;
          user_id: string;
        };
        Insert: {
          academic_year_id?: string | null;
          activated_at?: string | null;
          billing_academic_year_id?: string | null;
          billing_semester_id?: string | null;
          created_at?: string | null;
          created_from_payment_id?: string | null;
          ends_on?: string;
          expires_at?: string;
          id?: string;
          plan_id: string;
          product?: string;
          renewed_from?: string | null;
          semester_id?: string | null;
          starts_at?: string;
          starts_on?: string;
          status?: string;
          suspend_reason?: string | null;
          suspended_at?: string | null;
          updated_at?: string | null;
          user_id: string;
        };
        Update: {
          academic_year_id?: string | null;
          activated_at?: string | null;
          billing_academic_year_id?: string | null;
          billing_semester_id?: string | null;
          created_at?: string | null;
          created_from_payment_id?: string | null;
          ends_on?: string;
          expires_at?: string;
          id?: string;
          plan_id?: string;
          product?: string;
          renewed_from?: string | null;
          semester_id?: string | null;
          starts_at?: string;
          starts_on?: string;
          status?: string;
          suspend_reason?: string | null;
          suspended_at?: string | null;
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
            foreignKeyName: "subscriptions_billing_semester_fkey";
            columns: ["billing_semester_id"];
            isOneToOne: false;
            referencedRelation: "billing_semesters";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "subscriptions_billing_year_fkey";
            columns: ["billing_academic_year_id"];
            isOneToOne: false;
            referencedRelation: "billing_academic_years";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "subscriptions_created_from_payment_fkey";
            columns: ["created_from_payment_id"];
            isOneToOne: false;
            referencedRelation: "payments";
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
      test_answers: {
        Row: {
          boolean_answer: boolean | null;
          created_at: string;
          id: string;
          is_correct: boolean | null;
          points_awarded: number | null;
          question_id: string;
          selected_option_id: string | null;
          submission_id: string;
          updated_at: string;
        };
        Insert: {
          boolean_answer?: boolean | null;
          created_at?: string;
          id?: string;
          is_correct?: boolean | null;
          points_awarded?: number | null;
          question_id: string;
          selected_option_id?: string | null;
          submission_id: string;
          updated_at?: string;
        };
        Update: {
          boolean_answer?: boolean | null;
          created_at?: string;
          id?: string;
          is_correct?: boolean | null;
          points_awarded?: number | null;
          question_id?: string;
          selected_option_id?: string | null;
          submission_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "test_answers_question_id_fkey";
            columns: ["question_id"];
            isOneToOne: false;
            referencedRelation: "test_questions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "test_answers_selected_option_id_fkey";
            columns: ["selected_option_id"];
            isOneToOne: false;
            referencedRelation: "test_options";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "test_answers_submission_id_fkey";
            columns: ["submission_id"];
            isOneToOne: false;
            referencedRelation: "test_submissions";
            referencedColumns: ["id"];
          },
        ];
      };
      test_options: {
        Row: {
          created_at: string;
          id: string;
          is_correct: boolean;
          label: string;
          position: number;
          question_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_correct?: boolean;
          label: string;
          position: number;
          question_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_correct?: boolean;
          label?: string;
          position?: number;
          question_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "test_options_question_id_fkey";
            columns: ["question_id"];
            isOneToOne: false;
            referencedRelation: "test_questions";
            referencedColumns: ["id"];
          },
        ];
      };
      test_questions: {
        Row: {
          created_at: string;
          id: string;
          points: number;
          position: number;
          prompt: string;
          test_id: string;
          type: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          points?: number;
          position: number;
          prompt: string;
          test_id: string;
          type: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          points?: number;
          position?: number;
          prompt?: string;
          test_id?: string;
          type?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "test_questions_test_id_fkey";
            columns: ["test_id"];
            isOneToOne: false;
            referencedRelation: "tests";
            referencedColumns: ["id"];
          },
        ];
      };
      test_submissions: {
        Row: {
          created_at: string;
          feedback: string | null;
          graded_at: string | null;
          id: string;
          max_score: number | null;
          score: number | null;
          status: string;
          student_id: string;
          submitted_at: string | null;
          teacher_id: string;
          test_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          feedback?: string | null;
          graded_at?: string | null;
          id?: string;
          max_score?: number | null;
          score?: number | null;
          status?: string;
          student_id: string;
          submitted_at?: string | null;
          teacher_id: string;
          test_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          feedback?: string | null;
          graded_at?: string | null;
          id?: string;
          max_score?: number | null;
          score?: number | null;
          status?: string;
          student_id?: string;
          submitted_at?: string | null;
          teacher_id?: string;
          test_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "test_submissions_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "test_submissions_test_id_fkey";
            columns: ["test_id"];
            isOneToOne: false;
            referencedRelation: "tests";
            referencedColumns: ["id"];
          },
        ];
      };
      tests: {
        Row: {
          class_name: string | null;
          created_at: string;
          due_date: string | null;
          grade: string | null;
          id: string;
          instructions: string;
          lesson_session_id: string | null;
          source_ai_generation_id: string | null;
          status: string;
          subject: string | null;
          teacher_id: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          class_name?: string | null;
          created_at?: string;
          due_date?: string | null;
          grade?: string | null;
          id?: string;
          instructions?: string;
          lesson_session_id?: string | null;
          source_ai_generation_id?: string | null;
          status?: string;
          subject?: string | null;
          teacher_id: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          class_name?: string | null;
          created_at?: string;
          due_date?: string | null;
          grade?: string | null;
          id?: string;
          instructions?: string;
          lesson_session_id?: string | null;
          source_ai_generation_id?: string | null;
          status?: string;
          subject?: string | null;
          teacher_id?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tests_lesson_session_id_fkey";
            columns: ["lesson_session_id"];
            isOneToOne: false;
            referencedRelation: "lesson_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tests_source_ai_generation_id_fkey";
            columns: ["source_ai_generation_id"];
            isOneToOne: false;
            referencedRelation: "ai_generations";
            referencedColumns: ["id"];
          },
        ];
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
      payment_methods_public: {
        Row: {
          id: string | null;
          name: string | null;
          provider: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      approve_distribution_snapshot: {
        Args: {
          p_items: Json;
          p_semester_plan_id: string;
          p_spreadsheet_id: string;
          p_worksheet_name: string;
        };
        Returns: Json;
      };
      approve_semester_plan: {
        Args: { p_plan_id: string };
        Returns: Database["public"]["Tables"]["semester_plans"]["Row"];
      };
      archive_semester_plan: {
        Args: { p_plan_id: string };
        Returns: Database["public"]["Tables"]["semester_plans"]["Row"];
      };
      capture_semester_plan_snapshot: {
        Args: { p_plan_id: string; p_version_id: string };
        Returns: Json;
      };
      complete_semester_plan: {
        Args: { p_plan_id: string };
        Returns: Database["public"]["Tables"]["semester_plans"]["Row"];
      };
      create_semester_plan_version: {
        Args: { p_plan_id: string };
        Returns: Database["public"]["Tables"]["semester_plans"]["Row"];
      };
      admin_set_user_role: {
        Args: {
          p_new_role: Database["public"]["Enums"]["app_role"];
          p_target_user_id: string;
        };
        Returns: undefined;
      };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      is_semester_plan_owner: {
        Args: { plan_id: string };
        Returns: boolean;
      };
      start_semester_plan_execution: {
        Args: { p_plan_id: string };
        Returns: Database["public"]["Tables"]["semester_plans"]["Row"];
      };
      is_p2e2e_test_email: {
        Args: { p_email: string };
        Returns: boolean;
      };
      is_p2e2e_test_user_id: {
        Args: { p_user_id: string };
        Returns: boolean;
      };
      p2e2e_teardown_active: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      save_curriculum_draft_atomic: {
        Args: {
          p_academic_year: string;
          p_file_id: string | null;
          p_grade: string;
          p_lessons: Json;
          p_original_name: string;
          p_semester: string;
          p_subject: string;
          p_user_id: string;
        };
        Returns: string;
      };
      teardown_p2e2e_test_user: {
        Args: { p_email: string };
        Returns: Json;
      };
      try_insert_coupon_redemption: {
        Args: {
          p_coupon_id: string;
          p_payment_id: string;
          p_user_id: string;
        };
        Returns: "inserted" | "existing" | "per_user_exhausted";
      };
    };
    Enums: {
      app_role: "admin" | "teacher";
      semester_plan_status: "draft" | "approved" | "in_progress" | "completed" | "archived";
      semester_plan_version_status: "draft" | "approved";
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
      semester_plan_status: ["draft", "approved", "in_progress", "completed", "archived"],
      semester_plan_version_status: ["draft", "approved"],
    },
  },
} as const;
