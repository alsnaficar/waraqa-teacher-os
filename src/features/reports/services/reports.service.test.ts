import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { SupabaseUserContext } from "@/platform/database/supabase/context";
import {
  calculateLessonSessionStats,
  dedupeReportSessions,
  ReportsService,
  resolveReportsDateRange,
  toReportRow,
  toReportStatus,
  type ReportLessonSessionRow,
} from "./reports.service.ts";

const TEACHER_A = "11111111-1111-4111-8111-111111111111";
const TEACHER_B = "22222222-2222-4222-8222-222222222222";

type Row = Record<string, unknown>;

function matchesFilters(row: Row, filters: Record<string, unknown>): boolean {
  return Object.entries(filters).every(([column, value]) => {
    if (column.startsWith("gte:")) {
      return String(row[column.slice(4)] ?? "") >= String(value);
    }
    if (column.startsWith("lte:")) {
      return String(row[column.slice(4)] ?? "") <= String(value);
    }
    return row[column] === value;
  });
}

function createMockClient(db: { lesson_sessions: Row[] }) {
  const client = {
    from(table: string) {
      const state: {
        filters: Record<string, unknown>;
        orders: Array<{ column: string; ascending: boolean }>;
      } = {
        filters: {},
        orders: [],
      };

      const runSelect = (): Row[] => {
        let rows = [...(db[table as keyof typeof db] ?? [])];
        rows = rows.filter((row) => matchesFilters(row, state.filters));
        for (const order of state.orders) {
          rows.sort((a, b) => {
            const av = a[order.column];
            const bv = b[order.column];
            if (av === bv) return 0;
            if (av == null) return 1;
            if (bv == null) return -1;
            if (av < bv) return order.ascending ? -1 : 1;
            return order.ascending ? 1 : -1;
          });
        }
        return rows;
      };

      const chain = {
        select(_columns?: string) {
          return chain;
        },
        eq(column: string, value: unknown) {
          state.filters[column] = value;
          return chain;
        },
        gte(column: string, value: unknown) {
          state.filters[`gte:${column}`] = value;
          return chain;
        },
        lte(column: string, value: unknown) {
          state.filters[`lte:${column}`] = value;
          return chain;
        },
        order(column: string, opts?: { ascending?: boolean }) {
          state.orders.push({ column, ascending: opts?.ascending !== false });
          return chain;
        },
        then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
          return Promise.resolve({ data: runSelect(), error: null }).then(resolve, reject);
        },
      };

      return chain;
    },
  };

  return client as never;
}

function authFor(db: { lesson_sessions: Row[] }, userId = TEACHER_A): SupabaseUserContext {
  return { client: createMockClient(db), userId };
}

function sessionRow(
  overrides: Partial<Row> & { id: string; teacher_id?: string; session_date?: string; status?: string },
): Row {
  return {
    day_of_week: 0,
    period_number: 1,
    lesson_locked: false,
    curriculum_lesson_id: "lesson-1",
    teacher_id: TEACHER_A,
    session_date: "2026-08-14",
    status: "scheduled",
    ...overrides,
  };
}

function reportRow(overrides: Partial<ReportLessonSessionRow> = {}): ReportLessonSessionRow {
  return {
    id: "s1",
    sessionDate: "2026-08-14",
    dayOfWeek: 0,
    periodNumber: 1,
    status: "scheduled",
    lessonLocked: false,
    curriculumLessonId: "lesson-1",
    teacherId: TEACHER_A,
    ...overrides,
  };
}

describe("Reports date range helpers", () => {
  it("resolves today / week / month / custom using ISO UTC dates", () => {
    assert.deepEqual(resolveReportsDateRange({ kind: "today", today: "2026-08-14" }), {
      from: "2026-08-14",
      to: "2026-08-14",
    });

    // 2026-08-14 is Friday → week Sun 2026-08-09 .. Sat 2026-08-15
    assert.deepEqual(resolveReportsDateRange({ kind: "week", today: "2026-08-14" }), {
      from: "2026-08-09",
      to: "2026-08-15",
    });

    assert.deepEqual(resolveReportsDateRange({ kind: "month", today: "2026-08-14" }), {
      from: "2026-08-01",
      to: "2026-08-31",
    });

    assert.deepEqual(
      resolveReportsDateRange({ kind: "custom", from: "2026-08-01", to: "2026-08-10" }),
      { from: "2026-08-01", to: "2026-08-10" },
    );
  });
});

