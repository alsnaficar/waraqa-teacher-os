import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  CALENDAR_RESOLVE_REQUIRED_MESSAGE,
  GENERAL_VARIANT_CODE,
  WESTERN_VARIANT_CODE,
  resolveCalendarForPlan,
} from "@/features/calendar/services/resolve-calendar.ts";
import {
  buildTeachingDates,
  loadCalendarConfig,
  mapResolvedCalendarToPlannerConfig,
} from "./planner-engine.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const ENGINE_FILE = "src/features/planner/services/planner-engine.ts";
const LIFECYCLE_FILE = "src/features/planner/services/semester-plan-lifecycle.ts";
const SHEETS_FILE = "src/features/planner/sheets.functions.ts";

const TEACHER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const YEAR_ID = "11111111-1111-4111-8111-111111111111";
const SEMESTER_ID = "22222222-2222-4222-8222-222222222222";
const GENERAL_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const WESTERN_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const NATIONAL_DAY = "2026-09-23";

type Row = Record<string, unknown>;
type Filter = { column: string; op: "eq" | "is"; value: unknown };

function matches(row: Row, filters: Filter[]): boolean {
  return filters.every((f) => {
    const v = row[f.column];
    if (f.op === "is") return v == null && f.value == null;
    return v === f.value;
  });
}

function createReadClient(db: Record<string, Row[]>) {
  const writes: Array<{ table: string; op: string }> = [];

  const client = {
    from(table: string) {
      const filters: Filter[] = [];
      const orders: { column: string; ascending: boolean }[] = [];
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

      const api: Record<string, unknown> = {
        select() {
          return api;
        },
        insert() {
          writes.push({ table, op: "insert" });
          throw new Error("calendar resolution must not write");
        },
        update() {
          writes.push({ table, op: "update" });
          throw new Error("calendar resolution must not write");
        },
        delete() {
          writes.push({ table, op: "delete" });
          throw new Error("calendar resolution must not write");
        },
        eq(column: string, value: unknown) {
          filters.push({ column, op: "eq", value });
          return api;
        },
        is(column: string, value: unknown) {
          filters.push({ column, op: "is", value });
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
          const rows = runSelect();
          return Promise.resolve({ data: rows[0] ?? null, error: null });
        },
        single() {
          const rows = runSelect();
          if (!rows[0]) return Promise.resolve({ data: null, error: { message: "not found" } });
          return Promise.resolve({ data: rows[0], error: null });
        },
        then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
          return Promise.resolve({ data: runSelect(), error: null }).then(onFulfilled, onRejected);
        },
      };
      return api;
    },
  };

  return { client, writes };
}

function auth(userId: string, client: ReturnType<typeof createReadClient>["client"]) {
  return { userId, client: client as never };
}

function officialTables(overrides: Record<string, Row[]> = {}): Record<string, Row[]> {
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
    calendar_variants: [
      {
        id: GENERAL_ID,
        code: GENERAL_VARIANT_CODE,
        label: "جميع المناطق",
        is_default: true,
        is_selectable: true,
        sort_order: 0,
      },
      {
        id: WESTERN_ID,
        code: WESTERN_VARIANT_CODE,
        label: "المنطقة الغربية",
        is_default: false,
        is_selectable: true,
        sort_order: 1,
      },
    ],
    calendar_term_overrides: [],
    calendar_exceptions: [],
    ...overrides,
  };
}

const WESTERN_HOLIDAY = {
  id: "ex-west-1",
  variant_id: WESTERN_ID,
  academic_year_id: YEAR_ID,
  semester_id: SEMESTER_ID,
  kind: "holiday",
  action: "add",
  starts_at: NATIONAL_DAY,
  ends_at: NATIONAL_DAY,
  title: "اليوم الوطني",
  replaces_exception_id: null,
  is_teaching_day: false,
  is_remote: false,
};

const GENERAL_PLAN = {
  academic_year_id: YEAR_ID,
  semester_id: SEMESTER_ID,
  calendar_variant_id: GENERAL_ID,
};

const WESTERN_PLAN = {
  academic_year_id: YEAR_ID,
  semester_id: SEMESTER_ID,
  calendar_variant_id: WESTERN_ID,
};

