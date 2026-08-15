import type { CalculatedLessonEntry } from "@/features/planner/services/planner-engine";
import type { PlanEntryForTimetableMatch } from "./match-plan-entry-to-timetable-slot";
import type { TeacherTimetableEntry } from "@/features/teacher-timetable/types";
import type { Database } from "@/platform/database/supabase/types";

import { matchPlanEntryToTimetableSlot } from "./match-plan-entry-to-timetable-slot";
import {
  resolveOwnedGradeClassIds,
  type CatalogClass,
  type CatalogGrade,
} from "./resolve-grade-class.logic";

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
  /** Teacher-owned catalog used for unambiguous name → ID resolution. */
  grades: ReadonlyArray<CatalogGrade>;
  classes: ReadonlyArray<CatalogClass>;
};

/**
 * Builds lesson_session insert rows for timetable slots with slot-aware plan matching.
 * Skips periods already taken and slots with zero or ambiguous plan matches.
 * Grade/class IDs are set only when catalog resolution is unambiguous and owned.
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

    const resolved = resolveOwnedGradeClassIds({
      gradeName: slot.grade,
      className: slot.className,
      grades: input.grades,
      classes: input.classes,
    });

    const gradeId =
      resolved.status === "resolved" || resolved.status === "unresolved"
        ? resolved.gradeId
        : null;
    const classId =
      resolved.status === "resolved" || resolved.status === "unresolved"
        ? resolved.classId
        : null;

    // ambiguous / mismatch / foreign → leave nulls (do not guess)
    const safeGradeId =
      resolved.status === "ambiguous" ||
      resolved.status === "mismatch" ||
      resolved.status === "foreign"
        ? null
        : gradeId;
    const safeClassId =
      resolved.status === "ambiguous" ||
      resolved.status === "mismatch" ||
      resolved.status === "foreign"
        ? null
        : classId;

    rows.push({
      teacher_id: input.teacherId,
      academic_year_id: input.academicYearId,
      semester_id: input.semesterId,
      grade_id: safeGradeId,
      class_id: safeClassId,
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