describe("Reports status + stats helpers", () => {
  it("maps unknown status to scheduled (existing project convention)", () => {
    assert.equal(toReportStatus("scheduled"), "scheduled");
    assert.equal(toReportStatus("completed"), "completed");
    assert.equal(toReportStatus("weird-future-status"), "scheduled");
  });

  it("empty range / empty sessions → zero stats and zero completionRate", () => {
    const stats = calculateLessonSessionStats([]);
    assert.deepEqual(stats, {
      total: 0,
      scheduled: 0,
      preparing: 0,
      prepared: 0,
      completed: 0,
      cancelled: 0,
      completionRate: 0,
    });
  });

  it("counts each of the five statuses exactly once", () => {
    const stats = calculateLessonSessionStats([
      reportRow({ id: "1", status: "scheduled" }),
      reportRow({ id: "2", status: "preparing" }),
      reportRow({ id: "3", status: "prepared" }),
      reportRow({ id: "4", status: "completed" }),
      reportRow({ id: "5", status: "cancelled" }),
    ]);

    assert.equal(stats.total, 5);
    assert.equal(stats.scheduled, 1);
    assert.equal(stats.preparing, 1);
    assert.equal(stats.prepared, 1);
    assert.equal(stats.completed, 1);
    assert.equal(stats.cancelled, 1);
    // prepared/cancelled are not completed
    assert.equal(stats.completionRate, 20);
  });

  it("completionRate rounds to nearest integer", () => {
    const stats = calculateLessonSessionStats([
      reportRow({ id: "1", status: "completed" }),
      reportRow({ id: "2", status: "scheduled" }),
      reportRow({ id: "3", status: "scheduled" }),
    ]);
    // 1/3 * 100 ≈ 33.333 → 33
    assert.equal(stats.completionRate, 33);
  });

  it("zero division: total 0 → completionRate 0", () => {
    assert.equal(calculateLessonSessionStats([]).completionRate, 0);
  });

  it("dedupe prevents double-counting duplicate ids", () => {
    const sessions = [
      reportRow({ id: "dup", status: "completed" }),
      reportRow({ id: "dup", status: "completed" }),
      reportRow({ id: "other", status: "scheduled" }),
    ];
    assert.equal(dedupeReportSessions(sessions).length, 2);
    const stats = calculateLessonSessionStats(sessions);
    assert.equal(stats.total, 2);
    assert.equal(stats.completed, 1);
    assert.equal(stats.completionRate, 50);
  });
});

