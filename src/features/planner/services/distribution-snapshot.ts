/**
 * Approve a reviewed DistributionDraft into an independent snapshot.
 * JWT client writes only. Does not touch planner_entries, lesson_sessions,
 * the planner engine, or calendar tables.
 */

import { assertAdmin } from "../../../platform/auth/assert-admin.ts";
import type { SupabaseUserContext } from "../../../platform/database/supabase/context.ts";

import type { DistributionDraft } from "./distribution-import.logic.ts";
import {
  DISTRIBUTION_SNAPSHOT_MISSING_PLAN_MESSAGE,
  DISTRIBUTION_SNAPSHOT_PLAN_NOT_DRAFT_MESSAGE,
  DISTRIBUTION_SNAPSHOT_SAVE_FAILED_MESSAGE,
  DISTRIBUTION_SNAPSHOT_VERSION_MISSING_MESSAGE,
  decideDistributionSnapshotApproval,
  type DistributionSnapshotItemInput,
} from "./distribution-snapshot.logic.ts";

type AdminClient = Awaited<
  typeof import("@/platform/database/supabase/client.server")
>["supabaseAdmin"];

type JwtClient = SupabaseUserContext["client"];

export interface DraftSemesterPlanOption {
  id: string;
  subject: string;
  grade: string;
  academicYearId: string | null;
  semesterId: string | null;
  currentVersion: number;
}

export interface ApproveDistributionSnapshotInput {
  draft: DistributionDraft;
  semesterPlanId: string;
  confirmed: boolean;
  acknowledgeWarnings: boolean;
}

export type ApproveDistributionSnapshotResult =
  | {
      ok: true;
      snapshotId: string;
      semesterPlanId: string;
      semesterPlanVersionId: string;
      itemCount: number;
      totalPeriods: number;
    }
  | {
      ok: false;
      errors: string[];
    };

export type DistributionSnapshotDeps = {
  insertSnapshot?: (row: Record<string, unknown>) => Promise<{ id: string }>;
  insertItems?: (rows: Record<string, unknown>[]) => Promise<void>;
  supersedeCurrent?: (versionId: string) => Promise<void>;
};

async function loadDraftPlan(
  client: JwtClient,
  planId: string,
): Promise<{
  id: string;
  status: string;
  current_version: number;
} | null> {
  const { data, error } = await client
    .from("semester_plans")
    .select("id, status, current_version")
    .eq("id", planId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function loadCurrentVersion(
  client: JwtClient,
  planId: string,
  versionNumber: number,
): Promise<{ id: string } | null> {
  const { data, error } = await client
    .from("semester_plan_versions")
    .select("id")
    .eq("semester_plan_id", planId)
    .eq("version_number", versionNumber)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listDraftSemesterPlans(
  client: JwtClient,
): Promise<DraftSemesterPlanOption[]> {
  const { data, error } = await client
    .from("semester_plans")
    .select("id, subject, grade, academic_year_id, semester_id, current_version")
    .eq("status", "draft")
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    subject: row.subject,
    grade: row.grade,
    academicYearId: row.academic_year_id,
    semesterId: row.semester_id,
    currentVersion: row.current_version,
  }));
}

async function supersedeCurrentSnapshot(client: JwtClient, versionId: string): Promise<void> {
  const { error } = await client
    .from("distribution_snapshots")
    .update({ is_current: false })
    .eq("semester_plan_version_id", versionId)
    .eq("is_current", true);
  if (error) throw error;
}

async function insertSnapshotRow(
  client: JwtClient,
  row: {
    semester_plan_id: string;
    semester_plan_version_id: string;
    spreadsheet_id: string;
    worksheet_name: string;
    source: "google_sheets";
    item_count: number;
    total_periods: number;
    approved_by: string;
    is_current: true;
  },
): Promise<{ id: string }> {
  const { data, error } = await client
    .from("distribution_snapshots")
    .insert(row)
    .select("id")
    .single();
  if (error || !data?.id) {
    throw new Error(DISTRIBUTION_SNAPSHOT_SAVE_FAILED_MESSAGE);
  }
  return { id: data.id };
}

