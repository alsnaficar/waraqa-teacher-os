import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  CALENDAR_RESOLVE_REQUIRED_MESSAGE,
  GENERAL_VARIANT_CODE,
  WESTERN_VARIANT_CODE,
  resolveCalendar,
  resolveCalendarForPlan,
} from "./resolve-calendar.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const RESOLVER_FILE = "src/features/calendar/services/resolve-calendar.ts";
const ENGINE_FILE = "src/features/planner/services/planner-engine.ts";

const TEACHER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OWNER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OFFICIAL_YEAR_ID = "01c10273-1111-4111-8111-111111111111";
const OFFICIAL_SEMESTER_ID = "5c772d22-2222-4222-8222-222222222222";
const GENERAL_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const WESTERN_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

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
        then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
          return Promise.resolve({ data: runSelect(), error: null }).then(onFulfilled, onRejected);
        },
      };
      return api;
    },
  };
  return client;
}

function auth(userId: string, client: ReturnType<typeof createReadClient>) {
  return { userId, client: client as never };
}

function officialTables(overrides: Record<string, Row[]> = {}): Record<string, Row[]> {
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

const HOLIDAY_A = "2026-09-23";
const HOLIDAY_B = "2026-11-09";
const RANGE_START = "2026-09-22";
const RANGE_END = "2026-09-24";

function exceptionRow(
  partial: Partial<Row> & {
    id: string;
    variant_id: string;
    kind: string;
    action: string;
    starts_at: string;
    ends_at: string;
    title: string;
  },
): Row {
  return {
    academic_year_id: OFFICIAL_YEAR_ID,
    semester_id: OFFICIAL_SEMESTER_ID,
    replaces_exception_id: null,
    is_teaching_day: false,
    is_remote: false,
    ...partial,
  };
}

describe("resolveCalendar", () => {
  it("GENERAL returns the official 1448 semester dates", async () => {
    const client = createReadClient(officialTables());
    const calendar = await resolveCalendar(
      {
        academicYearId: OFFICIAL_YEAR_ID,
        semesterId: OFFICIAL_SEMESTER_ID,
        variantCode: GENERAL_VARIANT_CODE,
      },
      auth(TEACHER_ID, client),
    );

    assert.equal(calendar.year.id, OFFICIAL_YEAR_ID);
    assert.equal(calendar.year.label, "العام الدراسي 1448-1449هـ");
    assert.equal(calendar.year.endDate, null);
    assert.equal(calendar.semester.id, OFFICIAL_SEMESTER_ID);
    assert.equal(calendar.effectiveSemesterStart, "2026-08-30");
    assert.equal(calendar.effectiveSemesterEnd, "2027-01-08");
    assert.equal(calendar.variant.code, GENERAL_VARIANT_CODE);
    assert.equal(calendar.source, "base");
    assert.deepEqual(calendar.holidays, []);
  });

  it("WESTERN with no exceptions inherits GENERAL dates", async () => {
    const client = createReadClient(officialTables());
    const calendar = await resolveCalendar(
      {
        academicYearId: OFFICIAL_YEAR_ID,
        semesterId: OFFICIAL_SEMESTER_ID,
        variantCode: WESTERN_VARIANT_CODE,
      },
      auth(TEACHER_ID, client),
    );

    assert.equal(calendar.variant.code, WESTERN_VARIANT_CODE);
    assert.equal(calendar.effectiveSemesterStart, "2026-08-30");
    assert.equal(calendar.effectiveSemesterEnd, "2027-01-08");
    assert.equal(calendar.source, "base");
    assert.deepEqual(calendar.holidays, []);
  });

  it("a plan with a null calendar_variant_id resolves as GENERAL", async () => {
    const client = createReadClient(officialTables());
    const calendar = await resolveCalendarForPlan(
      {
        academic_year_id: OFFICIAL_YEAR_ID,
        semester_id: OFFICIAL_SEMESTER_ID,
        calendar_variant_id: null,
      },
      auth(TEACHER_ID, client),
    );

    assert.equal(calendar.variant.code, GENERAL_VARIANT_CODE);
    assert.equal(calendar.effectiveSemesterStart, "2026-08-30");
    assert.equal(calendar.effectiveSemesterEnd, "2027-01-08");
  });

  it("fails closed when the official semester is missing", async () => {
    const client = createReadClient(
      officialTables({
        semesters: [],
      }),
    );

    await assert.rejects(
      () =>
        resolveCalendar(
          { academicYearId: OFFICIAL_YEAR_ID, semesterId: OFFICIAL_SEMESTER_ID },
          auth(TEACHER_ID, client),
        ),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, CALENDAR_RESOLVE_REQUIRED_MESSAGE);
        return true;
      },
    );
  });

  it("does not fall back to DEFAULT_CALENDAR or 1447", () => {
    const resolver = readFileSync(join(ROOT, RESOLVER_FILE), "utf8");
    const engine = readFileSync(join(ROOT, ENGINE_FILE), "utf8");
    assert.equal(/DEFAULT_CALENDAR|1447/.test(resolver), false);
    assert.match(engine, /export const DEFAULT_CALENDAR/);
    assert.equal(/return DEFAULT_CALENDAR/.test(engine), false);
  });
});

