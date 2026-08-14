import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { SupabaseUserContext } from "@/platform/database/supabase/context";
import { resolveReportsDateRange } from "@/features/reports/services/reports.service.ts";
import { buildReportsDateFilter } from "@/features/reports/services/reports-ui.logic.ts";

import {
  averageNumericScores,
  computeTestDetail,
  computeTestReportSummary,
  isTestDueInRange,
  ratePercent,
  TestReportsService,
} from "./test-reports.service.ts";
import {
  assertNoClientTeacherId,
  buildTestSummaryItems,
  TEST_REPORTS_EMPTY_TITLE,
} from "./test-reports-ui.logic.ts";

const TEACHER_A = "11111111-1111-4111-8111-111111111111";
const TEACHER_B = "22222222-2222-4222-8222-222222222222";
const TEST_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TEST_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const STU_A = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const STU_B = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

type Row = Record<string, unknown>;
type Db = {
  tests: Row[];
  test_submissions: Row[];
  students: Row[];
};

function createMockClient(db: Db) {
  const client = {
    from(table: string) {
      const state: {
        filters: Record<string, unknown>;
        op: "select" | null;
        orders: Array<{ column: string; ascending: boolean }>;
      } = {
        filters: {},
        op: null,
        orders: [],
      };

      const runSelect = (): Row[] => {
        let rows = [...((db as Record<string, Row[]>)[table] ?? [])];
        for (const [column, value] of Object.entries(state.filters)) {
          rows = rows.filter((row) => {
            if (Array.isArray(value)) return value.includes(row[column]);
            return row[column] === value;
          });
        }
        return rows;
      };

      const chain = {
        select(_columns?: string) {
          state.op = "select";
          return chain;
        },
        eq(column: string, value: unknown) {
          state.filters[column] = value;
          return chain;
        },
        in(column: string, values: unknown[]) {
          state.filters[column] = values;
          return chain;
        },
        order(column: string, opts?: { ascending?: boolean }) {
          state.orders.push({ column, ascending: opts?.ascending !== false });
          return chain;
        },
        async maybeSingle() {
          return { data: runSelect()[0] ?? null, error: null };
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

function authFor(db: Db, userId = TEACHER_A): SupabaseUserContext {
  return { client: createMockClient(db), userId };
}

function seedDb(): Db {
  return {
    tests: [
      {
        id: TEST_A,
        teacher_id: TEACHER_A,
        title: "اختبار الأسبوع",
        subject: "رياضيات",
        grade: "أول",
        class_name: "1/أ",
        due_date: "2026-08-14",
        status: "published",
      },
      {
        id: "test-out",
        teacher_id: TEACHER_A,
        title: "خارج الفترة",
        subject: "علوم",
        grade: "أول",
        class_name: "1/أ",
        due_date: "2026-07-01",
        status: "draft",
      },
      {
        id: "test-null-due",
        teacher_id: TEACHER_A,
        title: "بدون موعد",
        subject: "لغة",
        grade: "أول",
        class_name: "1/أ",
        due_date: null,
        status: "published",
      },
      {
        id: TEST_B,
        teacher_id: TEACHER_B,
        title: "اختبار معلم آخر",
        subject: "لغة",
        grade: "ثاني",
        class_name: "2/ب",
        due_date: "2026-08-14",
        status: "published",
      },
    ],
    test_submissions: [
      {
        id: "sub-1",
        teacher_id: TEACHER_A,
        test_id: TEST_A,
        student_id: STU_A,
        status: "graded",
        score: 8,
        max_score: 10,
        feedback: "جيد",
        submitted_at: "2026-08-13T10:00:00Z",
        graded_at: "2026-08-14T12:00:00Z",
      },
      {
        id: "sub-2",
        teacher_id: TEACHER_A,
        test_id: TEST_A,
        student_id: STU_B,
        status: "submitted",
        score: null,
        max_score: null,
        feedback: null,
        submitted_at: "2026-08-13T11:00:00Z",
        graded_at: null,
      },
      {
        id: "sub-foreign",
        teacher_id: TEACHER_B,
        test_id: TEST_B,
        student_id: STU_B,
        status: "graded",
        score: 99,
        max_score: 100,
        feedback: "سرّي",
        submitted_at: "2026-08-13T10:00:00Z",
        graded_at: "2026-08-14T12:00:00Z",
      },
    ],
    students: [
      {
        id: STU_A,
        teacher_id: TEACHER_A,
        full_name: "أحمد",
        student_code: "A1",
        active: true,
      },
      {
        id: STU_B,
        teacher_id: TEACHER_A,
        full_name: "سارة",
        student_code: "S2",
        active: true,
      },
      {
        id: "stu-inactive",
        teacher_id: TEACHER_A,
        full_name: "موقوف",
        student_code: "X",
        active: false,
      },
      {
        id: "stu-b",
        teacher_id: TEACHER_B,
        full_name: "أجنبي",
        student_code: "B1",
        active: true,
      },
    ],
  };
}

describe("TASK 22.6 test reports", () => {
  it("1. date range inclusion/exclusion", () => {
    const range = resolveReportsDateRange({ kind: "today", today: "2026-08-14" });
    assert.equal(isTestDueInRange("2026-08-14", range), true);
    assert.equal(isTestDueInRange("2026-07-01", range), false);
    assert.deepEqual(buildReportsDateFilter("week"), { kind: "week" });
  });

  it("2. null due_date exclusion", () => {
    assert.equal(
      isTestDueInRange(null, { from: "2026-08-01", to: "2026-08-31" }),
      false,
    );
  });

  it("3. completionRate", () => {
    const summary = computeTestReportSummary({
      tests: [{ status: "published" }],
      submissions: [
        { status: "pending", score: null },
        { status: "submitted", score: null },
        { status: "graded", score: 9 },
      ],
      activeStudentCount: 3,
    });
    assert.equal(summary.completionRate, 67);
    assert.equal(summary.expectedSubmissions, 3);
  });

  it("4. gradingRate", () => {
    const summary = computeTestReportSummary({
      tests: [{ status: "published" }],
      submissions: [
        { status: "submitted", score: null },
        { status: "graded", score: 8 },
        { status: "graded", score: 6 },
      ],
      activeStudentCount: 2,
    });
    assert.equal(summary.gradingRate, 67);
  });

  it("5. averageScore (graded-only)", () => {
    assert.equal(averageNumericScores([8, 10, null]), 9);
    const summary = computeTestReportSummary({
      tests: [{ status: "closed" }],
      submissions: [
        { status: "graded", score: 8 },
        { status: "graded", score: 10 },
        { status: "submitted", score: 99 },
        { status: "graded", score: null },
      ],
      activeStudentCount: 1,
    });
    assert.equal(summary.averageScore, 9);
  });

  it("6. period summary counts", async () => {
    const report = await TestReportsService.getPeriodReport(
      { kind: "today", today: "2026-08-14" },
      authFor(seedDb()),
    );
    assert.equal(report.summary.totalTests, 1);
    assert.equal(report.summary.publishedTests, 1);
    assert.equal(report.summary.draftTests, 0);
    assert.equal(report.summary.totalStudents, 2);
    assert.equal(report.summary.totalSubmissions, 2);
    assert.equal(report.summary.gradedSubmissions, 1);
    assert.equal(report.summary.submittedSubmissions, 1);
    assert.equal(report.tests.every((row) => row.id !== "test-null-due"), true);
    assert.equal(report.tests.every((row) => row.id !== "test-out"), true);
  });

  it("7. test detail", async () => {
    const detail = await TestReportsService.getTestDetail(TEST_A, authFor(seedDb()));
    assert.ok(detail);
    assert.equal(detail.title, "اختبار الأسبوع");
    assert.equal(detail.subject, "رياضيات");
    assert.equal(detail.grade, "أول");
    assert.equal(detail.className, "1/أ");
    assert.equal(detail.dueDate, "2026-08-14");
    assert.equal(detail.status, "published");
    assert.equal(detail.numberOfStudents, 2);
    assert.equal(detail.submittedCount, 1);
    assert.equal(detail.gradedCount, 1);
    assert.equal(detail.averageScore, 8);
  });

  it("8. student performance", async () => {
    const detail = await TestReportsService.getTestDetail(TEST_A, authFor(seedDb()));
    assert.ok(detail);
    const ahmed = detail.students.find((row) => row.studentId === STU_A);
    assert.ok(ahmed);
    assert.equal(ahmed.studentName, "أحمد");
    assert.equal(ahmed.studentCode, "A1");
    assert.equal(ahmed.status, "graded");
    assert.equal(ahmed.score, 8);
    assert.equal(ahmed.maxScore, 10);
    assert.equal(ahmed.feedback, "جيد");
    assert.ok(ahmed.submittedAt);
    assert.ok(ahmed.gradedAt);
  });

  it("9. unknown student fallback", () => {
    const detail = computeTestDetail({
      test: {
        id: TEST_A,
        title: "اختبار",
        subject: null,
        grade: null,
        class_name: null,
        due_date: "2026-08-14",
        status: "published",
        teacher_id: TEACHER_A,
      },
      submissions: [
        {
          id: "sub-x",
          test_id: TEST_A,
          student_id: "missing-student",
          status: "graded",
          score: 5,
          max_score: 10,
          feedback: null,
          submitted_at: null,
          graded_at: "2026-08-14T12:00:00Z",
          teacher_id: TEACHER_A,
        },
      ],
      studentsById: new Map(),
    });
    assert.equal(detail.students[0]?.studentName, "طالب غير معروف");
    assert.equal(detail.students[0]?.studentCode, null);
  });

  it("10. teacher isolation", async () => {
    const db = seedDb();
    const report = await TestReportsService.getPeriodReport(
      { kind: "today", today: "2026-08-14" },
      authFor(db, TEACHER_A),
    );
    assert.equal(report.tests.every((row) => row.id !== TEST_B), true);
    assert.equal(report.summary.averageScore, 8);

    assert.equal(await TestReportsService.getTestDetail(TEST_B, authFor(db, TEACHER_A)), null);

    const foreign = await TestReportsService.getTestDetail(TEST_B, authFor(db, TEACHER_B));
    assert.ok(foreign);
    assert.equal(foreign.averageScore, 99);
  });

  it("11. empty period + helpers", async () => {
    const report = await TestReportsService.getPeriodReport(
      { kind: "custom", from: "2026-01-01", to: "2026-01-02" },
      authFor(seedDb()),
    );
    assert.equal(report.tests.length, 0);
    assert.equal(report.summary.totalTests, 0);
    assert.equal(report.summary.totalSubmissions, 0);
    assert.match(TEST_REPORTS_EMPTY_TITLE, /لا توجد اختبارات/);
    assert.equal(buildTestSummaryItems(report.summary).length > 0, true);

    assert.equal(ratePercent(1, 0), 0);
    assert.equal(averageNumericScores([]), 0);
    assert.throws(() => assertNoClientTeacherId({ kind: "today", teacher_id: "x" } as never));
    assertNoClientTeacherId({ kind: "week" });
  });
});
