import {
  LessonSessionService,
  todayIso,
} from "@/features/lesson-sessions/services/lesson-session.service";

export interface LessonContext {
  lessonId: string | null;
  title: string;
  subject: string;
  grade: string;
  className: string;
  unit: string;
  suggestedDate: string;
  period: number;
}

/**
 * Current-lesson context for AI form prefills.
 * Resolves via ensureSessionsForDate (session truth + P2), not planner generateSchedule.
 */
export async function getLessonContext(): Promise<LessonContext | null> {
  const result = await LessonSessionService.ensureSessionsForDate(todayIso());
  const session = result.sessions[0];

  if (!session) {
    return null;
  }

  return {
    lessonId: session.curriculumLessonId,
    title: session.lessonTitle,
    subject: session.subject,
    grade: session.grade,
    className: session.className,
    unit: session.unitTitle ?? "",
    suggestedDate: session.sessionDate,
    period: session.periodNumber,
  };
}
