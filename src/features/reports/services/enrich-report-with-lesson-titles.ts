import { resolveUserContext, type SupabaseUserContext } from "@/platform/database/supabase/context";

import type { LessonSessionReport, ReportLessonSessionRow } from "./reports.service";

export type ReportSessionWithTitle = ReportLessonSessionRow & {
  lessonTitle: string;
};

export type LessonSessionReportView = Omit<LessonSessionReport, "sessions"> & {
  sessions: ReportSessionWithTitle[];
};

const UNKNOWN_LESSON_TITLE = "درس غير معروف";

/**
 * Read-only enrichment: resolve curriculum lesson titles for report rows.
 * Scoped through authenticated context; does not accept client teacher_id.
 * Only loads lessons referenced by the already teacher-scoped report sessions.
 */
export async function enrichReportWithLessonTitles(
  report: LessonSessionReport,
  context?: SupabaseUserContext,
): Promise<LessonSessionReportView> {
  if (report.sessions.length === 0) {
    return { ...report, sessions: [] };
  }

  const resolved = await resolveUserContext(context);
  if (!resolved) {
    return {
      ...report,
      sessions: report.sessions.map((session) => ({
        ...session,
        lessonTitle: UNKNOWN_LESSON_TITLE,
      })),
    };
  }

  const lessonIds = [...new Set(report.sessions.map((session) => session.curriculumLessonId))];

  const { data, error } = await resolved.client
    .from("curriculum_lessons")
    .select("id, title")
    .in("id", lessonIds);

  if (error) throw error;

  const titleById = new Map((data ?? []).map((lesson) => [lesson.id, lesson.title]));

  return {
    ...report,
    sessions: report.sessions.map((session) => ({
      ...session,
      lessonTitle: titleById.get(session.curriculumLessonId) ?? UNKNOWN_LESSON_TITLE,
    })),
  };
}
