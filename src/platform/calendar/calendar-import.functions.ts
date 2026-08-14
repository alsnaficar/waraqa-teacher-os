/**
 * Admin official-calendar PDF/image import server functions.
 *
 * Auth: requireSupabaseAuth (JWT) + assertAdmin.
 * Extract returns a structured draft only — no INSERT.
 * Approve inserts calendar_exceptions via the JWT client.
 * Ownership / user_id is never accepted from the client.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { assertAdmin } from "@/platform/auth/assert-admin";
import { requireSupabaseAuth } from "@/platform/database/supabase/auth-middleware";
import type { SupabaseUserContext } from "@/platform/database/supabase/context";
import { MAX_CALENDAR_IMPORT_BASE64_CHARS } from "@/features/calendar/services/calendar-import.limits";
import { CALENDAR_EXCEPTION_KINDS } from "@/features/calendar/services/calendar-import.logic";
import {
  approveOfficialCalendarImport as approveOfficialCalendarImportOp,
  extractOfficialCalendarDraft as extractOfficialCalendarDraftOp,
  listAdminCalendarVariants as listAdminCalendarVariantsOp,
  type CalendarImportApproveResult,
  type CalendarImportDraft,
  type CalendarVariantOption,
} from "@/features/calendar/services/calendar-import.service";

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "التاريخ يجب أن يكون بصيغة YYYY-MM-DD");
const VariantCode = z.enum(["GENERAL", "WESTERN"]);

const ExtractInput = z.object({
  academicYearId: z.string().uuid(),
  semesterId: z.string().uuid(),
  variantCode: VariantCode,
  fileBase64: z.string().min(1).max(MAX_CALENDAR_IMPORT_BASE64_CHARS),
  declaredMime: z.string().max(80).optional(),
  declaredName: z.string().max(240).optional(),
});

const ApproveItem = z.object({
  kind: z.enum(CALENDAR_EXCEPTION_KINDS),
  title: z.string().min(1).max(160),
  startDate: IsoDate,
  endDate: IsoDate,
  selected: z.boolean().optional(),
});

const ApproveInput = z.object({
  academicYearId: z.string().uuid(),
  semesterId: z.string().uuid(),
  variantCode: VariantCode,
  items: z.array(ApproveItem).min(1).max(200),
});

type AdminClient = Awaited<
  typeof import("@/platform/database/supabase/client.server")
>["supabaseAdmin"];

function authFromContext(context: {
  userId: string;
  supabase: SupabaseUserContext["client"];
}): SupabaseUserContext {
  return { client: context.supabase, userId: context.userId };
}

async function requireAdminImportContext(context: {
  userId: string;
  supabase: SupabaseUserContext["client"];
}): Promise<{ auth: SupabaseUserContext; adminClient: AdminClient }> {
  const { supabaseAdmin } = await import("@/platform/database/supabase/client.server");
  await assertAdmin(supabaseAdmin, context.userId);
  return { auth: authFromContext(context), adminClient: supabaseAdmin };
}

export const listAdminCalendarVariants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CalendarVariantOption[]> => {
    const { auth, adminClient } = await requireAdminImportContext(context);
    return listAdminCalendarVariantsOp(auth, adminClient);
  });

export const extractOfficialCalendarDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ExtractInput.parse(data))
  .handler(async ({ data, context }): Promise<CalendarImportDraft> => {
    const { auth, adminClient } = await requireAdminImportContext(context);
    return extractOfficialCalendarDraftOp(auth, adminClient, {
      academicYearId: data.academicYearId,
      semesterId: data.semesterId,
      variantCode: data.variantCode,
      fileBase64: data.fileBase64,
      declaredMime: data.declaredMime,
      declaredName: data.declaredName,
    });
  });

export const approveOfficialCalendarImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ApproveInput.parse(data))
  .handler(async ({ data, context }): Promise<CalendarImportApproveResult> => {
    const { auth, adminClient } = await requireAdminImportContext(context);
    return approveOfficialCalendarImportOp(auth, adminClient, {
      academicYearId: data.academicYearId,
      semesterId: data.semesterId,
      variantCode: data.variantCode,
      items: data.items,
    });
  });
