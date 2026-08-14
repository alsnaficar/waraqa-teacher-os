import type {
  CalendarAcademicYear,
  CalendarTerm,
} from "@/features/calendar/services/calendar.service";
import {
  resolveCalendar,
  resolveCalendarForPlan,
  type ResolvedCalendar,
} from "@/features/calendar/services/resolve-calendar";
import { resolveUserContext, type SupabaseUserContext } from "@/platform/database/supabase/context";
import { deserializeLessonNotes } from "@/platform/curriculum/curriculum-management.functions";
import { TeacherTimetableService } from "@/features/teacher-timetable/services/teacher-timetable.service";
import {
  resolveDistributionScheduleLessons,
  type ScheduleSourceLesson,
} from "./distribution-schedule-source";

function createPlannerId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export interface AcademicCalendarConfig {
  academicYear: string;
  semesterId: string;
  semesterStart: string; // YYYY-MM-DD
  semesterEnd: string; // YYYY-MM-DD
  teachingWeeksCount: number;
  periodsPerDay: number;
  workingDays: number[]; // e.g. [0, 1, 2, 3, 4] for Sun-Thu
  holidays: Array<{ date: string; label: string }>;
  examWeeks: number[]; // Week numbers when exams are held, e.g. [14, 15]
}

export interface TimetableSlot {
  dayOfWeek: number; // 0 = Sunday, 1 = Monday, etc.
  period: number; // 1-based period number
  className: string; // e.g., "5-أ" or "1/أ"
  subject?: string;
  grade?: string;
}

export type OverrideType = "skip" | "swap" | "move" | "insert";

export interface ScheduleOverride {
  id: string;
  type: OverrideType;
  lessonId?: string; // ID of the curriculum_lessons entry
  lessonIdA?: string; // For swaps
  lessonIdB?: string; // For swaps
  targetDate?: string; // For move / insert (YYYY-MM-DD)
  targetPeriod?: number; // For move / insert
  customTitle?: string; // For insert
  customUnit?: string; // For insert
  periodsCount?: number; // For insert
}

export interface CalculatedLessonEntry {
  id: string; // unique ID
  academicYear: string;
  semester: string;
  weekNumber: number; // overall academic week
  teachingWeek: number; // week excluding holidays/exams
  suggestedDate: string; // YYYY-MM-DD
  dayOfWeek: number;
  period: number;
  unit: string;
  lessonId: string | null; // null for custom inserts
  lessonTitle: string;
  lessonOrder: number;
  periodsCount: number;
  remainingPeriods: number;
  status: "Upcoming" | "Current" | "Completed" | "Skipped";
  className: string;
  subject: string;
  /** General objectives — sourced from curriculum_lessons, not duplicated. */
  objectives: string;
  /** Teaching resources / activities from curriculum notes JSON. */
  teachingResources: string;
  /** Assessment methods from curriculum notes JSON. */
  assessmentMethods: string;
  /** Free-form curriculum notes carried into the plan row. */
  planNotes: string;
  /**
   * Distribution snapshot that generated this operational row.
   * Null for legacy curriculum-generated plans. Persisted in planner_entries.notes.
   */
  distributionSnapshotId?: string | null;
}

// Fallback / default configs to ensure zero-cold-start
export const CONFIG_ACADEMIC_CALENDAR_DATE = "1970-01-01";
export const CONFIG_SCHEDULE_OVERRIDES_DATE = "1970-01-02";

/** Normalises a row that may predate pedagogical fields on the Semester Plan JSON. */
export function normalisePlanEntry(
  raw: Partial<CalculatedLessonEntry> & { id?: string },
): CalculatedLessonEntry | null {
  if (!raw?.suggestedDate || raw.period == null) return null;

  return {
    id: raw.id ?? `${raw.lessonId ?? "row"}-${raw.suggestedDate}-${raw.period}`,
    academicYear: raw.academicYear ?? "",
    semester: raw.semester ?? "",
    weekNumber: raw.weekNumber ?? 0,
    teachingWeek: raw.teachingWeek ?? raw.weekNumber ?? 0,
    suggestedDate: raw.suggestedDate,
    dayOfWeek: raw.dayOfWeek ?? 0,
    period: raw.period,
    unit: raw.unit ?? "",
    lessonId: raw.lessonId ?? null,
    lessonTitle: raw.lessonTitle ?? "",
    lessonOrder: raw.lessonOrder ?? 0,
    periodsCount: raw.periodsCount ?? 1,
    remainingPeriods: raw.remainingPeriods ?? 0,
    status: raw.status ?? "Upcoming",
    className: raw.className ?? "",
    subject: raw.subject ?? "",
    objectives: raw.objectives ?? "",
    teachingResources: raw.teachingResources ?? "",
    assessmentMethods: raw.assessmentMethods ?? "",
    planNotes: raw.planNotes ?? "",
    distributionSnapshotId: raw.distributionSnapshotId ?? null,
  };
}

