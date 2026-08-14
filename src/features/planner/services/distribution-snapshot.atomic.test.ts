/**
 * Atomic approval tests.
 *
 * SQL contract tests read the migration. In-memory replica tests clone/restore
 * snapshot tables to mirror function-exception rollback.
 *
 * This environment does not run a live PostgreSQL harness. Do not treat the
 * replica as proof of PostgreSQL transaction semantics; plpgsql RAISE without
 * an outer EXCEPTION handler aborts the function transaction on the server.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { simulateApproveDistributionSnapshotRpc } from "./distribution-snapshot.atomic.memory.ts";
import { DISTRIBUTION_SNAPSHOT_SAVE_FAILED_MESSAGE } from "./distribution-snapshot.logic.ts";
import {
  APPROVE_DISTRIBUTION_SNAPSHOT_RPC,
  approveDistributionSnapshotAuthorized,
  type ApproveDistributionSnapshotRpcArgs,
} from "./distribution-snapshot.ts";
import { applyCurriculumMatches, parseDistributionSheet } from "./distribution-import.logic.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const MIGRATION = join(
  ROOT,
  "supabase/migrations/20260813210000_approve_distribution_snapshot_atomic.sql",
);
const SERVICE_FILE = join(ROOT, "src/features/planner/services/distribution-snapshot.ts");
const FUNCTIONS_FILE = join(ROOT, "src/features/planner/distribution-import.functions.ts");

const ADMIN = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TEACHER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PLAN_ID = "99999999-9999-4999-8999-999999999999";
const VERSION_ID = "88888888-8888-4888-8888-888888888888";
const SNAPSHOT_A = "77777777-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LESSON_ID = "11111111-1111-4111-8111-111111111111";

type Row = Record<string, unknown>;

function validItems(): ApproveDistributionSnapshotRpcArgs["p_items"] {
  return [
    {
      order_index: 1,
      unit: "وحدة",
      lesson: "درس أ",
      periods: 2,
      notes: "",
      curriculum_lesson_id: LESSON_ID,
    },
    {
      order_index: 2,
      unit: "وحدة",
      lesson: "درس ب",
      periods: 1,
      notes: "",
      curriculum_lesson_id: null,
    },
  ];
}

function seedTables(overrides: Record<string, Row[]> = {}): Record<string, Row[]> {
  return {
    user_roles: [{ user_id: ADMIN, role: "admin" }],
    semester_plans: [
      {
        id: PLAN_ID,
        user_id: TEACHER,
        status: "draft",
        current_version: 1,
      },
    ],
    semester_plan_versions: [
      {
        id: VERSION_ID,
        semester_plan_id: PLAN_ID,
        version_number: 1,
      },
    ],
    distribution_snapshots: [
      {
        id: SNAPSHOT_A,
        semester_plan_id: PLAN_ID,
        semester_plan_version_id: VERSION_ID,
        spreadsheet_id: "old-sheet",
        worksheet_name: "قديم",
        source: "google_sheets",
        item_count: 1,
        total_periods: 1,
        approved_by: ADMIN,
        is_current: true,
      },
    ],
    distribution_snapshot_items: [
      {
        id: "item-a",
        snapshot_id: SNAPSHOT_A,
        order_index: 1,
        unit: "قديم",
        lesson: "لقطة أ",
        periods: 1,
        notes: "",
        curriculum_lesson_id: null,
      },
    ],
    planner_entries: [{ id: "keep-me", semester_plan_id: PLAN_ID }],
    lesson_sessions: [{ id: "session-keep" }],
    ...overrides,
  };
}

function rpcArgs(
  items: ApproveDistributionSnapshotRpcArgs["p_items"] = validItems(),
): ApproveDistributionSnapshotRpcArgs {
  return {
    p_semester_plan_id: PLAN_ID,
    p_spreadsheet_id: "sheet-new",
    p_worksheet_name: "التوزيع",
    p_items: items,
  };
}

function currentSnapshots(tables: Record<string, Row[]>) {
  return (tables.distribution_snapshots ?? []).filter((row) => row.is_current === true);
}

function snapshotById(tables: Record<string, Row[]>, id: string) {
  return (tables.distribution_snapshots ?? []).find((row) => row.id === id);
}

describe("approve_distribution_snapshot SQL contract", () => {
  const sql = readFileSync(MIGRATION, "utf8");

  it("is a single plpgsql function using auth.uid and admin role", () => {
    assert.match(sql, /create or replace function public\.approve_distribution_snapshot/);
    assert.match(sql, /language plpgsql/);
    assert.match(sql, /security invoker/i);
    assert.match(sql, /v_caller uuid := auth\.uid\(\)/);
    assert.match(sql, /has_role\(v_caller,\s*'admin'::public\.app_role\)/);
    assert.match(sql, /is_semester_plan_owner\(v_plan\.id\)/);
    assert.match(sql, /v_plan\.status is distinct from 'draft'/);
    assert.match(sql, /version_number = v_plan\.current_version/);
    assert.doesNotMatch(sql, /p_user_id/);
    assert.doesNotMatch(sql, /security definer/i);
    assert.doesNotMatch(sql.replace(/--[^\n]*/g, ""), /\bservice_role\b/);
  });

  it("validates items before mutating is_current and writes snapshots only", () => {
    const validateIdx = sql.indexOf("jsonb_array_length(p_items) < 1");
    const updateIdx = sql.indexOf("set is_current = false");
    const insertSnapIdx = sql.indexOf("insert into public.distribution_snapshots");
    const insertItemsIdx = sql.indexOf("insert into public.distribution_snapshot_items");
    assert.ok(validateIdx >= 0);
    assert.ok(updateIdx > validateIdx);
    assert.ok(insertSnapIdx > updateIdx);
    assert.ok(insertItemsIdx > insertSnapIdx);
    const withoutComments = sql.replace(/--[^\n]*/g, "");
    assert.match(sql, /grant execute[\s\S]*to authenticated/i);
    assert.match(
      sql,
      /revoke all on function public\.approve_distribution_snapshot\(uuid, text, text, jsonb\)\s+from public, anon/,
    );
    assert.match(sql, /revoke all on function public\.approve_distribution_snapshot/);
    assert.doesNotMatch(withoutComments, /planner_entries/);
    assert.doesNotMatch(withoutComments, /lesson_sessions/);
    assert.doesNotMatch(sql, /alter table/i);
    assert.doesNotMatch(sql, /create policy/i);
    assert.doesNotMatch(sql, /INSERT INTO public\.semester_plans/i);
  });
});

