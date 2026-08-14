/**
 * P1-C2 version isolation: create_semester_plan_version must not re-point
 * planner_entries onto the new draft version.
 *
 * SQL contract tests read the new migration. In-memory tests replica the RPC
 * body. This environment does not run a live PostgreSQL harness. Do not treat
 * the replica as proof of PostgreSQL transaction semantics.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const NEW_MIGRATION =
  "supabase/migrations/20260813230000_create_semester_plan_version_no_repoint.sql";
const ORIGINAL_MIGRATION = "supabase/migrations/20260808000100_semester_plan_lifecycle.sql";
const LIFECYCLE_TS = "src/features/planner/services/semester-plan-lifecycle.ts";
const ENGINE_TS = "src/features/planner/services/planner-engine.ts";
const SESSION_TS = "src/features/lesson-sessions/services/lesson-session.service.ts";

const OWNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const STRANGER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PLAN_ID = "99999999-9999-4999-8999-999999999999";
const VERSION_1_ID = "11111111-1111-4111-8111-111111111111";
const VERSION_2_ID = "22222222-2222-4222-8222-222222222222";
const ENTRY_ID = "33333333-3333-4333-8333-333333333333";
const SNAPSHOT_A_ID = "44444444-4444-4444-8444-444444444444";

type Row = Record<string, unknown>;

const V1_SNAPSHOT = {
  capturedAt: "2026-08-13T00:00:00.000Z",
  entries: [{ suggestedDate: "2026-08-30", period: 1, lessonTitle: "درس أ" }],
  overrides: [],
};

function functionBody(sql: string, name: string): string {
  const start = sql.indexOf(`create or replace function public.${name}`);
  assert.ok(start >= 0, `missing ${name}`);
  const asDollar = sql.indexOf("as $$", start);
  const end = sql.indexOf("$$;", asDollar);
  assert.ok(asDollar >= 0 && end > asDollar);
  return sql.slice(start, end);
}

function cloneTables(tables: Record<string, Row[]>): Record<string, Row[]> {
  return Object.fromEntries(
    Object.entries(tables).map(([name, rows]) => [name, rows.map((row) => ({ ...row }))]),
  );
}

function snapshotHasEntries(snapshot: unknown): boolean {
  return Boolean(
    snapshot && typeof snapshot === "object" && !Array.isArray(snapshot) && "entries" in snapshot,
  );
}

function isPlanOwner(tables: Record<string, Row[]>, planId: string, userId: string): boolean {
  const plan = (tables.semester_plans ?? []).find((row) => row.id === planId);
  return Boolean(plan && plan.user_id === userId);
}

/**
 * In-memory replica of create_semester_plan_version after P1-C2.
 * Not live PostgreSQL.
 */
function simulateCreateSemesterPlanVersion(options: {
  tables: Record<string, Row[]>;
  authUid: string | null;
  planId: string;
  newVersionId?: string;
}): { data: Row | null; error: { message: string } | null } {
  const { tables, planId } = options;
  try {
    if (options.authUid == null || !isPlanOwner(tables, planId, options.authUid)) {
      throw new Error("not authorized");
    }

    const plan = (tables.semester_plans ?? []).find((row) => row.id === planId);
    if (!plan) throw new Error("semester plan not found");
    if (plan.status !== "approved" && plan.status !== "in_progress") {
      throw new Error("new versions can only be created from approved or in-progress plans");
    }

    const current = (tables.semester_plan_versions ?? []).find(
      (row) => row.semester_plan_id === planId && row.version_number === plan.current_version,
    );
    if (!current) throw new Error("current plan version not found");
    if (current.status !== "approved" || !snapshotHasEntries(current.snapshot)) {
      throw new Error(
        "current version must be approved with a snapshot before creating a new version",
      );
    }

    const nextNumber = Number(plan.current_version) + 1;
    const newVersionId = options.newVersionId ?? VERSION_2_ID;
    tables.semester_plan_versions = tables.semester_plan_versions ?? [];
    tables.semester_plan_versions.push({
      id: newVersionId,
      semester_plan_id: planId,
      version_number: nextNumber,
      status: "draft",
      snapshot: {
        clonedFromVersion: current.version_number,
        entries: [],
        overrides: [],
      },
      created_by: options.authUid,
    });

    plan.status = "draft";
    plan.current_version = nextNumber;
    return { data: { ...plan }, error: null };
  } catch (error) {
    return {
      data: null,
      error: { message: error instanceof Error ? error.message : "failed" },
    };
  }
}

