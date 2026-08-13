import { supabase } from "@/platform/database/supabase/client";
import {
  CONFIG_ACADEMIC_CALENDAR_DATE,
  CONFIG_SCHEDULE_OVERRIDES_DATE,
  generateSchedule,
  loadUserOverrides,
  normalisePlanEntry,
  recalculateAndSyncPlanner,
  saveUserOverrides,
  syncScheduleToDatabase,
  type CalculatedLessonEntry,
  type PlanSyncScope,
  type ScheduleOverride,
} from "./planner-engine";
import {
  DISTRIBUTION_SNAPSHOT_REQUIRED_MESSAGE,
  nextLiveDateReadAction,
  nextLoadOrGeneratePlanAction,
  resolveStoredPlannerEntriesLive,
} from "./distribution-snapshot-staleness";
import {
  assertWritableDraft,
  ensureSemesterPlan,
  findSemesterPlan,
  getCurrentPlanVersion,
  loadPlanEntries,
  type SemesterPlanContext,
  type SemesterPlanRow,
} from "./semester-plan-lifecycle";

export { normalisePlanEntry };

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
  statusLabel?: string;
  versionLabel?: string;
  approvedAt?: string | null;
  updatedAt?: string | null;
}

export interface LoadedSemesterPlan extends SemesterPlanContext {
  entries: CalculatedLessonEntry[];
}

function toScope(ctx: SemesterPlanContext, subject?: string): PlanSyncScope {
  return {
    planId: ctx.plan.id,
    versionId: ctx.version.id,
    subject: subject || ctx.plan.subject,
  };
}

/**
 * Owner-scoped operational rows that are not yet linked to a semester plan.
 * Used only as a compatibility fallback — never creates a second schedule.
 */