describe("in-memory RPC replica (not live PostgreSQL)", () => {
  it("successful approval supersedes A and stores complete B items", () => {
    const tables = seedTables();
    const result = simulateApproveDistributionSnapshotRpc({
      tables,
      authUid: ADMIN,
      args: rpcArgs(),
    });
    assert.equal(result.error, null);
    assert.ok(result.data?.snapshot_id);
    assert.equal(snapshotById(tables, SNAPSHOT_A)?.is_current, false);
    const current = currentSnapshots(tables);
    assert.equal(current.length, 1);
    assert.equal(current[0]?.id, result.data?.snapshot_id);
    const items = (tables.distribution_snapshot_items ?? []).filter(
      (row) => row.snapshot_id === result.data?.snapshot_id,
    );
    assert.equal(items.length, 2);
    assert.equal(result.data?.item_count, 2);
    assert.equal(result.data?.total_periods, 3);
    assert.equal(tables.planner_entries?.length, 1);
    assert.equal(tables.lesson_sessions?.length, 1);
  });

  it("failure creating snapshot B restores A as current with no orphan B", () => {
    const tables = seedTables();
    const before = JSON.stringify(tables.distribution_snapshots);
    const result = simulateApproveDistributionSnapshotRpc({
      tables,
      authUid: ADMIN,
      args: rpcArgs(),
      failAfter: "supersede",
    });
    assert.equal(result.data, null);
    assert.equal(result.error?.message, DISTRIBUTION_SNAPSHOT_SAVE_FAILED_MESSAGE);
    assert.equal(JSON.stringify(tables.distribution_snapshots), before);
    assert.equal(snapshotById(tables, SNAPSHOT_A)?.is_current, true);
    assert.equal(currentSnapshots(tables).length, 1);
    assert.equal(
      (tables.distribution_snapshot_items ?? []).every((row) => row.snapshot_id === SNAPSHOT_A),
      true,
    );
  });

  it("failure inserting B rolls back so A stays current", () => {
    const tables = seedTables();
    const result = simulateApproveDistributionSnapshotRpc({
      tables,
      authUid: ADMIN,
      args: rpcArgs(),
      failAfter: "insert_snapshot",
    });
    assert.equal(result.data, null);
    assert.equal(snapshotById(tables, SNAPSHOT_A)?.is_current, true);
    assert.equal(
      currentSnapshots(tables)
        .map((row) => row.id)
        .join(","),
      SNAPSHOT_A,
    );
    assert.equal(
      (tables.distribution_snapshots ?? []).some((row) => row.id !== SNAPSHOT_A),
      false,
    );
  });

  it("failure inserting items rolls back B snapshot and items", () => {
    const tables = seedTables();
    const result = simulateApproveDistributionSnapshotRpc({
      tables,
      authUid: ADMIN,
      args: rpcArgs(),
      failAfter: "insert_items",
    });
    assert.equal(result.data, null);
    assert.equal(result.error?.message, DISTRIBUTION_SNAPSHOT_SAVE_FAILED_MESSAGE);
    assert.equal(snapshotById(tables, SNAPSHOT_A)?.is_current, true);
    assert.equal((tables.distribution_snapshots ?? []).length, 1);
    assert.equal((tables.distribution_snapshot_items ?? []).length, 1);
    assert.equal(tables.distribution_snapshot_items?.[0]?.snapshot_id, SNAPSHOT_A);
  });

  it("empty items fail before changing the current snapshot", () => {
    const tables = seedTables();
    const result = simulateApproveDistributionSnapshotRpc({
      tables,
      authUid: ADMIN,
      args: rpcArgs([]),
    });
    assert.equal(result.data, null);
    assert.equal(snapshotById(tables, SNAPSHOT_A)?.is_current, true);
    assert.equal((tables.distribution_snapshots ?? []).length, 1);
  });

  it("invalid items roll back with no writes", () => {
    const tables = seedTables();
    const result = simulateApproveDistributionSnapshotRpc({
      tables,
      authUid: ADMIN,
      args: rpcArgs([
        {
          order_index: 1,
          unit: "وحدة",
          lesson: "   ",
          periods: 0,
          notes: "",
          curriculum_lesson_id: null,
        },
      ]),
    });
    assert.equal(result.data, null);
    assert.equal(snapshotById(tables, SNAPSHOT_A)?.is_current, true);
    assert.equal(currentSnapshots(tables).length, 1);
  });

  it("non-draft plan is rejected without snapshot changes", () => {
    const tables = seedTables({
      semester_plans: [
        {
          id: PLAN_ID,
          user_id: TEACHER,
          status: "approved",
          current_version: 1,
        },
      ],
    });
    const before = JSON.stringify(tables.distribution_snapshots);
    const result = simulateApproveDistributionSnapshotRpc({
      tables,
      authUid: ADMIN,
      args: rpcArgs(),
    });
    assert.equal(result.data, null);
    assert.equal(JSON.stringify(tables.distribution_snapshots), before);
  });

  it("missing current version is rejected without snapshot changes", () => {
    const tables = seedTables({
      semester_plan_versions: [],
    });
    const result = simulateApproveDistributionSnapshotRpc({
      tables,
      authUid: ADMIN,
      args: rpcArgs(),
    });
    assert.equal(result.data, null);
    assert.equal(snapshotById(tables, SNAPSHOT_A)?.is_current, true);
  });

  it("rejects a non-admin caller without changing the current snapshot", () => {
    const tables = seedTables();
    const before = JSON.stringify({
      snapshots: tables.distribution_snapshots,
      items: tables.distribution_snapshot_items,
    });
    const result = simulateApproveDistributionSnapshotRpc({
      tables,
      authUid: TEACHER,
      args: rpcArgs(),
    });
    assert.equal(result.data, null);
    assert.equal(result.error?.message, DISTRIBUTION_SNAPSHOT_SAVE_FAILED_MESSAGE);
    assert.equal(snapshotById(tables, SNAPSHOT_A)?.is_current, true);
    assert.equal(
      JSON.stringify({
        snapshots: tables.distribution_snapshots,
        items: tables.distribution_snapshot_items,
      }),
      before,
    );
  });

  it("rejects an unauthenticated caller without writes", () => {
    const tables = seedTables();
    const result = simulateApproveDistributionSnapshotRpc({
      tables,
      authUid: null,
      args: rpcArgs(),
    });
    assert.equal(result.data, null);
    assert.equal(snapshotById(tables, SNAPSHOT_A)?.is_current, true);
    assert.equal((tables.distribution_snapshots ?? []).length, 1);
  });
});

