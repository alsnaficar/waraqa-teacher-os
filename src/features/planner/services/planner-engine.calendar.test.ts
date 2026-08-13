import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import type {
  CalendarAcademicYear,
  CalendarTerm,
} from "@/features/calendar/services/calendar.service";

import { CALENDAR_RESOLVE_REQUIRED_MESSAGE } from "@/features/calendar/services/resolve-calendar";

import {
  DEFAULT_CALENDAR,
  generateSchedule,
  loadCalendarConfig,
  PLANNER_CALENDAR_REQUIRED_MESSAGE,
  resolvePlannerCalendarConfig,
} from "./planner-engine.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const ENGINE_FILE = "src/features/planner/services/planner-engine.ts";

const TEACHER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OWNER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OFFICIAL_YEAR_ID = "01c10273-1111-4111-8111-111111111111";
const OFFICIAL_SEMESTER_ID = "5c772d22-2222-4222-8222-222222222222";
const CURRICULUM_FILE_ID = "curriculum-file-1";
const LESSON_ID = "curriculum-lesson-1";

type Row = Record<string, unknown>;
type Filter = { column: string; op: "eq" | "is" | "not-eq"; value: unknown };

function matches(row: Row, filters: Filter[]): boolean {
  return filters.every((f) => {
    const v = row[f.column];
    if (f.op === "eq") return v === f.value;
    if (f.op === "is") return v == null && f.value == null;
    return v !== f.value;
  });
}