/** Legacy fixture kept for tests and identity checks — not a generation success path. */
export const DEFAULT_CALENDAR: AcademicCalendarConfig = {
  academicYear: "1447",
  semesterId: "s1",
  semesterStart: "2026-08-30",
  semesterEnd: "2026-12-10",
  teachingWeeksCount: 15,
  periodsPerDay: 7,
  workingDays: [0, 1, 2, 3, 4], // Sun, Mon, Tue, Wed, Thu
  holidays: [
    { date: "2026-09-23", label: "اليوم الوطني للمملكة العربية السعودية" },
    { date: "2026-11-09", label: "إجازة نهاية أسبوع مطولة" },
    { date: "2026-11-10", label: "إجازة نهاية أسبوع مطولة" },
  ],
  examWeeks: [14, 15],
};

const DEFAULT_TIMETABLE: TimetableSlot[] = [
  { dayOfWeek: 0, period: 1, className: "أول متوسط - 1" }, // Sun Period 1
  { dayOfWeek: 1, period: 3, className: "أول متوسط - 1" }, // Mon Period 3
  { dayOfWeek: 3, period: 2, className: "أول متوسط - 1" }, // Wed Period 2
  { dayOfWeek: 4, period: 4, className: "أول متوسط - 1" }, // Thu Period 4
];

/**
 * Reads the timetable slots the Madrasati connector stores on `profiles.classes`.
 */
export function parseProfileTimetable(classes: unknown): TimetableSlot[] {
  if (!classes || typeof classes !== "object") return [];

  const slots = (classes as { timetable?: unknown }).timetable;

  if (!Array.isArray(slots)) return [];

  return slots.flatMap((slot) => {
    if (!slot || typeof slot !== "object") return [];

    const { dayOfWeek, period, className } = slot as Record<string, unknown>;

    if (typeof dayOfWeek !== "number" || typeof period !== "number") return [];

    return [
      {
        dayOfWeek,
        period,
        className: typeof className === "string" ? className : "",
      },
    ];
  });
}

/**
 * Resolves the teacher's weekly timetable.
 *
 * `teacher_timetable` is the source of truth. Profiles written by the Madrasati
 * connector are used as a fallback for teachers synced before that table
 * existed, and the built-in default keeps the planner usable during onboarding.
 */
export async function loadTimetable(context?: SupabaseUserContext): Promise<TimetableSlot[]> {
  try {
    const entries = await TeacherTimetableService.getTimetable(context);

    if (entries.length > 0) {
      return entries.map((entry) => ({
        dayOfWeek: entry.dayOfWeek,
        period: entry.period,
        className: entry.className,
        subject: entry.subject,
        grade: entry.grade,
      }));
    }

    const resolved = await resolveUserContext(context);

    if (resolved) {
      const { data: profile } = await resolved.client
        .from("profiles")
        .select("classes")
        .eq("id", resolved.userId)
        .maybeSingle();

      const fromProfile = parseProfileTimetable(profile?.classes);

      if (fromProfile.length > 0) {
        return fromProfile;
      }
    }
  } catch (error) {
    console.warn("Failed to load teacher timetable, falling back to default:", error);
  }

  return DEFAULT_TIMETABLE;
}

export const PLANNER_CALENDAR_REQUIRED_MESSAGE =
  "لا يمكن توليد خطة الفصل بدون تقويم دراسي رسمي صالح.";

/**
 * Maps an official year/term into planner calendar config.
 *
 * Official complete dates win. A null academic-year end date is irrelevant.
 * Missing or incomplete official dates fail closed — DEFAULT_CALENDAR is never
 * a generation success path.
 */
