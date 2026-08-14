import type { SupabaseUserContext } from "@/platform/database/supabase/context";

/** Generic failure — do not leak lesson existence, ownership, or publish state. */
export class LessonCurriculumAuthorizationError extends Error {
  constructor(message = "الدرس المحدد غير متاح لهذه الحصة.") {
    super(message);
    this.name = "LessonCurriculumAuthorizationError";
  }
}

export type PublishedCurriculumLessonOption = {
  id: string;
  title: string;
  objectives: string | null;
  notes: string | null;
  order_index: number;
};

/**
 * Canonical published curriculum file for a timetable grade + subject.
 * Matches getLessonOptions: newest published file, limit 1.
 */
export async function resolvePublishedCurriculumFileId(
  context: SupabaseUserContext,
  grade: string,
  subject: string,
): Promise<string | null> {
  const { data: files, error } = await context.client
    .from("curriculum_files")
    .select("id")
    .eq("grade", grade)
    .eq("subject", subject)
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) throw error;

  return files?.[0]?.id ?? null;
}

export async function listPublishedCurriculumLessons(
  context: SupabaseUserContext,
  fileId: string,
): Promise<PublishedCurriculumLessonOption[]> {
  const { data: lessons, error } = await context.client
    .from("curriculum_lessons")
    .select("id, title, objectives, notes, order_index")
    .eq("curriculum_file_id", fileId)
    .order("order_index", { ascending: true });

  if (error) throw error;

  return lessons ?? [];
}

/**
 * Server-side curriculum authorization for lesson-session changes.
 * FK existence alone is not sufficient — lesson must belong to the allowed
 * published file for the session's timetable grade + subject.
 */
export async function assertCurriculumLessonAuthorized(
  context: SupabaseUserContext,
  params: { grade: string; subject: string; curriculumLessonId: string },
): Promise<void> {
  const fileId = await resolvePublishedCurriculumFileId(
    context,
    params.grade,
    params.subject,
  );

  if (!fileId) {
    throw new LessonCurriculumAuthorizationError();
  }

  const { data, error } = await context.client
    .from("curriculum_lessons")
    .select("id")
    .eq("id", params.curriculumLessonId)
    .eq("curriculum_file_id", fileId)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    throw new LessonCurriculumAuthorizationError();
  }
}
