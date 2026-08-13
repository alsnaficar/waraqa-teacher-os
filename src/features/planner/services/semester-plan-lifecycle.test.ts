import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";

import {
  ensureSemesterPlan,
  findSemesterPlan,
  SEMESTER_PLAN_SCOPE_REQUIRED_MESSAGE,
} from "./semester-plan-lifecycle.ts";

const TEACHER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OWNER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OFFICIAL_YEAR_ID = "01c10273-1111-4111-8111-111111111111";
const OFFICIAL_SEMESTER_ID = "5c772d22-2222-4222-8222-222222222222";
const LEGACY_PLAN_ID = "legacy-plan-unlinked";
const LEGACY_VERSION_ID = "legacy-version-unlinked";

type Row = Record<string, unknown>;
type Filter = {
  column: string;
  op: "eq" | "is" | "not-eq";
  value: unknown;
};

function matches(row: Row, filters: Filter[]): boolean {
  return filters.every((f) => {
    const v = row[f.column];
    if (f.op === "eq") return v === f.value;
    if (f.op === "is") return v == null && f.value == null;
    return v !== f.value;
  });
}

function createMockDb(db: Record<string, Row[]>) {
  const inserts: { table: string; row: Row }[] = [];

  const client = {
    from(table: string) {
      const filters: Filter[] = [];
      const orders: { column: string; ascending: boolean }[] = [];
      let pendingInsert: Row[] | null = null;
      let pendingUpdate: Row | null = null;
      let limitN: number | null = null;

      const runSelect = (): Row[] => {
        let rows = (db[table] ?? []).filter((row) => matches(row, filters));
        for (const ord of [...orders].reverse()) {
          rows = [...rows].sort((a, b) => {
            const av = a[ord.column];
            const bv = b[ord.column];
            if (av === bv) return 0;
            if (av == null) return 1;
            if (bv == null) return -1;
            if (av < bv) return ord.ascending ? -1 : 1;
            return ord.ascending ? 1 : -1;
          });
        }
        if (limitN != null) rows = rows.slice(0, limitN);
        return rows;
      };

      const execute = async (mode: "many" | "single" | "maybe") => {
        if (pendingInsert) {
          const inserted: Row[] = [];
          for (const row of pendingInsert) {
            inserts.push({ table, row });
            const saved = {
              id: (row.id as string) ?? randomUUID(),
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              ...row,
            };
            db[table] = [...(db[table] ?? []), saved];
            inserted.push(saved);
          }
          const data = mode === "many" ? inserted : (inserted[0] ?? null);
          return { data, error: null };
        }

        if (pendingUpdate) {
          const rows = (db[table] ?? []).filter((row) => matches(row, filters));
          for (const row of rows) {
            Object.assign(row, pendingUpdate, { updated_at: new Date().toISOString() });
          }
          return { data: mode === "many" ? rows : (rows[0] ?? null), error: null };
        }

        const rows = runSelect();
        if (mode === "many") return { data: rows, error: null };
        if (mode === "maybe") return { data: rows[0] ?? null, error: null };
        if (!rows[0]) return { data: null, error: { message: "not found" } };
        return { data: rows[0], error: null };
      };

      const api: Record<string, unknown> = {
        select() {
          return api;
        },
        insert(row: Row | Row[]) {
          pendingInsert = Array.isArray(row) ? row : [row];
          return api;
        },
        update(row: Row) {
          pendingUpdate = row;
          return api;
        },
        eq(column: string, value: unknown) {
          filters.push({ column, op: "eq", value });
          return api;
        },
        is(column: string, value: unknown) {
          filters.push({ column, op: "is", value });
          return api;
        },
        not(column: string, operator: string, value: unknown) {
          if (operator === "eq") filters.push({ column, op: "not-eq", value });
          return api;
        },
        order(column: string, options?: { ascending?: boolean }) {
          orders.push({ column, ascending: options?.ascending !== false });
          return api;
        },
        limit(n: number) {
          limitN = n;
          return api;
        },
        maybeSingle() {
          return execute("maybe");
        },
        single() {
          return execute("single");
        },
        then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
          return execute("many").then(onFulfilled, onRejected);
        },
      };

      return api;
    },
  };

  return { client, db, inserts };
}

function auth(userId: string, client: ReturnType<typeof createMockDb>["client"]) {
  return { userId, client: client as never };
}

function officialCalendar() {
  return {
    academic_years: [
      {
        id: OFFICIAL_YEAR_ID,
        user_id: OWNER_ID,
        label: "العام الدراسي 1448-1449هـ",
        start_date: "2026-08-23",
        end_date: null,
        is_active: true,
      },
    ],
    semesters: [
      {
        id: OFFICIAL_SEMESTER_ID,
        user_id: OWNER_ID,
        academic_year_id: OFFICIAL_YEAR_ID,
        label: "الفصل الدراسي الأول",
        start_date: "2026-08-30",
        end_date: "2027-01-08",
        order_index: 1,
      },
    ],
    calendar_variants: [
      {
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        code: "GENERAL",
        label: "جميع المناطق",
        is_default: true,
        is_selectable: true,
        sort_order: 0,
      },
    ],
    semester_plans: [] as Row[],
    semester_plan_versions: [] as Row[],
    planner_entries: [] as Row[],
  };
}

