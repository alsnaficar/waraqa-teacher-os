/**
 * Teacher-owned academic year / semester management.
 *
 * Ownership always comes from auth.userId — never from client-supplied owner fields.
 */

import type { SupabaseUserContext } from "../../../platform/database/supabase/context.ts";
import {
  assertSemesterWithinAcademicYear,
  assertValidDateRange,
  normalizeCalendarLabel,
} from "./academic-calendar.logic.ts";

export interface AcademicYearRecord {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

export interface SemesterRecord {
  id: string;
  academicYearId: string;
  label: string;
  startDate: string;
  endDate: string;
  orderIndex: number;
}

function requireAuth(auth: SupabaseUserContext): SupabaseUserContext {
  if (!auth?.userId || !auth.client) {
    throw new Error("Unauthorized: missing authenticated user");
  }
  return auth;
}

export async function listAcademicYears(auth: SupabaseUserContext): Promise<AcademicYearRecord[]> {
  const { client, userId } = requireAuth(auth);

  const { data, error } = await client
    .from("academic_years")
    .select("id, label, start_date, end_date, is_active")
    .eq("user_id", userId)
    .order("is_active", { ascending: false })
    .order("start_date", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    label: row.label,
    startDate: row.start_date ?? "",
    endDate: row.end_date ?? "",
    isActive: row.is_active,
  }));
}

export async function createAcademicYear(
  auth: SupabaseUserContext,
  input: { label: string; startDate: string; endDate: string; activate?: boolean },
): Promise<AcademicYearRecord> {
  const { client, userId } = requireAuth(auth);
  const label = normalizeCalendarLabel(input.label);
  assertValidDateRange(input.startDate, input.endDate);

  const existing = await listAcademicYears(auth);
  const shouldActivate = input.activate === true || existing.length === 0;

  if (shouldActivate) {
    const { error: clearError } = await client
      .from("academic_years")
      .update({ is_active: false })
      .eq("user_id", userId)
      .eq("is_active", true);

    if (clearError) throw clearError;
  }

  const { data, error } = await client
    .from("academic_years")
    .insert({
      user_id: userId,
      label,
      start_date: input.startDate,
      end_date: input.endDate,
      is_active: shouldActivate,
    })
    .select("id, label, start_date, end_date, is_active")
    .single();

  if (error || !data) throw error ?? new Error("فشل إنشاء السنة الدراسية.");

  return {
    id: data.id,
    label: data.label,
    startDate: data.start_date ?? input.startDate,
    endDate: data.end_date ?? input.endDate,
    isActive: data.is_active,
  };
}

export async function activateAcademicYear(
  auth: SupabaseUserContext,
  academicYearId: string,
): Promise<AcademicYearRecord> {
  const { client, userId } = requireAuth(auth);

  if (!academicYearId || typeof academicYearId !== "string") {
    throw new Error("معرّف السنة الدراسية مطلوب.");
  }

  const { data: owned, error: ownedError } = await client
    .from("academic_years")
    .select("id")
    .eq("id", academicYearId)
    .eq("user_id", userId)
    .maybeSingle();

  if (ownedError) throw ownedError;
  if (!owned) {
    throw new Error("السنة الدراسية غير موجودة أو غير مملوكة لك.");
  }

  const { error: clearError } = await client
    .from("academic_years")
    .update({ is_active: false })
    .eq("user_id", userId)
    .eq("is_active", true);

  if (clearError) throw clearError;

  const { data, error } = await client
    .from("academic_years")
    .update({ is_active: true })
    .eq("id", academicYearId)
    .eq("user_id", userId)
    .select("id, label, start_date, end_date, is_active")
    .single();

  if (error || !data) throw error ?? new Error("فشل تفعيل السنة الدراسية.");

  return {
    id: data.id,
    label: data.label,
    startDate: data.start_date ?? "",
    endDate: data.end_date ?? "",
    isActive: data.is_active,
  };
}

export async function listSemestersForYear(
  auth: SupabaseUserContext,
  academicYearId: string,
): Promise<SemesterRecord[]> {
  const { client, userId } = requireAuth(auth);

  const { data: year, error: yearError } = await client
    .from("academic_years")
    .select("id")
    .eq("id", academicYearId)
    .eq("user_id", userId)
    .maybeSingle();

  if (yearError) throw yearError;
  if (!year) {
    throw new Error("السنة الدراسية غير موجودة أو غير مملوكة لك.");
  }

  const { data, error } = await client
    .from("semesters")
    .select("id, academic_year_id, label, start_date, end_date, order_index")
    .eq("user_id", userId)
    .eq("academic_year_id", academicYearId)
    .order("order_index", { ascending: true })
    .order("start_date", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    academicYearId: row.academic_year_id ?? academicYearId,
    label: row.label,
    startDate: row.start_date ?? "",
    endDate: row.end_date ?? "",
    orderIndex: row.order_index,
  }));
}

export async function createSemester(
  auth: SupabaseUserContext,
  input: {
    academicYearId: string;
    label: string;
    startDate: string;
    endDate: string;
    orderIndex?: number;
  },
): Promise<SemesterRecord> {
  const { client, userId } = requireAuth(auth);
  const label = normalizeCalendarLabel(input.label);

  const { data: year, error: yearError } = await client
    .from("academic_years")
    .select("id, start_date, end_date")
    .eq("id", input.academicYearId)
    .eq("user_id", userId)
    .maybeSingle();

  if (yearError) throw yearError;
  if (!year) {
    throw new Error("السنة الدراسية غير موجودة أو غير مملوكة لك.");
  }
  if (!year.start_date || !year.end_date) {
    throw new Error("السنة الدراسية تفتقد تواريخ البداية/النهاية.");
  }

  assertSemesterWithinAcademicYear({
    semesterStart: input.startDate,
    semesterEnd: input.endDate,
    yearStart: year.start_date,
    yearEnd: year.end_date,
  });

  const existing = await listSemestersForYear(auth, input.academicYearId);
  const orderIndex =
    typeof input.orderIndex === "number" && Number.isInteger(input.orderIndex)
      ? input.orderIndex
      : existing.length;

  const { data, error } = await client
    .from("semesters")
    .insert({
      user_id: userId,
      academic_year_id: year.id,
      label,
      start_date: input.startDate,
      end_date: input.endDate,
      order_index: orderIndex,
    })
    .select("id, academic_year_id, label, start_date, end_date, order_index")
    .single();

  if (error || !data) throw error ?? new Error("فشل إنشاء الفصل الدراسي.");

  return {
    id: data.id,
    academicYearId: data.academic_year_id ?? year.id,
    label: data.label,
    startDate: data.start_date ?? input.startDate,
    endDate: data.end_date ?? input.endDate,
    orderIndex: data.order_index,
  };
}
