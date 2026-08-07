import { supabase } from "@/platform/database/supabase/client";
import {
  CONFIG_ACADEMIC_CALENDAR_DATE,
  CONFIG_SCHEDULE_OVERRIDES_DATE,
  generateSchedule,
  loadUserOverrides,
  recalculateAndSyncPlanner,
  saveUserOverrides,
  syncScheduleToDatabase,
  type CalculatedLessonEntry,
  type ScheduleOverride,
} from "./planner-engine";

export interface SemesterPlanMeta {
  teacherName: string;
  schoolName: string;
  /** الإدارة التعليمية */
  educationAdministration: string;
  subject: string;
  grade: string;
  semesterLabel: string;
  academicYearLabel: string;
  teachingWeeksCount: number;
  lessonsCount: number;
  printDate: string;
}

/**
 * Normalises a row that may predate the pedagogical fields.
 * The Semester Plan JSON in `planner_entries.notes` is the canonical projection.
 */
export function normalisePlanEntry(
  raw: Partial<CalculatedLessonEntry> & {
    id?: string;
  },
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
  };
}

/**
 * Reads the canonical Semester Plan from synced `planner_entries`.
 * Does not regenerate — weekly view and lesson sessions should call this first.
 */
export async function loadCanonicalSemesterPlan(
  subject?: string,
): Promise<CalculatedLessonEntry[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  let query = supabase
    .from("planner_entries")
    .select("notes, subject, week_start_date")
    .eq("user_id", user.id)
    .not("week_start_date", "eq", CONFIG_ACADEMIC_CALENDAR_DATE)
    .not("week_start_date", "eq", CONFIG_SCHEDULE_OVERRIDES_DATE);

  if (subject) {
    query = query.eq("subject", subject);
  }

  const { data, error } = await query;
  if (error || !data) return [];

  const entries: CalculatedLessonEntry[] = [];

  for (const row of data) {
    if (!row.notes) continue;
    try {
      const parsed = JSON.parse(row.notes) as Partial<CalculatedLessonEntry>;
      const normalised = normalisePlanEntry(parsed);
      if (normalised) entries.push(normalised);
    } catch {
      // skip corrupt rows
    }
  }

  return entries.sort((a, b) => {
    if (a.suggestedDate !== b.suggestedDate) {
      return a.suggestedDate.localeCompare(b.suggestedDate);
    }
    return a.period - b.period;
  });
}

/**
 * Prefer the stored Semester Plan. Regenerate only when the canonical store is empty.
 */
export async function loadOrGeneratePlan(
  subject: string,
  grade: string,
): Promise<CalculatedLessonEntry[]> {
  const stored = await loadCanonicalSemesterPlan(subject);
  if (stored.length > 0) return stored;

  const calculated = await generateSchedule(subject, grade);
  if (calculated.length > 0) {
    await syncScheduleToDatabase(calculated, subject);
    return calculated;
  }

  return recalculateAndSyncPlanner(subject, grade);
}

/**
 * Entries for a single calendar date — used by Lesson Sessions and daily prep.
 */
export async function getPlanEntriesForDate(
  date: string,
  subject?: string,
): Promise<CalculatedLessonEntry[]> {
  const plan = await loadCanonicalSemesterPlan(subject);
  if (plan.length > 0) {
    return plan.filter((entry) => entry.suggestedDate === date && entry.status !== "Skipped");
  }

  // Cold start: generate once so sessions have something to project from.
  const generated = await generateSchedule(subject);
  if (generated.length > 0 && subject) {
    await syncScheduleToDatabase(generated, subject);
  }
  return generated.filter((entry) => entry.suggestedDate === date && entry.status !== "Skipped");
}

export function countTeachingWeeks(entries: CalculatedLessonEntry[]): number {
  const weeks = new Set(
    entries
      .filter((e) => e.status !== "Skipped" && (e.teachingWeek || e.weekNumber))
      .map((e) => e.teachingWeek || e.weekNumber),
  );
  return weeks.size;
}

