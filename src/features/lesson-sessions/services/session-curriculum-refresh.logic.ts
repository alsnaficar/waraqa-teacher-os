import type { CurriculumLessonSource } from "../types";
import type { PlanEntryForTimetableMatch } from "./match-plan-entry-to-timetable-slot";
import type { TimetableSlotForPlanMatch } from "./match-plan-entry-to-timetable-slot";
import { matchPlanEntryToTimetableSlot } from "./match-plan-entry-to-timetable-slot";

export type SessionForCurriculumRefresh = {
  id: string;
  status: string;
  lessonLocked: boolean;
  curriculumLessonId: string;
  curriculumLessonSource: CurriculumLessonSource;
  dayOfWeek: number;
  periodNumber: number;
};

export type CurriculumRefreshMatch = {
  sessionId: string;
  curriculumLessonId: string;
  grade: string;
  subject: string;
};

/**
 * Collects authoritative plan matches for scheduled/unlocked/plan-sourced sessions.
 * Zero or ambiguous DI-02 matches are skipped (fail-safe).
 * Does not authorize — caller must run SEC-02 before UPDATE.
 */
export function collectUnlockedSessionCurriculumRefreshMatches(input: {
  sessions: readonly SessionForCurriculumRefresh[];
  slots: readonly TimetableSlotForPlanMatch[];
  plannedForDate: readonly PlanEntryForTimetableMatch[];
  dayOfWeek: number;
}): CurriculumRefreshMatch[] {
  const slotByPeriod = new Map(input.slots.map((slot) => [slot.period, slot]));
  const matches: CurriculumRefreshMatch[] = [];

  for (const session of input.sessions) {
    if (session.status !== "scheduled" || session.lessonLocked) continue;
    if (session.curriculumLessonSource !== "plan") continue;

    const slot = slotByPeriod.get(session.periodNumber);
    if (!slot) continue;
    if (slot.dayOfWeek !== session.dayOfWeek) continue;

    const planned = matchPlanEntryToTimetableSlot(
      slot,
      input.plannedForDate,
      input.dayOfWeek,
    );

    if (!planned?.lessonId) continue;
    if (planned.lessonId === session.curriculumLessonId) continue;

    matches.push({
      sessionId: session.id,
      curriculumLessonId: planned.lessonId,
      grade: slot.grade,
      subject: slot.subject,
    });
  }

  return matches;
}