describe("approveDistributionSnapshotAuthorized atomic wiring", () => {
  function mockRoleClient(role: string | null) {
    const terminal = {
      async maybeSingle() {
        return {
          data: role == null ? null : { role },
          error: null,
        };
      },
    };
    return {
      from() {
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return terminal;
                  },
                  ...terminal,
                };
              },
            };
          },
        };
      },
    };
  }

  function readyDraft() {
    const parsed = parseDistributionSheet(
      [
        ["order", "unit", "lesson", "periods", "curriculum_lesson_id"],
        ["1", "وحدة", "درس أ", "2", LESSON_ID],
        ["2", "وحدة", "درس ب", "1", LESSON_ID],
      ],
      { spreadsheetId: "sheet-abc", worksheetName: "التوزيع" },
    );
    return applyCurriculumMatches(parsed, [{ id: LESSON_ID, title: "درس أ" }]);
  }

  it("maps RPC failure to the atomic error and does not return a snapshot id", async () => {
    const admin = mockRoleClient("admin");
    const jwt = {
      from(table: string) {
        if (table === "semester_plans") {
          return {
            select() {
              return {
                eq() {
                  return {
                    async maybeSingle() {
                      return {
                        data: { id: PLAN_ID, status: "draft", current_version: 1 },
                        error: null,
                      };
                    },
                  };
                },
              };
            },
          };
        }
        if (table === "semester_plan_versions") {
          return {
            select() {
              return {
                eq() {
                  return {
                    eq() {
                      return {
                        async maybeSingle() {
                          return { data: { id: VERSION_ID }, error: null };
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    };

    const result = await approveDistributionSnapshotAuthorized(
      admin as never,
      ADMIN,
      jwt as never,
      {
        draft: readyDraft(),
        semesterPlanId: PLAN_ID,
        confirmed: true,
        acknowledgeWarnings: false,
      },
      {
        rpc: async () => ({
          data: null,
          error: { message: DISTRIBUTION_SNAPSHOT_SAVE_FAILED_MESSAGE },
        }),
      },
    );

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.deepEqual(result.errors, [DISTRIBUTION_SNAPSHOT_SAVE_FAILED_MESSAGE]);
      assert.equal("snapshotId" in result, false);
    }
  });

  it("treats a JSON-string RPC payload as success only when snapshot_id is present", async () => {
    const admin = mockRoleClient("admin");
    const jwt = {
      from(table: string) {
        if (table === "semester_plans") {
          return {
            select() {
              return {
                eq() {
                  return {
                    async maybeSingle() {
                      return {
                        data: { id: PLAN_ID, status: "draft", current_version: 1 },
                        error: null,
                      };
                    },
                  };
                },
              };
            },
          };
        }
        if (table === "semester_plan_versions") {
          return {
            select() {
              return {
                eq() {
                  return {
                    eq() {
                      return {
                        async maybeSingle() {
                          return { data: { id: VERSION_ID }, error: null };
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    };

    const result = await approveDistributionSnapshotAuthorized(
      admin as never,
      ADMIN,
      jwt as never,
      {
        draft: readyDraft(),
        semesterPlanId: PLAN_ID,
        confirmed: true,
        acknowledgeWarnings: false,
      },
      {
        rpc: async () => ({
          data: JSON.stringify({
            snapshot_id: SNAPSHOT_A,
            semester_plan_id: PLAN_ID,
            semester_plan_version_id: VERSION_ID,
            item_count: 2,
            total_periods: 3,
          }),
          error: null,
        }),
      },
    );

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.snapshotId, SNAPSHOT_A);
      assert.equal(result.itemCount, 2);
    }
  });

  it("keeps assertAdmin and JWT rpc without service_role", () => {
    const service = readFileSync(SERVICE_FILE, "utf8");
    const functions = readFileSync(FUNCTIONS_FILE, "utf8");
    assert.match(service, /await assertAdmin\(adminClient, actorId\)/);
    assert.match(service, new RegExp(APPROVE_DISTRIBUTION_SNAPSHOT_RPC));
    assert.doesNotMatch(service.replace(/\/\*[\s\S]*?\*\//g, ""), /service_role/);
    assert.doesNotMatch(functions.replace(/\/\*[\s\S]*?\*\//g, ""), /service_role/);
    assert.match(functions, /requireSupabaseAuth/);
  });
});
