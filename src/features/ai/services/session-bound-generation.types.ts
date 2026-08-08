import type { SupabaseClient } from "@supabase/supabase-js";

import type { AiGenerationKind } from "@/features/ai/services/persistence.server";
import type { SupabaseUserContext } from "@/platform/database/supabase/context";
import type { LessonSession } from "@/features/lesson-sessions/types";
import type { SessionCurriculumLesson } from "@/features/lesson-sessions/services/require-owned-lesson-session";

/** Canonical generation kinds for the unified session-bound pipeline. */
export type GenerationType = AiGenerationKind;

/**
 * Common request identity for all product generations.
 * Binding authority is lessonSessionId only — options are display/params.
 */
export type GenerateRequest<TOptions = Record<string, unknown>> = {
  lessonSessionId: string;
  type: GenerationType;
  options?: TOptions;
};

export type SessionBoundTimetableEntry = {
  id: string;
  teacherId: string;
  dayOfWeek: number;
  period: number;
  subject: string;
  grade: string;
  className: string;
  classroom?: string;
  startsAt?: string;
  endsAt?: string;
  active: boolean;
};

export type SessionBoundGenerationContext = {
  session: LessonSession;
  curriculumLesson: SessionCurriculumLesson | null;
  timetableEntry: SessionBoundTimetableEntry | null;
  auth: SupabaseUserContext;
  supabase: SupabaseClient;
  userId: string;
};

/** Result produced by a kind-specific strategy before persistence. */
export type GenerationExecuteResult = {
  content: string | Record<string, unknown>;
  model: string;
  prompt: string;
  /** Kind-specific inputs stored in ai_generations.output.input */
  input: Record<string, unknown>;
  curriculumContextUsed?: boolean;
  extraOutput?: Record<string, unknown>;
};

export type GenerationResult = {
  id: string;
  content: string | Record<string, unknown>;
  createdAt: string;
  lessonSessionId: string;
  curriculumLessonId: string;
};