export function resolvePlannerCalendarConfig(
  year: CalendarAcademicYear | null,
  term: CalendarTerm | null,
): AcademicCalendarConfig {
  if (year && term?.startDate && term.endDate) {
    return {
      academicYear: year.label,
      semesterId: term.id,
      semesterStart: term.startDate,
      semesterEnd: term.endDate,
      teachingWeeksCount: 15,
      periodsPerDay: 7,
      workingDays: [0, 1, 2, 3, 4],
      holidays: [],
      examWeeks: [],
    };
  }

  throw new Error(PLANNER_CALENDAR_REQUIRED_MESSAGE);
}

function expandIsoDateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(last.getTime()) || start > end) {
    return dates;
  }
  while (cursor <= last) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

/**
 * Maps the official resolved calendar onto planner config.
 * Holidays, cancelled days, and exam ranges skip teaching dates.
 * Effective semester bounds include variant term overrides.
 */
export function mapResolvedCalendarToPlannerConfig(
  calendar: ResolvedCalendar,
): AcademicCalendarConfig {
  const config = resolvePlannerCalendarConfig(
    {
      id: calendar.year.id,
      label: calendar.year.label,
      startDate: calendar.year.startDate,
      endDate: calendar.year.endDate,
      isActive: calendar.year.isActive,
    },
    {
      id: calendar.semester.id,
      label: calendar.semester.label,
      startDate: calendar.effectiveSemesterStart,
      endDate: calendar.effectiveSemesterEnd,
      orderIndex: calendar.semester.orderIndex,
    },
  );

  const holidays = new Map<string, string>();
  for (const item of calendar.holidays) {
    holidays.set(item.date, item.label);
  }
  for (const date of calendar.cancelledDays) {
    if (!holidays.has(date)) holidays.set(date, "");
  }
  for (const range of calendar.examRanges) {
    for (const date of expandIsoDateRange(range.startDate, range.endDate)) {
      if (!holidays.has(date)) holidays.set(date, range.label);
    }
  }

  return {
    ...config,
    holidays: [...holidays.entries()].map(([date, label]) => ({ date, label })),
  };
}

export async function loadCalendarConfig(
  context?: SupabaseUserContext,
  plan?: {
    academic_year_id?: string | null;
    semester_id?: string | null;
    calendar_variant_id?: string | null;
  } | null,
): Promise<AcademicCalendarConfig> {
  const calendar = plan
    ? await resolveCalendarForPlan(plan, context)
    : await resolveCalendar({}, context);
  return mapResolvedCalendarToPlannerConfig(calendar);
}

export async function saveCalendarConfig(_config: AcademicCalendarConfig): Promise<void> {
  console.warn(
    "saveCalendarConfig() is deprecated. Academic calendar is now managed from academic_years, semesters and calendar_events.",
  );
}

export interface PlanSyncScope {
  planId: string;
  versionId: string;
  subject: string;
}

function assertPlanSyncScope(scope: PlanSyncScope | undefined | null): PlanSyncScope {
  if (!scope?.planId || !scope.versionId || !scope.subject) {
    throw new Error("مزامنة الجدول تتطلب نطاق خطة فصل صالحاً (planId و versionId و subject).");
  }
  return scope;
}

