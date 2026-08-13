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
  activateAdminAcademicYear,
  createAcademicYear,
  createAdminAcademicYear,
  createAdminSemester,
  createSemester,
  listAcademicYears,
} from "./academic-calendar.management.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const FUNCTIONS_FILE = "src/platform/calendar/academic-calendar.functions.ts";
const SETTINGS_FILE = "src/routes/_authenticated/settings.tsx";
const UI_FILE = "src/features/calendar/components/academic-calendar-settings-section.tsx";
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

  it("semester requires owned/managed year", async () => {
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
        createAdminSemester(auth(USER_A, client), mockAdminClient("admin"), {
          academicYearId: "y-b",
          label: "فصل",
          startDate: "2026-01-01",
          endDate: "2026-06-01",
        }),
      /غير موجودة|غير مملوكة/,
    );
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

  it("cannot activate another user's academic year", async () => {
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
      () => activateAdminAcademicYear(auth(USER_A, client), mockAdminClient("admin"), "y-b"),
      /غير موجودة|غير مملوكة/,
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

  it("teacher Settings no longer exposes calendar CRUD", () => {
    const settings = readFileSync(join(ROOT, SETTINGS_FILE), "utf8");
    const ui = readFileSync(join(ROOT, UI_FILE), "utf8");
    assert.match(settings, /AcademicCalendarSettingsSection/);
    assert.match(ui, /لم يُعتمد التقويم الدراسي بعد/);
    assert.equal(
      /createTeacherAcademicYear|createAdminAcademicYear|activateTeacherAcademicYear|activateAdminAcademicYear|createTeacherSemester|createAdminSemester/.test(
        settings,
      ),
      false,
    );
    assert.equal(
      /createTeacherAcademicYear|createAdminAcademicYear|activateTeacherAcademicYear|activateAdminAcademicYear|createTeacherSemester|createAdminSemester/.test(
        ui,
      ),
      false,
    );
    assert.equal(/إضافة سنة دراسية|إضافة فصل/.test(ui), false);
    assert.equal(/userId:\s*|teacherId:|ownerId:/.test(ui), false);
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
