/**
 * Admin distribution preview (read-only) and snapshot approval.
 *
 * Preview: JWT → assertAdmin → Google SA read → draft. No DB write.
 * Approve: JWT → assertAdmin → JWT client INSERT into distribution snapshot tables.
 * Does not write planner_entries, lesson_sessions, or call the planner engine.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/platform/database/supabase/auth-middleware";
import type { SupabaseUserContext } from "@/platform/database/supabase/context";

import {
  previewDistributionDraftAuthorized,
  type PreviewDistributionInput,
} from "./services/distribution-import.ts";
import {
  DEFAULT_DISTRIBUTION_WORKSHEET,
  type DistributionDraft,
  type DistributionDraftItem,
} from "./services/distribution-import.logic.ts";
import {
  approveDistributionSnapshotAuthorized,
  listDraftSemesterPlansAuthorized,
  type ApproveDistributionSnapshotResult,
  type DraftSemesterPlanOption,
} from "./services/distribution-snapshot.ts";

const OptionalUuid = z.string().uuid().optional();

const PreviewInput = z.object({
  worksheetName: z.string().trim().min(1).max(100).optional(),
  academicYearId: OptionalUuid,
  semesterId: OptionalUuid,
  gradeId: OptionalUuid,
  subjectId: OptionalUuid,
  semesterPlanId: OptionalUuid,
});

type AdminClient = Awaited<
  typeof import("@/platform/database/supabase/client.server")
>["supabaseAdmin"];

export async function previewDistributionDraftForAdmin(
  client: AdminClient,
  actorId: string,
  input: PreviewDistributionInput = {},
): Promise<DistributionDraft> {
  return previewDistributionDraftAuthorized(client, actorId, {
    worksheetName: input.worksheetName || DEFAULT_DISTRIBUTION_WORKSHEET,
    academicYearId: input.academicYearId,
    semesterId: input.semesterId,
    gradeId: input.gradeId,
    subjectId: input.subjectId,
    semesterPlanId: input.semesterPlanId,
  });
}

export const previewDistributionDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => PreviewInput.parse(data ?? {}))
  .handler(async ({ data, context }): Promise<DistributionDraft> => {
    const { supabaseAdmin } = await import("@/platform/database/supabase/client.server");
    return previewDistributionDraftForAdmin(supabaseAdmin, context.userId, data);
  });

const DraftItemInput = z.object({
  clientId: z.string().min(1).max(80),
  order: z.number().int().positive().nullable(),
  unit: z.string().max(240),
  lesson: z.string().max(240),
  periods: z.number().int().nullable(),
  notes: z.string().max(2000),
  curriculumLessonId: z.string().uuid().nullable(),
  curriculumLessonTitle: z.string().max(240).nullable(),
  curriculumMatch: z.enum(["matched", "missing_id", "not_found", "invalid", "unchecked"]),
  status: z.enum(["ready", "needs_review", "error"]),
  issues: z.array(
    z.object({
      severity: z.enum(["error", "warning"]),
      code: z.string().max(80),
      message: z.string().max(400),
    }),
  ),
  reviewReason: z.string().max(800).nullable(),
});

const ApproveInput = z.object({
  semesterPlanId: z.string().uuid(),
  confirmed: z.literal(true),
  acknowledgeWarnings: z.boolean(),
  draft: z.object({
    spreadsheetId: z.string().min(1).max(128),
    worksheetName: z.string().min(1).max(100),
    items: z.array(DraftItemInput).min(1).max(500),
    summary: z.object({
      itemCount: z.number().int().nonnegative(),
      totalPeriods: z.number().int().nonnegative(),
      readyCount: z.number().int().nonnegative(),
      reviewCount: z.number().int().nonnegative(),
      errorCount: z.number().int().nonnegative(),
      warningCount: z.number().int().nonnegative(),
    }),
    errors: z.array(z.string().max(400)),
    warnings: z.array(z.string().max(400)),
  }),
});

function authFromContext(context: {
  userId: string;
  supabase: SupabaseUserContext["client"];
}): SupabaseUserContext {
  return { client: context.supabase, userId: context.userId };
}

export const listDraftSemesterPlansForDistribution = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DraftSemesterPlanOption[]> => {
    const { supabaseAdmin } = await import("@/platform/database/supabase/client.server");
    return listDraftSemesterPlansAuthorized(
      supabaseAdmin,
      context.userId,
      authFromContext(context).client,
    );
  });

export const approveDistributionSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ApproveInput.parse(data))
  .handler(async ({ data, context }): Promise<ApproveDistributionSnapshotResult> => {
    const { supabaseAdmin } = await import("@/platform/database/supabase/client.server");
    const draft = {
      spreadsheetId: data.draft.spreadsheetId,
      worksheetName: data.draft.worksheetName,
      items: data.draft.items as DistributionDraftItem[],
      summary: data.draft.summary,
      context: {
        academicYearId: null,
        semesterId: null,
        gradeId: null,
        subjectId: null,
        semesterPlanId: data.semesterPlanId,
        available: true,
        note: null,
      },
      capacity: {
        totalPeriods: data.draft.summary.totalPeriods,
        availableSlots: null,
        status: "unknown" as const,
        note: "",
      },
      readyCount: data.draft.summary.readyCount,
      reviewCount: data.draft.summary.reviewCount,
      errors: data.draft.errors,
      warnings: data.draft.warnings,
    } satisfies DistributionDraft;

    return approveDistributionSnapshotAuthorized(
      supabaseAdmin,
      context.userId,
      authFromContext(context).client,
      {
        draft,
        semesterPlanId: data.semesterPlanId,
        confirmed: data.confirmed,
        acknowledgeWarnings: data.acknowledgeWarnings,
      },
    );
  });
