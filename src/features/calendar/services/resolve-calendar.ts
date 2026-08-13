/**
 * Resolves the official academic calendar for a plan/variant.
 *
 * Base dates always come from academic_years + semesters.
 * Regional variants add optional term overrides and exceptions.
 * Missing official dates fail closed. No legacy fixture calendar.
 */

import { resolveUserContext, type SupabaseUserContext } from "@/platform/database/supabase/context";

import {
  getActiveAcademicYear,
  getCurrentAcademicTerm,
  type CalendarAcademicYear,
  type CalendarTerm,
} from "./calendar.service.ts";

export const GENERAL_VARIANT_CODE = "GENERAL";
export const WESTERN_VARIANT_CODE = "WESTERN";

export const CALENDAR_RESOLVE_REQUIRED_MESSAGE =
  "لا يمكن حل التقويم الدراسي بدون عام وفصل دراسي صالحين.";

export interface CalendarVariantRecord {
  id: string;
  code: string;
  label: string;
}

export interface ResolvedCalendarHoliday {
  date: string;
  label: string;
}

export interface ResolvedCalendarRange {
  startDate: string;
  endDate: string;
  label: string;
}

export interface ResolvedCalendar {
  year: CalendarAcademicYear;
  semester: CalendarTerm;
  variant: CalendarVariantRecord;
  effectiveSemesterStart: string;
  effectiveSemesterEnd: string;
  holidays: ResolvedCalendarHoliday[];
  examRanges: ResolvedCalendarRange[];
  remoteRanges: ResolvedCalendarRange[];
  extraTeachingDays: string[];
  cancelledDays: string[];
  source: "base" | "override";
}

export interface ResolveCalendarInput {
  academicYearId?: string | null;
  semesterId?: string | null;
  variantId?: string | null;
  variantCode?: string | null;
  plan?: {
    academic_year_id?: string | null;
    semester_id?: string | null;
    calendar_variant_id?: string | null;
  } | null;
}

type Client = NonNullable<SupabaseUserContext>["client"];

interface ExceptionRow {
  id: string;
  variant_id: string;
  kind: string;
  action: string;
  starts_at: string;
  ends_at: string;
  title: string;
  replaces_exception_id: string | null;
  is_teaching_day: boolean;
  is_remote: boolean;
  semester_id: string | null;
}

function mapYear(row: {
  id: string;
  label: string;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
}): CalendarAcademicYear {
  return {
    id: row.id,
    label: row.label,
    startDate: row.start_date,
    endDate: row.end_date,
    isActive: row.is_active,
  };
}

function mapSemester(row: {
  id: string;
  label: string;
  start_date: string | null;
  end_date: string | null;
  order_index: number;
}): CalendarTerm {
  return {
    id: row.id,
    label: row.label,
    startDate: row.start_date,
    endDate: row.end_date,
    orderIndex: row.order_index,
  };
}

function expandDateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(last.getTime())) return dates;

  while (cursor <= last) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function applyExceptions(rows: ExceptionRow[]): {
  holidays: ResolvedCalendarHoliday[];
  examRanges: ResolvedCalendarRange[];
  remoteRanges: ResolvedCalendarRange[];
  extraTeachingDays: string[];
  cancelledDays: string[];
} {
  const holidays: ResolvedCalendarHoliday[] = [];
  const examRanges: ResolvedCalendarRange[] = [];
  const remoteRanges: ResolvedCalendarRange[] = [];
  const extraTeachingDays: string[] = [];
  const cancelledDays: string[] = [];

  for (const row of rows) {
    if (row.action === "remove" && row.kind === "holiday") {
      const removedDates = new Set(expandDateRange(row.starts_at, row.ends_at));
      for (let i = holidays.length - 1; i >= 0; i -= 1) {
        if (removedDates.has(holidays[i].date)) {
          holidays.splice(i, 1);
        }
      }
      continue;
    }

    if (row.action === "remove") {
      cancelledDays.push(...expandDateRange(row.starts_at, row.ends_at));
      continue;
    }

    if (row.kind === "holiday") {
      for (const date of expandDateRange(row.starts_at, row.ends_at)) {
        holidays.push({ date, label: row.title });
      }
      continue;
    }

    if (row.kind === "exam") {
      examRanges.push({
        startDate: row.starts_at,
        endDate: row.ends_at,
        label: row.title,
      });
      continue;
    }

    if (row.kind === "remote") {
      remoteRanges.push({
        startDate: row.starts_at,
        endDate: row.ends_at,
        label: row.title,
      });
      continue;
    }

    if (row.kind === "teaching_day") {
      extraTeachingDays.push(...expandDateRange(row.starts_at, row.ends_at));
      continue;
    }

    if (row.kind === "non_teaching_day" || row.kind === "break") {
      cancelledDays.push(...expandDateRange(row.starts_at, row.ends_at));
    }
  }

  return {
    holidays,
    examRanges,
    remoteRanges,
    extraTeachingDays: [...new Set(extraTeachingDays)],
    cancelledDays: [...new Set(cancelledDays)],
  };
}

