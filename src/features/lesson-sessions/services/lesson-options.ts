import { TeacherTimetableService } from "@/features/teacher-timetable/services/teacher-timetable.service";
import type { SupabaseUserContext } from "@/platform/database/supabase/context";

import {
  listPublishedCurriculumLessonsByFileIds,
  publishedCurriculumScopeKey,
  resolvePublishedCurriculumFileIdsByScope,
  type PublishedCurriculumLessonOption,
} from "./lesson-curriculum-authorization";
import { LessonSessionService } from "./lesson-session.service";

export type LessonOptionsForSession = {
  lessons: PublishedCurriculumLessonOption[];
  selectedLessonId: string;
};

/**
 * Shared lesson-options loader for one or many owned sessions.
 *
 * One owned-session read, one timetable read, one published-file catalog read
 * for the required (grade, subject) scopes, and one curriculum-lesson read for
 * the distinct published files. Options are mapped in memory.
 *
 * Options are mapped in memory. This path never generates or ensures sessions.
 */
export async function loadLessonOptionsForOwnedSessions(
  lessonSessionIds: readonly string[],
  context: SupabaseUserContext,
): Promise<Record<string, LessonOptionsForSession>> {
  const uniqueIds = [...new Set(lessonSessionIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    return {};
  }

  const sessions = await LessonSessionService.getOwnedSessionsByIds(uniqueIds, context);
  if (sessions.length === 0) {
    return {};
  }

  const timetable = await TeacherTimetableService.getTimetable(context);

  const sessionScopes = sessions.map((session) => {
    const slot = timetable.find(
      (entry) => entry.dayOfWeek === session.dayOfWeek && entry.period === session.periodNumber,
    );

    return {
      session,
      grade: slot?.grade ?? "",
      subject: slot?.subject ?? "",
    };
  });

  const fileIdByScope = await resolvePublishedCurriculumFileIdsByScope(
    context,
    sessionScopes.map(({ grade, subject }) => ({ grade, subject })),
  );

  const fileIds = [...new Set([...fileIdByScope.values()])];
  const lessonsByFileId = await listPublishedCurriculumLessonsByFileIds(context, fileIds);

  const optionsBySessionId: Record<string, LessonOptionsForSession> = {};

  for (const { session, grade, subject } of sessionScopes) {
    const fileId = fileIdByScope.get(publishedCurriculumScopeKey(grade, subject));
    const lessons = fileId ? (lessonsByFileId.get(fileId) ?? []) : [];

    optionsBySessionId[session.id] = {
      lessons,
      selectedLessonId: session.curriculumLessonId,
    };
  }

  return optionsBySessionId;
}