function seedApprovedPlan(overrides: Record<string, Row[]> = {}): Record<string, Row[]> {
  return {
    semester_plans: [
      {
        id: PLAN_ID,
        user_id: OWNER,
        status: "approved",
        current_version: 1,
      },
    ],
    semester_plan_versions: [
      {
        id: VERSION_1_ID,
        semester_plan_id: PLAN_ID,
        version_number: 1,
        status: "approved",
        snapshot: structuredClone(V1_SNAPSHOT),
        created_by: OWNER,
      },
    ],
    planner_entries: [
      {
        id: ENTRY_ID,
        user_id: OWNER,
        semester_plan_id: PLAN_ID,
        semester_plan_version_id: VERSION_1_ID,
        subject: "لغتي",
        week_start_date: "2026-08-30",
        day_of_week: 0,
        period: 1,
        notes: JSON.stringify({ suggestedDate: "2026-08-30", period: 1 }),
      },
    ],
    distribution_snapshots: [
      {
        id: SNAPSHOT_A_ID,
        semester_plan_id: PLAN_ID,
        semester_plan_version_id: VERSION_1_ID,
        is_current: true,
      },
    ],
    ...overrides,
  };
}

describe("P1-C2 SQL contract (not live PostgreSQL)", () => {
  const sql = readFileSync(join(ROOT, NEW_MIGRATION), "utf8");
  const original = readFileSync(join(ROOT, ORIGINAL_MIGRATION), "utf8");
  const body = functionBody(sql, "create_semester_plan_version");
  const originalBody = functionBody(original, "create_semester_plan_version");
  const withoutComments = sql.replace(/--[^\n]*/g, "");

  it("replaces create_semester_plan_version with the same signature and SECURITY DEFINER", () => {
    assert.match(
      sql,
      /create or replace function public\.create_semester_plan_version\(p_plan_id uuid\)/,
    );
    assert.match(sql, /returns public\.semester_plans/);
    assert.match(sql, /language plpgsql/);
    assert.match(sql, /security definer/);
    assert.match(sql, /set search_path = public/);
  });

  it("preserves owner check, locking, statuses, and approved-snapshot requirement", () => {
    assert.match(body, /is_semester_plan_owner\(p_plan_id\)/);
    assert.match(body, /raise exception 'not authorized'/);
    assert.match(body, /from public\.semester_plans where id = p_plan_id for update/);
    assert.match(body, /status not in \('approved', 'in_progress'\)/);
    assert.match(body, /version_number = plan_row\.current_version/);
    assert.match(body, /for update/);
    assert.match(body, /current_version\.status <> 'approved'/);
    assert.match(body, /current_version\.snapshot \? 'entries'/);
  });

  it("creates an empty draft V2 snapshot with clonedFromVersion and increments current_version", () => {
    assert.match(body, /clonedFromVersion/);
    assert.match(body, /'entries', '\[\]'::jsonb/);
    assert.match(body, /'overrides', '\[\]'::jsonb/);
    assert.match(body, /status,\s*[\s\S]*'draft'/);
    assert.match(
      body,
      /set_config\('app\.semester_plan_rpc', 'create_semester_plan_version', true\)/,
    );
    assert.match(body, /set status = 'draft'/);
    assert.match(body, /current_version = next_number/);
  });

  it("does not re-point, delete, or copy planner_entries", () => {
    assert.match(originalBody, /update public\.planner_entries/);
    assert.match(originalBody, /set semester_plan_version_id = new_version\.id/);
    assert.equal(/update\s+public\.planner_entries/i.test(body), false);
    assert.equal(/semester_plan_version_id\s*=\s*new_version\.id/.test(body), false);
    assert.equal(/delete\s+from\s+public\.planner_entries/i.test(withoutComments), false);
    assert.equal(/insert\s+into\s+public\.planner_entries/i.test(withoutComments), false);
  });

  it("does not change grants, RLS, snapshots, sessions, or service_role writes", () => {
    assert.equal(/\bgrant\b/i.test(withoutComments), false);
    assert.equal(/\brevoke\b/i.test(withoutComments), false);
    assert.equal(/using\s*\(\s*true\s*\)/i.test(withoutComments), false);
    assert.equal(/service_role/.test(withoutComments), false);
    assert.equal(/create policy/i.test(withoutComments), false);
    assert.equal(/alter table/i.test(withoutComments), false);
    assert.equal(/distribution_snapshots|lesson_sessions|calendar_/i.test(withoutComments), false);
  });

  it("does not change TypeScript lifecycle callers, planner engine, or lesson sessions", () => {
    const lifecycle = readFileSync(join(ROOT, LIFECYCLE_TS), "utf8");
    const engine = readFileSync(join(ROOT, ENGINE_TS), "utf8");
    const session = readFileSync(join(ROOT, SESSION_TS), "utf8");
    assert.match(lifecycle, /create_semester_plan_version/);
    assert.match(lifecycle, /loadHistoricalVersionEntries/);
    assert.equal(/create_semester_plan_version/.test(engine), false);
    assert.equal(/create_semester_plan_version/.test(session), false);
  });
});

