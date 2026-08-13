/**
 * In-memory replica of approve_distribution_snapshot for tests only.
 * Clones snapshot tables, applies the RPC body, and restores on failure.
 * This is not a live PostgreSQL transaction proof.
 */

import { DISTRIBUTION_SNAPSHOT_SAVE_FAILED_MESSAGE } from "./distribution-snapshot.logic.ts";
import type { ApproveDistributionSnapshotRpcArgs } from "./distribution-snapshot.ts";

export type MemoryRow = Record<string, unknown>;

export type AtomicFailAfter = "none" | "supersede" | "insert_snapshot" | "insert_items";

function cloneTables(tables: Record<string, MemoryRow[]>): Record<string, MemoryRow[]> {
  return Object.fromEntries(
    Object.entries(tables).map(([name, rows]) => [name, rows.map((row) => ({ ...row }))]),
  );
}

function restore(target: Record<string, MemoryRow[]>, source: Record<string, MemoryRow[]>) {
  for (const name of Object.keys(target)) {
    target[name] = [];
  }
  for (const [name, rows] of Object.entries(source)) {
    target[name] = rows.map((row) => ({ ...row }));
  }
}

function hasAdminRole(tables: Record<string, MemoryRow[]>, userId: string): boolean {
  return (tables.user_roles ?? []).some((row) => row.user_id === userId && row.role === "admin");
}

function isPlanOwner(tables: Record<string, MemoryRow[]>, planId: string, userId: string): boolean {
  const plan = (tables.semester_plans ?? []).find((row) => row.id === planId);
  if (!plan) return false;
  return plan.user_id === userId || hasAdminRole(tables, userId);
}

export function simulateApproveDistributionSnapshotRpc(options: {
  tables: Record<string, MemoryRow[]>;
  authUid: string | null;
  args: ApproveDistributionSnapshotRpcArgs;
  failAfter?: AtomicFailAfter;
}): { data: Record<string, unknown> | null; error: { message: string } | null } {
  const backup = cloneTables(options.tables);
  try {
    const result = applyApproveDistributionSnapshot(options);
    return { data: result, error: null };
  } catch {
    restore(options.tables, backup);
    return { data: null, error: { message: DISTRIBUTION_SNAPSHOT_SAVE_FAILED_MESSAGE } };
  }
}

function applyApproveDistributionSnapshot(options: {
  tables: Record<string, MemoryRow[]>;
  authUid: string | null;
  args: ApproveDistributionSnapshotRpcArgs;
  failAfter?: AtomicFailAfter;
}): Record<string, unknown> {
  function fail(): never {
    throw new Error(DISTRIBUTION_SNAPSHOT_SAVE_FAILED_MESSAGE);
  }
  const { tables, args } = options;
  if (options.authUid == null) fail();
  const authUid = options.authUid;
  if (!hasAdminRole(tables, authUid)) fail();
  if (!args.p_semester_plan_id) fail();

  const plan = (tables.semester_plans ?? []).find((row) => row.id === args.p_semester_plan_id);
  if (!plan) fail();
  if (!isPlanOwner(tables, String(plan.id), authUid)) fail();
  if (plan.status !== "draft") fail();

  const version = (tables.semester_plan_versions ?? []).find(
    (row) => row.semester_plan_id === plan.id && row.version_number === plan.current_version,
  );
  if (!version) fail();

  const spreadsheet = args.p_spreadsheet_id?.trim() ?? "";
  const worksheet = args.p_worksheet_name?.trim() ?? "";
  if (spreadsheet.length < 1 || spreadsheet.length > 128) fail();
  if (worksheet.length < 1 || worksheet.length > 100) fail();

  const items = Array.isArray(args.p_items) ? args.p_items : [];
  if (items.length < 1) fail();

  const seen = new Set<number>();
  let totalPeriods = 0;
  for (const item of items) {
    const order = Number(item.order_index);
    const periods = Number(item.periods);
    const lesson = String(item.lesson ?? "").trim();
    if (!Number.isInteger(order) || order < 1) fail();
    if (!Number.isInteger(periods) || periods < 1) fail();
    if (!lesson) fail();
    if (seen.has(order)) fail();
    seen.add(order);
    totalPeriods += periods;
  }
  if (totalPeriods < 1) fail();

  if (!tables.distribution_snapshots) tables.distribution_snapshots = [];
  if (!tables.distribution_snapshot_items) tables.distribution_snapshot_items = [];

  for (const row of tables.distribution_snapshots) {
    if (row.semester_plan_version_id === version.id && row.is_current === true) {
      row.is_current = false;
    }
  }

  if (options.failAfter === "supersede") fail();

  const snapshotId = crypto.randomUUID();
  tables.distribution_snapshots.push({
    id: snapshotId,
    semester_plan_id: plan.id,
    semester_plan_version_id: version.id,
    spreadsheet_id: spreadsheet,
    worksheet_name: worksheet,
    source: "google_sheets",
    item_count: items.length,
    total_periods: totalPeriods,
    approved_by: authUid,
    is_current: true,
  });

  if (options.failAfter === "insert_snapshot") fail();

  for (const item of items) {
    tables.distribution_snapshot_items.push({
      id: crypto.randomUUID(),
      snapshot_id: snapshotId,
      order_index: item.order_index,
      unit: item.unit ?? "",
      lesson: String(item.lesson).trim(),
      periods: item.periods,
      notes: item.notes ?? "",
      curriculum_lesson_id: item.curriculum_lesson_id,
    });
    if (options.failAfter === "insert_items") fail();
  }

  const inserted = tables.distribution_snapshot_items.filter(
    (row) => row.snapshot_id === snapshotId,
  );
  if (inserted.length !== items.length) fail();

  return {
    snapshot_id: snapshotId,
    semester_plan_id: plan.id,
    semester_plan_version_id: version.id,
    item_count: items.length,
    total_periods: totalPeriods,
  };
}
