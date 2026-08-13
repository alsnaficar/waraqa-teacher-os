import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { resolveAcademicScope } from "./academic-calendar.ts";
import {
  getActiveAcademicYear,
  getCurrentAcademicTerm,
  pickAcademicTermForDate,
  type CalendarTerm,
} from "./calendar.service.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const SERVICE_FILE = "src/features/calendar/services/calendar.service.ts";
const SCOPE_FILE = "src/features/calendar/services/academic-calendar.ts";

const TEACHER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OWNER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OFFICIAL_YEAR_ID = "01c10273-1111-4111-8111-111111111111";
const OFFICIAL_SEMESTER_ID = "5c772d22-2222-4222-8222-222222222222";

type Row = Record<string, unknown>;
type Filter = { column: string; op: "eq" | "lte" | "gte"; value: unknown };

function matches(row: Row, filters: Filter[]): boolean {
  return filters.every((f) => {
    const v = row[f.column];
    if (f.op === "eq") return v === f.value;
    if (v == null) return false;
    const left = String(v);
    const right = String(f.value);
    if (f.op === "lte") return left <= right;
    return left >= right;
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
        lte(column: string, value: unknown) {
          filters.push({ column, op: "lte", value });
          return api;
        },
        gte(column: string, value: unknown) {
          filters.push({ column, op: "gte", value });
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
  };
}

function auth(userId: string, client: ReturnType<typeof createReadClient>) {
  return { userId, client: client as never };
}

const SEMESTER_1: CalendarTerm = {
  id: OFFICIAL_SEMESTER_ID,
  label: "الفصل الدراسي الأول",
  startDate: "2026-08-30",
  endDate: "2027-01-08",
  orderIndex: 1,
};

const SEMESTER_2: CalendarTerm = {
  id: "semester-2-mock",
  label: "الفصل الدراسي الثاني",
  startDate: "2027-01-18",
  endDate: "2027-05-28",
  orderIndex: 2,
};

const SEMESTER_3: CalendarTerm = {
  id: "semester-3-mock",
  label: "الفصل الدراسي الثالث",
  startDate: "2027-06-08",
  endDate: "2027-08-12",
  orderIndex: 3,
};

function calendarWithInactiveYear() {
  const official = officialCalendar();
  return {
    academic_years: [
      {
        id: "inactive-year-id",
        user_id: OWNER_ID,
        label: "عام غير نشط",
        start_date: "2025-08-23",
        end_date: "2026-08-22",
        is_active: false,
      },
      ...official.academic_years,
    ],
    semesters: [
      {
        id: "inactive-semester-id",
        user_id: OWNER_ID,
        academic_year_id: "inactive-year-id",
        label: "فصل عام غير نشط",
        start_date: "2025-08-30",
        end_date: "2026-12-31",
        order_index: 1,
      },
      ...official.semesters,
    ],
  };
}

describe("official calendar resolvers", () => {
  it("year and semester reads do not filter by user_id", () => {
    const service = readFileSync(join(ROOT, SERVICE_FILE), "utf8");
    const scope = readFileSync(join(ROOT, SCOPE_FILE), "utf8");
    assert.equal(/from\("academic_years"\)[\s\S]{0,280}\.eq\("user_id"/.test(service), false);
    assert.equal(/from\("semesters"\)[\s\S]{0,400}\.eq\("user_id"/.test(service), false);
    assert.equal(/\.eq\("user_id"/.test(scope), false);
  });

  it("getActiveAcademicYear returns the official active year for a non-owner teacher", async () => {
    const client = createReadClient(officialCalendar());
    const year = await getActiveAcademicYear(auth(TEACHER_ID, client));
    assert.ok(year);
    assert.equal(year!.id, OFFICIAL_YEAR_ID);
    assert.equal(year!.label, "العام الدراسي 1448-1449هـ");
    assert.equal(year!.startDate, "2026-08-23");
    assert.equal(year!.endDate, null);
    assert.equal(year!.isActive, true);
  });

  it("pickAcademicTermForDate returns the covering semester on 2026-09-01", () => {
    assert.equal(pickAcademicTermForDate([SEMESTER_1], "2026-09-01")?.id, OFFICIAL_SEMESTER_ID);
  });

  it("pickAcademicTermForDate returns the nearest upcoming semester on 2026-08-13", () => {
    assert.equal(pickAcademicTermForDate([SEMESTER_1], "2026-08-13")?.id, OFFICIAL_SEMESTER_ID);
  });

  it("pickAcademicTermForDate returns the next semester between terms", () => {
    assert.equal(
      pickAcademicTermForDate([SEMESTER_1, SEMESTER_2], "2027-01-12")?.id,
      SEMESTER_2.id,
    );
  });

  it("pickAcademicTermForDate returns null after all semesters", () => {
    assert.equal(pickAcademicTermForDate([SEMESTER_1], "2027-01-09"), null);
    assert.equal(pickAcademicTermForDate([SEMESTER_1, SEMESTER_2, SEMESTER_3], "2027-08-13"), null);
  });

  it("pickAcademicTermForDate returns the nearest future semester by start_date", () => {
    assert.equal(
      pickAcademicTermForDate([SEMESTER_3, SEMESTER_2, SEMESTER_1], "2026-08-13")?.id,
      OFFICIAL_SEMESTER_ID,
    );
    assert.equal(
      pickAcademicTermForDate([SEMESTER_3, SEMESTER_2], "2027-01-10")?.id,
      SEMESTER_2.id,
    );
  });

  it("pickAcademicTermForDate does not treat a null end_date as covering today", () => {
    const openEnded: CalendarTerm = {
      ...SEMESTER_1,
      endDate: null,
    };
    assert.equal(pickAcademicTermForDate([openEnded], "2026-09-01"), null);
    assert.equal(pickAcademicTermForDate([openEnded], "2026-08-13")?.id, OFFICIAL_SEMESTER_ID);
  });

  it("getCurrentAcademicTerm returns the official upcoming semester before 2026-08-30", async () => {
    const client = createReadClient(officialCalendar());
    const term = await getCurrentAcademicTerm(auth(TEACHER_ID, client));
    const today = new Date().toISOString().slice(0, 10);
    if (today < "2026-08-30") {
      assert.equal(term?.id, OFFICIAL_SEMESTER_ID);
    } else if (today <= "2027-01-08") {
      assert.equal(term?.id, OFFICIAL_SEMESTER_ID);
    } else {
      assert.equal(term, null);
    }
  });

  it("getCurrentAcademicTerm uses the active academic year only", async () => {
    const client = createReadClient(calendarWithInactiveYear());
    const term = await getCurrentAcademicTerm(auth(TEACHER_ID, client));
    assert.equal(term?.id, OFFICIAL_SEMESTER_ID);
  });

  it("resolveAcademicScope maps a date inside the official first semester", async () => {
    const client = createReadClient(officialCalendar());
    const scope = await resolveAcademicScope("2026-09-15", auth(TEACHER_ID, client));
    assert.ok(scope);
    assert.equal(scope!.academicYearId, OFFICIAL_YEAR_ID);
    assert.equal(scope!.semesterId, OFFICIAL_SEMESTER_ID);
    assert.equal(scope!.academicYearLabel, "العام الدراسي 1448-1449هـ");
    assert.equal(scope!.semesterLabel, "الفصل الدراسي الأول");
  });
});