describe("P1-C2 in-memory replica (not live PostgreSQL)", () => {
  it("keeps V1 planner_entries on V1 and gives V2 zero operational rows", () => {
    const tables = seedApprovedPlan();
    const beforeEntries = cloneTables(tables).planner_entries;
    const beforeSnapshot = structuredClone(
      tables.semester_plan_versions.find((row) => row.id === VERSION_1_ID)?.snapshot,
    );

    const result = simulateCreateSemesterPlanVersion({
      tables,
      authUid: OWNER,
      planId: PLAN_ID,
    });

    assert.equal(result.error, null);
    assert.equal(result.data?.status, "draft");
    assert.equal(result.data?.current_version, 2);

    const v1 = tables.semester_plan_versions.find((row) => row.id === VERSION_1_ID);
    const v2 = tables.semester_plan_versions.find((row) => row.version_number === 2);
    assert.ok(v1);
    assert.ok(v2);
    assert.deepEqual(v1.snapshot, beforeSnapshot);
    assert.deepEqual(v2.snapshot, {
      clonedFromVersion: 1,
      entries: [],
      overrides: [],
    });
    assert.equal(v2.status, "draft");

    assert.equal(tables.planner_entries.length, 1);
    assert.equal(tables.planner_entries[0]?.id, ENTRY_ID);
    assert.equal(tables.planner_entries[0]?.semester_plan_version_id, VERSION_1_ID);
    assert.deepEqual(tables.planner_entries, beforeEntries);

    const v2Entries = tables.planner_entries.filter(
      (row) => row.semester_plan_version_id === v2.id,
    );
    assert.equal(v2Entries.length, 0);

    assert.equal(tables.distribution_snapshots[0]?.semester_plan_version_id, VERSION_1_ID);
    assert.equal(
      tables.distribution_snapshots.some((row) => row.semester_plan_version_id === v2.id),
      false,
    );
  });

  it("does not delete or create planner_entries", () => {
    const tables = seedApprovedPlan();
    simulateCreateSemesterPlanVersion({ tables, authUid: OWNER, planId: PLAN_ID });
    assert.equal(tables.planner_entries.length, 1);
    assert.equal(tables.planner_entries[0]?.id, ENTRY_ID);
  });

  it("rejects a non-owner and does not mutate rows", () => {
    const tables = seedApprovedPlan();
    const before = cloneTables(tables);
    const result = simulateCreateSemesterPlanVersion({
      tables,
      authUid: STRANGER,
      planId: PLAN_ID,
    });
    assert.equal(result.error?.message, "not authorized");
    assert.deepEqual(tables.semester_plans, before.semester_plans);
    assert.deepEqual(tables.semester_plan_versions, before.semester_plan_versions);
    assert.deepEqual(tables.planner_entries, before.planner_entries);
  });

  it("rejects a draft plan without creating a version", () => {
    const tables = seedApprovedPlan({
      semester_plans: [{ id: PLAN_ID, user_id: OWNER, status: "draft", current_version: 1 }],
    });
    const result = simulateCreateSemesterPlanVersion({
      tables,
      authUid: OWNER,
      planId: PLAN_ID,
    });
    assert.equal(
      result.error?.message,
      "new versions can only be created from approved or in-progress plans",
    );
    assert.equal(tables.semester_plan_versions.length, 1);
    assert.equal(tables.planner_entries[0]?.semester_plan_version_id, VERSION_1_ID);
  });
});
