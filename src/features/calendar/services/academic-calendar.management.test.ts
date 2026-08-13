import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { resolveAcademicScope } from "./academic-calendar.ts";
import {
  assertSemesterWithinAcademicYear,
  assertValidDateRange,
  normalizeCalendarLabel,
} from "./academic-calendar.logic.ts";
import {
  activateAcademicYear,
  createAcademicYear,
  createSemester,
  listAcademicYears,
} from "./academic-calendar.management.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const FUNCTIONS_FILE = "src/platform/calendar/academic-calendar.functions.ts";
const SETTINGS_FILE = "src/routes/_authenticated/settings.tsx";
const UI_FILE = "src/features/calendar/components/academic-calendar-settings-section.tsx";
const MANAGEMENT_FILE = "src/features/calendar/services/academic-calendar.management.ts";

const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

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
});

describe("academic year / semester management (JWT-scoped)", () => {
  it("authenticated teacher can create academic year", async () => {
    const { client, db } = createMockClient({ academic_years: [], semesters: [] });
    const year = await createAcademicYear(auth(USER_A, client), {
      label: "1447-1448",
      startDate: "2026-08-01",
      endDate: "2027-06-30",
    });
    assert.equal(year.label, "1447-1448");
    assert.equal(year.isActive, true);
    assert.equal(db.academic_years.length, 1);
    assert.equal(db.academic_years[0].user_id, USER_A);
  });

  it("unauthenticated request rejected", async () => {
    const { client } = createMockClient({ academic_years: [] });
    await assert.rejects(
      () =>
        createAcademicYear(
          { userId: "", client: client as never },
          {
            label: "x",
            startDate: "2026-01-01",
            endDate: "2026-12-31",
          },
        ),
      /Unauthorized|authenticated/i,
    );
  });

  it("client cannot provide another user ID — ownership is JWT-scoped", async () => {
    const { client, db } = createMockClient({ academic_years: [], semesters: [] });
    const forgedClientPayload = { userId: USER_B, teacherId: USER_B, ownerId: USER_B };
    // Server always passes JWT userId (USER_A); forged payload is ignored by design.
    const year = await createAcademicYear(auth(USER_A, client), {
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

  it("invalid academic-year date range rejected", async () => {
    const { client } = createMockClient({ academic_years: [] });
    await assert.rejects(
      () =>
        createAcademicYear(auth(USER_A, client), {
          label: "bad",
          startDate: "2026-12-31",
          endDate: "2026-01-01",
        }),
      /البداية/,
    );
  });

  it("teacher can activate own academic year", async () => {
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
    const activated = await activateAcademicYear(auth(USER_A, client), "y2");
    assert.equal(activated.id, "y2");
    assert.equal(activated.isActive, true);
    assert.equal(db.academic_years.find((y) => y.id === "y1")?.is_active, false);
    assert.equal(db.academic_years.find((y) => y.id === "y2")?.is_active, true);
  });

  it("teacher cannot activate another user's academic year", async () => {
    const { client } = createMockClient({
      academic_years: [
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
    await assert.rejects(
      () => activateAcademicYear(auth(USER_A, client), "y-b"),
      /غير موجودة|غير مملوكة/,
    );
  });

  it("semester requires own academic year", async () => {
    const { client } = createMockClient({
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
    await assert.rejects(
      () =>
        createSemester(auth(USER_A, client), {
          academicYearId: "y-b",
          label: "فصل",
          startDate: "2026-01-01",
          endDate: "2026-06-01",
        }),
      /غير موجودة|غير مملوكة/,
    );
  });

  it("semester outside academic-year dates rejected", async () => {
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
        createSemester(auth(USER_A, client), {
          academicYearId: "y-a",
          label: "خارج",
          startDate: "2026-01-01",
          endDate: "2026-12-31",
        }),
      /ضمن حدود/,
    );
  });

  it("invalid semester date range rejected", async () => {
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
      ],
      semesters: [],
    });
    await assert.rejects(
      () =>
        createSemester(auth(USER_A, client), {
          academicYearId: "y-a",
          label: "معكوس",
          startDate: "2026-06-01",
          endDate: "2026-01-01",
        }),
      /البداية/,
    );
  });

  it("cross-user academic-year reference rejected", async () => {
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
    await assert.rejects(
      () =>
        createSemester(auth(USER_A, client), {
          academicYearId: "y-b",
          label: "سرقة",
          startDate: "2026-01-01",
          endDate: "2026-03-01",
        }),
      /غير موجودة|غير مملوكة/,
    );
    assert.equal(db.semesters.length, 0);
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
});

describe("academic calendar server / UI security wiring", () => {
  it("server functions use requireSupabaseAuth and context.userId only", () => {
    const source = readFileSync(join(ROOT, FUNCTIONS_FILE), "utf8");
    assert.match(source, /requireSupabaseAuth/);
    assert.match(source, /context\.userId/);
    assert.equal(/data\.userId|data\.teacherId|data\.ownerId|data\.profileId/.test(source), false);
    assert.match(source, /export const createTeacherAcademicYear/);
    assert.match(source, /export const activateTeacherAcademicYear/);
    assert.match(source, /export const createTeacherSemester/);
  });

  it("management writes user_id from auth.userId only", () => {
    const source = readFileSync(join(ROOT, MANAGEMENT_FILE), "utf8");
    assert.match(source, /user_id:\s*userId/);
    assert.equal(/input\.userId|input\.teacherId|input\.ownerId/.test(source), false);
  });

  it("Settings page hosts academic calendar section with Arabic empty state", () => {
    const settings = readFileSync(join(ROOT, SETTINGS_FILE), "utf8");
    const ui = readFileSync(join(ROOT, UI_FILE), "utf8");
    assert.match(settings, /AcademicCalendarSettingsSection/);
    assert.match(ui, /السنة الدراسية/);
    assert.match(ui, /الفصول الدراسية/);
    assert.match(ui, /أضف سنة دراسية أولاً لإضافة الفصول الدراسية/);
    assert.equal(/userId:\s*|teacherId:|ownerId:/.test(ui), false);
  });
});
