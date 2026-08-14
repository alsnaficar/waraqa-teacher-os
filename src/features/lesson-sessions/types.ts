export type LessonSessionStatus =
  "scheduled" | "preparing" | "prepared" | "completed" | "cancelled";

/**
 * Provenance of `curriculumLessonId`.
 * `plan` = DI-02 planner/timetable match; `manual` = teacher changeLesson override.
 */
export type CurriculumLessonSource = "plan" | "manual";

const CURRICULUM_LESSON_SOURCES: readonly CurriculumLessonSource[] = ["plan", "manual"];

/** Strict parser — invalid DB values must not silently default. */
export function toCurriculumLessonSource(value: string): CurriculumLessonSource {
  if ((CURRICULUM_LESSON_SOURCES as readonly string[]).includes(value)) {
    return value as CurriculumLessonSource;
  }
  throw new Error(`Invalid curriculum_lesson_source: ${value}`);
}

/**
 * One scheduled lesson for one teacher — the central entity of Waraqa.
 * Mirrors a `public.lesson_sessions` row in camelCase.
 */
export interface LessonSession {
  id: string;

  teacherId: string;

  academicYearId: string;

  semesterId: string;

  gradeId: string | null;

  classId: string | null;

  curriculumLessonId: string;

  curriculumLessonSource: CurriculumLessonSource;

  sessionDate: string;

  dayOfWeek: number;

  periodNumber: number;

  lessonLocked: boolean;

  status: LessonSessionStatus;

  preparedAt: string | null;

  completedAt: string | null;

  createdAt: string;

  updatedAt: string;
}

/**
 * A session joined with the descriptive fields the UI needs. The session row
 * only stores foreign keys, so titles and class labels are resolved from the
 * curriculum and the teacher timetable.
 */
export interface LessonSessionView extends LessonSession {
  lessonTitle: string;
  lessonObjectives: string | null;
  unitTitle: string | null;
  subject: string;
  grade: string;
  className: string;
  classroom: string | null;
  startsAt: string | null;
  endsAt: string | null;
}

/**
 * Why generation produced no sessions. These are all expected setup states, so
 * the UI can tell the teacher what to configure instead of showing an error.
 */
export type LessonSessionSkipReason =
  "unauthenticated" | "no-academic-year" | "no-timetable" | "no-curriculum" | "no-slots";

export const LESSON_SESSION_SKIP_MESSAGES: Record<LessonSessionSkipReason, string> = {
  unauthenticated: "يجب تسجيل الدخول لعرض حصص اليوم.",
  "no-academic-year":
    "لم يتم إعداد العام الدراسي والفصل الدراسي بعد. أضفهما من الإعدادات لإنشاء الحصص.",
  "no-timetable":
    "لا يوجد جدول حصص. أضف جدولك من الإعدادات، أو انتظر مزامنة مدرستي عبر المتصفح عند توفر المنصة.",
  "no-curriculum": "لا يوجد منهج منشور لهذه المادة والصف، لذلك تعذّر توزيع الدروس على الحصص.",
  "no-slots": "لا توجد حصص مجدولة في هذا اليوم.",
};

export interface LessonSessionGenerationResult {
  sessions: LessonSessionView[];
  created: number;
  skipped: LessonSessionSkipReason | null;
}

export class LessonSessionLockedError extends Error {
  constructor(message = "الدرس مقفل بعد التحضير. احذف التحضير أولاً لتتمكن من تغييره.") {
    super(message);
    this.name = "LessonSessionLockedError";
  }
}

/** Session is claimed for Prepare — conflicting lifecycle mutations are denied. */
export class LessonSessionPreparingError extends Error {
  readonly code = "PREPARING" as const;

  constructor(message = "الحصة قيد التحضير حالياً. انتظر انتهاء التوليد أو ألغِ التحضير أولاً.") {
    super(message);
    this.name = "LessonSessionPreparingError";
  }
}