function createMockDb(db: Record<string, Row[]>) {
  const writes: { table: string; op: "insert" | "update" | "delete"; row?: Row }[] = [];

  const client = {
    from(table: string) {
      const filters: Filter[] = [];
      const orders: { column: string; ascending: boolean }[] = [];
      let pendingInsert: Row[] | null = null;
      let pendingUpdate: Row | null = null;
      let pendingDelete = false;
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
          for (const row of pendingInsert) {
            writes.push({ table, op: "insert", row });
            db[table] = [...(db[table] ?? []), { id: row.id, ...row }];
          }
          const data = mode === "many" ? pendingInsert : (pendingInsert[0] ?? null);
          return { data, error: null };
        }

        if (pendingUpdate) {
          writes.push({ table, op: "update", row: pendingUpdate });
          const rows = (db[table] ?? []).filter((row) => matches(row, filters));
          for (const row of rows) Object.assign(row, pendingUpdate);
          return { data: mode === "many" ? rows : (rows[0] ?? null), error: null };
        }

        if (pendingDelete) {
          writes.push({ table, op: "delete" });
          const remaining = (db[table] ?? []).filter((row) => !matches(row, filters));
          db[table] = remaining;
          return { data: null, error: null };
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
          pendingDelete = true;
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
        neq(column: string, value: unknown) {
          filters.push({ column, op: "not-eq", value });
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

  return { client, db, writes };
}

function auth(userId: string, client: ReturnType<typeof createMockDb>["client"]) {
  return { userId, client: client as never };
}

const OFFICIAL_YEAR: CalendarAcademicYear = {
  id: OFFICIAL_YEAR_ID,
  label: "العام الدراسي 1448-1449هـ",
  startDate: "2026-08-23",
  endDate: null,
  isActive: true,
};

const OFFICIAL_TERM: CalendarTerm = {
  id: OFFICIAL_SEMESTER_ID,
  label: "الفصل الدراسي الأول",
  startDate: "2026-08-30",
  endDate: "2027-01-08",
  orderIndex: 1,
};

function officialTables(overrides: Record<string, Row[]> = {}): Record<string, Row[]> {
  return {
    academic_years: [
      {
        id: OFFICIAL_YEAR_ID,
        user_id: OWNER_ID,
        label: OFFICIAL_YEAR.label,
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
        label: OFFICIAL_TERM.label,
        start_date: "2026-08-30",
        end_date: "2027-01-08",
        order_index: 1,
      },
    ],
    calendar_events: [],
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
    calendar_term_overrides: [],
    calendar_exceptions: [],
    profiles: [
      {
        id: TEACHER_ID,
        grade: "صف أول",
        subject: "لغتي",
        classes: null,
      },
    ],
    curriculum_files: [
      {
        id: CURRICULUM_FILE_ID,
        grade: "صف أول",
        subject: "لغتي",
        status: "published",
      },
    ],
    curriculum_lessons: [
      {
        id: LESSON_ID,
        curriculum_file_id: CURRICULUM_FILE_ID,
        title: "الدرس الأول",
        order_index: 1,
        objectives: "هدف",
        notes: JSON.stringify({ periods: "1", unitName: "الوحدة الأولى" }),
      },
    ],
    teacher_timetable: [],
    planner_entries: [
      {
        id: "existing-entry-keep",
        user_id: TEACHER_ID,
        subject: "لغتي",
        week_start_date: "2026-08-30",
        notes: "{}",
      },
    ],
    ...overrides,
  };
}

describe("planner calendar config", () => {
  it("uses the official semester dates when the official calendar is valid", () => {
    const config = resolvePlannerCalendarConfig(OFFICIAL_YEAR, OFFICIAL_TERM);
    assert.equal(config.academicYear, "العام الدراسي 1448-1449هـ");
    assert.equal(config.semesterId, OFFICIAL_SEMESTER_ID);
    assert.equal(config.semesterStart, "2026-08-30");
    assert.equal(config.semesterEnd, "2027-01-08");
    assert.notEqual(config.academicYear, DEFAULT_CALENDAR.academicYear);
    assert.notEqual(config.semesterId, DEFAULT_CALENDAR.semesterId);
    assert.notEqual(config.semesterEnd, DEFAULT_CALENDAR.semesterEnd);
  });

  it("uses the official calendar when the academic year end date is null", () => {
    assert.equal(OFFICIAL_YEAR.endDate, null);
    const config = resolvePlannerCalendarConfig(OFFICIAL_YEAR, OFFICIAL_TERM);
    assert.equal(config.semesterStart, "2026-08-30");
    assert.equal(config.semesterEnd, "2027-01-08");
    assert.notEqual(config.academicYear, DEFAULT_CALENDAR.academicYear);
  });

  it("does not use DEFAULT_CALENDAR when no official calendar exists", () => {
    assert.throws(
      () => resolvePlannerCalendarConfig(null, null),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, PLANNER_CALENDAR_REQUIRED_MESSAGE);
        return true;
      },
    );
  });

  it("fails closed when the official term is missing an end date", () => {
    const incomplete: CalendarTerm = { ...OFFICIAL_TERM, endDate: null };
    assert.throws(
      () => resolvePlannerCalendarConfig(OFFICIAL_YEAR, incomplete),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, PLANNER_CALENDAR_REQUIRED_MESSAGE);
        return true;
      },
    );
  });

  it("official calendar wins over the legacy DEFAULT_CALENDAR values", () => {
    assert.equal(DEFAULT_CALENDAR.academicYear, "1447");
    assert.equal(DEFAULT_CALENDAR.semesterEnd, "2026-12-10");
    const config = resolvePlannerCalendarConfig(OFFICIAL_YEAR, OFFICIAL_TERM);
    assert.equal(config.academicYear, "العام الدراسي 1448-1449هـ");
    assert.equal(config.semesterEnd, "2027-01-08");
    assert.deepEqual(config.examWeeks, []);
    assert.notDeepEqual(config.examWeeks, DEFAULT_CALENDAR.examWeeks);
  });

  it("does not rewrite existing planner entries and has no migration in this step", () => {
    const source = readFileSync(join(ROOT, ENGINE_FILE), "utf8");
    assert.equal(/return DEFAULT_CALENDAR/.test(source), false);
    assert.equal(/supabase\/migrations/.test(source), false);
    assert.match(source, /export const DEFAULT_CALENDAR/);
  });

  it("loadCalendarConfig returns official dates for a valid upcoming semester", async () => {
    const mock = createMockDb(officialTables());
    const config = await loadCalendarConfig(auth(TEACHER_ID, mock.client));
    assert.equal(config.academicYear, "العام الدراسي 1448-1449هـ");
    assert.equal(config.semesterId, OFFICIAL_SEMESTER_ID);
    assert.equal(config.semesterStart, "2026-08-30");
    assert.equal(config.semesterEnd, "2027-01-08");
    assert.equal(mock.writes.length, 0);
  });

  it("generateSchedule uses official semester dates, not DEFAULT_CALENDAR", async () => {
    const mock = createMockDb(officialTables());
    const entries = await generateSchedule(
      "لغتي",
      "صف أول",
      undefined,
      auth(TEACHER_ID, mock.client),
    );

    assert.ok(entries.length > 0);
    assert.equal(entries[0]?.academicYear, "العام الدراسي 1448-1449هـ");
    assert.equal(entries[0]?.semester, OFFICIAL_SEMESTER_ID);
    for (const entry of entries) {
      assert.ok(entry.suggestedDate >= "2026-08-30");
      assert.ok(entry.suggestedDate <= "2027-01-08");
      assert.notEqual(entry.academicYear, DEFAULT_CALENDAR.academicYear);
      assert.notEqual(entry.semester, DEFAULT_CALENDAR.semesterId);
    }
    assert.equal(mock.writes.filter((item) => item.table === "planner_entries").length, 0);
  });

  it("generateSchedule does not succeed with DEFAULT_CALENDAR when official calendar is missing", async () => {
    const mock = createMockDb(
      officialTables({
        academic_years: [],
        semesters: [],
      }),
    );

    await assert.rejects(
      () => generateSchedule("لغتي", "صف أول", undefined, auth(TEACHER_ID, mock.client)),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, CALENDAR_RESOLVE_REQUIRED_MESSAGE);
        return true;
      },
    );

    assert.equal(mock.writes.filter((item) => item.table === "planner_entries").length, 0);
    assert.equal((mock.db.planner_entries ?? []).length, 1);
  });

  it("generateSchedule fails closed when the official semester end date is missing", async () => {
    const mock = createMockDb(
      officialTables({
        semesters: [
          {
            id: OFFICIAL_SEMESTER_ID,
            user_id: OWNER_ID,
            academic_year_id: OFFICIAL_YEAR_ID,
            label: OFFICIAL_TERM.label,
            start_date: "2026-08-30",
            end_date: null,
            order_index: 1,
          },
        ],
      }),
    );

    await assert.rejects(
      () => generateSchedule("لغتي", "صف أول", undefined, auth(TEACHER_ID, mock.client)),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, CALENDAR_RESOLVE_REQUIRED_MESSAGE);
        return true;
      },
    );

    assert.equal(mock.writes.filter((item) => item.table === "planner_entries").length, 0);
  });
});
