/**
 * Platform academic year / semester management.
 *
 * Admin writes look up and update rows by id. RLS (admin-only INSERT/UPDATE/DELETE)
 * is the authorization boundary. `user_id` is created-by metadata on INSERT from
 * the JWT and is never taken from client input or changed on UPDATE.
 */

import { assertAdmin } from "../../../platform/auth/assert-admin.ts";
import type { SupabaseUserContext } from "../../../platform/database/supabase/context.ts";
import {
  assertSemesterWithinAcademicYear,
  assertSemestersDoNotOverlap,
  assertValidDateRange,
  assertValidStartAndOptionalEnd,
  normalizeCalendarLabel,
  normalizeOptionalIsoDate,
} from "./academic-calendar.logic.ts";

type AdminClient = Awaited<
  typeof import("../../../platform/database/supabase/client.server.ts")
>["supabaseAdmin"];

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

async function requireAdminActor(
  auth: SupabaseUserContext,
  adminClient: AdminClient,
): Promise<SupabaseUserContext> {
  const verified = requireAuth(auth);
  await assertAdmin(adminClient, verified.userId);
  return verified;
}

function mapYear(row: {
  id: string;
  label: string;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
}): AcademicYearRecord {
  return {
    id: row.id,
    label: row.label,
    startDate: row.start_date ?? "",
    endDate: row.end_date ?? "",
    isActive: row.is_active,
  };
}

function mapSemester(
  row: {
    id: string;
    academic_year_id: string | null;
    label: string;
    start_date: string | null;
    end_date: string | null;
    order_index: number;
  },
  academicYearId: string,
): SemesterRecord {
  return {
    id: row.id,
    academicYearId: row.academic_year_id ?? academicYearId,
    label: row.label,
    startDate: row.start_date ?? "",
    endDate: row.end_date ?? "",
    orderIndex: row.order_index,
  };
}

async function deactivateOtherActiveYears(
  client: SupabaseUserContext["client"],
  exceptYearId?: string,
): Promise<void> {
  let query = client.from("academic_years").update({ is_active: false }).eq("is_active", true);
  if (exceptYearId) {
    query = query.neq("id", exceptYearId);
  }
  const { error } = await query;
  if (error) throw error;
}

async function listSemestersByAcademicYearId(
  client: SupabaseUserContext["client"],
  academicYearId: string,
): Promise<SemesterRecord[]> {
  const { data, error } = await client
    .from("semesters")
    .select("id, academic_year_id, label, start_date, end_date, order_index")
    .eq("academic_year_id", academicYearId)
    .order("order_index", { ascending: true })
    .order("start_date", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => mapSemester(row, academicYearId));
}

// --- Read / list (JWT-scoped; current owner RLS) ---

export async function listAcademicYears(auth: SupabaseUserContext): Promise<AcademicYearRecord[]> {
  const { client, userId } = requireAuth(auth);

  const { data, error } = await client
    .from("academic_years")
    .select("id, label, start_date, end_date, is_active")
    .eq("user_id", userId)
    .order("is_active", { ascending: false })
    .order("start_date", { ascending: false });

  if (error) throw error;

  return (data ?? []).map(mapYear);
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

  return (data ?? []).map((row) => mapSemester(row, academicYearId));
}

// --- Admin write operations (JWT user_id; assertAdmin required) ---