export async function loadLegacyOwnerPlannerEntries(input?: {
  subject?: string;
  date?: string;
}): Promise<CalculatedLessonEntry[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  let query = supabase
    .from("planner_entries")
    .select("notes, subject, week_start_date, semester_plan_id")
    .eq("user_id", user.id)
    .is("semester_plan_id", null)
    .not("week_start_date", "eq", CONFIG_ACADEMIC_CALENDAR_DATE)
    .not("week_start_date", "eq", CONFIG_SCHEDULE_OVERRIDES_DATE)
    .neq("subject", "OVERRIDES");

  if (input?.subject) {
    query = query.eq("subject", input.subject);
  }

  const { data, error } = await query;
  if (error || !data) return [];

  const entries: CalculatedLessonEntry[] = [];
  for (const row of data) {
    if (!row.notes) continue;
    try {
      const parsed = JSON.parse(row.notes) as Partial<CalculatedLessonEntry>;
      const normalised = normalisePlanEntry(parsed);
      if (!normalised) continue;
      if (input?.date && normalised.suggestedDate !== input.date) continue;
      entries.push(normalised);
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
 * Reads linked canonical schedule for a subject when a plan already exists.
 * Does not create a plan and does not regenerate.
 */
export async function loadCanonicalSemesterPlan(
  subject?: string,
): Promise<CalculatedLessonEntry[]> {
  if (!subject) return [];

  try {
    const ctx = await findSemesterPlan({ subject });
    if (!ctx) return [];
    const stored = await loadPlanEntries(ctx.plan.id, ctx.version.id);
    const live = await resolveStoredPlannerEntriesLive(
      supabase,
      ctx.plan.id,
      ctx.plan.current_version,
      stored,
    );
    return nextLiveDateReadAction(live.kind) === "return-stored" && live.kind === "allow"
      ? live.entries
      : [];
  } catch {
    return [];
  }
}

/**
 * Prefer linked Semester Plan rows. If the draft store is empty but legacy
 * unlinked rows exist, adopt them (link) instead of regenerating.
 */
async function applyLiveStoredPlannerEntries(
  ctx: SemesterPlanContext,
  stored: CalculatedLessonEntry[],
): Promise<LoadedSemesterPlan | "continue-generate"> {
  const live = await resolveStoredPlannerEntriesLive(
    supabase,
    ctx.plan.id,
    ctx.plan.current_version,
    stored,
  );
  const action = nextLoadOrGeneratePlanAction(live.kind, stored.length);
  if (action === "fail-closed") {
    throw new Error(DISTRIBUTION_SNAPSHOT_REQUIRED_MESSAGE);
  }
  if (action === "return-empty") {
    return { ...ctx, entries: [] };
  }
  if (action === "return-stored" && live.kind === "allow") {
    return { ...ctx, entries: live.entries };
  }
  return "continue-generate";
}

export async function loadOrGeneratePlan(
  subject: string,
  grade: string,
): Promise<LoadedSemesterPlan> {
  const ctx = await ensureSemesterPlan({ subject, grade });
  let stored = await loadPlanEntries(ctx.plan.id, ctx.version.id);
  const first = await applyLiveStoredPlannerEntries(ctx, stored);
  if (first !== "continue-generate") {
    return first;
  }

  // Compatibility: legacy unlinked rows for this subject become the draft schedule.
  const legacy = await loadLegacyOwnerPlannerEntries({ subject });
  if (legacy.length > 0) {
    stored = await loadPlanEntries(ctx.plan.id, ctx.version.id);
    if (stored.length > 0) {
      const linked = await applyLiveStoredPlannerEntries(ctx, stored);
      if (linked !== "continue-generate") return linked;
    }
    // ensureSemesterPlan already attempted linkOrphan; re-read after a second link.
    const { data: userData } = await supabase.auth.getUser();
    if (userData.user) {
      await supabase
        .from("planner_entries")
        .update({
          semester_plan_id: ctx.plan.id,
          semester_plan_version_id: ctx.version.id,
        })
        .eq("user_id", userData.user.id)
        .eq("subject", subject)
        .is("semester_plan_id", null)
        .not("week_start_date", "eq", CONFIG_ACADEMIC_CALENDAR_DATE)
        .not("week_start_date", "eq", CONFIG_SCHEDULE_OVERRIDES_DATE);

      stored = await loadPlanEntries(ctx.plan.id, ctx.version.id);
      if (stored.length > 0) {
        const linked = await applyLiveStoredPlannerEntries(ctx, stored);
        if (linked !== "continue-generate") return linked;
      }
    }
    // Linked read still empty (e.g. column missing pre-migration) — return legacy as-is.
    return { ...ctx, entries: legacy };
  }

  if (ctx.plan.status !== "draft") {
    return { ...ctx, entries: [] };
  }

  const scope = toScope(ctx, subject);
  const calculated = await generateSchedule(subject, grade, ctx.plan.id);
  if (calculated.length > 0) {
    await syncScheduleToDatabase(calculated, scope);
    return { ...ctx, entries: calculated };
  }

  const regenerated = await recalculateAndSyncPlanner(subject, grade, scope);
  return { ...ctx, entries: regenerated };
}

/**
 * Entries for a single calendar date — used by Lesson Sessions and daily prep.
 *
 * 1. Linked current-version plan rows when a semester plan exists.
 * 2. Otherwise owner-scoped legacy planner_entries for that date/subject.
 * Never silently regenerates when legacy rows are available.
 */
export async function getPlanEntriesForDate(
  date: string,
  subject?: string,
): Promise<CalculatedLessonEntry[]> {
  const linked = subject
    ? await loadCanonicalSemesterPlan(subject)
    : await loadLinkedEntriesAcrossPlansForDate(date);

  const fromLinked = linked.filter(
    (entry) => entry.suggestedDate === date && entry.status !== "Skipped",
  );
  if (fromLinked.length > 0) {
    return fromLinked;
  }

  const legacy = await loadLegacyOwnerPlannerEntries({ subject, date });
  return legacy.filter((entry) => entry.status !== "Skipped");
}

/** Linked current-version entries for a date across the teacher's non-archived plans. */
async function loadLinkedEntriesAcrossPlansForDate(date: string): Promise<CalculatedLessonEntry[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: plans, error } = await supabase
    .from("semester_plans")
    .select(
      "id, current_version, subject, grade, status, user_id, academic_year_id, semester_id, approved_at, completed_at, archived_at, created_at, updated_at",
    )
    .eq("user_id", user.id)
    .neq("status", "archived");

  if (error || !plans?.length) return [];

  const entries: CalculatedLessonEntry[] = [];
  for (const plan of plans) {
    const version = await getCurrentPlanVersion(plan as SemesterPlanRow);
    if (!version) continue;
    const rows = await loadPlanEntries(plan.id, version.id);
    const live = await resolveStoredPlannerEntriesLive(
      supabase,
      plan.id,
      plan.current_version,
      rows,
    );
    if (nextLiveDateReadAction(live.kind) !== "return-stored" || live.kind !== "allow") {
      continue;
    }
    for (const row of live.entries) {
      if (row.suggestedDate === date) entries.push(row);
    }
  }
  return entries;
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
  base: Omit<SemesterPlanMeta, "teachingWeeksCount" | "lessonsCount" | "printDate"> &
    Partial<Pick<SemesterPlanMeta, "statusLabel" | "versionLabel" | "approvedAt" | "updatedAt">>,
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
 * Regenerates the full-term plan — Draft only.
 */
export async function generateSemesterPlan(
  subject: string,
  grade: string,
  input?: { calendarVariantId?: string | null },
): Promise<LoadedSemesterPlan> {
  const ctx = await ensureSemesterPlan({
    subject,
    grade,
    calendarVariantId: input?.calendarVariantId,
  });
  assertWritableDraft(ctx.plan);
  const entries = await recalculateAndSyncPlanner(subject, grade, toScope(ctx, subject));
  return { ...ctx, entries };
}

export async function moveLessonInPlan(input: {
  lessonId: string;
  targetDate: string;
  targetPeriod: number;
  subject: string;
  grade: string;
}): Promise<LoadedSemesterPlan> {
  const ctx = await ensureSemesterPlan({ subject: input.subject, grade: input.grade });
  assertWritableDraft(ctx.plan);
  const scope = toScope(ctx, input.subject);

  const overrides = await loadUserOverrides(ctx.plan.id);
  const next: ScheduleOverride[] = [
    ...overrides.filter((o) => !(o.type === "move" && o.lessonId === input.lessonId)),
    {
      id: createPlannerId(),
      type: "move",
      lessonId: input.lessonId,
      targetDate: input.targetDate,
      targetPeriod: input.targetPeriod,
    },
  ];

  await saveUserOverrides(next, scope);
  const entries = await recalculateAndSyncPlanner(input.subject, input.grade, scope);
  return { ...ctx, entries };
}

export async function swapLessonsInPlan(input: {
  lessonIdA: string;
  lessonIdB: string;
  subject: string;
  grade: string;
}): Promise<LoadedSemesterPlan> {
  const ctx = await ensureSemesterPlan({ subject: input.subject, grade: input.grade });
  assertWritableDraft(ctx.plan);
  const scope = toScope(ctx, input.subject);

  const overrides = await loadUserOverrides(ctx.plan.id);
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
      id: createPlannerId(),
      type: "swap",
      lessonIdA: input.lessonIdA,
      lessonIdB: input.lessonIdB,
    },
  ];

  await saveUserOverrides(next, scope);
  const entries = await recalculateAndSyncPlanner(input.subject, input.grade, scope);
  return { ...ctx, entries };
}

export async function shiftLessonOrder(input: {
  entries: CalculatedLessonEntry[];
  lessonId: string;
  direction: "up" | "down";
  subject: string;
  grade: string;
}): Promise<LoadedSemesterPlan> {
  const unique = uniqueLessons(input.entries);
  const index = unique.findIndex((e) => e.lessonId === input.lessonId);
  if (index < 0) {
    const ctx = await ensureSemesterPlan({ subject: input.subject, grade: input.grade });
    return { ...ctx, entries: input.entries };
  }

  const swapWith = input.direction === "up" ? index - 1 : index + 1;
  if (swapWith < 0 || swapWith >= unique.length) {
    const ctx = await ensureSemesterPlan({ subject: input.subject, grade: input.grade });
    return { ...ctx, entries: input.entries };
  }

  const a = unique[index].lessonId;
  const b = unique[swapWith].lessonId;
  if (!a || !b) {
    const ctx = await ensureSemesterPlan({ subject: input.subject, grade: input.grade });
    return { ...ctx, entries: input.entries };
  }

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
    meta.statusLabel,
    meta.versionLabel,
    `weeks:${meta.teachingWeeksCount}`,
    `lessons:${meta.lessonsCount}`,
    meta.printDate,
  ]
    .filter(Boolean)
    .join(" | ");
}
