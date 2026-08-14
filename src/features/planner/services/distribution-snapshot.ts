/**
 * Approve a reviewed DistributionDraft into an independent snapshot.
 * JWT → assertAdmin → JWT RPC (one PostgreSQL transaction).
 * Does not touch operational planner or session tables, the planner engine,
 * or calendar tables. Writes only through the JWT-authenticated RPC.
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
} from "./distribution-snapshot.logic.ts";

type AdminClient = Awaited<
  typeof import("@/platform/database/supabase/client.server")
>["supabaseAdmin"];

type JwtClient = SupabaseUserContext["client"];

export const APPROVE_DISTRIBUTION_SNAPSHOT_RPC = "approve_distribution_snapshot";

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

export interface ApproveDistributionSnapshotRpcArgs {
  p_semester_plan_id: string;
  p_spreadsheet_id: string;
  p_worksheet_name: string;
  p_items: Array<{
    order_index: number;
    unit: string;
    lesson: string;
    periods: number;
    notes: string;
    curriculum_lesson_id: string | null;
  }>;
}

export type DistributionSnapshotDeps = {
  rpc?: (
    fn: string,
    args: ApproveDistributionSnapshotRpcArgs,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
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

function parseApproveRpcResult(data: unknown): ApproveDistributionSnapshotResult | null {
  let payload: unknown = data;
  if (typeof data === "string") {
    try {
      payload = JSON.parse(data);
    } catch {
      return null;
    }
  }
  if (!payload || typeof payload !== "object") return null;
  const row = payload as Record<string, unknown>;
  const snapshotId = typeof row.snapshot_id === "string" ? row.snapshot_id : "";
  const semesterPlanId = typeof row.semester_plan_id === "string" ? row.semester_plan_id : "";
  const semesterPlanVersionId =
    typeof row.semester_plan_version_id === "string" ? row.semester_plan_version_id : "";
  const itemCount = typeof row.item_count === "number" ? row.item_count : Number(row.item_count);
  const totalPeriods =
    typeof row.total_periods === "number" ? row.total_periods : Number(row.total_periods);
  if (!snapshotId || !semesterPlanId || !semesterPlanVersionId) return null;
  if (!Number.isFinite(itemCount) || itemCount < 1) return null;
  if (!Number.isFinite(totalPeriods) || totalPeriods < 1) return null;
  return {
    ok: true,
    snapshotId,
    semesterPlanId,
    semesterPlanVersionId,
    itemCount,
    totalPeriods,
  };
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

  const args: ApproveDistributionSnapshotRpcArgs = {
    p_semester_plan_id: plan.id,
    p_spreadsheet_id: input.draft.spreadsheetId,
    p_worksheet_name: input.draft.worksheetName,
    p_items: decision.items.map((item) => ({
      order_index: item.orderIndex,
      unit: item.unit,
      lesson: item.lesson,
      periods: item.periods,
      notes: item.notes,
      curriculum_lesson_id: item.curriculumLessonId,
    })),
  };

  let response: { data: unknown; error: { message: string } | null };
  try {
    response = deps.rpc
      ? await deps.rpc(APPROVE_DISTRIBUTION_SNAPSHOT_RPC, args)
      : await jwtClient.rpc(APPROVE_DISTRIBUTION_SNAPSHOT_RPC, args);
  } catch {
    return { ok: false, errors: [DISTRIBUTION_SNAPSHOT_SAVE_FAILED_MESSAGE] };
  }

  if (response.error || !response.data) {
    return { ok: false, errors: [DISTRIBUTION_SNAPSHOT_SAVE_FAILED_MESSAGE] };
  }

  const parsed = parseApproveRpcResult(response.data);
  if (!parsed) {
    return { ok: false, errors: [DISTRIBUTION_SNAPSHOT_SAVE_FAILED_MESSAGE] };
  }
  return parsed;
}