const NULL_PLAN = {
  academic_year_id: YEAR_ID,
  semester_id: SEMESTER_ID,
  calendar_variant_id: null,
};

describe("planner calendar variant wiring", () => {
  it("GENERAL plan uses GENERAL official semester dates", async () => {
    const { client, writes } = createReadClient(officialTables());
    const config = await loadCalendarConfig(auth(TEACHER_ID, client), GENERAL_PLAN);
    assert.equal(config.semesterId, SEMESTER_ID);
    assert.equal(config.semesterStart, "2026-08-30");
    assert.equal(config.semesterEnd, "2027-01-08");
    assert.equal(config.academicYear, "العام الدراسي 1448-1449هـ");
    assert.deepEqual(config.holidays, []);
    assert.equal(writes.length, 0);
  });

  it("WESTERN plan uses the WESTERN resolved calendar", async () => {
    const { client } = createReadClient(
      officialTables({
        calendar_exceptions: [{ ...WESTERN_HOLIDAY }],
      }),
    );
    const config = await loadCalendarConfig(auth(TEACHER_ID, client), WESTERN_PLAN);
    assert.equal(config.semesterStart, "2026-08-30");
    assert.equal(config.semesterEnd, "2027-01-08");
    assert.equal(
      config.holidays.some((item) => item.date === NATIONAL_DAY),
      true,
    );

    const general = await loadCalendarConfig(auth(TEACHER_ID, client), GENERAL_PLAN);
    assert.equal(
      general.holidays.some((item) => item.date === NATIONAL_DAY),
      false,
    );
  });

  it("NULL calendar_variant_id reads as GENERAL and does not backfill", async () => {
    const { client, writes } = createReadClient(
      officialTables({
        calendar_exceptions: [{ ...WESTERN_HOLIDAY }],
      }),
    );
    const resolved = await resolveCalendarForPlan(NULL_PLAN, auth(TEACHER_ID, client));
    assert.equal(resolved.variant.code, GENERAL_VARIANT_CODE);

    const config = await loadCalendarConfig(auth(TEACHER_ID, client), NULL_PLAN);
    assert.equal(config.semesterStart, "2026-08-30");
    assert.equal(
      config.holidays.some((item) => item.date === NATIONAL_DAY),
      false,
    );
    assert.equal(writes.length, 0);
  });

  it("uses official semester dates, not DEFAULT_CALENDAR", async () => {
    const { client } = createReadClient(officialTables());
    const config = await loadCalendarConfig(auth(TEACHER_ID, client), GENERAL_PLAN);
    assert.equal(config.semesterStart, "2026-08-30");
    assert.equal(config.semesterEnd, "2027-01-08");
    assert.notEqual(config.academicYear, "1447");
    assert.notEqual(config.semesterId, "s1");
  });

  it("throws when the official semester is missing", async () => {
    const { client } = createReadClient(officialTables({ semesters: [] }));
    await assert.rejects(
      () => loadCalendarConfig(auth(TEACHER_ID, client), GENERAL_PLAN),
      (err: unknown) => err instanceof Error && err.message === CALENDAR_RESOLVE_REQUIRED_MESSAGE,
    );
  });

  it("WESTERN holiday remove does not skip the restored teaching date", async () => {
    const { client } = createReadClient(
      officialTables({
        calendar_exceptions: [
          {
            id: "ex-general-holiday",
            variant_id: GENERAL_ID,
            academic_year_id: YEAR_ID,
            semester_id: SEMESTER_ID,
            kind: "holiday",
            action: "add",
            starts_at: NATIONAL_DAY,
            ends_at: NATIONAL_DAY,
            title: "اليوم الوطني",
            replaces_exception_id: null,
            is_teaching_day: false,
            is_remote: false,
          },
          {
            id: "ex-western-remove",
            variant_id: WESTERN_ID,
            academic_year_id: YEAR_ID,
            semester_id: SEMESTER_ID,
            kind: "holiday",
            action: "remove",
            starts_at: NATIONAL_DAY,
            ends_at: NATIONAL_DAY,
            title: "عنوان مختلف",
            replaces_exception_id: null,
            is_teaching_day: false,
            is_remote: false,
          },
        ],
      }),
    );

    const western = await loadCalendarConfig(auth(TEACHER_ID, client), WESTERN_PLAN);
    assert.equal(
      western.holidays.some((item) => item.date === NATIONAL_DAY),
      false,
    );
    const westernDates = buildTeachingDates(western);
    const restored = westernDates.find((day) => day.date === NATIONAL_DAY);
    assert.equal(restored?.isHoliday, false);

    const general = await loadCalendarConfig(auth(TEACHER_ID, client), GENERAL_PLAN);
    assert.equal(
      general.holidays.some((item) => item.date === NATIONAL_DAY),
      true,
    );
  });

  it("calendar exceptions skip teaching dates", () => {
    const config = mapResolvedCalendarToPlannerConfig({
      year: {
        id: YEAR_ID,
        label: "العام الدراسي 1448-1449هـ",
        startDate: "2026-08-23",
        endDate: null,
        isActive: true,
      },
      semester: {
        id: SEMESTER_ID,
        label: "الفصل الدراسي الأول",
        startDate: "2026-08-30",
        endDate: "2027-01-08",
        orderIndex: 1,
      },
      variant: { id: GENERAL_ID, code: GENERAL_VARIANT_CODE, label: "جميع المناطق" },
      effectiveSemesterStart: "2026-08-30",
      effectiveSemesterEnd: "2026-09-24",
      holidays: [{ date: NATIONAL_DAY, label: "اليوم الوطني" }],
      examRanges: [],
      remoteRanges: [],
      extraTeachingDays: [],
      cancelledDays: ["2026-09-22"],
      source: "override",
    });

    const dates = buildTeachingDates(config);
    const national = dates.find((day) => day.date === NATIONAL_DAY);
    const cancelled = dates.find((day) => day.date === "2026-09-22");
    assert.equal(national?.isHoliday, true);
    assert.equal(cancelled?.isHoliday, true);
  });

  it("GENERAL teaching-date shape stays official Sun–Thu with no fixture fallback", async () => {
    const { client } = createReadClient(officialTables());
    const config = await loadCalendarConfig(auth(TEACHER_ID, client), GENERAL_PLAN);
    const dates = buildTeachingDates(config);
    assert.equal(config.workingDays.join(","), "0,1,2,3,4");
    assert.ok(dates.some((day) => day.date === "2026-08-30"));
    assert.ok(dates.some((day) => day.date === "2027-01-07"));
    assert.equal(
      dates.every((day) => day.dayOfWeek >= 0 && day.dayOfWeek <= 4),
      true,
    );
  });
});

