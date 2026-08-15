import type { CatalogClass, CatalogGrade } from "@/features/lesson-sessions/services/resolve-grade-class.logic";
import {
  filterClassesByGradeId,
  normalizeCatalogName,
  resolveOwnedGradeClassIds,
} from "@/features/lesson-sessions/services/resolve-grade-class.logic";

import type { TeacherTimetableEntry } from "../types";

export type TimetableSlotFormState = {
  dayOfWeek: number;
  period: number;
  subject: string;
  grade: string;
  className: string;
  /** Catalog IDs when selected from owned grade/class lists. */
  gradeId: string;
  classId: string;
  classroom: string;
  startsAt: string;
  endsAt: string;
};

export function emptyTimetableSlotForm(
  overrides: Partial<TimetableSlotFormState> = {},
): TimetableSlotFormState {
  return {
    dayOfWeek: 0,
    period: 1,
    subject: "",
    grade: "",
    className: "",
    gradeId: "",
    classId: "",
    classroom: "",
    startsAt: "",
    endsAt: "",
    ...overrides,
  };
}

/**
 * Hydrate form from a timetable entry, resolving catalog IDs when names match uniquely.
 */
export function timetableEntryToFormState(
  entry: TeacherTimetableEntry,
  grades: ReadonlyArray<CatalogGrade> = [],
  classes: ReadonlyArray<CatalogClass> = [],
): TimetableSlotFormState {
  const resolved = resolveOwnedGradeClassIds({
    gradeName: entry.grade,
    className: entry.className,
    grades,
    classes,
  });

  const gradeId =
    resolved.status === "resolved" && resolved.gradeId ? resolved.gradeId : "";
  const classId =
    resolved.status === "resolved" && resolved.classId ? resolved.classId : "";

  return emptyTimetableSlotForm({
    dayOfWeek: entry.dayOfWeek,
    period: entry.period,
    subject: entry.subject,
    grade: entry.grade,
    className: entry.className,
    gradeId,
    classId,
    classroom: entry.classroom ?? "",
    startsAt: entry.startsAt ?? "",
    endsAt: entry.endsAt ?? "",
  });
}

export function applyGradeSelection(
  form: TimetableSlotFormState,
  gradeId: string,
  grades: ReadonlyArray<CatalogGrade>,
  classes: ReadonlyArray<CatalogClass>,
): TimetableSlotFormState {
  const grade = grades.find((item) => item.id === gradeId);
  const nextGradeName = grade?.name ?? "";
  const currentClass = classes.find((item) => item.id === form.classId);
  const classStillValid =
    Boolean(currentClass) &&
    (!gradeId || !currentClass?.gradeId || currentClass.gradeId === gradeId);

  return {
    ...form,
    gradeId,
    grade: nextGradeName,
    classId: classStillValid ? form.classId : "",
    className: classStillValid ? form.className : "",
  };
}

export function applyClassSelection(
  form: TimetableSlotFormState,
  classId: string,
  grades: ReadonlyArray<CatalogGrade>,
  classes: ReadonlyArray<CatalogClass>,
): TimetableSlotFormState {
  const klass = classes.find((item) => item.id === classId);
  if (!klass) {
    return { ...form, classId: "", className: "" };
  }

  const gradeId = klass.gradeId ?? form.gradeId;
  const grade = gradeId ? grades.find((item) => item.id === gradeId) : null;

  return {
    ...form,
    classId: klass.id,
    className: klass.name,
    gradeId: grade?.id ?? form.gradeId,
    grade: grade?.name ?? form.grade,
  };
}

export function classesForSelectedGrade(
  classes: ReadonlyArray<CatalogClass>,
  gradeId: string,
): CatalogClass[] {
  return filterClassesByGradeId(classes, gradeId || null);
}

export function assertNoClientTeacherId(payload: Record<string, unknown>): void {
  if ("teacherId" in payload || "teacher_id" in payload) {
    throw new Error("teacher_id must not be supplied by the client.");
  }
}

export function formHasRequiredGradeClass(form: TimetableSlotFormState): boolean {
  return Boolean(normalizeCatalogName(form.grade) && normalizeCatalogName(form.className));
}
