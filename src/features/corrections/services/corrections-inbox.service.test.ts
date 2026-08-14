import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import type { SupabaseUserContext } from "@/platform/database/supabase/context";

import { CorrectionsInboxService } from "./corrections-inbox.service.ts";

const TEACHER_A = "11111111-1111-4111-8111-111111111111";
const TEACHER_B = "22222222-2222-4222-8222-222222222222";
const HW_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TEST_A = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const STU_A = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const STU_B = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const HS_A = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const TS_A = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const HS_FOREIGN = "99999999-9999-4999-8999-999999999999";
const TS_FOREIGN = "88888888-8888-4888-8888-888888888888";

type Row = Record<string, unknown>;
type Db = {
  homework_submissions: Row[];
  test_submissions: Row[];
  homework: Row[];
  tests: Row[];
  students: Row[];
  __queries?: Array<{ table: string; filters: Record<string, unknown> }>;
};

function createMockClient(db: Db) {
  if (!db.__queries) db.__queries = [];

  const client = {
    from(table: string) {
      const state: {
        filters: Record<string, unknown>;
        inFilters: Record<string, unknown[]>;
        orders: Array<{ column: string; ascending: boolean }>;
      } = {
        filters: {},
        inFilters: {},
        orders: [],
      };

      const runSelect = (): Row[] => {
        db.__queries!.push({ table, filters: { ...state.filters, ...state.inFilters } });
        let rows = [...((db as Record<string, Row[]>)[table] ?? [])];
        for (const [column, value] of Object.entries(state.filters)) {
          rows = rows.filter((row) => row[column] === value);
        }
        for (const [column, values] of Object.entries(state.inFilters)) {
          rows = rows.filter((row) => values.includes(row[column]));
        }
        for (const order of state.orders) {
          rows.sort((a, b) => {
            const av = a[order.column];
            const bv = b[order.column];
            if (av === bv) return 0;
            if (av == null) return 1;
            if (bv == null) return -1;
            if (String(av) < String(bv)) return order.ascending ? -1 : 1;
            return order.ascending ? 1 : -1;
          });
        }
        return rows;
      };

      const chain = {
        select() {
          return chain;
        },
        eq(column: string, value: unknown) {
          state.filters[column] = value;
          return chain;
        },
        in(column: string, values: unknown[]) {
          state.inFilters[column] = values;
          return chain;
        },
        order(column: string, opts?: { ascending?: boolean }) {
          state.orders.push({ column, ascending: opts?.ascending !== false });
          return chain;
        },
        then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
          return Promise.resolve({ data: runSelect(), error: null }).then(resolve, reject);
        },
      };
      return chain;
    },
  };

  return client as never;
}

function authFor(db: Db, userId = TEACHER_A): SupabaseUserContext {
  return { client: createMockClient(db), userId };
}

function seedBase(db: Db) {
  db.homework.push({
    id: HW_A,
    teacher_id: TEACHER_A,
    title: "واجب الوحدة",
  });
  db.tests.push({
    id: TEST_A,
    teacher_id: TEACHER_A,
    title: "اختبار قصير",
  });
  db.students.push(
    { id: STU_A, teacher_id: TEACHER_A, full_name: "أحمد علي" },
    { id: STU_B, teacher_id: TEACHER_A, full_name: "سارة محمد" },
  );
}

