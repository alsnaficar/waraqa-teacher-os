import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { resolveAcademicScope } from "./academic-calendar.ts";
import { getActiveAcademicYear, getCurrentAcademicTerm } from "./calendar.service.ts";

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

  it("getCurrentAcademicTerm keeps date-window logic (null before 2026-08-30)", async () => {
    const client = createReadClient(officialCalendar());
    const term = await getCurrentAcademicTerm(auth(TEACHER_ID, client));
    const today = new Date().toISOString().slice(0, 10);
    if (today < "2026-08-30" || today > "2027-01-08") {
      assert.equal(term, null);
    } else {
      assert.equal(term?.id, OFFICIAL_SEMESTER_ID);
    }
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