export function buildSemesterPlanMeta(
  base: Omit<SemesterPlanMeta, "teachingWeeksCount" | "lessonsCount" | "printDate">,
  entries: CalculatedLessonEntry[],
): SemesterPlanMeta {
  return {
    ...base,
    teachingWeeksCount: countTeachingWeeks(entries),
    lessonsCount: uniqueLessons(entries).length,
    printDate: new Date().toISOString().slice(0, 10),
  };
}

/**
 * Regenerates the full-term plan from curriculum + calendar + timetable and
 * writes it into `planner_entries` (canonical store).
 */
export async function generateSemesterPlan(
  subject: string,
  grade: string,
): Promise<CalculatedLessonEntry[]> {
  return recalculateAndSyncPlanner(subject, grade);
}

export async function moveLessonInPlan(input: {
  lessonId: string;
  targetDate: string;
  targetPeriod: number;
  subject: string;
  grade: string;
}): Promise<CalculatedLessonEntry[]> {
  const overrides = await loadUserOverrides();
  const next: ScheduleOverride[] = [
    ...overrides.filter((o) => !(o.type === "move" && o.lessonId === input.lessonId)),
    {
      id: crypto.randomUUID(),
      type: "move",
      lessonId: input.lessonId,
      targetDate: input.targetDate,
      targetPeriod: input.targetPeriod,
    },
  ];

  await saveUserOverrides(next);
  return recalculateAndSyncPlanner(input.subject, input.grade);
}

export async function swapLessonsInPlan(input: {
  lessonIdA: string;
  lessonIdB: string;
  subject: string;
  grade: string;
}): Promise<CalculatedLessonEntry[]> {
  const overrides = await loadUserOverrides();
  const next: ScheduleOverride[] = [
    ...overrides.filter(
      (o) =>
        !(
          o.type === "swap" &&
          ((o.lessonIdA === input.lessonIdA && o.lessonIdB === input.lessonIdB) ||
            (o.lessonIdA === input.lessonIdB && o.lessonIdB === input.lessonIdA))
        ),
    ),
    {
      id: crypto.randomUUID(),
      type: "swap",
      lessonIdA: input.lessonIdA,
      lessonIdB: input.lessonIdB,
    },
  ];

  await saveUserOverrides(next);
  return recalculateAndSyncPlanner(input.subject, input.grade);
}

export async function shiftLessonOrder(input: {
  entries: CalculatedLessonEntry[];
  lessonId: string;
  direction: "up" | "down";
  subject: string;
  grade: string;
}): Promise<CalculatedLessonEntry[]> {
  const unique = uniqueLessons(input.entries);
  const index = unique.findIndex((e) => e.lessonId === input.lessonId);
  if (index < 0) return input.entries;

  const swapWith = input.direction === "up" ? index - 1 : index + 1;
  if (swapWith < 0 || swapWith >= unique.length) return input.entries;

  const a = unique[index].lessonId;
  const b = unique[swapWith].lessonId;
  if (!a || !b) return input.entries;

  return swapLessonsInPlan({
    lessonIdA: a,
    lessonIdB: b,
    subject: input.subject,
    grade: input.grade,
  });
}

/** One row per curriculum lesson (first period part), for the semester table. */
export function uniqueLessons(entries: CalculatedLessonEntry[]): CalculatedLessonEntry[] {
  const seen = new Set<string>();
  const rows: CalculatedLessonEntry[] = [];

  for (const entry of entries) {
    if (entry.status === "Skipped") continue;
    const key = entry.lessonId ?? entry.id;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(entry);
  }

  return rows.sort((a, b) => {
    if (a.suggestedDate !== b.suggestedDate) {
      return a.suggestedDate.localeCompare(b.suggestedDate);
    }
    return a.period - b.period;
  });
}

/** QR payload summarising the printed plan identity. */
export function buildPlanQrPayload(meta: SemesterPlanMeta): string {
  return [
    "Waraqa Semester Plan",
    meta.schoolName,
    meta.teacherName,
    meta.subject,
    meta.grade,
    meta.semesterLabel,
    meta.academicYearLabel,
    `weeks:${meta.teachingWeeksCount}`,
    `lessons:${meta.lessonsCount}`,
    meta.printDate,
  ]
    .filter(Boolean)
    .join(" | ");
}
