import type { SupabaseUserContext } from "@/platform/database/supabase/context";
import type { LessonSession } from "../types";
import { LessonSessionService } from "./lesson-session.service";

export class LessonSessionBindingError extends Error {
  readonly code: "MISSING" | "INVALID" | "NOT_FOUND";

  constructor(code: LessonSessionBindingError["code"], message: string) {
    super(message);
    this.name = "LessonSessionBindingError";
    this.code = code;
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Server-side Session Binding Contract.
 *
 * Lesson Session is the authority: never trust client-supplied teacher_id or
 * curriculum_lesson_id as the binding identity.
 */
export async function requireOwnedLessonSession(
  lessonSessionId: string | null | undefined,
  context: SupabaseUserContext,
): Promise<LessonSession> {
  if (lessonSessionId == null || String(lessonSessionId).trim() === "") {
    throw new LessonSessionBindingError(
      "MISSING",
      "lessonSessionId مطلوب — يجب ربط التوليد بحصة درس صالحة.",
    );
  }

  const id = String(lessonSessionId).trim();
  if (!UUID_RE.test(id)) {
    throw new LessonSessionBindingError("INVALID", "معرف حصة الدرس غير صالح.");
  }

  const session = await LessonSessionService.getSessionById(id, context);
  if (!session) {
    // Ownership miss and missing row look the same — do not leak existence.
    throw new LessonSessionBindingError(
      "NOT_FOUND",
      "حصة الدرس غير موجودة أو غير مصرح بالوصول إليها.",
    );
  }

  if (session.teacherId !== context.userId) {
    throw new LessonSessionBindingError(
      "NOT_FOUND",
      "حصة الدرس غير موجودة أو غير مصرح بالوصول إليها.",
    );
  }

  if (!session.curriculumLessonId) {
    throw new LessonSessionBindingError("INVALID", "حصة الدرس لا تحتوي على درس منهجي مرتبط.");
  }

  return session;
}

export type SessionCurriculumLesson = {
  id: string;
  title: string;
  objectives: string | null;
  notes: string | null;
};

/**
 * Resolve curriculum content from the owned session's curriculum_lesson_id.
 * Does not accept a client-supplied curriculum lesson id.
 */
export async function loadCurriculumLessonForSession(
  session: LessonSession,
  context: SupabaseUserContext,
): Promise<SessionCurriculumLesson | null> {
  const { data, error } = await context.client
    .from("curriculum_lessons")
    .select("id, title, objectives, notes")
    .eq("id", session.curriculumLessonId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    id: data.id,
    title: data.title,
    objectives: data.objectives,
    notes: data.notes,
  };
}
