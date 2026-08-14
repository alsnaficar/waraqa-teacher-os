import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { resolveAcademicScope } from "./academic-calendar.ts";
import {
  assertSemesterWithinAcademicYear,
  assertSemestersDoNotOverlap,
  assertValidDateRange,
  assertValidStartAndOptionalEnd,
  normalizeCalendarLabel,
} from "./academic-calendar.logic.ts";
import {
  activateAdminAcademicYear,
  createAcademicYear,
  createAdminAcademicYear,
  createAdminSemester,
  createSemester,
  deleteAdminAcademicYear,
  deleteAdminSemester,
  listAcademicYears,
  listAdminAcademicYears,
  listAdminSemestersForYear,
  listSemestersForYear,
  updateAdminAcademicYear,
  updateAdminSemester,
} from "./academic-calendar.management.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const FUNCTIONS_FILE = "src/platform/calendar/academic-calendar.functions.ts";
const SETTINGS_FILE = "src/routes/_authenticated/settings.tsx";
const PLANNER_FILE = "src/routes/_authenticated/planner.tsx";
const MANAGEMENT_FILE = "src/features/calendar/services/academic-calendar.management.ts";
const ADMIN_PAGE = "src/routes/_authenticated/admin/academic-calendar.tsx";
const ADMIN_SHELL = "src/components/admin/admin-shell.tsx";
const ADMIN_DASHBOARD = "src/routes/_authenticated/admin/index.tsx";

const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const EXISTING_YEAR_ID = "11111111-1111-4111-8111-111111111111";
const EXISTING_SEMESTER_ID = "22222222-2222-4222-8222-222222222222";

type Row = Record<string, unknown>;
type Filter = { column: string; op: "eq" | "neq"; value: unknown };

function matches(row: Row, filters: Filter[]): boolean {
  return filters.every((f) => {
    const v = row[f.column];
    if (f.op === "eq") return v === f.value;
    return v !== f.value;
  });
}