export async function createAcademicYear(
  auth: SupabaseUserContext,
  input: { label: string; startDate: string; endDate: string; activate?: boolean },
): Promise<AcademicYearRecord> {
  const { client, userId } = requireAuth(auth);
  const label = normalizeCalendarLabel(input.label);
  assertValidDateRange(input.startDate, input.endDate);

  const { data: existingRows, error: existingError } = await client
    .from("academic_years")
    .select("id")
    .limit(1);

  if (existingError) throw existingError;

  const shouldActivate = input.activate === true || (existingRows ?? []).length === 0;

  if (shouldActivate) {
    await deactivateOtherActiveYears(client);
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

  return mapYear(data);
}

export async function activateAcademicYear(
  auth: SupabaseUserContext,
  academicYearId: string,
): Promise<AcademicYearRecord> {
  const { client } = requireAuth(auth);

  if (!academicYearId || typeof academicYearId !== "string") {
    throw new Error("معرّف السنة الدراسية مطلوب.");
  }

  const { data: year, error: yearError } = await client
    .from("academic_years")
    .select("id, start_date, end_date")
    .eq("id", academicYearId)
    .maybeSingle();

  if (yearError) throw yearError;
  if (!year) {
    throw new Error("السنة الدراسية غير موجودة.");
  }
  if (!year.start_date) {
    throw new Error("لا يمكن تفعيل سنة دراسية بدون تاريخ بداية صحيح.");
  }

  await deactivateOtherActiveYears(client, year.id);

  const { data, error } = await client
    .from("academic_years")
    .update({ is_active: true })
    .eq("id", year.id)
    .select("id, label, start_date, end_date, is_active")
    .single();

  if (error || !data) throw error ?? new Error("فشل تفعيل السنة الدراسية.");

  return mapYear(data);
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
  assertValidDateRange(input.startDate, input.endDate);

  const { data: year, error: yearError } = await client
    .from("academic_years")
    .select("id, start_date, end_date")
    .eq("id", input.academicYearId)
    .maybeSingle();

  if (yearError) throw yearError;
  if (!year) {
    throw new Error("السنة الدراسية غير موجودة.");
  }
  if (!year.start_date) {
    throw new Error("السنة الدراسية تفتقد تاريخ البداية.");
  }
  if (input.startDate < year.start_date || input.endDate < year.start_date) {
    throw new Error("فترة الفصل يجب أن تكون ضمن حدود السنة الدراسية.");
  }
  if (year.end_date) {
    assertSemesterWithinAcademicYear({
      semesterStart: input.startDate,
      semesterEnd: input.endDate,
      yearStart: year.start_date,
      yearEnd: year.end_date,
    });
  }

  const existing = await listSemestersByAcademicYearId(client, input.academicYearId);
  assertSemestersDoNotOverlap(existing, {
    startDate: input.startDate,
    endDate: input.endDate,
  });
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

  return mapSemester(data, year.id);
}

export async function updateAcademicYear(
  auth: SupabaseUserContext,
  input: {
    academicYearId: string;
    label: string;
    startDate: string;
    endDate?: string | null;
    isActive?: boolean;
  },
): Promise<AcademicYearRecord> {
  const { client } = requireAuth(auth);
  const label = normalizeCalendarLabel(input.label);
  const endDate = normalizeOptionalIsoDate(input.endDate);
  assertValidStartAndOptionalEnd(input.startDate, endDate);

  const { data: owned, error: ownedError } = await client
    .from("academic_years")
    .select("id, is_active")
    .eq("id", input.academicYearId)
    .maybeSingle();

  if (ownedError) throw ownedError;
  if (!owned) {
    throw new Error("السنة الدراسية غير موجودة.");
  }

  const semesters = await listSemestersByAcademicYearId(client, owned.id);
  for (const semester of semesters) {
    if (semester.startDate && semester.startDate < input.startDate) {
      throw new Error("فترة الفصل يجب أن تكون ضمن حدود السنة الدراسية.");
    }
    if (endDate && semester.startDate && semester.startDate > endDate) {
      throw new Error("فترة الفصل يجب أن تكون ضمن حدود السنة الدراسية.");
    }
    if (semester.endDate && semester.endDate < input.startDate) {
      throw new Error("فترة الفصل يجب أن تكون ضمن حدود السنة الدراسية.");
    }
    if (endDate && semester.endDate && semester.endDate > endDate) {
      throw new Error("فترة الفصل يجب أن تكون ضمن حدود السنة الدراسية.");
    }
    if (!semester.startDate || !semester.endDate || !endDate) continue;
    assertSemesterWithinAcademicYear({
      semesterStart: semester.startDate,
      semesterEnd: semester.endDate,
      yearStart: input.startDate,
      yearEnd: endDate,
    });
  }

  const nextActive = input.isActive ?? owned.is_active;
  if (nextActive) {
    await deactivateOtherActiveYears(client, owned.id);
  }

  const { data, error } = await client
    .from("academic_years")
    .update({
      label,
      start_date: input.startDate,
      end_date: endDate,
      is_active: nextActive,
    })
    .eq("id", owned.id)
    .select("id, label, start_date, end_date, is_active")
    .single();

  if (error || !data) throw error ?? new Error("فشل تعديل السنة الدراسية.");
  if (data.id !== owned.id) {
    throw new Error("تعذّر تعديل السنة دون تغيير المعرّف.");
  }

  return mapYear(data);
}

export async function updateSemester(
  auth: SupabaseUserContext,
  input: {
    semesterId: string;
    academicYearId: string;
    label: string;
    startDate: string;
    endDate?: string | null;
    orderIndex?: number;
  },
): Promise<SemesterRecord> {
  const { client } = requireAuth(auth);
  const label = normalizeCalendarLabel(input.label);
  const endDate = normalizeOptionalIsoDate(input.endDate);
  assertValidStartAndOptionalEnd(input.startDate, endDate);

  const { data: owned, error: ownedError } = await client
    .from("semesters")
    .select("id, academic_year_id, order_index")
    .eq("id", input.semesterId)
    .maybeSingle();

  if (ownedError) throw ownedError;
  if (!owned?.academic_year_id) {
    throw new Error("الفصل الدراسي غير موجود.");
  }
  if (owned.academic_year_id !== input.academicYearId) {
    throw new Error("الفصل الدراسي لا ينتمي إلى السنة المحددة.");
  }

  const { data: year, error: yearError } = await client
    .from("academic_years")
    .select("id, start_date, end_date")
    .eq("id", owned.academic_year_id)
    .maybeSingle();

  if (yearError) throw yearError;
  if (!year) {
    throw new Error("السنة الدراسية غير موجودة.");
  }
  if (!year.start_date) {
    throw new Error("السنة الدراسية تفتقد تاريخ البداية.");
  }

  if (input.startDate < year.start_date) {
    throw new Error("فترة الفصل يجب أن تكون ضمن حدود السنة الدراسية.");
  }
  if (year.end_date && input.startDate > year.end_date) {
    throw new Error("فترة الفصل يجب أن تكون ضمن حدود السنة الدراسية.");
  }
  if (endDate && endDate < year.start_date) {
    throw new Error("فترة الفصل يجب أن تكون ضمن حدود السنة الدراسية.");
  }
  if (year.end_date && endDate && endDate > year.end_date) {
    throw new Error("فترة الفصل يجب أن تكون ضمن حدود السنة الدراسية.");
  }
  if (endDate && year.end_date) {
    assertSemesterWithinAcademicYear({
      semesterStart: input.startDate,
      semesterEnd: endDate,
      yearStart: year.start_date,
      yearEnd: year.end_date,
    });
  }

  const siblings = await listSemestersByAcademicYearId(client, year.id);
  assertSemestersDoNotOverlap(siblings, {
    id: owned.id,
    startDate: input.startDate,
    endDate: endDate ?? "",
  });

  const orderIndex =
    typeof input.orderIndex === "number" && Number.isInteger(input.orderIndex)
      ? input.orderIndex
      : owned.order_index;

  const { data, error } = await client
    .from("semesters")
    .update({
      label,
      start_date: input.startDate,
      end_date: endDate,
      order_index: orderIndex,
    })
    .eq("id", owned.id)
    .select("id, academic_year_id, label, start_date, end_date, order_index")
    .single();

  if (error || !data) throw error ?? new Error("فشل تعديل الفصل الدراسي.");
  if (data.id !== owned.id) {
    throw new Error("تعذّر تعديل الفصل دون تغيير المعرّف.");
  }

  return mapSemester(data, year.id);
}

async function countLinkedLessonSessions(
  auth: SupabaseUserContext,
  column: "academic_year_id" | "semester_id",
  id: string,
): Promise<number> {
  const { client } = requireAuth(auth);
  const { data, error } = await client.from("lesson_sessions").select("id").eq(column, id);
  if (error) throw error;
  return (data ?? []).length;
}

export async function deleteAcademicYear(
  auth: SupabaseUserContext,
  academicYearId: string,
): Promise<never> {
  requireAuth(auth);
  const linked = await countLinkedLessonSessions(auth, "academic_year_id", academicYearId);
  if (linked > 0) {
    throw new Error(`لا يمكن حذف السنة الدراسية لوجود ${linked} حصة مرتبطة بها.`);
  }
  throw new Error("حذف السنة الدراسية غير متاح حاليًا لحماية البيانات.");
}

export async function deleteSemester(
  auth: SupabaseUserContext,
  semesterId: string,
): Promise<never> {
  requireAuth(auth);
  const linked = await countLinkedLessonSessions(auth, "semester_id", semesterId);
  if (linked > 0) {
    throw new Error(`لا يمكن حذف الفصل الدراسي لوجود ${linked} حصة مرتبطة به.`);
  }
  throw new Error("حذف الفصل الدراسي غير متاح حاليًا لحماية البيانات.");
}

export async function listAdminAcademicYears(
  auth: SupabaseUserContext,
  adminClient: AdminClient,
): Promise<AcademicYearRecord[]> {
  const { client } = await requireAdminActor(auth, adminClient);

  const { data, error } = await client
    .from("academic_years")
    .select("id, label, start_date, end_date, is_active")
    .order("is_active", { ascending: false })
    .order("start_date", { ascending: false });

  if (error) throw error;

  return (data ?? []).map(mapYear);
}

export async function createAdminAcademicYear(
  auth: SupabaseUserContext,
  adminClient: AdminClient,
  input: { label: string; startDate: string; endDate: string; activate?: boolean },
): Promise<AcademicYearRecord> {
  await requireAdminActor(auth, adminClient);
  return createAcademicYear(auth, input);
}

export async function activateAdminAcademicYear(
  auth: SupabaseUserContext,
  adminClient: AdminClient,
  academicYearId: string,
): Promise<AcademicYearRecord> {
  await requireAdminActor(auth, adminClient);
  return activateAcademicYear(auth, academicYearId);
}

export async function listAdminSemestersForYear(
  auth: SupabaseUserContext,
  adminClient: AdminClient,
  academicYearId: string,
): Promise<SemesterRecord[]> {
  const { client } = await requireAdminActor(auth, adminClient);

  const { data: year, error: yearError } = await client
    .from("academic_years")
    .select("id")
    .eq("id", academicYearId)
    .maybeSingle();

  if (yearError) throw yearError;
  if (!year) {
    throw new Error("السنة الدراسية غير موجودة.");
  }

  const { data, error } = await client
    .from("semesters")
    .select("id, academic_year_id, label, start_date, end_date, order_index")
    .eq("academic_year_id", academicYearId)
    .order("order_index", { ascending: true })
    .order("start_date", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => mapSemester(row, academicYearId));
}

export async function createAdminSemester(
  auth: SupabaseUserContext,
  adminClient: AdminClient,
  input: {
    academicYearId: string;
    label: string;
    startDate: string;
    endDate: string;
    orderIndex?: number;
  },
): Promise<SemesterRecord> {
  await requireAdminActor(auth, adminClient);
  return createSemester(auth, input);
}

export async function updateAdminAcademicYear(
  auth: SupabaseUserContext,
  adminClient: AdminClient,
  input: {
    academicYearId: string;
    label: string;
    startDate: string;
    endDate?: string | null;
    isActive?: boolean;
  },
): Promise<AcademicYearRecord> {
  await requireAdminActor(auth, adminClient);
  return updateAcademicYear(auth, input);
}

export async function updateAdminSemester(
  auth: SupabaseUserContext,
  adminClient: AdminClient,
  input: {
    semesterId: string;
    academicYearId: string;
    label: string;
    startDate: string;
    endDate?: string | null;
    orderIndex?: number;
  },
): Promise<SemesterRecord> {
  await requireAdminActor(auth, adminClient);
  return updateSemester(auth, input);
}

export async function deleteAdminAcademicYear(
  auth: SupabaseUserContext,
  adminClient: AdminClient,
  academicYearId: string,
): Promise<never> {
  await requireAdminActor(auth, adminClient);
  return deleteAcademicYear(auth, academicYearId);
}

export async function deleteAdminSemester(
  auth: SupabaseUserContext,
  adminClient: AdminClient,
  semesterId: string,
): Promise<never> {
  await requireAdminActor(auth, adminClient);
  return deleteSemester(auth, semesterId);
}
