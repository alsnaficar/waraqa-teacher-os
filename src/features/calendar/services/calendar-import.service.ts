/**
 * Admin official-calendar import: extract draft, then approve inserts.
 * Gemini never inserts. Teachers cannot write calendar_exceptions.
 */

import { getGemini } from "../../ai/providers/gemini.ts";
import { assertAdmin } from "../../../platform/auth/assert-admin.ts";
import type { SupabaseUserContext } from "../../../platform/database/supabase/context.ts";
import {
  decodeCalendarImportBase64,
  validateCalendarImportFile,
} from "./calendar-import.limits.ts";
import {
  assertCalendarImportScopeInput,
  buildCalendarImportDraft,
  decideCalendarImportApproval,
  type CalendarImportApprovalItem,
  type CalendarImportDraft,
  type CalendarImportScope,
  type CalendarImportVariantCode,
  type ExistingCalendarException,
} from "./calendar-import.logic.ts";

export type { CalendarImportDraft, CalendarImportVariantCode } from "./calendar-import.logic.ts";
import {
  extractCalendarExceptionsFromFile,
  type CalendarImportGeminiLike,
} from "./calendar-import.extraction.ts";
import { GENERAL_VARIANT_CODE, WESTERN_VARIANT_CODE } from "./resolve-calendar.ts";

type AdminClient = Awaited<
  typeof import("../../../platform/database/supabase/client.server.ts")
>["supabaseAdmin"];

type Client = NonNullable<SupabaseUserContext>["client"];

export interface CalendarImportExtractInput {
  academicYearId: string;
  semesterId: string;
  variantCode: string;
  fileBase64: string;
  declaredMime?: string;
  declaredName?: string;
}

export interface CalendarImportApproveInput {
  academicYearId: string;
  semesterId: string;
  variantCode: string;
  items: CalendarImportApprovalItem[];
}

export interface CalendarImportApproveResult {
  insertedCount: number;
  duplicateCount: number;
  rejectedCount: number;
  duplicates: Array<{ title: string; message: string }>;
  rejected: Array<{ title: string; message: string }>;
}

export interface CalendarVariantOption {
  id: string;
  code: CalendarImportVariantCode;
  label: string;
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

async function loadImportScope(
  client: Client,
  input: { academicYearId: string; semesterId: string; variantCode: string },
): Promise<CalendarImportScope> {
  const variantCode = assertCalendarImportScopeInput(input);

  const { data: year, error: yearError } = await client
    .from("academic_years")
    .select("id, label, start_date, end_date")
    .eq("id", input.academicYearId)
    .maybeSingle();
  if (yearError) throw yearError;
  if (!year?.id || !year.start_date) {
    throw new Error("تعذر تحديد العام الدراسي.");
  }

  const { data: semester, error: semesterError } = await client
    .from("semesters")
    .select("id, label, start_date, end_date, academic_year_id")
    .eq("id", input.semesterId)
    .maybeSingle();
  if (semesterError) throw semesterError;
  if (!semester?.id || !semester.start_date || !semester.end_date) {
    throw new Error("تعذر تحديد الفصل الدراسي.");
  }
  if (semester.academic_year_id !== year.id) {
    throw new Error("الفصل الدراسي لا ينتمي إلى العام المحدد.");
  }

  const { data: variant, error: variantError } = await client
    .from("calendar_variants")
    .select("id, code, label")
    .eq("code", variantCode)
    .maybeSingle();
  if (variantError) throw variantError;
  if (
    !variant?.id ||
    (variant.code !== GENERAL_VARIANT_CODE && variant.code !== WESTERN_VARIANT_CODE)
  ) {
    throw new Error("تعذر تحديد التقويم (المنطقة).");
  }

  return {
    academicYearId: year.id,
    semesterId: semester.id,
    variantCode,
    variantId: variant.id,
    academicYearLabel: year.label,
    semesterLabel: semester.label,
    variantLabel: variant.label,
    yearStart: year.start_date,
    yearEnd: year.end_date,
    semesterStart: semester.start_date,
    semesterEnd: semester.end_date,
  };
}

async function loadExistingExceptions(
  client: Client,
  scope: CalendarImportScope,
): Promise<ExistingCalendarException[]> {
  const { data, error } = await client
    .from("calendar_exceptions")
    .select("variant_id, academic_year_id, semester_id, kind, starts_at, ends_at, title")
    .eq("variant_id", scope.variantId)
    .eq("academic_year_id", scope.academicYearId)
    .eq("semester_id", scope.semesterId);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    variantId: row.variant_id,
    academicYearId: row.academic_year_id,
    semesterId: row.semester_id,
    kind: row.kind,
    startDate: row.starts_at,
    endDate: row.ends_at,
    title: row.title,
  }));
}

export async function listAdminCalendarVariants(
  auth: SupabaseUserContext,
  adminClient: AdminClient,
): Promise<CalendarVariantOption[]> {
  const { client } = await requireAdminActor(auth, adminClient);
  const { data, error } = await client
    .from("calendar_variants")
    .select("id, code, label, sort_order")
    .in("code", [GENERAL_VARIANT_CODE, WESTERN_VARIANT_CODE])
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? [])
    .filter(
      (
        row,
      ): row is {
        id: string;
        code: CalendarImportVariantCode;
        label: string;
        sort_order: number;
      } => row.code === GENERAL_VARIANT_CODE || row.code === WESTERN_VARIANT_CODE,
    )
    .map((row) => ({ id: row.id, code: row.code, label: row.label }));
}

export async function extractOfficialCalendarDraft(
  auth: SupabaseUserContext,
  adminClient: AdminClient,
  input: CalendarImportExtractInput,
  deps: { ai?: CalendarImportGeminiLike } = {},
): Promise<CalendarImportDraft> {
  const { client } = await requireAdminActor(auth, adminClient);
  const scope = await loadImportScope(client, input);
  const bytes = decodeCalendarImportBase64(input.fileBase64);
  const { mime } = validateCalendarImportFile({
    bytes,
    declaredMime: input.declaredMime,
    declaredName: input.declaredName,
  });

  const ai = (deps.ai ?? getGemini()) as CalendarImportGeminiLike;
  const rawItems = await extractCalendarExceptionsFromFile({ bytes, mime }, ai);
  const existing = await loadExistingExceptions(client, scope);
  return buildCalendarImportDraft(scope, rawItems, existing);
}

export async function approveOfficialCalendarImport(
  auth: SupabaseUserContext,
  adminClient: AdminClient,
  input: CalendarImportApproveInput,
): Promise<CalendarImportApproveResult> {
  const { client } = await requireAdminActor(auth, adminClient);
  const scope = await loadImportScope(client, input);
  const existing = await loadExistingExceptions(client, scope);
  const decisions = decideCalendarImportApproval({
    scope,
    items: input.items,
    existing,
  });

  const toInsert = decisions.filter((d) => d.outcome === "insert").map((d) => d.row);
  const duplicates = decisions
    .filter((d) => d.outcome === "duplicate")
    .map((d) => ({ title: d.title, message: d.message }));
  const rejected = decisions
    .filter((d) => d.outcome === "rejected")
    .map((d) => ({ title: d.title, message: d.message }));

  if (toInsert.length > 0) {
    const { error } = await client.from("calendar_exceptions").insert(toInsert);
    if (error) throw error;
  }

  return {
    insertedCount: toInsert.length,
    duplicateCount: duplicates.length,
    rejectedCount: rejected.length,
    duplicates,
    rejected,
  };
}
