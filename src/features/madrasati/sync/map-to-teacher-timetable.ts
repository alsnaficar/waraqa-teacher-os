import type { MadrasatiTimetableEntry } from "../provider/models.ts";
import type { TeacherTimetableEntry } from "../../teacher-timetable/types.ts";

export type TeacherTimetableDraft = Omit<
  TeacherTimetableEntry,
  "id" | "teacherId" | "createdAt" | "updatedAt"
>;

/**
 * Maps normalized Madrasati timetable rows to TeacherTimetableService.saveTimetable drafts.
 *
 * teacher_timetable has no academic_year_id / semester_id — weekly slot identity is
 * (teacher_id, day_of_week, period) enforced by the writer + DB unique index.
 */
export function mapMadrasatiTimetableToTeacherDrafts(
  rows: readonly MadrasatiTimetableEntry[],
): TeacherTimetableDraft[] {
  return rows.map((row) => ({
    dayOfWeek: row.dayOfWeek,
    period: row.period,
    subject: row.subject,
    grade: row.grade,
    className: row.className,
    classroom: row.classroom,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    active: true,
  }));
}