function legacyUnlinkedPlan() {
  return {
    id: LEGACY_PLAN_ID,
    user_id: TEACHER_ID,
    subject: "لغتي",
    grade: "صف أول",
    academic_year_id: null,
    semester_id: null,
    status: "draft",
    current_version: 1,
  };
}

function legacyUnlinkedVersion() {
  return {
    id: LEGACY_VERSION_ID,
    semester_plan_id: LEGACY_PLAN_ID,
    version_number: 1,
    status: "draft",
    snapshot: { entries: [], overrides: [] },
    created_by: TEACHER_ID,
  };
}

describe("ensureSemesterPlan academic scope", () => {
  it("creates a plan when academic year and semester are both present", async () => {
    const mock = createMockDb(officialCalendar());
    const ctx = await ensureSemesterPlan(
      {
        subject: "لغتي",
        grade: "صف أول",
        academicYearId: OFFICIAL_YEAR_ID,
        semesterId: OFFICIAL_SEMESTER_ID,
      },
      auth(TEACHER_ID, mock.client),
    );

    assert.equal(ctx.plan.academic_year_id, OFFICIAL_YEAR_ID);
    assert.equal(ctx.plan.semester_id, OFFICIAL_SEMESTER_ID);
    assert.equal(
      mock.inserts.some((item) => item.table === "semester_plans"),
      true,
    );
    const planInsert = mock.inserts.find((item) => item.table === "semester_plans");
    assert.equal(planInsert?.row.academic_year_id, OFFICIAL_YEAR_ID);
    assert.equal(planInsert?.row.semester_id, OFFICIAL_SEMESTER_ID);
  });

  it("rejects creation when academic year is missing and does not insert", async () => {
    const mock = createMockDb({
      academic_years: [],
      semesters: officialCalendar().semesters,
      semester_plans: [],
      semester_plan_versions: [],
      planner_entries: [],
    });

    await assert.rejects(
      () =>
        ensureSemesterPlan(
          {
            subject: "لغتي",
            grade: "صف أول",
            academicYearId: null,
            semesterId: OFFICIAL_SEMESTER_ID,
          },
          auth(TEACHER_ID, mock.client),
        ),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, SEMESTER_PLAN_SCOPE_REQUIRED_MESSAGE);
        return true;
      },
    );

    assert.equal(mock.inserts.length, 0);
    assert.equal((mock.db.semester_plans ?? []).length, 0);
  });

  it("rejects creation when semester is missing and does not insert", async () => {
    const mock = createMockDb({
      academic_years: officialCalendar().academic_years,
      semesters: [],
      semester_plans: [],
      semester_plan_versions: [],
      planner_entries: [],
    });

    await assert.rejects(
      () =>
        ensureSemesterPlan(
          {
            subject: "لغتي",
            grade: "صف أول",
            academicYearId: OFFICIAL_YEAR_ID,
            semesterId: null,
          },
          auth(TEACHER_ID, mock.client),
        ),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, SEMESTER_PLAN_SCOPE_REQUIRED_MESSAGE);
        return true;
      },
    );

    assert.equal(mock.inserts.length, 0);
    assert.equal((mock.db.semester_plans ?? []).length, 0);
  });

  it("rejects creation when both academic year and semester are missing", async () => {
    const mock = createMockDb({
      academic_years: [],
      semesters: [],
      semester_plans: [],
      semester_plan_versions: [],
      planner_entries: [],
    });

    await assert.rejects(
      () =>
        ensureSemesterPlan(
          {
            subject: "لغتي",
            grade: "صف أول",
            academicYearId: null,
            semesterId: null,
          },
          auth(TEACHER_ID, mock.client),
        ),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, SEMESTER_PLAN_SCOPE_REQUIRED_MESSAGE);
        return true;
      },
    );

    assert.equal(mock.inserts.length, 0);
  });

  it("can still read an existing legacy plan with a null academic year", async () => {
    const mock = createMockDb({
      ...officialCalendar(),
      semester_plans: [legacyUnlinkedPlan()],
      semester_plan_versions: [legacyUnlinkedVersion()],
    });

    const found = await findSemesterPlan(
      {
        subject: "لغتي",
        academicYearId: null,
        semesterId: null,
      },
      auth(TEACHER_ID, mock.client),
    );

    assert.ok(found);
    assert.equal(found.plan.id, LEGACY_PLAN_ID);
    assert.equal(found.plan.academic_year_id, null);
    assert.equal(found.plan.semester_id, null);
    assert.equal(mock.inserts.length, 0);
  });

  it("uses the upcoming official semester on 2026-08-13 to create a scoped plan", async () => {
    const mock = createMockDb(officialCalendar());
    const ctx = await ensureSemesterPlan(
      { subject: "الرياضيات", grade: "صف أول" },
      auth(TEACHER_ID, mock.client),
    );

    const today = new Date().toISOString().slice(0, 10);
    assert.ok(today < "2026-08-30" || today <= "2027-01-08");
    assert.equal(ctx.plan.academic_year_id, OFFICIAL_YEAR_ID);
    assert.equal(ctx.plan.semester_id, OFFICIAL_SEMESTER_ID);
    assert.equal(
      mock.inserts.some((item) => item.table === "semester_plans"),
      true,
    );
  });
});
