import type { CalculatedLessonEntry } from "@/features/planner/services/planner-engine";
import type { PlanEntryForTimetableMatch } from "./match-plan-entry-to-timetable-slot";
import type { TeacherTimetableEntry } from "@/features/teacher-timetable/types";
import type { Database } from "@/platform/database/supabase/types";

import { matchPlanEntryToTimetableSlot } from "./match-plan-entry-to-timetable-slot";

type SessionInsert = Database["public"]["Tables"]["lesson_sessions"]["Insert"];

export type TimetableSlotForSessionInsert = Pick<
  TeacherTimetableEntry,
  "dayOfWeek" | "period" | "subject" | "grade" | "className"
>;

export type BuildSessionInsertsInput = {
  slots: readonly TimetableSlotForSessionInsert[];
  plannedForDate: readonly PlanEntryForTimetableMatch[];
  dayOfWeek: number;
  sessionDate: string;
  teacherId: string;
  academicYearId: string;
  semesterId: string;
  takenPeriods: ReadonlySet<number>;
  gradeIdByName: ReadonlyMap<string, string>;
  classIdByName: ReadonlyMap<string, string>;
};

/**
 * Builds lesson_session insert rows for timetable slots with slot-aware plan matching.
 * Skips periods already taken and slots with zero or ambiguous plan matches.
 */
export function buildSessionInsertsForTimetableSlots(
  input: BuildSessionInsertsInput,
): SessionInsert[] {
  const rows: SessionInsert[] = [];

  for (const slot of input.slots) {
    if (input.takenPeriods.has(slot.period)) continue;

    const planned = matchPlanEntryToTimetableSlot(
      slot,
      input.plannedForDate,
      input.dayOfWeek,
    );

    if (!planned?.lessonId) continue;

    rows.push({
      teacher_id: input.teacherId,
      academic_year_id: input.academicYearId,
      semester_id: input.semesterId,
      grade_id: input.gradeIdByName.get(slot.grade) ?? null,
      class_id: input.classIdByName.get(slot.className) ?? null,
      curriculum_lesson_id: planned.lessonId,
      curriculum_lesson_source: "plan",
      session_date: input.sessionDate,
      day_of_week: input.dayOfWeek,
      period_number: slot.period,
      lesson_locked: false,
      status: "scheduled",
    });
  }

  return rows;
}
