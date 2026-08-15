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

export function publishedCurriculumScopeKey(grade: string, subject: string): string {
  return `${grade.trim()}\0${subject.trim()}`;
}

/**
 * Canonical published curriculum file for a timetable grade + subject.
 * Matches getLessonOptions: newest published file, limit 1.
 */
export async function resolvePublishedCurriculumFileId(
  context: SupabaseUserContext,
  grade: string,
  subject: string,
): Promise<string | null> {
  const byScope = await resolvePublishedCurriculumFileIdsByScope(context, [{ grade, subject }]);
  return byScope.get(publishedCurriculumScopeKey(grade, subject)) ?? null;
}

/**
 * Newest published curriculum file per (grade, subject), in one catalog read.
 * Extra files for other subjects of the same grades are discarded in memory.
 */
export async function resolvePublishedCurriculumFileIdsByScope(
  context: SupabaseUserContext,
  scopes: ReadonlyArray<{ grade: string; subject: string }>,
): Promise<Map<string, string>> {
  const uniqueScopes = new Map<string, { grade: string; subject: string }>();

  for (const scope of scopes) {
    const grade = scope.grade.trim();
    const subject = scope.subject.trim();
    if (!grade || !subject) continue;
    uniqueScopes.set(publishedCurriculumScopeKey(grade, subject), { grade, subject });
  }

  if (uniqueScopes.size === 0) {
    return new Map();
  }

  const grades = [...new Set([...uniqueScopes.values()].map((scope) => scope.grade))];

  const { data: files, error } = await context.client
    .from("curriculum_files")
    .select("id, grade, subject, created_at")
    .eq("status", "published")
    .in("grade", grades);

  if (error) throw error;

  const newestByScope = new Map<string, { id: string; createdAt: string }>();

  for (const file of files ?? []) {
    const grade = (file.grade ?? "").trim();
    const subject = (file.subject ?? "").trim();
    const key = publishedCurriculumScopeKey(grade, subject);
    if (!uniqueScopes.has(key)) continue;

    const previous = newestByScope.get(key);
    if (!previous || file.created_at > previous.createdAt) {
      newestByScope.set(key, { id: file.id, createdAt: file.created_at });
    }
  }

  return new Map([...newestByScope].map(([key, value]) => [key, value.id]));
}

export async function listPublishedCurriculumLessons(
  context: SupabaseUserContext,
  fileId: string,
): Promise<PublishedCurriculumLessonOption[]> {
  const byFileId = await listPublishedCurriculumLessonsByFileIds(context, [fileId]);
  return byFileId.get(fileId) ?? [];
}

/**
 * Published lesson catalogs for several curriculum files, in one read.
 * Each file's lessons are sorted by order_index, matching the single-file helper.
 */
export async function listPublishedCurriculumLessonsByFileIds(
  context: SupabaseUserContext,
  fileIds: readonly string[],
): Promise<Map<string, PublishedCurriculumLessonOption[]>> {
  const uniqueFileIds = [...new Set(fileIds.filter(Boolean))];
  const lessonsByFileId = new Map<string, PublishedCurriculumLessonOption[]>();

  for (const fileId of uniqueFileIds) {
    lessonsByFileId.set(fileId, []);
  }

  if (uniqueFileIds.length === 0) {
    return lessonsByFileId;
  }

  const { data: lessons, error } = await context.client
    .from("curriculum_lessons")
    .select("id, title, objectives, notes, order_index, curriculum_file_id")
    .in("curriculum_file_id", uniqueFileIds);

  if (error) throw error;

  for (const lesson of lessons ?? []) {
    if (!lesson.curriculum_file_id) continue;
    const list = lessonsByFileId.get(lesson.curriculum_file_id);
    if (!list) continue;

    list.push({
      id: lesson.id,
      title: lesson.title,
      objectives: lesson.objectives,
      notes: lesson.notes,
      order_index: lesson.order_index,
    });
  }

  for (const list of lessonsByFileId.values()) {
    list.sort((a, b) => a.order_index - b.order_index);
  }

  return lessonsByFileId;
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