function createMockClient(db: Record<string, Row[]>) {
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
        delete() {
          throw new Error("calendar management must not delete rows");
        },
        eq(column: string, value: unknown) {
          filters.push({ column, op: "eq", value });
          return api;
        },
        neq(column: string, value: unknown) {
          filters.push({ column, op: "neq", value });
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

  return { client, db };
}

function auth(userId: string, client: ReturnType<typeof createMockClient>["client"]) {
  return { userId, client: client as never };
}

function mockAdminClient(role: string | null) {
  const terminal = {
    async maybeSingle() {
      return {
        data: role == null ? null : { role },
        error: null,
      };
    },
  };

  const chain = {
    eq() {
      return {
        eq() {
          return terminal;
        },
        ...terminal,
      };
    },
  };

  return {
    from() {
      return {
        select() {
          return chain;
        },
      };
    },
  } as never;
}

function existingOwnedCalendar(userId: string): Record<string, Row[]> {
  return {
    academic_years: [
      {
        id: EXISTING_YEAR_ID,
        user_id: userId,
        label: "سنة قائمة",
        start_date: "2025-08-01",
        end_date: "2026-06-30",
        is_active: true,
      },
    ],
    semesters: [
      {
        id: EXISTING_SEMESTER_ID,
        user_id: userId,
        academic_year_id: EXISTING_YEAR_ID,
        label: "فصل قائم",
        start_date: "2025-08-01",
        end_date: "2025-12-15",
        order_index: 0,
      },
    ],
  };
}

describe("academic calendar validation logic", () => {
  it("rejects invalid academic-year date range", () => {
    assert.throws(() => assertValidDateRange("2026-06-01", "2026-01-01"), /البداية/);
  });

  it("rejects semester outside academic-year dates", () => {
    assert.throws(
      () =>
        assertSemesterWithinAcademicYear({
          semesterStart: "2025-12-01",
          semesterEnd: "2026-02-01",
          yearStart: "2026-01-01",
          yearEnd: "2026-12-31",
        }),
      /ضمن حدود/,
    );
  });

  it("rejects invalid semester date range", () => {
    assert.throws(
      () =>
        assertSemesterWithinAcademicYear({
          semesterStart: "2026-06-01",
          semesterEnd: "2026-01-01",
          yearStart: "2026-01-01",
          yearEnd: "2026-12-31",
        }),
      /البداية/,
    );
  });

  it("requires a non-empty label", () => {
    assert.throws(() => normalizeCalendarLabel("   "), /مطلوب/);
  });

  it("rejects overlapping semester ranges", () => {
    assert.throws(
      () =>
        assertSemestersDoNotOverlap(
          [{ id: "s1", startDate: "2026-08-23", endDate: "2026-11-19" }],
          { id: "s2", startDate: "2026-11-01", endDate: "2027-01-08" },
        ),
      /تتداخل/,
    );
  });

  it("allows a start date without an end date", () => {
    assert.doesNotThrow(() => assertValidStartAndOptionalEnd("2026-08-23", null));
  });
});

describe("admin academic year / semester management", () => {
  it("admin can create year", async () => {
    const { client, db } = createMockClient({ academic_years: [], semesters: [] });
    const year = await createAdminAcademicYear(auth(USER_A, client), mockAdminClient("admin"), {
      label: "1447-1448",
      startDate: "2026-08-01",
      endDate: "2027-06-30",
    });
    assert.equal(year.label, "1447-1448");
    assert.equal(year.isActive, true);
    assert.equal(db.academic_years.length, 1);
    assert.equal(db.academic_years[0].user_id, USER_A);
  });

  it("admin can activate year", async () => {
    const { client, db } = createMockClient({
      academic_years: [
        {
          id: "y1",
          user_id: USER_A,
          label: "قديمة",
          start_date: "2025-01-01",
          end_date: "2025-12-31",
          is_active: true,
        },
        {
          id: "y2",
          user_id: USER_A,
          label: "جديدة",
          start_date: "2026-01-01",
          end_date: "2026-12-31",
          is_active: false,
        },
      ],
    });
    const activated = await activateAdminAcademicYear(
      auth(USER_A, client),
      mockAdminClient("admin"),
      "y2",
    );
    assert.equal(activated.id, "y2");
    assert.equal(activated.isActive, true);
    assert.equal(db.academic_years.find((y) => y.id === "y1")?.is_active, false);
    assert.equal(db.academic_years.find((y) => y.id === "y2")?.is_active, true);
    assert.equal(db.academic_years.length, 2);
  });

  it("admin can activate a year with a null end date and deactivate every other active year", async () => {
    const { client, db } = createMockClient({
      academic_years: [
        {
          id: "y-a",
          user_id: USER_A,
          label: "سنة أخرى نشطة",
          start_date: "2025-08-23",
          end_date: "2026-06-24",
          is_active: true,
        },
        {
          id: EXISTING_YEAR_ID,
          user_id: USER_B,
          label: "العام الدراسي 1448-1449هـ",
          start_date: "2026-08-23",
          end_date: null,
          is_active: false,
        },
      ],
    });
    const activated = await activateAdminAcademicYear(
      auth(USER_A, client),
      mockAdminClient("admin"),
      EXISTING_YEAR_ID,
    );
    assert.equal(activated.id, EXISTING_YEAR_ID);
    assert.equal(activated.isActive, true);
    assert.equal(activated.endDate, "");
    assert.equal(db.academic_years.find((y) => y.id === EXISTING_YEAR_ID)?.is_active, true);
    assert.equal(db.academic_years.find((y) => y.id === EXISTING_YEAR_ID)?.end_date, null);
    assert.equal(db.academic_years.find((y) => y.id === EXISTING_YEAR_ID)?.user_id, USER_B);
    assert.equal(db.academic_years.find((y) => y.id === "y-a")?.is_active, false);
    assert.equal(db.academic_years.find((y) => y.id === "y-a")?.user_id, USER_A);
    assert.equal(db.academic_years.length, 2);
  });

  it("only authenticated admin can write", async () => {
    const { client } = createMockClient({ academic_years: [] });
    await assert.rejects(
      () =>
        createAdminAcademicYear({ userId: "", client: client as never }, mockAdminClient("admin"), {
          label: "x",
          startDate: "2026-01-01",
          endDate: "2026-12-31",
        }),
      /Unauthorized|authenticated/i,
    );
  });

  it("non-admin cannot write", async () => {
    const { client, db } = createMockClient({ academic_years: [], semesters: [] });
    await assert.rejects(
      () =>
        createAdminAcademicYear(auth(USER_A, client), mockAdminClient(null), {
          label: "ممنوع",
          startDate: "2026-01-01",
          endDate: "2026-12-31",
        }),
      /مديري النظام/,
    );
    await assert.rejects(
      () =>
        createAdminAcademicYear(auth(USER_A, client), mockAdminClient("teacher"), {
          label: "ممنوع",
          startDate: "2026-01-01",
          endDate: "2026-12-31",
        }),
      /مديري النظام/,
    );
    assert.equal(db.academic_years.length, 0);
  });

  it("admin can create a semester on another admin's official year", async () => {
    const { client, db } = createMockClient({
      academic_years: [
        {
          id: "y-b",
          user_id: USER_B,
          label: "B",
          start_date: "2026-01-01",
          end_date: "2026-12-31",
          is_active: true,
        },
      ],
      semesters: [],
    });
    const created = await createAdminSemester(auth(USER_A, client), mockAdminClient("admin"), {
      academicYearId: "y-b",
      label: "فصل",
      startDate: "2026-01-01",
      endDate: "2026-06-01",
    });
    assert.equal(created.academicYearId, "y-b");
    assert.equal(created.label, "فصل");
    assert.equal(db.academic_years[0].user_id, USER_B);
    assert.equal(db.semesters[0].user_id, USER_A);
    assert.equal(db.semesters[0].academic_year_id, "y-b");
  });

  it("admin can create a semester when the official year has no end date", async () => {
    const { client, db } = createMockClient({
      academic_years: [
        {
          id: EXISTING_YEAR_ID,
          user_id: USER_B,
          label: "العام الدراسي 1448-1449هـ",
          start_date: "2026-08-23",
          end_date: null,
          is_active: true,
        },
      ],
      semesters: [],
    });
    const created = await createAdminSemester(auth(USER_A, client), mockAdminClient("admin"), {
      academicYearId: EXISTING_YEAR_ID,
      label: "الفصل الدراسي الأول",
      startDate: "2026-08-30",
      endDate: "2027-01-08",
    });
    assert.equal(created.academicYearId, EXISTING_YEAR_ID);
    assert.equal(created.startDate, "2026-08-30");
    assert.equal(created.endDate, "2027-01-08");
    assert.equal(db.semesters.length, 1);
    assert.equal(db.semesters[0].start_date, "2026-08-30");
    assert.equal(db.semesters[0].end_date, "2027-01-08");
    assert.equal(db.semesters[0].user_id, USER_A);
    assert.equal(db.academic_years[0].end_date, null);
    assert.equal(db.academic_years[0].user_id, USER_B);
    assert.equal(db.academic_years[0].label, "العام الدراسي 1448-1449هـ");
  });

  it("rejects a semester without dates even when the year end is null", async () => {
    const { client, db } = createMockClient({
      academic_years: [
        {
          id: EXISTING_YEAR_ID,
          user_id: USER_B,
          label: "العام الدراسي 1448-1449هـ",
          start_date: "2026-08-23",
          end_date: null,
          is_active: true,
        },
      ],
      semesters: [],
    });
    await assert.rejects(
      () =>
        createAdminSemester(auth(USER_A, client), mockAdminClient("admin"), {
          academicYearId: EXISTING_YEAR_ID,
          label: "فصل بلا نهاية",
          startDate: "2026-08-30",
          endDate: "",
        }),
      /التواريخ|YYYY-MM-DD/,
    );
    await assert.rejects(
      () =>
        createAdminSemester(auth(USER_A, client), mockAdminClient("admin"), {
          academicYearId: EXISTING_YEAR_ID,
          label: "فصل معكوس",
          startDate: "2027-01-08",
          endDate: "2026-08-30",
        }),
      /البداية/,
    );
    assert.equal(db.semesters.length, 0);
    assert.equal(db.academic_years[0].end_date, null);
  });

  it("non-admin cannot create a semester or activate a year", async () => {
    const { client, db } = createMockClient({
      academic_years: [
        {
          id: EXISTING_YEAR_ID,
          user_id: USER_B,
          label: "العام الدراسي 1448-1449هـ",
          start_date: "2026-08-23",
          end_date: null,
          is_active: false,
        },
      ],
      semesters: [],
    });
    await assert.rejects(
      () =>
        createAdminSemester(auth(USER_A, client), mockAdminClient("teacher"), {
          academicYearId: EXISTING_YEAR_ID,
          label: "ممنوع",
          startDate: "2026-08-30",
          endDate: "2027-01-08",
        }),
      /مديري النظام/,
    );
    await assert.rejects(
      () =>
        activateAdminAcademicYear(
          auth(USER_A, client),
          mockAdminClient("teacher"),
          EXISTING_YEAR_ID,
        ),
      /مديري النظام/,
    );
    assert.equal(db.semesters.length, 0);
    assert.equal(db.academic_years[0].is_active, false);
    assert.equal(db.academic_years[0].user_id, USER_B);
  });

  it("semester date validation", async () => {
    const { client } = createMockClient({
      academic_years: [
        {
          id: "y-a",
          user_id: USER_A,
          label: "A",
          start_date: "2026-01-01",
          end_date: "2026-06-30",
          is_active: true,
        },
      ],
      semesters: [],
    });
    await assert.rejects(
      () =>
        createAdminSemester(auth(USER_A, client), mockAdminClient("admin"), {
          academicYearId: "y-a",
          label: "خارج",
          startDate: "2026-01-01",
          endDate: "2026-12-31",
        }),
      /ضمن حدود/,
    );
    await assert.rejects(
      () =>
        createAdminSemester(auth(USER_A, client), mockAdminClient("admin"), {
          academicYearId: "y-a",
          label: "معكوس",
          startDate: "2026-06-01",
          endDate: "2026-01-01",
        }),
      /البداية/,
    );
  });

  it("existing year/semester data is not deleted", async () => {
    const { client, db } = createMockClient(existingOwnedCalendar(USER_A));
    const created = await createAdminAcademicYear(auth(USER_A, client), mockAdminClient("admin"), {
      label: "سنة جديدة",
      startDate: "2026-08-01",
      endDate: "2027-06-30",
      activate: true,
    });
    assert.ok(db.academic_years.find((y) => y.id === EXISTING_YEAR_ID));
    assert.ok(db.semesters.find((s) => s.id === EXISTING_SEMESTER_ID));
    assert.equal(db.academic_years.length, 2);
    assert.equal(db.semesters.length, 1);
    assert.equal(db.academic_years.find((y) => y.id === EXISTING_YEAR_ID)?.is_active, false);
    assert.equal(created.isActive, true);

    const reactivated = await activateAdminAcademicYear(
      auth(USER_A, client),
      mockAdminClient("admin"),
      EXISTING_YEAR_ID,
    );
    assert.equal(reactivated.id, EXISTING_YEAR_ID);
    assert.ok(db.academic_years.find((y) => y.id === EXISTING_YEAR_ID));
    assert.ok(db.academic_years.find((y) => y.id === created.id));
    assert.ok(db.semesters.find((s) => s.id === EXISTING_SEMESTER_ID));
    assert.equal(db.academic_years.length, 2);
    assert.equal(db.semesters.length, 1);
  });

  it("admin can update year label and dates without changing id", async () => {
    const { client, db } = createMockClient({
      academic_years: [
        {
          id: EXISTING_YEAR_ID,
          user_id: USER_A,
          label: "العام الدراسي الحالي 1447هـ",
          start_date: "2026-08-30",
          end_date: null,
          is_active: true,
        },
      ],
      semesters: [
        {
          id: EXISTING_SEMESTER_ID,
          user_id: USER_A,
          academic_year_id: EXISTING_YEAR_ID,
          label: "الفصل الدراسي الأول",
          start_date: "2026-08-30",
          end_date: null,
          order_index: 1,
        },
      ],
      lesson_sessions: [
        {
          id: "sess-1",
          academic_year_id: EXISTING_YEAR_ID,
          semester_id: EXISTING_SEMESTER_ID,
        },
      ],
    });
    const updated = await updateAdminAcademicYear(auth(USER_A, client), mockAdminClient("admin"), {
      academicYearId: EXISTING_YEAR_ID,
      label: "العام الدراسي 1448هـ - 1449هـ",
      startDate: "2026-08-23",
      endDate: "2027-06-24",
    });
    assert.equal(updated.id, EXISTING_YEAR_ID);
    assert.equal(updated.label, "العام الدراسي 1448هـ - 1449هـ");
    assert.equal(updated.startDate, "2026-08-23");
    assert.equal(updated.endDate, "2027-06-24");
    assert.equal(updated.isActive, true);
    assert.equal(db.academic_years.length, 1);
    assert.equal(db.academic_years[0].id, EXISTING_YEAR_ID);
    assert.equal(db.academic_years[0].is_active, true);
    assert.equal(db.lesson_sessions.length, 1);
    assert.equal(db.lesson_sessions[0].academic_year_id, EXISTING_YEAR_ID);
    assert.equal(db.lesson_sessions[0].semester_id, EXISTING_SEMESTER_ID);
  });

  it("admin can set official 1448 start and nullable end without touching semester or sessions", async () => {
    const { client, db } = createMockClient({
      academic_years: [
        {
          id: EXISTING_YEAR_ID,
          user_id: USER_A,
          label: "العام الدراسي الحالي 1447هـ",
          start_date: "2026-08-30",
          end_date: "2027-07-01",
          is_active: true,
        },
      ],
      semesters: [
        {
          id: EXISTING_SEMESTER_ID,
          user_id: USER_A,
          academic_year_id: EXISTING_YEAR_ID,
          label: "الفصل الدراسي الأول",
          start_date: "2026-08-30",
          end_date: "2027-01-08",
          order_index: 1,
        },
      ],
      lesson_sessions: Array.from({ length: 14 }, (_, i) => ({
        id: `sess-${i}`,
        academic_year_id: EXISTING_YEAR_ID,
        semester_id: EXISTING_SEMESTER_ID,
      })),
      semester_plans: [
        {
          id: "plan-1",
          academic_year_id: EXISTING_YEAR_ID,
          semester_id: EXISTING_SEMESTER_ID,
        },
      ],
    });
    const updated = await updateAdminAcademicYear(auth(USER_A, client), mockAdminClient("admin"), {
      academicYearId: EXISTING_YEAR_ID,
      label: "العام الدراسي 1448-1449هـ",
      startDate: "2026-08-23",
      endDate: null,
      isActive: true,
    });
    assert.equal(updated.id, EXISTING_YEAR_ID);
    assert.equal(updated.label, "العام الدراسي 1448-1449هـ");
    assert.equal(updated.startDate, "2026-08-23");
    assert.equal(updated.endDate, "");
    assert.equal(db.academic_years.length, 1);
    assert.equal(db.academic_years[0].end_date, null);
    assert.equal(db.semesters[0].id, EXISTING_SEMESTER_ID);
    assert.equal(db.semesters[0].start_date, "2026-08-30");
    assert.equal(db.semesters[0].end_date, "2027-01-08");
    assert.equal(db.lesson_sessions.length, 14);
    assert.ok(db.lesson_sessions.every((s) => s.academic_year_id === EXISTING_YEAR_ID));
    assert.ok(db.lesson_sessions.every((s) => s.semester_id === EXISTING_SEMESTER_ID));
    assert.equal(db.semester_plans[0].academic_year_id, EXISTING_YEAR_ID);
    assert.equal(db.semester_plans[0].semester_id, EXISTING_SEMESTER_ID);
  });

  it("admin can update semester dates without changing id", async () => {
    const { client, db } = createMockClient({
      academic_years: [
        {
          id: EXISTING_YEAR_ID,
          user_id: USER_A,
          label: "العام الدراسي 1448هـ - 1449هـ",
          start_date: "2026-08-23",
          end_date: "2027-06-24",
          is_active: true,
        },
      ],
      semesters: [
        {
          id: EXISTING_SEMESTER_ID,
          user_id: USER_A,
          academic_year_id: EXISTING_YEAR_ID,
          label: "الفصل الدراسي الأول",
          start_date: "2026-08-30",
          end_date: null,
          order_index: 1,
        },
      ],
      lesson_sessions: [
        {
          id: "sess-1",
          academic_year_id: EXISTING_YEAR_ID,
          semester_id: EXISTING_SEMESTER_ID,
        },
      ],
    });
    const updated = await updateAdminSemester(auth(USER_A, client), mockAdminClient("admin"), {
      semesterId: EXISTING_SEMESTER_ID,
      academicYearId: EXISTING_YEAR_ID,
      label: "الفصل الدراسي الأول",
      startDate: "2026-08-23",
      endDate: "2026-11-19",
    });
    assert.equal(updated.id, EXISTING_SEMESTER_ID);
    assert.equal(updated.startDate, "2026-08-23");
    assert.equal(updated.endDate, "2026-11-19");
    assert.equal(db.semesters[0].id, EXISTING_SEMESTER_ID);
    assert.equal(db.lesson_sessions[0].semester_id, EXISTING_SEMESTER_ID);
  });

  it("admin can update academic year label without changing dates or id", async () => {
    const { client, db } = createMockClient({
      academic_years: [
        {
          id: EXISTING_YEAR_ID,
          user_id: USER_A,
          label: "العام الدراسي الحالي 1447هـ",
          start_date: "2026-08-30",
          end_date: "2027-06-24",
          is_active: true,
        },
      ],
      semesters: [],
    });
    const updated = await updateAdminAcademicYear(auth(USER_A, client), mockAdminClient("admin"), {
      academicYearId: EXISTING_YEAR_ID,
      label: "العام الدراسي 1448هـ",
      startDate: "2026-08-30",
      endDate: "2027-06-24",
    });
    assert.equal(updated.id, EXISTING_YEAR_ID);
    assert.equal(updated.label, "العام الدراسي 1448هـ");
    assert.equal(updated.startDate, "2026-08-30");
    assert.equal(updated.endDate, "2027-06-24");
    assert.equal(db.academic_years.length, 1);
  });

  it("admin can update active state without creating a second year", async () => {
    const otherYearId = "33333333-3333-4333-8333-333333333333";
    const { client, db } = createMockClient({
      academic_years: [
        {
          id: EXISTING_YEAR_ID,
          user_id: USER_A,
          label: "نشطة",
          start_date: "2026-08-23",
          end_date: "2027-06-24",
          is_active: true,
        },
        {
          id: otherYearId,
          user_id: USER_A,
          label: "غير نشطة",
          start_date: "2025-08-24",
          end_date: "2026-06-18",
          is_active: false,
        },
      ],
    });
    const updated = await updateAdminAcademicYear(auth(USER_A, client), mockAdminClient("admin"), {
      academicYearId: otherYearId,
      label: "غير نشطة",
      startDate: "2025-08-24",
      endDate: "2026-06-18",
      isActive: true,
    });
    assert.equal(updated.id, otherYearId);
    assert.equal(updated.isActive, true);
    assert.equal(db.academic_years.length, 2);
    assert.equal(db.academic_years.find((y) => y.id === EXISTING_YEAR_ID)?.is_active, false);
    assert.equal(db.academic_years.find((y) => y.id === otherYearId)?.is_active, true);
  });

  it("admin can update semester label and order without changing id", async () => {
    const { client, db } = createMockClient({
      academic_years: [
        {
          id: EXISTING_YEAR_ID,
          user_id: USER_A,
          label: "العام الدراسي 1448هـ",
          start_date: "2026-08-23",
          end_date: "2027-06-24",
          is_active: true,
        },
      ],
      semesters: [
        {
          id: EXISTING_SEMESTER_ID,
          user_id: USER_A,
          academic_year_id: EXISTING_YEAR_ID,
          label: "الفصل الدراسي الأول",
          start_date: "2026-08-23",
          end_date: "2026-11-19",
          order_index: 1,
        },
      ],
    });
    const updated = await updateAdminSemester(auth(USER_A, client), mockAdminClient("admin"), {
      semesterId: EXISTING_SEMESTER_ID,
      academicYearId: EXISTING_YEAR_ID,
      label: "الفصل الدراسي الثاني",
      startDate: "2026-08-23",
      endDate: "2026-11-19",
      orderIndex: 2,
    });
    assert.equal(updated.id, EXISTING_SEMESTER_ID);
    assert.equal(updated.label, "الفصل الدراسي الثاني");
    assert.equal(updated.orderIndex, 2);
    assert.equal(db.semesters.length, 1);
    assert.equal(db.semesters[0].id, EXISTING_SEMESTER_ID);
  });

  it("existing 14 lesson_sessions and semester_plans stay attached to the same ids", async () => {
    const { client, db } = createMockClient({
      academic_years: [
        {
          id: EXISTING_YEAR_ID,
          user_id: USER_A,
          label: "العام الدراسي الحالي 1447هـ",
          start_date: "2026-08-30",
          end_date: null,
          is_active: true,
        },
      ],
      semesters: [
        {
          id: EXISTING_SEMESTER_ID,
          user_id: USER_A,
          academic_year_id: EXISTING_YEAR_ID,
          label: "الفصل الدراسي الأول",
          start_date: "2026-08-30",
          end_date: null,
          order_index: 1,
        },
      ],
      lesson_sessions: Array.from({ length: 14 }, (_, i) => ({
        id: `sess-${i}`,
        academic_year_id: EXISTING_YEAR_ID,
        semester_id: EXISTING_SEMESTER_ID,
      })),
      semester_plans: [
        {
          id: "plan-1",
          academic_year_id: EXISTING_YEAR_ID,
          semester_id: EXISTING_SEMESTER_ID,
        },
      ],
    });
    await updateAdminAcademicYear(auth(USER_A, client), mockAdminClient("admin"), {
      academicYearId: EXISTING_YEAR_ID,
      label: "العام الدراسي 1448هـ",
      startDate: "2026-08-23",
      endDate: "2027-06-24",
      isActive: true,
    });
    await updateAdminSemester(auth(USER_A, client), mockAdminClient("admin"), {
      semesterId: EXISTING_SEMESTER_ID,
      academicYearId: EXISTING_YEAR_ID,
      label: "الفصل الدراسي الأول",
      startDate: "2026-08-23",
      endDate: "2026-11-19",
      orderIndex: 1,
    });
    assert.equal(db.academic_years[0].id, EXISTING_YEAR_ID);
    assert.equal(db.semesters[0].id, EXISTING_SEMESTER_ID);
    assert.equal(db.lesson_sessions.length, 14);
    assert.ok(db.lesson_sessions.every((s) => s.academic_year_id === EXISTING_YEAR_ID));
    assert.ok(db.lesson_sessions.every((s) => s.semester_id === EXISTING_SEMESTER_ID));
    assert.equal(db.semester_plans.length, 1);
    assert.equal(db.semester_plans[0].academic_year_id, EXISTING_YEAR_ID);
    assert.equal(db.semester_plans[0].semester_id, EXISTING_SEMESTER_ID);
  });

  it("rejects inverted semester date range on update", async () => {
    const { client } = createMockClient({
      academic_years: [
        {
          id: EXISTING_YEAR_ID,
          user_id: USER_A,
          label: "A",
          start_date: "2026-08-23",
          end_date: "2027-06-24",
          is_active: true,
        },
      ],
      semesters: [
        {
          id: EXISTING_SEMESTER_ID,
          user_id: USER_A,
          academic_year_id: EXISTING_YEAR_ID,
          label: "فصل",
          start_date: "2026-08-23",
          end_date: "2026-11-19",
          order_index: 1,
        },
      ],
    });
    await assert.rejects(
      () =>
        updateAdminSemester(auth(USER_A, client), mockAdminClient("admin"), {
          semesterId: EXISTING_SEMESTER_ID,
          academicYearId: EXISTING_YEAR_ID,
          label: "فصل",
          startDate: "2026-11-19",
          endDate: "2026-08-23",
        }),
      /البداية/,
    );
  });

  it("rejects semester update outside academic-year dates", async () => {
    const { client } = createMockClient({
      academic_years: [
        {
          id: EXISTING_YEAR_ID,
          user_id: USER_A,
          label: "A",
          start_date: "2026-08-23",
          end_date: "2027-06-24",
          is_active: true,
        },
      ],
      semesters: [
        {
          id: EXISTING_SEMESTER_ID,
          user_id: USER_A,
          academic_year_id: EXISTING_YEAR_ID,
          label: "فصل",
          start_date: "2026-08-23",
          end_date: "2026-11-19",
          order_index: 1,
        },
      ],
    });
    await assert.rejects(
      () =>
        updateAdminSemester(auth(USER_A, client), mockAdminClient("admin"), {
          semesterId: EXISTING_SEMESTER_ID,
          academicYearId: EXISTING_YEAR_ID,
          label: "فصل",
          startDate: "2026-08-23",
          endDate: "2027-12-31",
        }),
      /ضمن حدود/,
    );
  });

  it("rejects overlapping semester update within the same year", async () => {
    const { client } = createMockClient({
      academic_years: [
        {
          id: EXISTING_YEAR_ID,
          user_id: USER_A,
          label: "A",
          start_date: "2026-08-23",
          end_date: "2027-06-24",
          is_active: true,
        },
      ],
      semesters: [
        {
          id: EXISTING_SEMESTER_ID,
          user_id: USER_A,
          academic_year_id: EXISTING_YEAR_ID,
          label: "الأول",
          start_date: "2026-08-23",
          end_date: "2026-11-19",
          order_index: 1,
        },
        {
          id: "33333333-3333-4333-8333-333333333333",
          user_id: USER_A,
          academic_year_id: EXISTING_YEAR_ID,
          label: "الثاني",
          start_date: "2026-11-22",
          end_date: "2027-02-12",
          order_index: 2,
        },
      ],
    });
    await assert.rejects(
      () =>
        updateAdminSemester(auth(USER_A, client), mockAdminClient("admin"), {
          semesterId: "33333333-3333-4333-8333-333333333333",
          academicYearId: EXISTING_YEAR_ID,
          label: "الثاني",
          startDate: "2026-11-01",
          endDate: "2027-02-12",
        }),
      /تتداخل/,
    );
  });

  it("rejects inverted date range on year update", async () => {
    const { client } = createMockClient({
      academic_years: [
        {
          id: EXISTING_YEAR_ID,
          user_id: USER_A,
          label: "A",
          start_date: "2026-08-23",
          end_date: "2027-06-24",
          is_active: true,
        },
      ],
      semesters: [],
    });
    await assert.rejects(
      () =>
        updateAdminAcademicYear(auth(USER_A, client), mockAdminClient("admin"), {
          academicYearId: EXISTING_YEAR_ID,
          label: "A",
          startDate: "2027-06-24",
          endDate: "2026-08-23",
        }),
      /البداية/,
    );
  });

  it("non-admin cannot update calendar", async () => {
    const { client, db } = createMockClient({
      academic_years: [
        {
          id: EXISTING_YEAR_ID,
          user_id: USER_A,
          label: "A",
          start_date: "2026-08-23",
          end_date: "2027-06-24",
          is_active: true,
        },
      ],
    });
    await assert.rejects(
      () =>
        updateAdminAcademicYear(auth(USER_A, client), mockAdminClient("teacher"), {
          academicYearId: EXISTING_YEAR_ID,
          label: "مخترق",
          startDate: "2026-08-23",
          endDate: "2027-06-24",
        }),
      /مديري النظام/,
    );
    assert.equal(db.academic_years[0].label, "A");
  });

  it("unauthenticated cannot update calendar", async () => {
    const { client, db } = createMockClient({
      academic_years: [
        {
          id: EXISTING_YEAR_ID,
          user_id: USER_A,
          label: "A",
          start_date: "2026-08-23",
          end_date: "2027-06-24",
          is_active: true,
        },
      ],
    });
    await assert.rejects(
      () =>
        updateAdminAcademicYear({ userId: "", client: client as never }, mockAdminClient("admin"), {
          academicYearId: EXISTING_YEAR_ID,
          label: "مخترق",
          startDate: "2026-08-23",
          endDate: "2027-06-24",
        }),
      /Unauthorized|authenticated/i,
    );
    assert.equal(db.academic_years[0].label, "A");
  });

  it("updating year dates does not activate another year", async () => {
    const otherYearId = "33333333-3333-4333-8333-333333333333";
    const { client, db } = createMockClient({
      academic_years: [
        {
          id: EXISTING_YEAR_ID,
          user_id: USER_A,
          label: "نشطة",
          start_date: "2026-08-23",
          end_date: "2027-06-24",
          is_active: true,
        },
        {
          id: otherYearId,
          user_id: USER_A,
          label: "غير نشطة",
          start_date: "2025-08-24",
          end_date: "2026-06-18",
          is_active: false,
        },
      ],
    });
    const updated = await updateAdminAcademicYear(auth(USER_A, client), mockAdminClient("admin"), {
      academicYearId: otherYearId,
      label: "غير نشطة بعد التعديل",
      startDate: "2025-08-20",
      endDate: "2026-06-20",
    });
    assert.equal(updated.id, otherYearId);
    assert.equal(updated.isActive, false);
    assert.equal(db.academic_years.find((y) => y.id === EXISTING_YEAR_ID)?.is_active, true);
    assert.equal(db.academic_years.find((y) => y.id === otherYearId)?.is_active, false);
  });

  it("rejects semester that does not belong to the selected year", async () => {
    const otherYearId = "33333333-3333-4333-8333-333333333333";
    const { client } = createMockClient({
      academic_years: [
        {
          id: EXISTING_YEAR_ID,
          user_id: USER_A,
          label: "A",
          start_date: "2026-08-23",
          end_date: "2027-06-24",
          is_active: true,
        },
        {
          id: otherYearId,
          user_id: USER_A,
          label: "B",
          start_date: "2025-08-24",
          end_date: "2026-06-18",
          is_active: false,
        },
      ],
      semesters: [
        {
          id: EXISTING_SEMESTER_ID,
          user_id: USER_A,
          academic_year_id: EXISTING_YEAR_ID,
          label: "فصل",
          start_date: "2026-08-23",
          end_date: "2026-11-19",
          order_index: 1,
        },
      ],
    });
    await assert.rejects(
      () =>
        updateAdminSemester(auth(USER_A, client), mockAdminClient("admin"), {
          semesterId: EXISTING_SEMESTER_ID,
          academicYearId: otherYearId,
          label: "فصل",
          startDate: "2025-08-24",
          endDate: "2025-11-19",
        }),
      /لا ينتمي/,
    );
  });

  it("refuses delete when lesson_sessions are linked and never changes ids", async () => {
    const { client, db } = createMockClient({
      academic_years: [
        {
          id: EXISTING_YEAR_ID,
          user_id: USER_A,
          label: "A",
          start_date: "2026-08-23",
          end_date: "2027-06-24",
          is_active: true,
        },
      ],
      semesters: [
        {
          id: EXISTING_SEMESTER_ID,
          user_id: USER_A,
          academic_year_id: EXISTING_YEAR_ID,
          label: "فصل",
          start_date: "2026-08-23",
          end_date: "2026-11-19",
          order_index: 1,
        },
      ],
      lesson_sessions: Array.from({ length: 14 }, (_, i) => ({
        id: `sess-${i}`,
        academic_year_id: EXISTING_YEAR_ID,
        semester_id: EXISTING_SEMESTER_ID,
      })),
    });
    await assert.rejects(
      () =>
        deleteAdminAcademicYear(auth(USER_A, client), mockAdminClient("admin"), EXISTING_YEAR_ID),
      /حصة مرتبطة/,
    );
    await assert.rejects(
      () =>
        deleteAdminSemester(auth(USER_A, client), mockAdminClient("admin"), EXISTING_SEMESTER_ID),
      /حصة مرتبطة/,
    );
    assert.equal(db.academic_years.length, 1);
    assert.equal(db.academic_years[0].id, EXISTING_YEAR_ID);
    assert.equal(db.semesters[0].id, EXISTING_SEMESTER_ID);
    assert.equal(db.lesson_sessions.length, 14);
    assert.ok(db.lesson_sessions.every((s) => s.academic_year_id === EXISTING_YEAR_ID));
    assert.ok(db.lesson_sessions.every((s) => s.semester_id === EXISTING_SEMESTER_ID));
  });

  it("client cannot provide another user ID — ownership is JWT-scoped", async () => {
    const { client, db } = createMockClient({ academic_years: [], semesters: [] });
    const forgedClientPayload = { userId: USER_B, teacherId: USER_B, ownerId: USER_B };
    const year = await createAdminAcademicYear(auth(USER_A, client), mockAdminClient("admin"), {
      label: "سنة أ",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    });
    assert.equal(db.academic_years[0].user_id, USER_A);
    assert.notEqual(db.academic_years[0].user_id, forgedClientPayload.userId);
    assert.notEqual(db.academic_years[0].user_id, forgedClientPayload.teacherId);
    assert.equal(year.isActive, true);
  });

  it("academic year ownership is JWT-scoped on list", async () => {
    const { client } = createMockClient({
      academic_years: [
        {
          id: "y-a",
          user_id: USER_A,
          label: "A",
          start_date: "2026-01-01",
          end_date: "2026-12-31",
          is_active: true,
        },
        {
          id: "y-b",
          user_id: USER_B,
          label: "B",
          start_date: "2026-01-01",
          end_date: "2026-12-31",
          is_active: true,
        },
      ],
    });
    const years = await listAcademicYears(auth(USER_A, client));
    assert.equal(years.length, 1);
    assert.equal(years[0].id, "y-a");
  });

  it("creating a future year with activate false keeps the current year active", async () => {
    const { client, db } = createMockClient(existingOwnedCalendar(USER_A));
    const created = await createAdminAcademicYear(auth(USER_A, client), mockAdminClient("admin"), {
      label: "العام الدراسي 1449-1450هـ",
      startDate: "2027-08-22",
      endDate: "2028-01-13",
      activate: false,
    });
    assert.equal(created.isActive, false);
    assert.equal(db.academic_years.find((y) => y.id === EXISTING_YEAR_ID)?.is_active, true);
    assert.equal(db.academic_years.length, 2);
  });

  it("listAdminAcademicYears is not owner-filtered", async () => {
    const { client } = createMockClient({
      academic_years: [
        {
          id: "y-a",
          user_id: USER_A,
          label: "العام الدراسي 1448-1449هـ",
          start_date: "2026-08-23",
          end_date: "2027-01-08",
          is_active: true,
        },
        {
          id: "y-b",
          user_id: USER_B,
          label: "العام الدراسي 1449-1450هـ",
          start_date: "2027-08-22",
          end_date: "2028-01-13",
          is_active: false,
        },
      ],
    });
    const years = await listAdminAcademicYears(auth(USER_A, client), mockAdminClient("admin"));
    assert.equal(years.length, 2);
    assert.equal(
      years
        .map((year) => year.id)
        .sort()
        .join(","),
      "y-a,y-b",
    );
  });

  it("listAdminAcademicYears returns every year without truncating to 4", async () => {
    const makeYears = (count: number) =>
      Array.from({ length: count }, (_, index) => ({
        id: `year-${String(index + 1).padStart(2, "0")}`,
        user_id: index % 2 === 0 ? USER_A : USER_B,
        label: `عام ${1448 + index}`,
        start_date: `${2026 + index}-08-23`,
        end_date: `${2027 + index}-07-01`,
        is_active: index === 0,
      }));

    const ten = createMockClient({ academic_years: makeYears(10) });
    const tenYears = await listAdminAcademicYears(
      auth(USER_A, ten.client),
      mockAdminClient("admin"),
    );
    assert.equal(tenYears.length, 10);

    const fifty = createMockClient({ academic_years: makeYears(50) });
    const fiftyYears = await listAdminAcademicYears(
      auth(USER_A, fifty.client),
      mockAdminClient("admin"),
    );
    assert.equal(fiftyYears.length, 50);
  });

  it("admin list query does not filter by user_id while create still writes JWT user_id", () => {
    const source = readFileSync(join(ROOT, MANAGEMENT_FILE), "utf8");
    const adminList = source.slice(
      source.indexOf("export async function listAdminAcademicYears"),
      source.indexOf("export async function createAdminAcademicYear"),
    );
    const ownerList = source.slice(
      source.indexOf("export async function listAcademicYears"),
      source.indexOf("export async function listSemestersForYear"),
    );
    assert.equal(/\.eq\("user_id"/.test(adminList), false);
    assert.match(ownerList, /\.eq\("user_id"/);
    assert.match(source, /user_id:\s*userId/);
  });

  it("listAdminSemestersForYear returns official semesters not owned by the admin", async () => {
    const { client } = createMockClient({
      academic_years: [
        {
          id: EXISTING_YEAR_ID,
          user_id: USER_B,
          label: "العام الدراسي 1448-1449هـ",
          start_date: "2026-08-23",
          end_date: null,
          is_active: true,
        },
      ],
      semesters: [
        {
          id: EXISTING_SEMESTER_ID,
          user_id: USER_B,
          academic_year_id: EXISTING_YEAR_ID,
          label: "الفصل الدراسي الأول",
          start_date: "2026-08-30",
          end_date: "2027-01-08",
          order_index: 1,
        },
      ],
    });

    await assert.rejects(
      () => listSemestersForYear(auth(USER_A, client), EXISTING_YEAR_ID),
      /غير موجودة|غير مملوكة/,
    );

    const rows = await listAdminSemestersForYear(
      auth(USER_A, client),
      mockAdminClient("admin"),
      EXISTING_YEAR_ID,
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.id, EXISTING_SEMESTER_ID);
    assert.equal(rows[0]?.academicYearId, EXISTING_YEAR_ID);
    assert.equal(rows[0]?.label, "الفصل الدراسي الأول");
  });

  it("listAdminSemestersForYear returns every semester for the selected year", async () => {
    const { client } = createMockClient({
      academic_years: [
        {
          id: EXISTING_YEAR_ID,
          user_id: USER_B,
          label: "العام الدراسي 1448-1449هـ",
          start_date: "2026-08-23",
          end_date: null,
          is_active: true,
        },
        {
          id: "other-year",
          user_id: USER_B,
          label: "عام آخر",
          start_date: "2027-08-22",
          end_date: "2028-01-13",
          is_active: false,
        },
      ],
      semesters: [
        {
          id: "sem-1",
          user_id: USER_B,
          academic_year_id: EXISTING_YEAR_ID,
          label: "الفصل الدراسي الأول",
          start_date: "2026-08-30",
          end_date: "2027-01-08",
          order_index: 1,
        },
        {
          id: "sem-2",
          user_id: USER_A,
          academic_year_id: EXISTING_YEAR_ID,
          label: "الفصل الدراسي الثاني",
          start_date: "2027-01-18",
          end_date: "2027-05-28",
          order_index: 2,
        },
        {
          id: "sem-other",
          user_id: USER_B,
          academic_year_id: "other-year",
          label: "فصل سنة أخرى",
          start_date: "2027-08-30",
          end_date: "2028-01-08",
          order_index: 1,
        },
      ],
    });

    const rows = await listAdminSemestersForYear(
      auth(USER_A, client),
      mockAdminClient("admin"),
      EXISTING_YEAR_ID,
    );
    assert.equal(rows.length, 2);
    assert.equal(rows.map((row) => row.id).join(","), "sem-1,sem-2");
  });

  it("admin semester list query does not filter by user_id", () => {
    const source = readFileSync(join(ROOT, MANAGEMENT_FILE), "utf8");
    const adminList = source.slice(
      source.indexOf("export async function listAdminSemestersForYear"),
      source.indexOf("export async function createAdminSemester"),
    );
    const ownerList = source.slice(
      source.indexOf("export async function listSemestersForYear"),
      source.indexOf("// --- Admin write operations"),
    );
    assert.equal(/\.eq\("user_id"/.test(adminList), false);
    assert.match(ownerList, /\.eq\("user_id"/);
  });

  it("admin write lookups and updates do not filter by user_id while insert still uses JWT", () => {
    const source = readFileSync(join(ROOT, MANAGEMENT_FILE), "utf8");
    const activate = source.slice(
      source.indexOf("export async function activateAcademicYear"),
      source.indexOf("export async function createSemester"),
    );
    const updateYear = source.slice(
      source.indexOf("export async function updateAcademicYear"),
      source.indexOf("export async function updateSemester"),
    );
    const updateTerm = source.slice(
      source.indexOf("export async function updateSemester"),
      source.indexOf("async function countLinkedLessonSessions"),
    );
    assert.equal(/\.eq\("user_id"/.test(activate), false);
    assert.equal(/\.eq\("user_id"/.test(updateYear), false);
    assert.equal(/\.eq\("user_id"/.test(updateTerm), false);
    assert.match(source, /user_id:\s*userId/);
    assert.match(source, /deactivateOtherActiveYears/);
    assert.equal(/DEFAULT_CALENDAR|1447/.test(activate), false);
    assert.equal(
      /DEFAULT_CALENDAR/.test(
        source.slice(
          source.indexOf("export async function createSemester"),
          source.indexOf("export async function updateAcademicYear"),
        ),
      ),
      false,
    );
    assert.match(activate, /if \(!year\.start_date\)/);
    assert.equal(/!year\.end_date/.test(activate), false);
  });

  it("admin create-semester UI does not treat an empty year end as an upper bound", () => {
    const page = readFileSync(join(ROOT, ADMIN_PAGE), "utf8");
    const createHandler = page.slice(
      page.indexOf("const onCreateSemester"),
      page.indexOf("const onSaveYearEdit"),
    );
    assert.match(createHandler, /selectedYear\?\.endDate/);
    assert.equal(
      /semesterForm\.startDate < selectedYear\.startDate \|\|[\s\S]*?semesterForm\.endDate > selectedYear\.endDate/.test(
        createHandler,
      ),
      false,
    );
    assert.match(createHandler, /semesterForm\.startDate/);
    assert.match(createHandler, /semesterForm\.endDate/);
    assert.equal(/DEFAULT_CALENDAR|1447/.test(createHandler), false);
  });

  it("invalid academic-year date range rejected", async () => {
    const { client } = createMockClient({ academic_years: [] });
    await assert.rejects(
      () =>
        createAdminAcademicYear(auth(USER_A, client), mockAdminClient("admin"), {
          label: "bad",
          startDate: "2026-12-31",
          endDate: "2026-01-01",
        }),
      /البداية/,
    );
  });

  it("admin can update another admin's official year without changing created-by", async () => {
    const { client, db } = createMockClient({
      academic_years: [
        {
          id: EXISTING_YEAR_ID,
          user_id: USER_B,
          label: "العام الدراسي الحالي 1447هـ",
          start_date: "2026-08-30",
          end_date: null,
          is_active: true,
        },
      ],
      lesson_sessions: [
        {
          id: "sess-1",
          academic_year_id: EXISTING_YEAR_ID,
          semester_id: EXISTING_SEMESTER_ID,
        },
      ],
    });
    const updated = await updateAdminAcademicYear(auth(USER_A, client), mockAdminClient("admin"), {
      academicYearId: EXISTING_YEAR_ID,
      label: "العام الدراسي 1448-1449هـ",
      startDate: "2026-08-23",
      endDate: "2027-06-24",
    });
    assert.equal(updated.id, EXISTING_YEAR_ID);
    assert.equal(updated.label, "العام الدراسي 1448-1449هـ");
    assert.equal(db.academic_years[0].user_id, USER_B);
    assert.equal(db.lesson_sessions[0].academic_year_id, EXISTING_YEAR_ID);
  });

  it("admin can activate another admin's year and deactivate every other active year", async () => {
    const { client, db } = createMockClient({
      academic_years: [
        {
          id: "y-a",
          user_id: USER_A,
          label: "A",
          start_date: "2025-01-01",
          end_date: "2025-12-31",
          is_active: true,
        },
        {
          id: "y-b",
          user_id: USER_B,
          label: "B",
          start_date: "2026-01-01",
          end_date: "2026-12-31",
          is_active: false,
        },
      ],
    });
    const activated = await activateAdminAcademicYear(
      auth(USER_A, client),
      mockAdminClient("admin"),
      "y-b",
    );
    assert.equal(activated.id, "y-b");
    assert.equal(activated.isActive, true);
    assert.equal(db.academic_years.find((y) => y.id === "y-a")?.is_active, false);
    assert.equal(db.academic_years.find((y) => y.id === "y-b")?.is_active, true);
    assert.equal(db.academic_years.find((y) => y.id === "y-b")?.user_id, USER_B);
  });

  it("admin can add a semester to another admin's official year", async () => {
    const { client, db } = createMockClient({
      academic_years: [
        {
          id: "y-b",
          user_id: USER_B,
          label: "B",
          start_date: "2026-01-01",
          end_date: "2026-12-31",
          is_active: true,
        },
      ],
      semesters: [],
    });
    const created = await createSemester(auth(USER_A, client), {
      academicYearId: "y-b",
      label: "الفصل الدراسي الأول",
      startDate: "2026-01-01",
      endDate: "2026-03-01",
    });
    assert.equal(created.academicYearId, "y-b");
    assert.equal(db.semesters.length, 1);
    assert.equal(db.semesters[0].user_id, USER_A);
    assert.equal(db.academic_years[0].user_id, USER_B);
  });

  it("existing resolveAcademicScope can resolve the created active scope", async () => {
    const { client } = createMockClient({ academic_years: [], semesters: [] });
    const year = await createAcademicYear(auth(USER_A, client), {
      label: "1447",
      startDate: "2026-08-01",
      endDate: "2027-06-30",
      activate: true,
    });
    const semester = await createSemester(auth(USER_A, client), {
      academicYearId: year.id,
      label: "الفصل الأول",
      startDate: "2026-08-01",
      endDate: "2026-12-15",
    });

    const scope = await resolveAcademicScope("2026-09-15", auth(USER_A, client));
    assert.ok(scope);
    assert.equal(scope!.academicYearId, year.id);
    assert.equal(scope!.semesterId, semester.id);
    assert.equal(scope!.academicYearLabel, "1447");
    assert.equal(scope!.semesterLabel, "الفصل الأول");
  });

  it("resolveAcademicScope can use an official year not owned by the teacher", async () => {
    const { client } = createMockClient({
      academic_years: [
        {
          id: EXISTING_YEAR_ID,
          user_id: USER_A,
          label: "العام الدراسي 1448-1449هـ",
          start_date: "2026-08-23",
          end_date: null,
          is_active: true,
        },
      ],
      semesters: [
        {
          id: EXISTING_SEMESTER_ID,
          user_id: USER_A,
          academic_year_id: EXISTING_YEAR_ID,
          label: "الفصل الدراسي الأول",
          start_date: "2026-08-30",
          end_date: "2027-01-08",
          order_index: 1,
        },
      ],
    });
    const scope = await resolveAcademicScope("2026-09-15", auth(USER_B, client));
    assert.ok(scope);
    assert.equal(scope!.academicYearId, EXISTING_YEAR_ID);
    assert.equal(scope!.semesterId, EXISTING_SEMESTER_ID);
  });
});

describe("academic calendar server / UI security wiring", () => {
  it("server functions use requireSupabaseAuth, assertAdmin, and context.userId only", () => {
    const source = readFileSync(join(ROOT, FUNCTIONS_FILE), "utf8");
    assert.match(source, /requireSupabaseAuth/);
    assert.match(source, /assertAdmin/);
    assert.match(source, /context\.userId/);
    assert.equal(/data\.userId|data\.teacherId|data\.ownerId|data\.profileId/.test(source), false);
    assert.match(source, /export const createAdminAcademicYear/);
    assert.match(source, /export const activateAdminAcademicYear/);
    assert.match(source, /export const createAdminSemester/);
    assert.match(source, /export const listAdminAcademicYears/);
    assert.match(source, /export const listAdminSemesters/);
    assert.match(source, /export const updateAdminAcademicYear/);
    assert.match(source, /export const updateAdminSemester/);
    assert.equal(
      /createTeacherAcademicYear|activateTeacherAcademicYear|createTeacherSemester/.test(source),
      false,
    );
  });

  it("management writes user_id from auth.userId only and does not delete rows", () => {
    const source = readFileSync(join(ROOT, MANAGEMENT_FILE), "utf8");
    assert.match(source, /user_id:\s*userId/);
    assert.match(source, /assertAdmin/);
    assert.equal(/input\.userId|input\.teacherId|input\.ownerId/.test(source), false);
    assert.equal(/\.delete\(/.test(source), false);
  });

  it("teacher Settings no longer exposes calendar, assignment, or weekly timetable UI", () => {
    const settings = readFileSync(join(ROOT, SETTINGS_FILE), "utf8");
    const planner = readFileSync(join(ROOT, PLANNER_FILE), "utf8");
    const timetableService = readFileSync(
      join(ROOT, "src/features/teacher-timetable/services/teacher-timetable.service.ts"),
      "utf8",
    );
    const plannerEngine = readFileSync(
      join(ROOT, "src/features/planner/services/planner-engine.ts"),
      "utf8",
    );

    assert.equal(/AcademicCalendarSettingsSection/.test(settings), false);
    assert.equal(/لم يُعتمد التقويم الدراسي بعد/.test(settings), false);
    assert.equal(/academic-calendar-settings-section/.test(settings), false);
    assert.equal(/الإسناد الدراسي \(المواد والصفوف\)/.test(settings), false);
    assert.equal(/الجدول الأسبوعي للحصص/.test(settings), false);
    assert.equal(/TeacherTimetableService/.test(settings), false);
    assert.equal(/addAssignment|removeAssignment|updateAssignment/.test(settings), false);
    assert.equal(
      /createTeacherAcademicYear|createAdminAcademicYear|activateTeacherAcademicYear|activateAdminAcademicYear|createTeacherSemester|createAdminSemester/.test(
        settings,
      ),
      false,
    );
    assert.equal(/إضافة سنة دراسية|إضافة فصل/.test(settings), false);

    assert.match(planner, /SemesterPlanCalendarField/);
    assert.match(planner, /updateSemesterPlanCalendarVariant/);
    assert.match(timetableService, /export class TeacherTimetableService/);
    assert.match(plannerEngine, /TeacherTimetableService\.getTimetable/);
    assert.match(plannerEngine, /loadTimetable/);
  });

  it("AI / planner / Madrasati remain unwired to calendar writes", () => {
    const forbidden =
      /updateAdminAcademicYear|updateAdminSemester|createAdminAcademicYear|deleteAdminAcademicYear|updateAcademicYear|updateSemester/;
    const scanRoots = [
      "src/platform/integration/connectors/madrasati/madrasati-apply.server.ts",
      "src/features/madrasati/sync/madrasati-sync.service.ts",
      "src/features/planner/services/planner-engine.ts",
      "src/features/lesson-sessions/services/lesson-session.service.ts",
      "src/features/calendar/services/academic-calendar.ts",
    ];
    for (const rel of scanRoots) {
      const source = readFileSync(join(ROOT, rel), "utf8");
      assert.equal(forbidden.test(source), false, rel);
    }
  });

  it("admin page wiring exists", () => {
    const page = readFileSync(join(ROOT, ADMIN_PAGE), "utf8");
    const shell = readFileSync(join(ROOT, ADMIN_SHELL), "utf8");
    const dashboard = readFileSync(join(ROOT, ADMIN_DASHBOARD), "utf8");
    assert.match(page, /createFileRoute\("\/_authenticated\/admin\/academic-calendar"\)/);
    assert.match(page, /التقويم الدراسي/);
    assert.match(page, /listAdminAcademicYears/);
    assert.match(page, /createAdminAcademicYear/);
    assert.match(page, /activateAdminAcademicYear/);
    assert.match(page, /listAdminSemesters/);
    assert.match(page, /createAdminSemester/);
    assert.match(page, /updateAdminAcademicYear/);
    assert.match(page, /updateAdminSemester/);
    assert.match(page, /تعديل/);
    assert.match(page, /حفظ التعديلات/);
    assert.match(page, /إلغاء/);
    assert.match(page, /formatHijri/);
    assert.match(page, /تاريخ البداية/);
    assert.match(page, /تاريخ النهاية/);
    assert.match(page, /window\.confirm/);
    assert.match(page, /سنة نشطة/);
    assert.match(page, /الترتيب/);
    assert.match(page, /activate:\s*false/);
    assert.equal(/activate:\s*true/.test(page), false);
    assert.match(page, /activate:\s*yearForm\.activate/);
    assert.match(page, /overflow-y-auto/);
    assert.match(page, /years\.map/);
    assert.match(page, /year-variant-tree/);
    assert.match(page, /data-calendar-variant/);
    assert.match(page, /listAdminCalendarVariants/);
    assert.match(page, /selectedVariantCode/);
    assert.match(page, /التقويمات داخل هذه السنة/);
    assert.match(page, /إدارة الفصول \(مشتركة\)/);
    assert.equal(/slice\(0,\s*4\)/.test(page), false);
    assert.equal(/userId:\s*|teacherId:|ownerId:|profileId:/.test(page), false);
    assert.match(shell, /\/admin\/academic-calendar/);
    assert.match(shell, /التقويم الدراسي/);
    assert.match(dashboard, /\/admin\/academic-calendar/);
    assert.match(dashboard, /التقويم الدراسي/);
  });

  it("no client owner ID is accepted", () => {
    const functions = readFileSync(join(ROOT, FUNCTIONS_FILE), "utf8");
    const management = readFileSync(join(ROOT, MANAGEMENT_FILE), "utf8");
    const page = readFileSync(join(ROOT, ADMIN_PAGE), "utf8");
    for (const source of [functions, management, page]) {
      assert.equal(
        /data\.userId|data\.teacherId|data\.ownerId|data\.profileId/.test(source),
        false,
      );
      assert.equal(
        /input\.userId|input\.teacherId|input\.ownerId|input\.profileId/.test(source),
        false,
      );
    }
  });
});
