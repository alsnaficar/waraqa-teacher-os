import { supabase } from "@/platform/database/supabase/client";
import { resolveUserContext, type SupabaseUserContext } from "@/platform/database/supabase/context";
import type { Database, Json } from "@/platform/database/supabase/types";
import {
  getActiveAcademicYear,
  getCurrentAcademicTerm,
} from "@/features/calendar/services/calendar.service";
import { resolveSelectableVariantForWrite } from "@/features/calendar/services/calendar-variants";
import { GENERAL_VARIANT_CODE } from "@/features/calendar/services/resolve-calendar";
import {
  CALENDAR_VARIANT_UNAUTHORIZED_MESSAGE,
  shouldPersistPlanVariantChange,
} from "@/features/calendar/services/calendar-variant-selection";
import {
  CONFIG_ACADEMIC_CALENDAR_DATE,
  CONFIG_SCHEDULE_OVERRIDES_DATE,
  normalisePlanEntry,
  type CalculatedLessonEntry,
} from "./planner-engine";

export type SemesterPlanStatus = Database["public"]["Enums"]["semester_plan_status"];
export type SemesterPlanVersionStatus = Database["public"]["Enums"]["semester_plan_version_status"];

export type SemesterPlanRow = Database["public"]["Tables"]["semester_plans"]["Row"];
export type SemesterPlanVersionRow = Database["public"]["Tables"]["semester_plan_versions"]["Row"];

export interface SemesterPlanSnapshot {
  capturedAt?: string;
  entries?: CalculatedLessonEntry[];
  overrides?: unknown;
  clonedFromVersion?: number;
}

export interface SemesterPlanContext {
  plan: SemesterPlanRow;
  version: SemesterPlanVersionRow;
}

export const SEMESTER_PLAN_STATUS_LABELS: Record<SemesterPlanStatus, string> = {
  draft: "مسودة",
  approved: "معتمدة",
  in_progress: "قيد التنفيذ",
  completed: "مكتملة",
  archived: "مؤرشفة",
};

export function formatPlanVersionLabel(versionNumber: number): string {
  return `الإصدار ${versionNumber}`;
}

export interface PlanUiActions {
  canGenerate: boolean;
  canEdit: boolean;
  canApprove: boolean;
  canStartExecution: boolean;
  canCreateVersion: boolean;
  canComplete: boolean;
  canArchive: boolean;
  canPrint: boolean;
  isReadOnly: boolean;
}

export function getPlanUiActions(status: SemesterPlanStatus): PlanUiActions {
  switch (status) {
    case "draft":
      return {
        canGenerate: true,
        canEdit: true,
        canApprove: true,
        canStartExecution: false,
        canCreateVersion: false,
        canComplete: false,
        canArchive: false,
        canPrint: true,
        isReadOnly: false,
      };
    case "approved":
      return {
        canGenerate: false,
        canEdit: false,
        canApprove: false,
        canStartExecution: true,
        canCreateVersion: true,
        canComplete: false,
        canArchive: false,
        canPrint: true,
        isReadOnly: true,
      };
    case "in_progress":
      return {
        canGenerate: false,
        canEdit: false,
        canApprove: false,
        canStartExecution: false,
        canCreateVersion: true,
        canComplete: true,
        canArchive: false,
        canPrint: true,
        isReadOnly: true,
      };
    case "completed":
      return {
        canGenerate: false,
        canEdit: false,
        canApprove: false,
        canStartExecution: false,
        canCreateVersion: false,
        canComplete: false,
        canArchive: true,
        canPrint: true,
        isReadOnly: true,
      };
    case "archived":
      return {
        canGenerate: false,
        canEdit: false,
        canApprove: false,
        canStartExecution: false,
        canCreateVersion: false,
        canComplete: false,
        canArchive: false,
        canPrint: true,
        isReadOnly: true,
      };
    default:
      return {
        canGenerate: false,
        canEdit: false,
        canApprove: false,
        canStartExecution: false,
        canCreateVersion: false,
        canComplete: false,
        canArchive: false,
        canPrint: true,
        isReadOnly: true,
      };
  }
}

function assertWritableDraft(plan: SemesterPlanRow): void {
  if (plan.status !== "draft") {
    throw new Error(
      `لا يمكن تعديل الخطة وهي بحالة «${SEMESTER_PLAN_STATUS_LABELS[plan.status]}». أنشئ إصداراً جديداً أولاً.`,
    );
  }
}