describe("planner calendar source guards", () => {
  it("wires generateSchedule to the plan variant and never succeeds via DEFAULT_CALENDAR", () => {
    const engine = readFileSync(join(ROOT, ENGINE_FILE), "utf8");
    const loadFn = engine.slice(
      engine.indexOf("export async function loadCalendarConfig"),
      engine.indexOf("export async function saveCalendarConfig"),
    );
    const generateFn = engine.slice(engine.indexOf("export async function generateSchedule"));

    assert.match(loadFn, /resolveCalendarForPlan/);
    assert.match(loadFn, /resolveCalendar\(/);
    assert.equal(/getHolidayDates/.test(loadFn), false);
    assert.equal(/DEFAULT_CALENDAR/.test(loadFn), false);
    assert.equal(/return DEFAULT_CALENDAR/.test(engine), false);
    assert.match(generateFn, /loadCalendarConfig\(resolved,\s*plan\)/);
    assert.match(generateFn, /calendar_variant_id/);
    assert.equal(/1447/.test(loadFn), false);
  });

  it("does not alter lifecycle writes, Sheets, or DB schemas", () => {
    const lifecycle = readFileSync(join(ROOT, LIFECYCLE_FILE), "utf8");
    const sheets = readFileSync(join(ROOT, SHEETS_FILE), "utf8");
    const engine = readFileSync(join(ROOT, ENGINE_FILE), "utf8");
    assert.equal(/loadCalendarConfig|resolveCalendarForPlan/.test(lifecycle), false);
    assert.equal(/calendar_variant/.test(sheets), false);
    assert.equal(/from\("academic_years"\)\.(update|insert)/.test(engine), false);
    assert.equal(/from\("semesters"\)\.(update|insert)/.test(engine), false);
    assert.equal(/from\("lesson_sessions"\)/.test(engine), false);
  });
});