async function insertSnapshotItems(
  client: JwtClient,
  snapshotId: string,
  items: DistributionSnapshotItemInput[],
): Promise<void> {
  const rows = items.map((item) => ({
    snapshot_id: snapshotId,
    order_index: item.orderIndex,
    unit: item.unit,
    lesson: item.lesson,
    periods: item.periods,
    notes: item.notes,
    curriculum_lesson_id: item.curriculumLessonId,
  }));
  const { error } = await client.from("distribution_snapshot_items").insert(rows);
  if (error) {
    throw new Error(DISTRIBUTION_SNAPSHOT_SAVE_FAILED_MESSAGE);
  }
}

export async function listDraftSemesterPlansAuthorized(
  adminClient: AdminClient,
  actorId: string,
  jwtClient: JwtClient,
): Promise<DraftSemesterPlanOption[]> {
  await assertAdmin(adminClient, actorId);
  return listDraftSemesterPlans(jwtClient);
}

export async function approveDistributionSnapshotAuthorized(
  adminClient: AdminClient,
  actorId: string,
  jwtClient: JwtClient,
  input: ApproveDistributionSnapshotInput,
  deps: DistributionSnapshotDeps = {},
): Promise<ApproveDistributionSnapshotResult> {
  await assertAdmin(adminClient, actorId);

  const plan = input.semesterPlanId ? await loadDraftPlan(jwtClient, input.semesterPlanId) : null;
  if (input.semesterPlanId && !plan) {
    return { ok: false, errors: [DISTRIBUTION_SNAPSHOT_MISSING_PLAN_MESSAGE] };
  }

  const decision = decideDistributionSnapshotApproval({
    draft: input.draft,
    semesterPlanId: input.semesterPlanId,
    planStatus: plan?.status ?? null,
    confirmed: input.confirmed,
    acknowledgeWarnings: input.acknowledgeWarnings,
  });
  if (!decision.ok) return decision;
  if (!plan) {
    return { ok: false, errors: [DISTRIBUTION_SNAPSHOT_MISSING_PLAN_MESSAGE] };
  }
  if (plan.status !== "draft") {
    return { ok: false, errors: [DISTRIBUTION_SNAPSHOT_PLAN_NOT_DRAFT_MESSAGE] };
  }

  const version = await loadCurrentVersion(jwtClient, plan.id, plan.current_version);
  if (!version) {
    return { ok: false, errors: [DISTRIBUTION_SNAPSHOT_VERSION_MISSING_MESSAGE] };
  }

  try {
    if (deps.supersedeCurrent) {
      await deps.supersedeCurrent(version.id);
    } else {
      await supersedeCurrentSnapshot(jwtClient, version.id);
    }

    const snapshotRow = {
      semester_plan_id: plan.id,
      semester_plan_version_id: version.id,
      spreadsheet_id: input.draft.spreadsheetId,
      worksheet_name: input.draft.worksheetName,
      source: "google_sheets" as const,
      item_count: decision.items.length,
      total_periods: decision.totalPeriods,
      approved_by: actorId,
      is_current: true as const,
    };

    const inserted = deps.insertSnapshot
      ? await deps.insertSnapshot(snapshotRow)
      : await insertSnapshotRow(jwtClient, snapshotRow);

    if (deps.insertItems) {
      await deps.insertItems(
        decision.items.map((item) => ({
          snapshot_id: inserted.id,
          ...item,
        })),
      );
    } else {
      await insertSnapshotItems(jwtClient, inserted.id, decision.items);
    }

    return {
      ok: true,
      snapshotId: inserted.id,
      semesterPlanId: plan.id,
      semesterPlanVersionId: version.id,
      itemCount: decision.items.length,
      totalPeriods: decision.totalPeriods,
    };
  } catch {
    return { ok: false, errors: [DISTRIBUTION_SNAPSHOT_SAVE_FAILED_MESSAGE] };
  }
}