async function requireUserId(context?: SupabaseUserContext): Promise<string> {
  const resolved = await resolveUserContext(context);
  if (!resolved) throw new Error("Unauthorized");
  return resolved.userId;
}

export async function getSemesterPlanById(
  planId: string,
  context?: SupabaseUserContext,
): Promise<SemesterPlanRow | null> {
  const resolved = await resolveUserContext(context);
  if (!resolved) return null;

  const { data, error } = await resolved.client
    .from("semester_plans")
    .select("*")
    .eq("id", planId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getCurrentPlanVersion(
  plan: SemesterPlanRow,
  context?: SupabaseUserContext,
): Promise<SemesterPlanVersionRow | null> {
  const resolved = await resolveUserContext(context);
  if (!resolved) return null;

  const { data, error } = await resolved.client
    .from("semester_plan_versions")
    .select("*")
    .eq("semester_plan_id", plan.id)
    .eq("version_number", plan.current_version)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export const SEMESTER_PLAN_SCOPE_REQUIRED_MESSAGE =
  "لا يمكن إنشاء خطة الفصل دون عام دراسي وفصل دراسي.";

async function resolveAcademicYearId(
  provided: string | null | undefined,
  context: SupabaseUserContext,
): Promise<string | null> {
  if (provided !== undefined) return provided;
  return (await getActiveAcademicYear(context))?.id ?? null;
}

async function resolveSemesterId(
  provided: string | null | undefined,
  context: SupabaseUserContext,
): Promise<string | null> {
  if (provided !== undefined) return provided;
  return (await getCurrentAcademicTerm(context))?.id ?? null;
}

/** Locate an existing plan for the teacher/subject/term scope. Does not create. */
export async function findSemesterPlan(
  input: {
    subject: string;
    academicYearId?: string | null;
    semesterId?: string | null;
  },
  context?: SupabaseUserContext,
): Promise<SemesterPlanContext | null> {
  const resolved = await resolveUserContext(context);
  if (!resolved) return null;

  const subject = input.subject.trim();
  if (!subject) return null;

  const yearId = await resolveAcademicYearId(input.academicYearId, resolved);
  const termId = await resolveSemesterId(input.semesterId, resolved);

  let query = resolved.client
    .from("semester_plans")
    .select("*")
    .eq("user_id", resolved.userId)
    .eq("subject", subject);

  if (yearId) query = query.eq("academic_year_id", yearId);
  else query = query.is("academic_year_id", null);

  if (termId) query = query.eq("semester_id", termId);
  else query = query.is("semester_id", null);

  const { data: existing, error: findError } = await query.maybeSingle();
  if (findError) throw findError;
  if (!existing) return null;

  const version = await getCurrentPlanVersion(existing, resolved);
  if (!version) return null;
  return { plan: existing, version };
}

/**
 * Finds or creates the canonical Semester Plan for a teacher subject/term scope.
 * Links any orphan planner_entries for that subject to the current version.
 */
export async function ensureSemesterPlan(
  input: {
    subject: string;
    grade: string;
    academicYearId?: string | null;
    semesterId?: string | null;
    calendarVariantId?: string | null;
    calendarVariantCode?: string | null;
  },
  context?: SupabaseUserContext,
): Promise<SemesterPlanContext> {
  const resolved = await resolveUserContext(context);
  if (!resolved) throw new Error("Unauthorized");

  const userId = resolved.userId;
  const subject = input.subject.trim();
  if (!subject) throw new Error("المادة مطلوبة لإنشاء خطة الفصل");

  const yearId = await resolveAcademicYearId(input.academicYearId, resolved);
  const termId = await resolveSemesterId(input.semesterId, resolved);

  const existing = await findSemesterPlan(
    {
      subject,
      academicYearId: yearId,
      semesterId: termId,
    },
    resolved,
  );

  if (existing) {
    if (input.grade && existing.plan.grade !== input.grade && existing.plan.status === "draft") {
      const { error: gradeError } = await resolved.client
        .from("semester_plans")
        .update({ grade: input.grade })
        .eq("id", existing.plan.id)
        .eq("status", "draft");
      if (!gradeError) existing.plan.grade = input.grade;
    }

    await linkOrphanEntriesToPlan(resolved, subject, existing.plan.id, existing.version.id);
    return existing;
  }

  if (!yearId || !termId) {
    throw new Error(SEMESTER_PLAN_SCOPE_REQUIRED_MESSAGE);
  }

  const variant = await resolveSelectableVariantForWrite(resolved.client, {
    id: input.calendarVariantId,
    code: input.calendarVariantCode,
  });

  const { data: created, error: createError } = await resolved.client
    .from("semester_plans")
    .insert({
      user_id: userId,
      subject,
      grade: input.grade || "",
      academic_year_id: yearId,
      semester_id: termId,
      calendar_variant_id: variant.id,
      status: "draft",
      current_version: 1,
    })
    .select("*")
    .single();

  if (createError) throw createError;

  const { data: version, error: versionError } = await resolved.client
    .from("semester_plan_versions")
    .insert({
      semester_plan_id: created.id,
      version_number: 1,
      status: "draft",
      snapshot: { entries: [], overrides: [] } as Json,
      created_by: userId,
    })
    .select("*")
    .single();

  if (versionError) throw versionError;

  await linkOrphanEntriesToPlan(resolved, subject, created.id, version.id);
  return { plan: created, version };
}

export async function updateSemesterPlanCalendarVariant(
  planId: string,
  calendarVariantId: string,
  context?: SupabaseUserContext,
): Promise<SemesterPlanRow> {
  const resolved = await resolveUserContext(context);
  if (!resolved) throw new Error("Unauthorized");

  const plan = await getSemesterPlanById(planId, resolved);
  if (!plan || plan.user_id !== resolved.userId) {
    throw new Error(CALENDAR_VARIANT_UNAUTHORIZED_MESSAGE);
  }

  assertWritableDraft(plan);

  const variant = await resolveSelectableVariantForWrite(resolved.client, {
    id: calendarVariantId,
  });
  const general = await resolveSelectableVariantForWrite(resolved.client, {
    code: GENERAL_VARIANT_CODE,
  });

  if (!shouldPersistPlanVariantChange(plan.calendar_variant_id, variant.id, general.id)) {
    return plan;
  }

  const { data, error } = await resolved.client
    .from("semester_plans")
    .update({ calendar_variant_id: variant.id })
    .eq("id", plan.id)
    .eq("user_id", resolved.userId)
    .eq("status", "draft")
    .select("*")
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error(CALENDAR_VARIANT_UNAUTHORIZED_MESSAGE);
  return data;
}

async function linkOrphanEntriesToPlan(
  context: SupabaseUserContext,
  subject: string,
  planId: string,
  versionId: string,
): Promise<void> {
  const { error } = await context.client
    .from("planner_entries")
    .update({
      semester_plan_id: planId,
      semester_plan_version_id: versionId,
    })
    .eq("user_id", context.userId)
    .eq("subject", subject)
    .is("semester_plan_id", null)
    .not("week_start_date", "eq", CONFIG_ACADEMIC_CALENDAR_DATE)
    .not("week_start_date", "eq", CONFIG_SCHEDULE_OVERRIDES_DATE);

  if (error) throw error;
}

export async function loadPlanEntries(
  planId: string,
  versionId: string,
  context?: SupabaseUserContext,
): Promise<CalculatedLessonEntry[]> {
  const resolved = await resolveUserContext(context);
  if (!resolved) return [];

  const { data, error } = await resolved.client
    .from("planner_entries")
    .select("notes")
    .eq("semester_plan_id", planId)
    .eq("semester_plan_version_id", versionId)
    .not("week_start_date", "eq", CONFIG_ACADEMIC_CALENDAR_DATE)
    .not("week_start_date", "eq", CONFIG_SCHEDULE_OVERRIDES_DATE)
    .neq("subject", "OVERRIDES");

  if (error) throw error;

  const entries: CalculatedLessonEntry[] = [];
  for (const row of data ?? []) {
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

export function parseVersionSnapshot(snapshot: Json): SemesterPlanSnapshot {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return { entries: [] };
  }

  const raw = snapshot as Record<string, unknown>;
  const entriesRaw = Array.isArray(raw.entries) ? raw.entries : [];
  const entries: CalculatedLessonEntry[] = [];

  for (const item of entriesRaw) {
    if (!item || typeof item !== "object") continue;
    const normalised = normalisePlanEntry(item as Partial<CalculatedLessonEntry>);
    if (normalised) entries.push(normalised);
  }

  return {
    capturedAt: typeof raw.capturedAt === "string" ? raw.capturedAt : undefined,
    entries,
    overrides: raw.overrides,
    clonedFromVersion:
      typeof raw.clonedFromVersion === "number" ? raw.clonedFromVersion : undefined,
  };
}

/** Historical approved version for print/audit — never mutates operational rows. */
export async function loadHistoricalVersionEntries(
  planId: string,
  versionNumber: number,
  context?: SupabaseUserContext,
): Promise<{ version: SemesterPlanVersionRow; entries: CalculatedLessonEntry[] }> {
  const resolved = await resolveUserContext(context);
  if (!resolved) throw new Error("Unauthorized");

  const { data: version, error } = await resolved.client
    .from("semester_plan_versions")
    .select("*")
    .eq("semester_plan_id", planId)
    .eq("version_number", versionNumber)
    .maybeSingle();

  if (error) throw error;
  if (!version) throw new Error("الإصدار غير موجود");

  const snap = parseVersionSnapshot(version.snapshot);
  return { version, entries: snap.entries ?? [] };
}

async function callPlanRpc(
  fn:
    | "approve_semester_plan"
    | "start_semester_plan_execution"
    | "complete_semester_plan"
    | "archive_semester_plan"
    | "create_semester_plan_version",
  planId: string,
  context?: SupabaseUserContext,
): Promise<SemesterPlanRow> {
  const resolved = await resolveUserContext(context);
  if (!resolved) throw new Error("Unauthorized");

  const { data, error } = await resolved.client.rpc(fn, { p_plan_id: planId });
  if (error) throw error;
  if (!data) throw new Error("تعذر تحديث حالة الخطة");
  return data as SemesterPlanRow;
}

export async function approveSemesterPlan(
  planId: string,
  context?: SupabaseUserContext,
): Promise<SemesterPlanContext> {
  const resolved = await resolveUserContext(context);
  if (!resolved) throw new Error("Unauthorized");

  const plan = await callPlanRpc("approve_semester_plan", planId, resolved);
  const version = await getCurrentPlanVersion(plan, resolved);
  if (!version) throw new Error("إصدار خطة الفصل غير موجود");
  return { plan, version };
}

export async function startSemesterPlanExecution(
  planId: string,
  context?: SupabaseUserContext,
): Promise<SemesterPlanContext> {
  const resolved = await resolveUserContext(context);
  if (!resolved) throw new Error("Unauthorized");

  const plan = await callPlanRpc("start_semester_plan_execution", planId, resolved);
  const version = await getCurrentPlanVersion(plan, resolved);
  if (!version) throw new Error("إصدار خطة الفصل غير موجود");
  return { plan, version };
}

export async function completeSemesterPlan(
  planId: string,
  context?: SupabaseUserContext,
): Promise<SemesterPlanContext> {
  const resolved = await resolveUserContext(context);
  if (!resolved) throw new Error("Unauthorized");

  const plan = await callPlanRpc("complete_semester_plan", planId, resolved);
  const version = await getCurrentPlanVersion(plan, resolved);
  if (!version) throw new Error("إصدار خطة الفصل غير موجود");
  return { plan, version };
}

export async function archiveSemesterPlan(
  planId: string,
  context?: SupabaseUserContext,
): Promise<SemesterPlanContext> {
  const resolved = await resolveUserContext(context);
  if (!resolved) throw new Error("Unauthorized");

  const plan = await callPlanRpc("archive_semester_plan", planId, resolved);
  const version = await getCurrentPlanVersion(plan, resolved);
  if (!version) throw new Error("إصدار خطة الفصل غير موجود");
  return { plan, version };
}

export async function createSemesterPlanVersion(
  planId: string,
  context?: SupabaseUserContext,
): Promise<SemesterPlanContext> {
  const resolved = await resolveUserContext(context);
  if (!resolved) throw new Error("Unauthorized");

  const plan = await callPlanRpc("create_semester_plan_version", planId, resolved);
  const version = await getCurrentPlanVersion(plan, resolved);
  if (!version) throw new Error("إصدار خطة الفصل غير موجود");
  return { plan, version };
}

export { assertWritableDraft };
