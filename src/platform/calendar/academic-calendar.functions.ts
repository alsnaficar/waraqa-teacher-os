/**
 * Authenticated academic year / semester management server functions.
 *
 * Ownership is always context.userId from requireSupabaseAuth — never client-supplied.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/platform/database/supabase/auth-middleware";
import type { SupabaseUserContext } from "@/platform/database/supabase/context";
import {
  activateAcademicYear,
  createAcademicYear,
  createSemester,
  listAcademicYears,
  listSemestersForYear,
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

function authFromContext(context: {
  userId: string;
  supabase: SupabaseUserContext["client"];
}): SupabaseUserContext {
  return { client: context.supabase, userId: context.userId };
}

export const listTeacherAcademicYears = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AcademicYearRecord[]> => {
    return listAcademicYears(authFromContext(context));
  });

export const createTeacherAcademicYear = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => CreateAcademicYearInput.parse(data))
  .handler(async ({ data, context }): Promise<AcademicYearRecord> => {
    return createAcademicYear(authFromContext(context), {
      label: data.label,
      startDate: data.startDate,
      endDate: data.endDate,
      activate: data.activate,
    });
  });

export const activateTeacherAcademicYear = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ActivateAcademicYearInput.parse(data))
  .handler(async ({ data, context }): Promise<AcademicYearRecord> => {
    return activateAcademicYear(authFromContext(context), data.academicYearId);
  });

export const listTeacherSemesters = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ListSemestersInput.parse(data))
  .handler(async ({ data, context }): Promise<SemesterRecord[]> => {
    return listSemestersForYear(authFromContext(context), data.academicYearId);
  });

export const createTeacherSemester = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => CreateSemesterInput.parse(data))
  .handler(async ({ data, context }): Promise<SemesterRecord> => {
    return createSemester(authFromContext(context), {
      academicYearId: data.academicYearId,
      label: data.label,
      startDate: data.startDate,
      endDate: data.endDate,
      orderIndex: data.orderIndex,
    });
  });
