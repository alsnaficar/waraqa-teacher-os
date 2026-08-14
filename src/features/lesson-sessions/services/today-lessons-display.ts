import type { LessonSessionView } from "../types";

/** Display row for dashboard "today" cards. Prefer session-backed rows. */
export type TodayLessonDisplay = {
  id: string;
  period: number;
  grade: string;
  klass: string;
  lessonTitle: string;
  subject: string;
  lessonSessionId?: string;
  status?: string;
  lessonLocked?: boolean;
  curriculumLessonId?: string;
  curriculumLessonSource?: "plan" | "manual";
};

export type TimetableSlotForTodayDisplay = {
  id: string;
  dayOfWeek: number;
  period: number;
  grade: string;
  className: string;
  subject: string;
  active: boolean;
};

/**
 * Resolves today's visible lessons for the dashboard.
 * Sessions (ensured for the date) are authoritative; timetable is display-only
 * fallback when no sessions exist yet; mock is last-resort onboarding.
 */
export function resolveTodayLessonDisplay(input: {
  sessions: readonly LessonSessionView[];
  timetableSlots: readonly TimetableSlotForTodayDisplay[];
  todayDayOfWeek: number;
  mockFallback?: readonly TodayLessonDisplay[];
}): TodayLessonDisplay[] {
  if (input.sessions.length > 0) {
    return [...input.sessions]
      .sort((a, b) => a.periodNumber - b.periodNumber)
      .map((session) => ({
        id: session.id,
        period: session.periodNumber,
        grade: session.grade,
        klass: session.className,
        lessonTitle: session.lessonTitle,
        subject: session.subject,
        lessonSessionId: session.id,
        status: session.status,
        lessonLocked: session.lessonLocked,
        curriculumLessonId: session.curriculumLessonId,
        curriculumLessonSource: session.curriculumLessonSource,
      }));
  }

  const timetableToday = input.timetableSlots
    .filter((entry) => entry.dayOfWeek === input.todayDayOfWeek && entry.active)
    .sort((a, b) => a.period - b.period)
    .map((entry) => ({
      id: entry.id,
      period: entry.period,
      grade: entry.grade,
      klass: entry.className,
      lessonTitle: entry.subject,
      subject: entry.subject,
    }));

  if (timetableToday.length > 0) return timetableToday;

  return input.mockFallback ? [...input.mockFallback] : [];
}
