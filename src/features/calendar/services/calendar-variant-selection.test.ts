import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  GENERAL_VARIANT_CODE,
  WESTERN_VARIANT_CODE,
  resolveCalendarForPlan,
} from "./resolve-calendar.ts";
import {
  CALENDAR_VARIANT_NOT_FOUND_MESSAGE,
  CALENDAR_VARIANT_NOT_SELECTABLE_MESSAGE,
  CALENDAR_VARIANT_UNAUTHORIZED_MESSAGE,
  assertSelectableCalendarVariant,
  pickVariantForNewPlan,
  readPlanVariantCode,
  shouldPersistPlanVariantChange,
  type SelectableCalendarVariant,
} from "./calendar-variant-selection.ts";
import {
  ensureSemesterPlan,
  updateSemesterPlanCalendarVariant,
} from "../../planner/services/semester-plan-lifecycle.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const LIFECYCLE_FILE = "src/features/planner/services/semester-plan-lifecycle.ts";
const SERVICE_FILE = "src/features/planner/services/semester-plan.service.ts";
const ENGINE_FILE = "src/features/planner/services/planner-engine.ts";
const SHEETS_FILE = "src/features/planner/sheets.functions.ts";
const SELECTION_FILE = "src/features/calendar/services/calendar-variant-selection.ts";
const VARIANTS_FILE = "src/features/calendar/services/calendar-variants.ts";

const TEACHER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TEACHER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const YEAR_ID = "11111111-1111-4111-8111-111111111111";
const SEMESTER_ID = "22222222-2222-4222-8222-222222222222";
const GENERAL_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const WESTERN_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const HIDDEN_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const PLAN_ID = "33333333-3333-4333-8333-333333333333";
const VERSION_ID = "44444444-4444-4444-8444-444444444444";

const CATALOG: SelectableCalendarVariant[] = [
  { id: GENERAL_ID, code: GENERAL_VARIANT_CODE, label: "جميع المناطق", isSelectable: true },
  { id: WESTERN_ID, code: WESTERN_VARIANT_CODE, label: "المنطقة الغربية", isSelectable: true },
  { id: HIDDEN_ID, code: "HIDDEN", label: "مخفي", isSelectable: false },
];

type Row = Record<string, unknown>;
type Filter = { column: string; op: "eq" | "neq" | "is" | "in" | "not"; value: unknown };

function matches(row: Row, filters: Filter[]): boolean {
  return filters.every((f) => {
    const v = row[f.column];
    if (f.op === "is") return v == null && f.value == null;
    if (f.op === "neq") return v !== f.value;
    if (f.op === "in") return Array.isArray(f.value) && f.value.includes(v);
    if (f.op === "not") return true;
    return v === f.value;
  });
}