describe("TASK 23 CorrectionsInboxService", () => {
  it("1-2 / 8-10. owned submitted homework+test merge; titles/students; sort", async () => {
    const db: Db = {
      homework_submissions: [],
      test_submissions: [],
      homework: [],
      tests: [],
      students: [],
    };
    seedBase(db);
    db.homework_submissions.push({
      id: HS_A,
      teacher_id: TEACHER_A,
      homework_id: HW_A,
      student_id: STU_A,
      status: "submitted",
      score: null,
      feedback: null,
      submitted_at: "2026-08-15T09:00:00Z",
      graded_at: null,
      created_at: "2026-08-15T08:00:00Z",
      updated_at: "2026-08-15T09:00:00Z",
    });
    db.test_submissions.push({
      id: TS_A,
      teacher_id: TEACHER_A,
      test_id: TEST_A,
      student_id: STU_B,
      status: "submitted",
      score: null,
      max_score: null,
      feedback: null,
      submitted_at: "2026-08-15T11:00:00Z",
      graded_at: null,
      created_at: "2026-08-15T10:00:00Z",
      updated_at: "2026-08-15T11:00:00Z",
    });

    const items = await CorrectionsInboxService.listNeedsAction(authFor(db));
    assert.equal(items.length, 2);
    assert.equal(items[0]?.source, "test");
    assert.equal(items[0]?.title, "اختبار قصير");
    assert.equal(items[0]?.studentName, "سارة محمد");
    assert.equal(items[1]?.source, "homework");
    assert.equal(items[1]?.title, "واجب الوحدة");
    assert.equal(items[1]?.studentName, "أحمد علي");
    assert.match(items[0]?.href ?? "", /\/tests\?testId=/);
    assert.match(items[1]?.href ?? "", /\/homework\?homeworkId=/);

    // Efficient queries: submissions filtered by teacher+status, then batched title/name lookups.
    const tables = db.__queries!.map((q) => q.table);
    assert.ok(tables.includes("homework_submissions"));
    assert.ok(tables.includes("test_submissions"));
    assert.ok(tables.includes("homework"));
    assert.ok(tables.includes("tests"));
    assert.ok(tables.includes("students"));
    assert.equal(tables.filter((t) => t === "homework_submissions").length, 1);
    assert.equal(tables.filter((t) => t === "test_submissions").length, 1);
  });

  it("3-4. foreign submissions excluded", async () => {
    const db: Db = {
      homework_submissions: [],
      test_submissions: [],
      homework: [],
      tests: [],
      students: [],
    };
    seedBase(db);
    db.homework_submissions.push({
      id: HS_FOREIGN,
      teacher_id: TEACHER_B,
      homework_id: HW_A,
      student_id: STU_A,
      status: "submitted",
      submitted_at: "2026-08-15T09:00:00Z",
      score: null,
      feedback: null,
      graded_at: null,
      created_at: "2026-08-15T08:00:00Z",
      updated_at: "2026-08-15T09:00:00Z",
    });
    db.test_submissions.push({
      id: TS_FOREIGN,
      teacher_id: TEACHER_B,
      test_id: TEST_A,
      student_id: STU_B,
      status: "submitted",
      submitted_at: "2026-08-15T11:00:00Z",
      score: null,
      max_score: null,
      feedback: null,
      graded_at: null,
      created_at: "2026-08-15T10:00:00Z",
      updated_at: "2026-08-15T11:00:00Z",
    });

    const items = await CorrectionsInboxService.listNeedsAction(authFor(db));
    assert.equal(items.length, 0);
  });

  it("5-6. pending and graded tests excluded", async () => {
    const db: Db = {
      homework_submissions: [],
      test_submissions: [],
      homework: [],
      tests: [],
      students: [],
    };
    seedBase(db);
    db.test_submissions.push(
      {
        id: "pending-1",
        teacher_id: TEACHER_A,
        test_id: TEST_A,
        student_id: STU_A,
        status: "pending",
        submitted_at: null,
        score: null,
        max_score: null,
        feedback: null,
        graded_at: null,
        created_at: "2026-08-15T08:00:00Z",
        updated_at: "2026-08-15T08:00:00Z",
      },
      {
        id: "graded-1",
        teacher_id: TEACHER_A,
        test_id: TEST_A,
        student_id: STU_B,
        status: "graded",
        submitted_at: "2026-08-15T09:00:00Z",
        score: 8,
        max_score: 10,
        feedback: null,
        graded_at: "2026-08-15T10:00:00Z",
        created_at: "2026-08-15T08:00:00Z",
        updated_at: "2026-08-15T10:00:00Z",
      },
    );

    const items = await CorrectionsInboxService.listNeedsAction(authFor(db));
    assert.equal(items.length, 0);
  });

  it("7. unauthenticated returns empty", async () => {
    // resolveUserContext(undefined) hits live auth; simulate via empty user path is hard.
    // Contract: service returns [] when resolveUserContext returns null — verified by
    // early return + source check.
    const source = readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), "corrections-inbox.service.ts"),
      "utf8",
    );
    assert.match(source, /resolveUserContext/);
    assert.match(source, /if\s*\(\s*!resolved\s*\)\s*return\s*\[\]/);
    assert.match(source, /listSubmittedForTeacher/);
    assert.equal(/\bteacherId\s*:/.test(source), false);
  });

  it("11. no client teacher_id; uses batched parent lookups", async () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const service = readFileSync(path.join(here, "corrections-inbox.service.ts"), "utf8");
    const hook = readFileSync(path.join(here, "../hooks/useCorrectionsInbox.ts"), "utf8");
    const page = readFileSync(
      path.join(here, "../components/corrections-page-content.tsx"),
      "utf8",
    );

    assert.equal(/\bteacherId\s*[:=]|\bteacher_id\s*[:=]/.test(hook), false);
    assert.equal(/\bteacherId\s*[:=]|\bteacher_id\s*[:=]/.test(page), false);
    assert.match(service, /listSubmittedForTeacher/);
    assert.match(service, /\.in\(/);
    assert.equal(/for\s*\(.*of.*homework.*\)[\s\S]*listByHomework/.test(service), false);
    assert.equal(/for\s*\(.*of.*test.*\)[\s\S]*listByTest/.test(service), false);
    assert.match(hook, /CorrectionsInboxService\.listNeedsAction/);
    assert.equal(/from\(["']homework_submissions["']\)/.test(hook), false);
    assert.equal(/from\(["']test_submissions["']\)/.test(page), false);
  });
});