describe("resolveCalendar holiday remove", () => {
  async function resolveVariant(
    variantCode: string,
    exceptions: Row[],
  ): Promise<Awaited<ReturnType<typeof resolveCalendar>>> {
    const client = createReadClient(officialTables({ calendar_exceptions: exceptions }));
    return resolveCalendar(
      {
        academicYearId: OFFICIAL_YEAR_ID,
        semesterId: OFFICIAL_SEMESTER_ID,
        variantCode,
      },
      auth(TEACHER_ID, client),
    );
  }

  it("holiday add excludes the date", async () => {
    const calendar = await resolveVariant(GENERAL_VARIANT_CODE, [
      exceptionRow({
        id: "ex-add",
        variant_id: GENERAL_ID,
        kind: "holiday",
        action: "add",
        starts_at: HOLIDAY_A,
        ends_at: HOLIDAY_A,
        title: "إجازة عامة",
      }),
    ]);
    assert.equal(
      calendar.holidays.some((item) => item.date === HOLIDAY_A),
      true,
    );
    assert.equal(calendar.cancelledDays.includes(HOLIDAY_A), false);
  });

  it("WESTERN remove restores a GENERAL holiday without cancelling the day", async () => {
    const exceptions = [
      exceptionRow({
        id: "ex-general",
        variant_id: GENERAL_ID,
        kind: "holiday",
        action: "add",
        starts_at: HOLIDAY_A,
        ends_at: HOLIDAY_A,
        title: "اليوم الوطني",
      }),
      exceptionRow({
        id: "ex-remove",
        variant_id: WESTERN_ID,
        kind: "holiday",
        action: "remove",
        starts_at: HOLIDAY_A,
        ends_at: HOLIDAY_A,
        title: "عنوان مختلف",
      }),
    ];

    const western = await resolveVariant(WESTERN_VARIANT_CODE, exceptions);
    assert.equal(
      western.holidays.some((item) => item.date === HOLIDAY_A),
      false,
    );
    assert.equal(western.cancelledDays.includes(HOLIDAY_A), false);

    const general = await resolveVariant(GENERAL_VARIANT_CODE, exceptions);
    assert.equal(
      general.holidays.some((item) => item.date === HOLIDAY_A),
      true,
    );
  });

  it("remove is date-range based and does not drop another same-title holiday", async () => {
    const calendar = await resolveVariant(WESTERN_VARIANT_CODE, [
      exceptionRow({
        id: "ex-a",
        variant_id: GENERAL_ID,
        kind: "holiday",
        action: "add",
        starts_at: HOLIDAY_A,
        ends_at: HOLIDAY_A,
        title: "إجازة",
      }),
      exceptionRow({
        id: "ex-b",
        variant_id: GENERAL_ID,
        kind: "holiday",
        action: "add",
        starts_at: HOLIDAY_B,
        ends_at: HOLIDAY_B,
        title: "إجازة",
      }),
      exceptionRow({
        id: "ex-remove-a",
        variant_id: WESTERN_ID,
        kind: "holiday",
        action: "remove",
        starts_at: HOLIDAY_A,
        ends_at: HOLIDAY_A,
        title: "إجازة",
      }),
    ]);

    assert.equal(
      calendar.holidays.some((item) => item.date === HOLIDAY_A),
      false,
    );
    assert.equal(
      calendar.holidays.some((item) => item.date === HOLIDAY_B),
      true,
    );
    assert.equal(calendar.cancelledDays.includes(HOLIDAY_A), false);
    assert.equal(calendar.cancelledDays.includes(HOLIDAY_B), false);
  });

  it("remove of one date inside a holiday range leaves the other days", async () => {
    const calendar = await resolveVariant(WESTERN_VARIANT_CODE, [
      exceptionRow({
        id: "ex-range",
        variant_id: GENERAL_ID,
        kind: "holiday",
        action: "add",
        starts_at: RANGE_START,
        ends_at: RANGE_END,
        title: "إجازة ممتدة",
      }),
      exceptionRow({
        id: "ex-remove-mid",
        variant_id: WESTERN_ID,
        kind: "holiday",
        action: "remove",
        starts_at: HOLIDAY_A,
        ends_at: HOLIDAY_A,
        title: "إجازة ممتدة",
      }),
    ]);

    const holidayDates = calendar.holidays.map((item) => item.date).sort();
    assert.deepEqual(holidayDates, [RANGE_START, RANGE_END]);
    assert.equal(calendar.cancelledDays.includes(HOLIDAY_A), false);
  });

  it("variant holiday add remains a holiday", async () => {
    const calendar = await resolveVariant(WESTERN_VARIANT_CODE, [
      exceptionRow({
        id: "ex-west-add",
        variant_id: WESTERN_ID,
        kind: "holiday",
        action: "add",
        starts_at: HOLIDAY_A,
        ends_at: HOLIDAY_A,
        title: "إجازة غربية",
      }),
    ]);
    assert.equal(
      calendar.holidays.some((item) => item.date === HOLIDAY_A),
      true,
    );
  });

  it("break still cancels teaching and exam ranges are unchanged", async () => {
    const calendar = await resolveVariant(GENERAL_VARIANT_CODE, [
      exceptionRow({
        id: "ex-break",
        variant_id: GENERAL_ID,
        kind: "break",
        action: "add",
        starts_at: "2026-10-01",
        ends_at: "2026-10-02",
        title: "استراحة",
      }),
      exceptionRow({
        id: "ex-exam",
        variant_id: GENERAL_ID,
        kind: "exam",
        action: "add",
        starts_at: "2026-12-01",
        ends_at: "2026-12-03",
        title: "اختبارات",
      }),
    ]);
    assert.deepEqual(calendar.cancelledDays.slice().sort(), ["2026-10-01", "2026-10-02"]);
    assert.deepEqual(calendar.examRanges, [
      { startDate: "2026-12-01", endDate: "2026-12-03", label: "اختبارات" },
    ]);
    assert.equal(calendar.holidays.length, 0);
  });
});