function parseOverrideNotes(notes: string | null | undefined): ScheduleOverride[] {
  if (!notes) return [];
  try {
    const parsed = JSON.parse(notes) as ScheduleOverride[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Loads schedule overrides with plan/legacy compatibility:
 *
 * - Prefer plan-scoped OVERRIDES row when `planId` is provided.
 * - Always merge readable null-plan (legacy) overrides so they are never
 *   silently dropped when a semester plan is introduced.
 * - Plan-scoped entries win on conflicting lesson override ids/types.
 *
 * This function never deletes legacy override rows.
 */
export async function loadUserOverrides(
  planId?: string,
  context?: SupabaseUserContext,
): Promise<ScheduleOverride[]> {
  try {
    const resolved = await resolveUserContext(context);
    if (!resolved) return [];

    const { data: legacyRow } = await resolved.client
      .from("planner_entries")
      .select("notes")
      .eq("week_start_date", CONFIG_SCHEDULE_OVERRIDES_DATE)
      .eq("user_id", resolved.userId)
      .eq("subject", "OVERRIDES")
      .is("semester_plan_id", null)
      .maybeSingle();

    const legacy = parseOverrideNotes(legacyRow?.notes);

    if (!planId) {
      return legacy;
    }

    const { data: planRow } = await resolved.client
      .from("planner_entries")
      .select("notes")
      .eq("week_start_date", CONFIG_SCHEDULE_OVERRIDES_DATE)
      .eq("user_id", resolved.userId)
      .eq("subject", "OVERRIDES")
      .eq("semester_plan_id", planId)
      .maybeSingle();

    const scoped = parseOverrideNotes(planRow?.notes);
    if (scoped.length === 0) return legacy;
    if (legacy.length === 0) return scoped;

    const byKey = new Map<string, ScheduleOverride>();
    for (const item of legacy) {
      byKey.set(item.id || `${item.type}:${item.lessonId ?? ""}:${item.lessonIdA ?? ""}`, item);
    }
    for (const item of scoped) {
      byKey.set(item.id || `${item.type}:${item.lessonId ?? ""}:${item.lessonIdA ?? ""}`, item);
    }
    return [...byKey.values()];
  } catch (err) {
    console.warn("Failed to load overrides:", err);
    return [];
  }
}

/**
 * Saves overrides for a semester plan draft into the plan-scoped sentinel row.
 * Legacy null-plan OVERRIDES rows are left untouched.
 */
export async function saveUserOverrides(
  overrides: ScheduleOverride[],
  scope?: PlanSyncScope,
  context?: SupabaseUserContext,
): Promise<void> {
  const resolvedContext = await resolveUserContext(context);
  if (!resolvedContext) throw new Error("Unauthorized");

  const resolved = assertPlanSyncScope(scope);

  const { data: existing } = await resolvedContext.client
    .from("planner_entries")
    .select("id")
    .eq("user_id", resolvedContext.userId)
    .eq("week_start_date", CONFIG_SCHEDULE_OVERRIDES_DATE)
    .eq("subject", "OVERRIDES")
    .eq("semester_plan_id", resolved.planId)
    .maybeSingle();

  const { error } = await resolvedContext.client.from("planner_entries").upsert({
    id: existing?.id ?? createPlannerId(),
    user_id: resolvedContext.userId,
    week_start_date: CONFIG_SCHEDULE_OVERRIDES_DATE,
    day_of_week: 0,
    period: 0,
    subject: "OVERRIDES",
    notes: JSON.stringify(overrides),
    semester_plan_id: resolved.planId,
    semester_plan_version_id: resolved.versionId,
  });

  if (error) throw error;
}

/**
 * Generates the clean calendar schedule list of slots, skipping holidays and exam weeks.
 */
export function buildTeachingDates(config: AcademicCalendarConfig): Array<{
  date: string; // YYYY-MM-DD
  weekNumber: number;
  teachingWeek: number;
  dayOfWeek: number;
  isHoliday: boolean;
  isExamWeek: boolean;
  holidayLabel?: string;
}> {
  const dates: Array<{
    date: string;
    weekNumber: number;
    teachingWeek: number;
    dayOfWeek: number;
    isHoliday: boolean;
    isExamWeek: boolean;
    holidayLabel?: string;
  }> = [];

  const start = new Date(config.semesterStart);
  const end = new Date(config.semesterEnd);

  const current = new Date(start);
  let teachingWeekCounter = 1;

  while (current <= end) {
    const dayOfWeek = current.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const isSchoolDay = config.workingDays.includes(dayOfWeek);

    const isoDate = current.toISOString().slice(0, 10);
    const msDiff = current.getTime() - start.getTime();
    const weekNumber = Math.floor(msDiff / (7 * 24 * 60 * 60 * 1000)) + 1;

    const isExamWeek = config.examWeeks.includes(weekNumber);
    const holidayHit = config.holidays.find((h) => h.date === isoDate);
    const isHoliday = !!holidayHit;

    // Determine teaching week increment
    // If it's a new week start and not an exam week or fully holiday, we increment.
    // To keep it simple, teaching week maps to academic week unless skipped.
    if (dayOfWeek === config.workingDays[0] && isSchoolDay) {
      if (isExamWeek) {
        // Exam weeks don't count towards teaching weeks
      } else {
        // Check if there's at least one teaching day in this week
        teachingWeekCounter = weekNumber;
      }
    }

    if (isSchoolDay) {
      dates.push({
        date: isoDate,
        weekNumber,
        teachingWeek: isExamWeek ? 0 : teachingWeekCounter,
        dayOfWeek,
        isHoliday,
        isExamWeek,
        holidayLabel: holidayHit?.label,
      });
    }

    current.setDate(current.getDate() + 1);
  }

  return dates;
}

export interface PlanTeachingSlot {
  date: string;
  weekNumber: number;
  teachingWeek: number;
  dayOfWeek: number;
  period: number;
  className: string;
}

function timetableMatchesPlan(
  slot: TimetableSlot,
  activeSubject: string,
  activeGrade: string,
): boolean {
  return (
    (!slot.subject || slot.subject === activeSubject) && (!slot.grade || slot.grade === activeGrade)
  );
}

export function countWeeklyMatchingTimetableSlots(
  timetable: TimetableSlot[],
  activeSubject: string,
  activeGrade: string,
): number {
  return timetable.filter((slot) => timetableMatchesPlan(slot, activeSubject, activeGrade)).length;
}

/**
 * Same teaching-slot grid the scheduler uses.
 * Holidays are skipped. Matching is subject/grade, not every school period.
 */
export function buildPlanTeachingSlots(
  schoolDates: ReturnType<typeof buildTeachingDates>,
  timetable: TimetableSlot[],
  activeSubject: string,
  activeGrade: string,
): PlanTeachingSlot[] {
  const teachingSlots: PlanTeachingSlot[] = [];

  for (const day of schoolDates) {
    // Skip holidays and exam-range days mapped into holidays.
    if (day.isHoliday) continue;
    // سنضيف دعم أسابيع الاختبارات من calendar_events لاحقًا

    const slotsForDay = timetable.filter(
      (slot) =>
        slot.dayOfWeek === day.dayOfWeek && timetableMatchesPlan(slot, activeSubject, activeGrade),
    );
    slotsForDay.sort((a, b) => a.period - b.period);

    for (const slot of slotsForDay) {
      teachingSlots.push({
        date: day.date,
        weekNumber: day.weekNumber,
        teachingWeek: day.teachingWeek,
        dayOfWeek: day.dayOfWeek,
        period: slot.period,
        className: slot.className,
      });
    }
  }

  return teachingSlots;
}

/**
 * The Smart Scheduler Engine.
 * Combines Published Curriculum Lessons + Calendar Config + Teacher Timetable + Overrides.
 * Produces the final sequential calculated schedule.
 */
export async function generateSchedule(
  subject?: string,
  grade?: string,
  planId?: string,
  context?: SupabaseUserContext,
): Promise<CalculatedLessonEntry[]> {
  const resolved = await resolveUserContext(context);
  if (!resolved) return [];

  const client = resolved.client;
  const userId = resolved.userId;

  // 1. Fetch teacher's primary profile to see what grade & subject they teach
  const { data: profile } = await client
    .from("profiles")
    .select("grade, subject, classes")
    .eq("id", userId)
    .single();

  if (!profile) {
    return [];
  }

  let activeSubject = subject || profile.subject;
  let activeGrade = grade || profile.grade;

  if (!subject && !grade && profile.classes) {
    const classes = profile.classes as Record<string, unknown>;
    if (Array.isArray(classes.assignments) && classes.assignments.length > 0) {
      const firstAssignment = classes.assignments[0] as Record<string, unknown>;
      if (firstAssignment) {
        activeSubject = (firstAssignment.subject as string) || activeSubject;
        activeGrade = (firstAssignment.grade as string) || activeGrade;
      }
    }
  }

  if (!activeSubject || !activeGrade) {
    return [];
  }

  // 2. Load the semester plan once when generating for a plan scope.
  // Calendar comes from the plan variant. Lessons prefer a current snapshot.
  // Distribution-based plans fail closed when that snapshot is missing.
  let parsedLessons: ScheduleSourceLesson[] = [];
  let distributionSnapshotId: string | null = null;
  let plan: {
    academic_year_id?: string | null;
    semester_id?: string | null;
    calendar_variant_id?: string | null;
    current_version?: number;
  } | null = null;
  if (planId) {
    const { data: planRow, error: planError } = await client
      .from("semester_plans")
      .select("academic_year_id, semester_id, calendar_variant_id, current_version")
      .eq("id", planId)
      .maybeSingle();
    if (planError) throw planError;
    if (!planRow) {
      throw new Error(PLANNER_CALENDAR_REQUIRED_MESSAGE);
    }
    plan = planRow;
    const fromSnapshot = await resolveDistributionScheduleLessons(
      client,
      planId,
      planRow.current_version,
    );
    if (fromSnapshot?.lessons.length) {
      parsedLessons = fromSnapshot.lessons;
      distributionSnapshotId = fromSnapshot.snapshotId;
    }
  }

  // 3. Legacy plans that never used a distribution snapshot keep curriculum.
  if (parsedLessons.length === 0) {
    const { data: files } = await client
      .from("curriculum_files")
      .select("id")
      .eq("grade", activeGrade)
      .eq("subject", activeSubject)
      .eq("status", "published")
      .limit(1);

    const publishedFileId = files?.[0]?.id;
    if (!publishedFileId) {
      return [];
    }

    const { data: lessons, error: lessonsError } = await client
      .from("curriculum_lessons")
      .select("*")
      .eq("curriculum_file_id", publishedFileId)
      .order("order_index", { ascending: true });

    if (lessonsError || !lessons || lessons.length === 0) {
      return [];
    }

    parsedLessons = lessons.map((l) => {
      const extra = deserializeLessonNotes(l.notes);
      return {
        id: l.id,
        title: l.title,
        unitTitle: extra.unitName || "الوحدة الأولى",
        periodsCount: Math.max(1, parseInt(extra.periods || "1", 10)),
        orderIndex: l.order_index,
        objectives: (l.objectives || extra.outcomes || "").trim(),
        teachingResources: (extra.activities || extra.resources || "").trim(),
        assessmentMethods: (extra.assessment || "").trim(),
        planNotes: (extra.notes || "").trim(),
      };
    });
  }

  // 4. Load config, timetable and overrides.
  const config = await loadCalendarConfig(resolved, plan);
  const timetable = await loadTimetable(resolved);
  const overrides = await loadUserOverrides(planId, resolved);

  // 5. Generate all school days inside the semester
  const schoolDates = buildTeachingDates(config);

  // 6. Build the list of available teaching slots sequentially
  const teachingSlots = buildPlanTeachingSlots(schoolDates, timetable, activeSubject, activeGrade);

  // 7. Prepare the curriculum lessons list, applying overrides (skips, swaps, etc.)
  const activeLessons = [...parsedLessons];

  // Apply SWAP overrides first
  for (const o of overrides) {
    if (o.type === "swap" && o.lessonIdA && o.lessonIdB) {
      const idxA = activeLessons.findIndex((l) => l.id === o.lessonIdA);
      const idxB = activeLessons.findIndex((l) => l.id === o.lessonIdB);
      if (idxA !== -1 && idxB !== -1) {
        const temp = activeLessons[idxA];
        activeLessons[idxA] = activeLessons[idxB];
        activeLessons[idxB] = temp;
      }
    }
  }

  // Apply SKIP and MOVE overrides: moved lessons are placed only at their
  // target slot, so they must not also fill the sequential queue.
  const skippedIds = new Set(
    overrides.filter((o) => o.type === "skip" && o.lessonId).map((o) => o.lessonId!),
  );
  const movedIds = new Set(
    overrides.filter((o) => o.type === "move" && o.lessonId).map((o) => o.lessonId!),
  );
  const nonSkippedLessons = activeLessons.filter(
    (l) => !l.id || (!skippedIds.has(l.id) && !movedIds.has(l.id)),
  );

  // Flatten the lessons based on periods count.
  // For example, if a lesson takes 2 periods, it gets split into:
  // slot 1: Lesson Title (Period 1 of 2)
  // slot 2: Lesson Title (Period 2 of 2)
  interface FlatLesson {
    id: string | null; // null if custom insert
    title: string;
    unit: string;
    lessonOrder: number;
    periodsCount: number;
    remainingPeriods: number;
    isCustom: boolean;
    objectives: string;
    teachingResources: string;
    assessmentMethods: string;
    planNotes: string;
  }
  const flatLessons: FlatLesson[] = [];
  let lessonOrderCounter = 1;

  for (const l of nonSkippedLessons) {
    for (let p = 0; p < l.periodsCount; p++) {
      flatLessons.push({
        id: l.id,
        title: l.periodsCount > 1 ? `${l.title} (جزء ${p + 1})` : l.title,
        unit: l.unitTitle,
        lessonOrder: lessonOrderCounter,
        periodsCount: l.periodsCount,
        remainingPeriods: l.periodsCount - p - 1,
        isCustom: false,
        objectives: l.objectives,
        teachingResources: l.teachingResources,
        assessmentMethods: l.assessmentMethods,
        planNotes: l.planNotes,
      });
    }
    lessonOrderCounter++;
  }

  // Apply INSERT overrides (place custom lessons at specific slots)
  const inserts = overrides.filter((o) => o.type === "insert" && o.targetDate && o.targetPeriod);

  // 8. Map flat lessons and custom inserts onto available teaching slots
  const calculatedEntries: CalculatedLessonEntry[] = [];
  let flatLessonIdx = 0;

  for (let slotIdx = 0; slotIdx < teachingSlots.length; slotIdx++) {
    const slot = teachingSlots[slotIdx];

    // Check if there is an INSERT override for this exact slot
    const insertHit = inserts.find(
      (o) => o.targetDate === slot.date && o.targetPeriod === slot.period,
    );

    if (insertHit) {
      calculatedEntries.push({
        id: `insert-${slot.date}-${slot.period}`,
        academicYear: config.academicYear,
        semester: config.semesterId,
        weekNumber: slot.weekNumber,
        teachingWeek: slot.teachingWeek,
        suggestedDate: slot.date,
        dayOfWeek: slot.dayOfWeek,
        period: slot.period,
        unit: insertHit.customUnit || "حصص مخصصة",
        lessonId: null,
        lessonTitle: insertHit.customTitle || "درس مخصص",
        lessonOrder: 0,
        periodsCount: 1,
        remainingPeriods: 0,
        status: "Upcoming",
        className: slot.className,
        subject: activeSubject,
        objectives: "",
        teachingResources: "",
        assessmentMethods: "",
        planNotes: "",
        distributionSnapshotId,
      });
      continue;
    }

    // Check if there is a MOVE override targeting this slot
    const moveHit = overrides.find(
      (o) => o.type === "move" && o.targetDate === slot.date && o.targetPeriod === slot.period,
    );

    if (moveHit && moveHit.lessonId) {
      const originalLesson = parsedLessons.find((l) => l.id === moveHit.lessonId);
      if (originalLesson) {
        calculatedEntries.push({
          id: `move-${slot.date}-${slot.period}`,
          academicYear: config.academicYear,
          semester: config.semesterId,
          weekNumber: slot.weekNumber,
          teachingWeek: slot.teachingWeek,
          suggestedDate: slot.date,
          dayOfWeek: slot.dayOfWeek,
          period: slot.period,
          unit: originalLesson.unitTitle,
          lessonId: originalLesson.id,
          lessonTitle: `[منقول] ${originalLesson.title}`,
          lessonOrder: originalLesson.orderIndex + 1,
          periodsCount: originalLesson.periodsCount,
          remainingPeriods: 0,
          status: "Upcoming",
          className: slot.className,
          subject: activeSubject,
          objectives: originalLesson.objectives,
          teachingResources: originalLesson.teachingResources,
          assessmentMethods: originalLesson.assessmentMethods,
          planNotes: originalLesson.planNotes,
          distributionSnapshotId,
        });
        // Skip placing regular flat lesson on this slot
        continue;
      }
    }

    // Regular sequential distribution
    if (flatLessonIdx < flatLessons.length) {
      const lesson = flatLessons[flatLessonIdx];
      calculatedEntries.push({
        id: `${lesson.id || "custom"}-${slot.date}-${slot.period}`,
        academicYear: config.academicYear,
        semester: config.semesterId,
        weekNumber: slot.weekNumber,
        teachingWeek: slot.teachingWeek,
        suggestedDate: slot.date,
        dayOfWeek: slot.dayOfWeek,
        period: slot.period,
        unit: lesson.unit,
        lessonId: lesson.id,
        lessonTitle: lesson.title,
        lessonOrder: lesson.lessonOrder,
        periodsCount: lesson.periodsCount,
        remainingPeriods: lesson.remainingPeriods,
        status: "Upcoming",
        className: slot.className,
        subject: activeSubject,
        objectives: lesson.objectives,
        teachingResources: lesson.teachingResources,
        assessmentMethods: lesson.assessmentMethods,
        planNotes: lesson.planNotes,
        distributionSnapshotId,
      });
      flatLessonIdx++;
    }
  }

  // 9. Update the STATUS of each entry dynamically based on suggestedDate vs today
  const todayISO = new Date().toISOString().slice(0, 10);
  for (const entry of calculatedEntries) {
    // Check if user manually marked skipped or completed in overrides (or set default based on date)
    const isExplicitSkipped = skippedIds.has(entry.lessonId || "");
    if (isExplicitSkipped) {
      entry.status = "Skipped";
    } else if (entry.suggestedDate < todayISO) {
      entry.status = "Completed";
    } else if (entry.suggestedDate === todayISO) {
      entry.status = "Current";
    } else {
      entry.status = "Upcoming";
    }
  }

  return calculatedEntries;
}

/**
 * Saves/updates generated planner entries for an explicit Draft semester-plan scope.
 *
 * Destructive sync (delete + rebuild) ALWAYS requires PlanSyncScope. Subject-only
 * sync is rejected so managed plans cannot be orphaned.
 */
export async function syncScheduleToDatabase(
  entries: CalculatedLessonEntry[],
  scope: PlanSyncScope,
  context?: SupabaseUserContext,
): Promise<void> {
  const resolvedContext = await resolveUserContext(context);
  if (!resolvedContext) throw new Error("Unauthorized");

  const resolved = assertPlanSyncScope(scope);

  const { data: plan, error: planError } = await resolvedContext.client
    .from("semester_plans")
    .select("id, status, subject")
    .eq("id", resolved.planId)
    .maybeSingle();
  if (planError) throw planError;
  if (!plan) throw new Error("خطة الفصل غير موجودة");
  if (plan.status !== "draft") {
    throw new Error(
      "لا يمكن إعادة توليد الخطة إلا وهي مسودة. أنشئ إصداراً جديداً للتعديل الهيكلي.",
    );
  }

  // Delete only this plan's operational rows (never subject-wide unmanaged deletes).
  const { error: deleteError } = await resolvedContext.client
    .from("planner_entries")
    .delete()
    .eq("user_id", resolvedContext.userId)
    .eq("semester_plan_id", resolved.planId)
    .not("week_start_date", "eq", CONFIG_ACADEMIC_CALENDAR_DATE)
    .not("week_start_date", "eq", CONFIG_SCHEDULE_OVERRIDES_DATE)
    .neq("subject", "OVERRIDES");

  if (deleteError) throw deleteError;

  if (entries.length === 0) return;

  const batchSize = 100;
  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, i + batchSize).map((e) => {
      const d = new Date(e.suggestedDate);
      const day = d.getDay();
      const diff = d.getDate() - day;
      const sun = new Date(d.setDate(diff));
      const weekStart = sun.toISOString().slice(0, 10);

      return {
        id: createPlannerId(),
        user_id: resolvedContext.userId,
        week_start_date: weekStart,
        day_of_week: e.dayOfWeek,
        period: e.period,
        subject: e.subject || resolved.subject || plan.subject,
        notes: JSON.stringify(e),
        semester_plan_id: resolved.planId,
        semester_plan_version_id: resolved.versionId,
      };
    });

    const { error: insertError } = await resolvedContext.client
      .from("planner_entries")
      .insert(batch);
    if (insertError) throw insertError;
  }
}

/**
 * Triggers full recalculation & synchronization of the Smart Planner schedule.
 */
export async function recalculateAndSyncPlanner(
  subject: string,
  grade: string | undefined,
  scope: PlanSyncScope,
  context?: SupabaseUserContext,
): Promise<CalculatedLessonEntry[]> {
  const resolved = assertPlanSyncScope(scope);
  const calculated = await generateSchedule(subject, grade, resolved.planId, context);
  await syncScheduleToDatabase(
    calculated,
    {
      ...resolved,
      subject: subject || calculated[0]?.subject || resolved.subject,
    },
    context,
  );
  return calculated;
}