describe("TASK 19.3 ReportsService lesson session report", () => {
  it("1. empty range returns empty sessions and zero stats", async () => {
    const db = { lesson_sessions: [] as Row[] };
    const report = await ReportsService.getLessonSessionReport(
      { kind: "custom", from: "2026-08-01", to: "2026-08-31" },
      authFor(db),
    );

    assert.equal(report.sessions.length, 0);
    assert.equal(report.stats.total, 0);
    assert.equal(report.stats.completionRate, 0);
    assert.deepEqual(report.range, { from: "2026-08-01", to: "2026-08-31" });
  });

  it("2–4. all five statuses + completionRate + prepared not completed", async () => {
    const db = {
      lesson_sessions: [
        sessionRow({ id: "a", status: "scheduled", period_number: 1 }),
        sessionRow({ id: "b", status: "preparing", period_number: 2 }),
        sessionRow({ id: "c", status: "prepared", period_number: 3, lesson_locked: true }),
        sessionRow({ id: "d", status: "completed", period_number: 4 }),
        sessionRow({ id: "e", status: "cancelled", period_number: 5 }),
      ],
    };

    const report = await ReportsService.getLessonSessionReport(
      { kind: "today", today: "2026-08-14" },
      authFor(db),
    );

    assert.equal(report.stats.total, 5);
    assert.equal(report.stats.scheduled, 1);
    assert.equal(report.stats.preparing, 1);
    assert.equal(report.stats.prepared, 1);
    assert.equal(report.stats.completed, 1);
    assert.equal(report.stats.cancelled, 1);
    assert.equal(report.stats.completionRate, 20);
    assert.equal(report.sessions[0]?.sessionDate, "2026-08-14");
  });

  it("5. date filtering includes only sessions inside the range", async () => {
    const db = {
      lesson_sessions: [
        sessionRow({ id: "before", session_date: "2026-08-01", status: "completed" }),
        sessionRow({ id: "in", session_date: "2026-08-10", status: "completed" }),
        sessionRow({ id: "after", session_date: "2026-08-20", status: "completed" }),
      ],
    };

    const report = await ReportsService.getLessonSessionReport(
      { kind: "custom", from: "2026-08-05", to: "2026-08-15" },
      authFor(db),
    );

    assert.equal(report.sessions.length, 1);
    assert.equal(report.sessions[0]?.id, "in");
    assert.equal(report.stats.completed, 1);
    assert.equal(report.stats.completionRate, 100);
  });

  it("5b. week and month filters use resolved ISO bounds", async () => {
    const db = {
      lesson_sessions: [
        sessionRow({ id: "week-edge", session_date: "2026-08-09", status: "scheduled" }),
        sessionRow({ id: "month-edge", session_date: "2026-08-31", status: "prepared" }),
        sessionRow({ id: "next-month", session_date: "2026-09-01", status: "completed" }),
      ],
    };

    const week = await ReportsService.getLessonSessionReport(
      { kind: "week", today: "2026-08-14" },
      authFor(db),
    );
    assert.deepEqual(
      week.sessions.map((s) => s.id),
      ["week-edge"],
    );

    const month = await ReportsService.getLessonSessionReport(
      { kind: "month", today: "2026-08-14" },
      authFor(db),
    );
    assert.deepEqual(
      month.sessions.map((s) => s.id).sort(),
      ["month-edge", "week-edge"],
    );
  });

  it("6. teacher ownership — never returns another teacher's sessions", async () => {
    const db = {
      lesson_sessions: [
        sessionRow({ id: "mine", teacher_id: TEACHER_A, status: "completed" }),
        sessionRow({ id: "theirs", teacher_id: TEACHER_B, status: "completed" }),
      ],
    };

    const report = await ReportsService.getLessonSessionReport(
      { kind: "today", today: "2026-08-14" },
      authFor(db, TEACHER_A),
    );

    assert.equal(report.sessions.length, 1);
    assert.equal(report.sessions[0]?.id, "mine");
    assert.equal(report.sessions[0]?.teacherId, TEACHER_A);
    assert.equal(report.stats.completed, 1);
  });

  it("7. duplicate ids are not double-counted", async () => {
    const db = {
      lesson_sessions: [
        sessionRow({ id: "same", status: "completed", period_number: 1 }),
        sessionRow({ id: "same", status: "completed", period_number: 1 }),
      ],
    };

    const report = await ReportsService.getLessonSessionReport(
      { kind: "today", today: "2026-08-14" },
      authFor(db),
    );

    assert.equal(report.sessions.length, 1);
    assert.equal(report.stats.total, 1);
    assert.equal(report.stats.completed, 1);
    assert.equal(report.stats.completionRate, 100);
  });

  it("8. unknown status follows project convention (count as scheduled)", async () => {
    const mapped = toReportRow(
      sessionRow({ id: "x", status: "legacy-unknown" }) as never,
    );
    assert.equal(mapped.status, "scheduled");

    const db = {
      lesson_sessions: [sessionRow({ id: "x", status: "legacy-unknown" })],
    };
    const report = await ReportsService.getLessonSessionReport(
      { kind: "today", today: "2026-08-14" },
      authFor(db),
    );

    assert.equal(report.stats.scheduled, 1);
    assert.equal(report.stats.completed, 0);
    assert.equal(report.stats.total, 1);
  });

});
