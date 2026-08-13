/**
 * Admin academic year / semester server functions.
 *
 * Auth: requireSupabaseAuth (JWT) + assertAdmin (user_roles.role === 'admin').
 * Writes use the authenticated admin JWT client so current owner RLS stays intact.
 * Ownership is always context.userId — never client-supplied owner fields.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { assertAdmin } from "@/platform/auth/assert-admin";
import { requireSupabaseAuth } from "@/platform/database/supabase/auth-middleware";
import type { SupabaseUserContext } from "@/platform/database/supabase/context";
import {
  activateAdminAcademicYear as activateAdminAcademicYearOp,
  createAdminAcademicYear as createAdminAcademicYearOp,
  createAdminSemester as createAdminSemesterOp,
  listAdminAcademicYears as listAdminAcademicYearsOp,
  listAdminSemestersForYear as listAdminSemestersForYearOp,
  type AcademicYearRecord,
  type SemesterRecord,
} from "@/features/calendar/services/academic-calendar.management";

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "التاريخ يجب أن يكون بصيغة YYYY-MM-DD");

const CreateAcademicYearInput = z.object({
  label: z.string().min(1).max(120),
  startDate: IsoDate,
  endDate: IsoDate,
  activate: z.boolean().optional(),
});

const ActivateAcademicYearInput = z.object({
  academicYearId: z.string().uuid(),
});

const ListSemestersInput = z.object({
  academicYearId: z.string().uuid(),
});

const CreateSemesterInput = z.object({
  academicYearId: z.string().uuid(),
  label: z.string().min(1).max(120),
  startDate: IsoDate,
  endDate: IsoDate,
  orderIndex: z.number().int().min(0).max(20).optional(),
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

async function requireAdminCalendarContext(context: {
  userId: string;
  supabase: SupabaseUserContext["client"];
}): Promise<{ auth: SupabaseUserContext; adminClient: AdminClient }> {
  const { supabaseAdmin } = await import("@/platform/database/supabase/client.server");
  await assertAdmin(supabaseAdmin, context.userId);
  return { auth: authFromContext(context), adminClient: supabaseAdmin };
}

export const listAdminAcademicYears = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AcademicYearRecord[]> => {
    const { auth, adminClient } = await requireAdminCalendarContext(context);
    return listAdminAcademicYearsOp(auth, adminClient);
  });

export const createAdminAcademicYear = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => CreateAcademicYearInput.parse(data))
  .handler(async ({ data, context }): Promise<AcademicYearRecord> => {
    const { auth, adminClient } = await requireAdminCalendarContext(context);
    return createAdminAcademicYearOp(auth, adminClient, {
      label: data.label,
      startDate: data.startDate,
      endDate: data.endDate,
      activate: data.activate,
    });
  });

export const activateAdminAcademicYear = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ActivateAcademicYearInput.parse(data))
  .handler(async ({ data, context }): Promise<AcademicYearRecord> => {
    const { auth, adminClient } = await requireAdminCalendarContext(context);
    return activateAdminAcademicYearOp(auth, adminClient, data.academicYearId);
  });

export const listAdminSemesters = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ListSemestersInput.parse(data))
  .handler(async ({ data, context }): Promise<SemesterRecord[]> => {
    const { auth, adminClient } = await requireAdminCalendarContext(context);
    return listAdminSemestersForYearOp(auth, adminClient, data.academicYearId);
  });

export const createAdminSemester = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => CreateSemesterInput.parse(data))
  .handler(async ({ data, context }): Promise<SemesterRecord> => {
    const { auth, adminClient } = await requireAdminCalendarContext(context);
    return createAdminSemesterOp(auth, adminClient, {
      academicYearId: data.academicYearId,
      label: data.label,
      startDate: data.startDate,
      endDate: data.endDate,
      orderIndex: data.orderIndex,
    });
  });
