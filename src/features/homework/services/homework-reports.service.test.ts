import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { SupabaseUserContext } from "@/platform/database/supabase/context";
import { resolveReportsDateRange } from "@/features/reports/services/reports.service.ts";
import { buildReportsDateFilter } from "@/features/reports/services/reports-ui.logic.ts";

import {
  averageNumericScores,
  computeHomeworkDetail,
  computeHomeworkReportSummary,
  HomeworkReportsService,
  isHomeworkDueInRange,
  ratePercent,
} from "./homework-reports.service.ts";
import {
  assertNoClientTeacherId,
  buildHomeworkSummaryItems,
  HOMEWORK_REPORTS_EMPTY_TITLE,
} from "./homework-reports-ui.logic.ts";

const TEACHER_A = "11111111-1111-4111-8111-111111111111";
const TEACHER_B = "22222222-2222-4222-8222-222222222222";
const HW_A = "hhhhhhhh-hhhh-4hhh-8hhh-hhhhhhhhhhhh";
const HW_B = "iiiiiiii-iiii-4iii-8iii-iiiiiiiiiiii";
const STU_A = "ssssssss-ssss-4sss-8sss-ssssssssssss";
const STU_B = "tttttttt-tttt-4ttt-8ttt-tttttttttttt";

type Row = Record<string, unknown>;
type Db = {
  homework: Row[];
  homework_submissions: Row[];
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
    homework: [
      {
        id: HW_A,
        teacher_id: TEACHER_A,
        title: "واجب الأسبوع",
        subject: "رياضيات",
        grade: "أول",
        class_name: "1/أ",
        due_date: "2026-08-14",
        status: "assigned",
      },
      {
        id: "hw-out",
        teacher_id: TEACHER_A,
        title: "خارج الفترة",
        subject: "علوم",
        grade: "أول",
        class_name: "1/أ",
        due_date: "2026-07-01",
        status: "draft",
      },
      {
        id: HW_B,
        teacher_id: TEACHER_B,
        title: "واجب معلم آخر",
        subject: "لغة",
        grade: "ثاني",
        class_name: "2/ب",
        due_date: "2026-08-14",
        status: "assigned",
      },
    ],
    homework_submissions: [
      {
        id: "sub-1",
        teacher_id: TEACHER_A,
        homework_id: HW_A,
        student_id: STU_A,
        status: "graded",
        score: 8,
        feedback: "جيد",
        submitted_at: "2026-08-13T10:00:00Z",
        graded_at: "2026-08-14T12:00:00Z",
      },
      {
        id: "sub-2",
        teacher_id: TEACHER_A,
        homework_id: HW_A,
        student_id: STU_B,
        status: "submitted",
        score: null,
        feedback: null,
        submitted_at: "2026-08-13T11:00:00Z",
        graded_at: null,
      },
      {
        id: "sub-foreign",
        teacher_id: TEACHER_B,
        homework_id: HW_B,
        student_id: STU_B,
        status: "graded",
        score: 99,
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

describe("TASK 20.8 homework reports", () => {
  it("1. today filter", () => {
    const filter = buildReportsDateFilter("today");
    assert.deepEqual(filter, { kind: "today" });
    assert.deepEqual(resolveReportsDateRange({ kind: "today", today: "2026-08-14" }), {
      from: "2026-08-14",
      to: "2026-08-14",
    });
    assert.equal(isHomeworkDueInRange("2026-08-14", { from: "2026-08-14", to: "2026-08-14" }), true);
    assert.equal(isHomeworkDueInRange(null, { from: "2026-08-14", to: "2026-08-14" }), false);
  });

  it("2. week filter", () => {
    assert.deepEqual(buildReportsDateFilter("week"), { kind: "week" });
    assert.deepEqual(resolveReportsDateRange({ kind: "week", today: "2026-08-14" }), {
      from: "2026-08-09",
      to: "2026-08-15",
    });
  });

  it("3. month filter", () => {
    assert.deepEqual(buildReportsDateFilter("month"), { kind: "month" });
    assert.deepEqual(resolveReportsDateRange({ kind: "month", today: "2026-08-14" }), {
      from: "2026-08-01",
      to: "2026-08-31",
    });
  });

  it("4. custom filter", () => {
    assert.deepEqual(
      buildReportsDateFilter("custom", { from: "2026-08-01", to: "2026-08-10" }),
      { kind: "custom", from: "2026-08-01", to: "2026-08-10" },
    );
    assert.throws(
      () => buildReportsDateFilter("custom", { from: "2026-08-10", to: "2026-08-01" }),
      /قبل تاريخ النهاية/,
    );
  });

  it("5. summary counts", async () => {
    const report = await HomeworkReportsService.getPeriodReport(
      { kind: "today", today: "2026-08-14" },
      authFor(seedDb()),
    );
    assert.equal(report.summary.totalHomework, 1);
    assert.equal(report.summary.assignedHomework, 1);
    assert.equal(report.summary.draftHomework, 0);
    assert.equal(report.summary.totalStudents, 2);
    assert.equal(report.summary.totalSubmissions, 2);
    assert.equal(report.summary.gradedSubmissions, 1);
    assert.equal(report.summary.submittedSubmissions, 1);
    assert.equal(report.summary.pendingSubmissions, 0);
  });

  it("6. completion rate", () => {
    const summary = computeHomeworkReportSummary({
      homework: [{ status: "assigned" }],
      submissions: [
        { status: "pending", score: null },
        { status: "submitted", score: null },
        { status: "graded", score: 9 },
      ],
      activeStudentCount: 3,
    });
    // (1 submitted + 1 graded) / 3 expected = 67%
    assert.equal(summary.completionRate, 67);
    assert.equal(summary.expectedSubmissions, 3);
  });

  it("7. grading rate", () => {
    const summary = computeHomeworkReportSummary({
      homework: [{ status: "assigned" }],
      submissions: [
        { status: "submitted", score: null },
        { status: "graded", score: 8 },
        { status: "graded", score: 6 },
      ],
      activeStudentCount: 2,
    });
    // 2 graded / (1 submitted + 2 graded) = 67%
    assert.equal(summary.gradingRate, 67);
  });

  it("8. average score", () => {
    assert.equal(averageNumericScores([8, 10, null]), 9);
    const summary = computeHomeworkReportSummary({
      homework: [{ status: "corrected" }],
      submissions: [
        { status: "graded", score: 8 },
        { status: "graded", score: 10 },
        { status: "submitted", score: null },
      ],
      activeStudentCount: 1,
    });
    assert.equal(summary.averageScore, 9);
  });

  it("9. homework detail", async () => {
    const detail = await HomeworkReportsService.getHomeworkDetail(HW_A, authFor(seedDb()));
    assert.ok(detail);
    assert.equal(detail.title, "واجب الأسبوع");
    assert.equal(detail.subject, "رياضيات");
    assert.equal(detail.grade, "أول");
    assert.equal(detail.className, "1/أ");
    assert.equal(detail.dueDate, "2026-08-14");
    assert.equal(detail.status, "assigned");
    assert.equal(detail.numberOfStudents, 2);
    assert.equal(detail.submittedCount, 1);
    assert.equal(detail.gradedCount, 1);
    assert.equal(detail.averageScore, 8);
  });

  it("10. student performance", async () => {
    const detail = await HomeworkReportsService.getHomeworkDetail(HW_A, authFor(seedDb()));
    assert.ok(detail);
    const ahmed = detail.students.find((row) => row.studentId === STU_A);
    assert.ok(ahmed);
    assert.equal(ahmed.studentName, "أحمد");
    assert.equal(ahmed.studentCode, "A1");
    assert.equal(ahmed.status, "graded");
    assert.equal(ahmed.score, 8);
    assert.equal(ahmed.feedback, "جيد");
    assert.ok(ahmed.submittedAt);
    assert.ok(ahmed.gradedAt);
  });

  it("11. teacher ownership", async () => {
    const db = seedDb();
    const report = await HomeworkReportsService.getPeriodReport(
      { kind: "today", today: "2026-08-14" },
      authFor(db, TEACHER_A),
    );
    assert.equal(report.homework.every((row) => row.id !== HW_B), true);
    assert.equal(report.summary.averageScore, 8);

    assert.equal(
      await HomeworkReportsService.getHomeworkDetail(HW_B, authFor(db, TEACHER_A)),
      null,
    );

    const foreign = await HomeworkReportsService.getHomeworkDetail(HW_B, authFor(db, TEACHER_B));
    assert.ok(foreign);
    assert.equal(foreign.averageScore, 99);
  });

  it("12. empty period", async () => {
    const report = await HomeworkReportsService.getPeriodReport(
      { kind: "custom", from: "2026-01-01", to: "2026-01-02" },
      authFor(seedDb()),
    );
    assert.equal(report.homework.length, 0);
    assert.equal(report.summary.totalHomework, 0);
    assert.equal(report.summary.totalSubmissions, 0);
    assert.match(HOMEWORK_REPORTS_EMPTY_TITLE, /لا توجد واجبات/);
    assert.equal(buildHomeworkSummaryItems(report.summary).length > 0, true);
  });

  it("13. division-by-zero cases", () => {
    assert.equal(ratePercent(1, 0), 0);
    assert.equal(ratePercent(0, 0), 0);
    assert.equal(averageNumericScores([]), 0);
    const empty = computeHomeworkReportSummary({
      homework: [],
      submissions: [],
      activeStudentCount: 0,
    });
    assert.equal(empty.completionRate, 0);
    assert.equal(empty.gradingRate, 0);
    assert.equal(empty.averageScore, 0);

    assert.throws(() => assertNoClientTeacherId({ kind: "today", teacher_id: "x" } as never));
    assertNoClientTeacherId({ kind: "week" });

    const detail = computeHomeworkDetail({
      homework: {
        id: HW_A,
        title: "واجب",
        subject: null,
        grade: null,
        class_name: null,
        due_date: "2026-08-14",
        status: "draft",
        teacher_id: TEACHER_A,
      },
      submissions: [],
      studentsById: new Map(),
    });
    assert.equal(detail.numberOfStudents, 0);
    assert.equal(detail.averageScore, 0);
  });
});
