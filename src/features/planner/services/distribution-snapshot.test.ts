import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { applyCurriculumMatches, parseDistributionSheet } from "./distribution-import.logic.ts";
import {
  DISTRIBUTION_SNAPSHOT_HAS_ERRORS_MESSAGE,
  DISTRIBUTION_SNAPSHOT_MISSING_PLAN_MESSAGE,
  DISTRIBUTION_SNAPSHOT_NEEDS_REVIEW_MESSAGE,
  DISTRIBUTION_SNAPSHOT_NOT_CONFIRMED_MESSAGE,
  DISTRIBUTION_SNAPSHOT_PLAN_NOT_DRAFT_MESSAGE,
  decideDistributionSnapshotApproval,
} from "./distribution-snapshot.logic.ts";
import {
  approveDistributionSnapshotAuthorized,
  type ApproveDistributionSnapshotRpcArgs,
} from "./distribution-snapshot.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const LOGIC_FILE = join(ROOT, "src/features/planner/services/distribution-snapshot.logic.ts");
const SERVICE_FILE = join(ROOT, "src/features/planner/services/distribution-snapshot.ts");
const FUNCTIONS_FILE = join(ROOT, "src/features/planner/distribution-import.functions.ts");
const PANEL_FILE = join(ROOT, "src/features/planner/components/distribution-import-panel.tsx");
const ENGINE_FILE = join(ROOT, "src/features/planner/services/planner-engine.ts");
const RESOLVER_FILE = join(ROOT, "src/features/calendar/services/resolve-calendar.ts");
const MIGRATION = join(ROOT, "supabase/migrations/20260813193000_distribution_snapshots.sql");

const ADMIN = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TEACHER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PLAN_ID = "99999999-9999-4999-8999-999999999999";
const VERSION_ID = "88888888-8888-4888-8888-888888888888";
const LESSON_ID = "11111111-1111-4111-8111-111111111111";
const SNAPSHOT_ID = "77777777-7777-4777-8777-777777777777";