function createMockClient(db: Record<string, Row[]>) {
  const writes = {
    inserts: [] as Array<{ table: string; rows: Row[] }>,
    updates: [] as Array<{ table: string; patch: Row; filters: Filter[] }>,
  };

  const client = {
    from(table: string) {
      const filters: Filter[] = [];
      let pendingInsert: Row[] | null = null;
      let pendingUpdate: Row | null = null;

      const runSelect = (): Row[] => (db[table] ?? []).filter((row) => matches(row, filters));

      const execute = async (mode: "many" | "single" | "maybe") => {
        if (pendingInsert) {
          writes.inserts.push({ table, rows: pendingInsert });
          const inserted: Row[] = [];
          for (const row of pendingInsert) {
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
          writes.updates.push({ table, patch: pendingUpdate, filters: [...filters] });
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
        neq(column: string, value: unknown) {
          filters.push({ column, op: "neq", value });
          return api;
        },
        is(column: string, value: unknown) {
          filters.push({ column, op: "is", value });
          return api;
        },
        in(column: string, value: unknown[]) {
          filters.push({ column, op: "in", value });
          return api;
        },
        not(column: string, op: string, value: unknown) {
          filters.push({ column, op: "not", value: { op, value } });
          return api;
        },
        order() {
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

  return { client, db, writes };
}

function auth(userId: string, client: ReturnType<typeof createMockClient>["client"]) {
  return { userId, client: client as never };
}

function variantRows(): Row[] {
  return [
    {
      id: GENERAL_ID,
      code: GENERAL_VARIANT_CODE,
      label: "جميع المناطق",
      is_selectable: true,
      sort_order: 0,
    },
    {
      id: WESTERN_ID,
      code: WESTERN_VARIANT_CODE,
      label: "المنطقة الغربية",
      is_selectable: true,
      sort_order: 1,
    },
    {
      id: HIDDEN_ID,
      code: "HIDDEN",
      label: "مخفي",
      is_selectable: false,
      sort_order: 9,
    },
  ];
}

function officialTables(extra: Record<string, Row[]> = {}): Record<string, Row[]> {
  return {
    academic_years: [
      {
        id: YEAR_ID,
        label: "العام الدراسي 1448-1449هـ",
        start_date: "2026-08-23",
        end_date: null,
        is_active: true,
      },
    ],
    semesters: [
      {
        id: SEMESTER_ID,
        academic_year_id: YEAR_ID,
        label: "الفصل الدراسي الأول",
        start_date: "2026-08-30",
        end_date: "2027-01-08",
        order_index: 1,
      },
    ],
    calendar_variants: variantRows(),
    calendar_term_overrides: [],
    calendar_exceptions: [],
    semester_plans: [],
    semester_plan_versions: [],
    planner_entries: [],
    lesson_sessions: [{ id: "ls-1", academic_year_id: YEAR_ID, semester_id: SEMESTER_ID }],
    ...extra,
  };
}

const EXISTING_NULL_PLANS: Row[] = Array.from({ length: 5 }, (_, i) => ({
  id: `plan-null-${i + 1}`,
  user_id: TEACHER_A,
  subject: `مادة-${i + 1}`,
  grade: "الأول متوسط",
  academic_year_id: YEAR_ID,
  semester_id: SEMESTER_ID,
  calendar_variant_id: null,
  status: "draft",
  current_version: 1,
}));

describe("semester plan calendar variant selection", () => {
  it("defaults a new plan without variant to GENERAL", async () => {
    const picked = pickVariantForNewPlan(CATALOG);
    assert.equal(picked.id, GENERAL_ID);
    assert.equal(picked.code, GENERAL_VARIANT_CODE);

    const { client, db } = createMockClient(officialTables());
    const ctx = await ensureSemesterPlan(
      {
        subject: "العلوم",
        grade: "الأول متوسط",
        academicYearId: YEAR_ID,
        semesterId: SEMESTER_ID,
      },
      auth(TEACHER_A, client),
    );
    assert.equal(ctx.plan.calendar_variant_id, GENERAL_ID);
    assert.equal(db.semester_plans?.[0]?.calendar_variant_id, GENERAL_ID);
  });

  it("stores WESTERN when the teacher selects WESTERN", async () => {
    const picked = pickVariantForNewPlan(CATALOG, { id: WESTERN_ID });
    assert.equal(picked.code, WESTERN_VARIANT_CODE);

    const { client, db } = createMockClient(officialTables());
    const ctx = await ensureSemesterPlan(
      {
        subject: "العلوم",
        grade: "الأول متوسط",
        academicYearId: YEAR_ID,
        semesterId: SEMESTER_ID,
        calendarVariantId: WESTERN_ID,
      },
      auth(TEACHER_A, client),
    );
    assert.equal(ctx.plan.calendar_variant_id, WESTERN_ID);
    assert.equal(db.semester_plans?.[0]?.calendar_variant_id, WESTERN_ID);
  });

  it("rejects a variant id that does not exist", async () => {
    assert.throws(
      () => pickVariantForNewPlan(CATALOG, { id: "00000000-0000-4000-8000-000000000000" }),
      (err: unknown) => err instanceof Error && err.message === CALENDAR_VARIANT_NOT_FOUND_MESSAGE,
    );

    const { client, db } = createMockClient(officialTables());
    await assert.rejects(
      () =>
        ensureSemesterPlan(
          {
            subject: "العلوم",
            grade: "الأول متوسط",
            academicYearId: YEAR_ID,
            semesterId: SEMESTER_ID,
            calendarVariantId: "00000000-0000-4000-8000-000000000000",
          },
          auth(TEACHER_A, client),
        ),
      (err: unknown) => err instanceof Error && err.message === CALENDAR_VARIANT_NOT_FOUND_MESSAGE,
    );
    assert.equal(db.semester_plans?.length, 0);
  });

  it("rejects a variant that is not selectable", async () => {
    assert.throws(
      () => assertSelectableCalendarVariant(CATALOG.find((row) => row.id === HIDDEN_ID)),
      (err: unknown) =>
        err instanceof Error && err.message === CALENDAR_VARIANT_NOT_SELECTABLE_MESSAGE,
    );
    assert.throws(
      () => pickVariantForNewPlan(CATALOG, { id: HIDDEN_ID }),
      (err: unknown) =>
        err instanceof Error && err.message === CALENDAR_VARIANT_NOT_SELECTABLE_MESSAGE,
    );

    const { client, db } = createMockClient(officialTables());
    await assert.rejects(
      () =>
        ensureSemesterPlan(
          {
            subject: "العلوم",
            grade: "الأول متوسط",
            academicYearId: YEAR_ID,
            semesterId: SEMESTER_ID,
            calendarVariantId: HIDDEN_ID,
          },
          auth(TEACHER_A, client),
        ),
      (err: unknown) =>
        err instanceof Error && err.message === CALENDAR_VARIANT_NOT_SELECTABLE_MESSAGE,
    );
    assert.equal(db.semester_plans?.length, 0);
  });

  it("reads a legacy NULL plan as GENERAL without writing", async () => {
    assert.equal(readPlanVariantCode({ calendar_variant_id: null }, CATALOG), GENERAL_VARIANT_CODE);
    assert.equal(shouldPersistPlanVariantChange(null, GENERAL_ID, GENERAL_ID), false);

    const { client, db, writes } = createMockClient(
      officialTables({
        semester_plans: [
          {
            id: PLAN_ID,
            user_id: TEACHER_A,
            subject: "العلوم",
            grade: "الأول متوسط",
            academic_year_id: YEAR_ID,
            semester_id: SEMESTER_ID,
            calendar_variant_id: null,
            status: "draft",
            current_version: 1,
          },
        ],
        semester_plan_versions: [
          {
            id: VERSION_ID,
            semester_plan_id: PLAN_ID,
            version_number: 1,
            status: "draft",
          },
        ],
      }),
    );

    const ctx = await ensureSemesterPlan(
      {
        subject: "العلوم",
        grade: "الأول متوسط",
        academicYearId: YEAR_ID,
        semesterId: SEMESTER_ID,
        calendarVariantId: WESTERN_ID,
      },
      auth(TEACHER_A, client),
    );
    assert.equal(ctx.plan.calendar_variant_id, null);
    assert.equal(db.semester_plans?.[0]?.calendar_variant_id, null);
    assert.equal(
      writes.updates.some((entry) => "calendar_variant_id" in entry.patch),
      false,
    );

    const calendar = await resolveCalendarForPlan(
      {
        academic_year_id: YEAR_ID,
        semester_id: SEMESTER_ID,
        calendar_variant_id: ctx.plan.calendar_variant_id,
      },
      auth(TEACHER_A, client),
    );
    assert.equal(calendar.variant.code, GENERAL_VARIANT_CODE);
  });

  it("does not backfill the five existing NULL plans", async () => {
    const versions = EXISTING_NULL_PLANS.map((plan) => ({
      id: `${plan.id}-v1`,
      semester_plan_id: plan.id,
      version_number: 1,
      status: "draft",
    }));
    const { client, db, writes } = createMockClient(
      officialTables({
        semester_plans: EXISTING_NULL_PLANS.map((row) => ({ ...row })),
        semester_plan_versions: versions,
      }),
    );

    for (const plan of EXISTING_NULL_PLANS) {
      await ensureSemesterPlan(
        {
          subject: String(plan.subject),
          grade: String(plan.grade),
          academicYearId: YEAR_ID,
          semesterId: SEMESTER_ID,
        },
        auth(TEACHER_A, client),
      );
    }

    assert.equal(db.semester_plans?.length, 5);
    assert.ok(db.semester_plans?.every((row) => row.calendar_variant_id == null));
    assert.equal(
      writes.updates.some(
        (entry) => entry.table === "semester_plans" && "calendar_variant_id" in entry.patch,
      ),
      false,
    );
  });

  it("does not touch lesson_sessions or planner_entries when selecting a variant", async () => {
    const { client, db, writes } = createMockClient(
      officialTables({
        planner_entries: [
          {
            id: "pe-1",
            user_id: TEACHER_A,
            subject: "العلوم",
            semester_plan_id: PLAN_ID,
            notes: "{}",
          },
        ],
        semester_plans: [
          {
            id: PLAN_ID,
            user_id: TEACHER_A,
            subject: "العلوم",
            grade: "الأول متوسط",
            academic_year_id: YEAR_ID,
            semester_id: SEMESTER_ID,
            calendar_variant_id: GENERAL_ID,
            status: "draft",
            current_version: 1,
          },
        ],
        semester_plan_versions: [
          {
            id: VERSION_ID,
            semester_plan_id: PLAN_ID,
            version_number: 1,
            status: "draft",
          },
        ],
      }),
    );

    const sessionsBefore = JSON.stringify(db.lesson_sessions);
    const entriesBefore = JSON.stringify(db.planner_entries);
    await updateSemesterPlanCalendarVariant(PLAN_ID, WESTERN_ID, auth(TEACHER_A, client));
    assert.equal(JSON.stringify(db.lesson_sessions), sessionsBefore);
    assert.equal(JSON.stringify(db.planner_entries), entriesBefore);
    assert.equal(
      writes.updates.every((entry) => entry.table === "semester_plans"),
      true,
    );
    assert.equal(db.semester_plans?.[0]?.calendar_variant_id, WESTERN_ID);
  });

  it("rejects a calendar variant change from a teacher who does not own the plan", async () => {
    const { client, db } = createMockClient(
      officialTables({
        semester_plans: [
          {
            id: PLAN_ID,
            user_id: TEACHER_A,
            subject: "العلوم",
            grade: "الأول متوسط",
            academic_year_id: YEAR_ID,
            semester_id: SEMESTER_ID,
            calendar_variant_id: GENERAL_ID,
            status: "draft",
            current_version: 1,
          },
        ],
      }),
    );

    await assert.rejects(
      () => updateSemesterPlanCalendarVariant(PLAN_ID, WESTERN_ID, auth(TEACHER_B, client)),
      (err: unknown) =>
        err instanceof Error && err.message === CALENDAR_VARIANT_UNAUTHORIZED_MESSAGE,
    );
    assert.equal(db.semester_plans?.[0]?.calendar_variant_id, GENERAL_ID);
  });

  it("resolveCalendarForPlan uses the plan variant", async () => {
    const { client } = createMockClient(officialTables());
    const western = await resolveCalendarForPlan(
      {
        academic_year_id: YEAR_ID,
        semester_id: SEMESTER_ID,
        calendar_variant_id: WESTERN_ID,
      },
      auth(TEACHER_A, client),
    );
    const general = await resolveCalendarForPlan(
      {
        academic_year_id: YEAR_ID,
        semester_id: SEMESTER_ID,
        calendar_variant_id: GENERAL_ID,
      },
      auth(TEACHER_A, client),
    );
    assert.equal(western.variant.code, WESTERN_VARIANT_CODE);
    assert.equal(western.variant.id, WESTERN_ID);
    assert.equal(general.variant.code, GENERAL_VARIANT_CODE);
    assert.equal(general.variant.id, GENERAL_ID);
    assert.notEqual(western.variant.id, general.variant.id);
  });

  it("keeps GENERAL and WESTERN as separate stored variants", async () => {
    const { client, db } = createMockClient(officialTables());
    const generalPlan = await ensureSemesterPlan(
      {
        subject: "العلوم",
        grade: "الأول متوسط",
        academicYearId: YEAR_ID,
        semesterId: SEMESTER_ID,
      },
      auth(TEACHER_A, client),
    );
    const westernPlan = await ensureSemesterPlan(
      {
        subject: "الرياضيات",
        grade: "الأول متوسط",
        academicYearId: YEAR_ID,
        semesterId: SEMESTER_ID,
        calendarVariantId: WESTERN_ID,
      },
      auth(TEACHER_A, client),
    );
    assert.equal(generalPlan.plan.calendar_variant_id, GENERAL_ID);
    assert.equal(westernPlan.plan.calendar_variant_id, WESTERN_ID);
    assert.equal(db.semester_plans?.length, 2);
    assert.notEqual(
      db.semester_plans?.[0]?.calendar_variant_id,
      db.semester_plans?.[1]?.calendar_variant_id,
    );
  });
});

describe("semester plan calendar variant source guards", () => {
  it("planner engine reads the plan variant; Sheets stay untouched", () => {
    const lifecycle = readFileSync(join(ROOT, LIFECYCLE_FILE), "utf8");
    const service = readFileSync(join(ROOT, SERVICE_FILE), "utf8");
    const engine = readFileSync(join(ROOT, ENGINE_FILE), "utf8");
    const sheets = readFileSync(join(ROOT, SHEETS_FILE), "utf8");
    const selection = readFileSync(join(ROOT, SELECTION_FILE), "utf8");
    const variants = readFileSync(join(ROOT, VARIANTS_FILE), "utf8");

    assert.match(lifecycle, /calendar_variant_id: variant\.id/);
    assert.match(lifecycle, /updateSemesterPlanCalendarVariant/);
    assert.equal(/loadCalendarConfig|generateSchedule/.test(lifecycle), false);
    assert.equal(/lesson_sessions/.test(lifecycle), false);
    assert.match(engine, /calendar_variant_id/);
    assert.equal(/calendar_variant/.test(sheets), false);
    assert.equal(/UPDATE.*calendar_variant_id/.test(selection), false);
    assert.match(service, /calendarVariantId/);
    assert.match(variants, /is_selectable/);
  });
});