async function loadYear(client: Client, yearId: string): Promise<CalendarAcademicYear | null> {
  const { data, error } = await client
    .from("academic_years")
    .select("id, label, start_date, end_date, is_active")
    .eq("id", yearId)
    .maybeSingle();

  if (error) throw error;
  return data ? mapYear(data) : null;
}

async function loadSemester(client: Client, semesterId: string): Promise<CalendarTerm | null> {
  const { data, error } = await client
    .from("semesters")
    .select("id, label, start_date, end_date, order_index, academic_year_id")
    .eq("id", semesterId)
    .maybeSingle();

  if (error) throw error;
  return data ? mapSemester(data) : null;
}

async function loadVariant(
  client: Client,
  input: { id?: string | null; code?: string | null },
): Promise<CalendarVariantRecord> {
  let query = client.from("calendar_variants").select("id, code, label");

  if (input.id) query = query.eq("id", input.id);
  else query = query.eq("code", input.code ?? GENERAL_VARIANT_CODE);

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new Error(CALENDAR_RESOLVE_REQUIRED_MESSAGE);
  }

  return { id: data.id, code: data.code, label: data.label };
}

async function loadTermOverride(
  client: Client,
  variantId: string,
  semesterId: string,
): Promise<{ start_date: string | null; end_date: string | null } | null> {
  const { data, error } = await client
    .from("calendar_term_overrides")
    .select("start_date, end_date")
    .eq("variant_id", variantId)
    .eq("semester_id", semesterId)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

async function loadExceptions(
  client: Client,
  variantId: string,
  yearId: string,
  semesterId: string,
): Promise<ExceptionRow[]> {
  const { data, error } = await client
    .from("calendar_exceptions")
    .select(
      "id, variant_id, kind, action, starts_at, ends_at, title, replaces_exception_id, is_teaching_day, is_remote, semester_id",
    )
    .eq("variant_id", variantId)
    .eq("academic_year_id", yearId)
    .order("starts_at", { ascending: true });

  if (error) throw error;

  return (data ?? []).filter(
    (row) => row.semester_id == null || row.semester_id === semesterId,
  ) as ExceptionRow[];
}

export async function resolveCalendar(
  input: ResolveCalendarInput = {},
  context?: SupabaseUserContext,
): Promise<ResolvedCalendar> {
  const resolved = await resolveUserContext(context);
  if (!resolved) {
    throw new Error(CALENDAR_RESOLVE_REQUIRED_MESSAGE);
  }

  const yearId = input.academicYearId ?? input.plan?.academic_year_id ?? null;
  const semesterId = input.semesterId ?? input.plan?.semester_id ?? null;

  const year = yearId
    ? await loadYear(resolved.client, yearId)
    : await getActiveAcademicYear(resolved);
  const semester = semesterId
    ? await loadSemester(resolved.client, semesterId)
    : await getCurrentAcademicTerm(resolved);

  if (!year || !semester?.startDate || !semester.endDate) {
    throw new Error(CALENDAR_RESOLVE_REQUIRED_MESSAGE);
  }

  const variant = await loadVariant(resolved.client, {
    id: input.variantId ?? input.plan?.calendar_variant_id ?? null,
    code: input.variantCode ?? null,
  });

  const override = await loadTermOverride(resolved.client, variant.id, semester.id);
  const effectiveSemesterStart = override?.start_date || semester.startDate;
  const effectiveSemesterEnd = override?.end_date || semester.endDate;

  if (!effectiveSemesterStart || !effectiveSemesterEnd) {
    throw new Error(CALENDAR_RESOLVE_REQUIRED_MESSAGE);
  }

  const generalVariant =
    variant.code === GENERAL_VARIANT_CODE
      ? variant
      : await loadVariant(resolved.client, { code: GENERAL_VARIANT_CODE });

  const generalExceptions = await loadExceptions(
    resolved.client,
    generalVariant.id,
    year.id,
    semester.id,
  );
  const variantExceptions =
    variant.id === generalVariant.id
      ? []
      : await loadExceptions(resolved.client, variant.id, year.id, semester.id);

  const applied = applyExceptions([...generalExceptions, ...variantExceptions]);
  const hasOverride =
    Boolean(override?.start_date || override?.end_date) ||
    generalExceptions.length > 0 ||
    variantExceptions.length > 0;

  return {
    year,
    semester,
    variant,
    effectiveSemesterStart,
    effectiveSemesterEnd,
    holidays: applied.holidays,
    examRanges: applied.examRanges,
    remoteRanges: applied.remoteRanges,
    extraTeachingDays: applied.extraTeachingDays,
    cancelledDays: applied.cancelledDays,
    source: hasOverride ? "override" : "base",
  };
}

export async function resolveCalendarForPlan(
  plan: NonNullable<ResolveCalendarInput["plan"]>,
  context?: SupabaseUserContext,
): Promise<ResolvedCalendar> {
  return resolveCalendar({ plan }, context);
}