function mockRoleClient(role: string | null): { client: never } {
  const terminal = {
    async maybeSingle() {
      return {
        data: role == null ? null : { role },
        error: null,
      };
    },
  };
  return {
    client: {
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
    } as never,
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

describe("decideDistributionSnapshotApproval", () => {
  it("rejects without an explicit confirmation", () => {
    const decision = decideDistributionSnapshotApproval({
      draft: readyDraft(),
      semesterPlanId: PLAN_ID,
      planStatus: "draft",
      confirmed: false,
      acknowledgeWarnings: false,
    });
    assert.equal(decision.ok, false);
    if (!decision.ok) {
      assert.ok(decision.errors.includes(DISTRIBUTION_SNAPSHOT_NOT_CONFIRMED_MESSAGE));
    }
  });

  it("rejects when no semester plan is selected", () => {
    const decision = decideDistributionSnapshotApproval({
      draft: readyDraft(),
      semesterPlanId: "",
      planStatus: "draft",
      confirmed: true,
      acknowledgeWarnings: false,
    });
    assert.equal(decision.ok, false);
    if (!decision.ok) {
      assert.ok(decision.errors.includes(DISTRIBUTION_SNAPSHOT_MISSING_PLAN_MESSAGE));
    }
  });

  it("rejects a non-draft plan", () => {
    const decision = decideDistributionSnapshotApproval({
      draft: readyDraft(),
      semesterPlanId: PLAN_ID,
      planStatus: "approved",
      confirmed: true,
      acknowledgeWarnings: false,
    });
    assert.equal(decision.ok, false);
    if (!decision.ok) {
      assert.ok(decision.errors.includes(DISTRIBUTION_SNAPSHOT_PLAN_NOT_DRAFT_MESSAGE));
    }
  });

  it("rejects drafts that still have errors", () => {
    const draft = parseDistributionSheet(
      [
        ["order", "unit", "lesson", "periods", "curriculum_lesson_id"],
        ["1", "وحدة", "", "2", LESSON_ID],
      ],
      { spreadsheetId: "sheet", worksheetName: "التوزيع" },
    );
    const decision = decideDistributionSnapshotApproval({
      draft,
      semesterPlanId: PLAN_ID,
      planStatus: "draft",
      confirmed: true,
      acknowledgeWarnings: true,
    });
    assert.equal(decision.ok, false);
    if (!decision.ok) {
      assert.ok(decision.errors.includes(DISTRIBUTION_SNAPSHOT_HAS_ERRORS_MESSAGE));
    }
  });

  it("rejects review items unless warnings are acknowledged", () => {
    const draft = parseDistributionSheet(
      [
        ["order", "unit", "lesson", "periods", "curriculum_lesson_id"],
        ["1", "وحدة", "درس", "2", ""],
      ],
      { spreadsheetId: "sheet", worksheetName: "التوزيع" },
    );
    const blocked = decideDistributionSnapshotApproval({
      draft,
      semesterPlanId: PLAN_ID,
      planStatus: "draft",
      confirmed: true,
      acknowledgeWarnings: false,
    });
    assert.equal(blocked.ok, false);
    if (!blocked.ok) {
      assert.ok(blocked.errors.includes(DISTRIBUTION_SNAPSHOT_NEEDS_REVIEW_MESSAGE));
    }
    const allowed = decideDistributionSnapshotApproval({
      draft,
      semesterPlanId: PLAN_ID,
      planStatus: "draft",
      confirmed: true,
      acknowledgeWarnings: true,
    });
    assert.equal(allowed.ok, true);
    if (allowed.ok) {
      assert.equal(allowed.items[0]?.curriculumLessonId, null);
      assert.equal(allowed.totalPeriods, 2);
    }
  });

  it("accepts a ready draft and keeps matched curriculum ids only", () => {
    const decision = decideDistributionSnapshotApproval({
      draft: readyDraft(),
      semesterPlanId: PLAN_ID,
      planStatus: "draft",
      confirmed: true,
      acknowledgeWarnings: false,
    });
    assert.equal(decision.ok, true);
    if (decision.ok) {
      assert.equal(decision.items.length, 2);
      assert.equal(decision.totalPeriods, 3);
      assert.equal(decision.items[0]?.curriculumLessonId, LESSON_ID);
      assert.equal(decision.items[0]?.orderIndex, 1);
      assert.equal("day" in decision.items[0]!, false);
    }
  });
});

describe("approveDistributionSnapshotAuthorized", () => {
  it("rejects a teacher before any snapshot write", async () => {
    const { client } = mockRoleClient(null);
    let inserts = 0;
    await assert.rejects(
      () =>
        approveDistributionSnapshotAuthorized(
          client,
          TEACHER,
          client,
          {
            draft: readyDraft(),
            semesterPlanId: PLAN_ID,
            confirmed: true,
            acknowledgeWarnings: false,
          },
          {
            rpc: async () => {
              inserts += 1;
              return { data: { snapshot_id: SNAPSHOT_ID }, error: null };
            },
          },
        ),
      (err: unknown) => err instanceof Error && err.message.includes("Administrators"),
    );
    assert.equal(inserts, 0);
  });

  it("writes snapshot tables for a draft plan and never planner_entries", async () => {
    const { client: admin } = mockRoleClient("admin");
    const writes: string[] = [];
    const jwt = {
      from(table: string) {
        writes.push(`${table}:from`);
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

    const rpcCalls: Array<{ fn: string; args: ApproveDistributionSnapshotRpcArgs }> = [];
    const result = await approveDistributionSnapshotAuthorized(
      admin,
      ADMIN,
      jwt as never,
      {
        draft: readyDraft(),
        semesterPlanId: PLAN_ID,
        confirmed: true,
        acknowledgeWarnings: false,
      },
      {
        rpc: async (fn, args) => {
          rpcCalls.push({ fn, args });
          return {
            data: {
              snapshot_id: SNAPSHOT_ID,
              semester_plan_id: PLAN_ID,
              semester_plan_version_id: VERSION_ID,
              item_count: 2,
              total_periods: 3,
            },
            error: null,
          };
        },
      },
    );

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.snapshotId, SNAPSHOT_ID);
      assert.equal(result.itemCount, 2);
      assert.equal(result.totalPeriods, 3);
      assert.equal(result.semesterPlanVersionId, VERSION_ID);
    }
    assert.equal(rpcCalls.length, 1);
    assert.equal(rpcCalls[0]?.fn, "approve_distribution_snapshot");
    assert.equal(rpcCalls[0]?.args.p_semester_plan_id, PLAN_ID);
    assert.equal((rpcCalls[0]?.args.p_items as Array<{ lesson: string }>)[0]?.lesson, "درس أ");
    assert.equal(
      writes.some((entry) => entry.startsWith("planner_entries")),
      false,
    );
    assert.equal(
      writes.some((entry) => entry.startsWith("lesson_sessions")),
      false,
    );
  });
});

describe("distribution snapshot contracts", () => {
  it("does not call the planner engine or calendar resolver", () => {
    for (const file of [LOGIC_FILE, SERVICE_FILE, FUNCTIONS_FILE, PANEL_FILE]) {
      const src = readFileSync(file, "utf8");
      assert.doesNotMatch(src, /generateSchedule/);
      assert.doesNotMatch(src, /planner-engine/);
      assert.doesNotMatch(src, /resolveCalendar/);
      assert.doesNotMatch(src, /resolve-calendar/);
      assert.doesNotMatch(src, /loadCalendarConfig/);
    }
    assert.match(readFileSync(ENGINE_FILE, "utf8"), /export async function generateSchedule/);
    assert.match(readFileSync(RESOLVER_FILE, "utf8"), /export async function resolveCalendar/);
  });

  it("approves through JWT after assertAdmin and does not use service_role for writes", () => {
    const service = readFileSync(SERVICE_FILE, "utf8");
    const start = service.indexOf("export async function approveDistributionSnapshotAuthorized");
    const body = service.slice(start);
    assert.match(body, /await assertAdmin\(adminClient, actorId\)/);
    const assertIdx = body.indexOf("await assertAdmin");
    const rpcIdx = body.indexOf("APPROVE_DISTRIBUTION_SNAPSHOT_RPC");
    assert.ok(assertIdx >= 0);
    assert.ok(rpcIdx > assertIdx);
    assert.match(service, /approve_distribution_snapshot/);
    assert.doesNotMatch(service, /service_role/);
    assert.doesNotMatch(service, /supabaseAdmin[\s\S]{0,80}\.insert/);
    assert.doesNotMatch(service, /supersedeCurrentSnapshot/);
    assert.doesNotMatch(service, /\.from\("distribution_snapshots"\)/);
    assert.doesNotMatch(service, /\.from\("distribution_snapshot_items"\)/);
    const fn = readFileSync(FUNCTIONS_FILE, "utf8");
    assert.match(fn, /authFromContext\(context\)\.client/);
    assert.match(fn, /approveDistributionSnapshotAuthorized/);
  });

  it("migration creates independent snapshot tables without mutating existing plans", () => {
    const sql = readFileSync(MIGRATION, "utf8");
    assert.match(sql, /create table if not exists public\.distribution_snapshots/);
    assert.match(sql, /create table if not exists public\.distribution_snapshot_items/);
    assert.match(sql, /plan_status is distinct from 'draft'/);
    const withoutComments = sql.replace(/--[^\n]*/g, "");
    assert.equal(/using\s*\(\s*true\s*\)/i.test(withoutComments), false);
    assert.equal(
      /update public\.(academic_years|semesters|lesson_sessions|semester_plans|planner_entries|calendar_variants|calendar_exceptions)/i.test(
        withoutComments,
      ),
      false,
    );
    assert.equal(/planner_entries/i.test(withoutComments), false);
    assert.equal(/generateSchedule/.test(sql), false);
  });
});
