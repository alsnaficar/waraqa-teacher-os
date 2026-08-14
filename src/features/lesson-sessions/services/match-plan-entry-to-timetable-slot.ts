import type { CalculatedLessonEntry } from "@/features/planner/services/planner-engine";
import type { TeacherTimetableEntry } from "@/features/teacher-timetable/types";

export type PlanEntryForTimetableMatch = CalculatedLessonEntry & { grade?: string };

/** Trim-only normalization — matches Madrasati timetable conventions. */
export function normalizePlanMatchText(value: string | undefined | null): string {
  return typeof value === "string" ? value.trim() : "";
}

export type TimetableSlotForPlanMatch = Pick<
  TeacherTimetableEntry,
  "dayOfWeek" | "period" | "subject" | "grade" | "className"
>;

function entryMatchesTimetableSlot(
  entry: PlanEntryForTimetableMatch,
  slot: TimetableSlotForPlanMatch,
  dayOfWeek: number,
): boolean {
  if (entry.dayOfWeek !== dayOfWeek) return false;
  if (entry.period !== slot.period) return false;

  const slotSubject = normalizePlanMatchText(slot.subject);
  const entrySubject = normalizePlanMatchText(entry.subject);
  if (slotSubject !== entrySubject) return false;

  const slotClass = normalizePlanMatchText(slot.className);
  const entryClass = normalizePlanMatchText(entry.className);
  if (slotClass !== entryClass) return false;

  const slotGrade = normalizePlanMatchText(slot.grade);
  const entryGrade = normalizePlanMatchText(entry.grade);
  if (slotGrade && entryGrade && slotGrade !== entryGrade) return false;

  return true;
}

/**
 * Binds one planner row to a timetable slot when the match is exact and unambiguous.
 * Returns null when zero or multiple candidates remain (fail-safe — no arbitrary .find()).
 */
export function matchPlanEntryToTimetableSlot(
  slot: TimetableSlotForPlanMatch,
  entries: readonly PlanEntryForTimetableMatch[],
  dayOfWeek: number,
): PlanEntryForTimetableMatch | null {
  const candidates = entries.filter(
    (entry) => entry.lessonId && entryMatchesTimetableSlot(entry, slot, dayOfWeek),
  );

  if (candidates.length !== 1) return null;

  return candidates[0] ?? null;
}
