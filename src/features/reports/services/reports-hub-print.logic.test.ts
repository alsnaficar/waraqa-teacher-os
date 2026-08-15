import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { HomeworkPeriodReport } from "@/features/homework/services/homework-reports.service.ts";
import type { TestPeriodReport } from "@/features/tests/services/test-reports.service.ts";

import type { LessonSessionReportView } from "./enrich-report-with-lesson-titles.ts";
import type { ReportsHubSnapshot } from "./reports-hub.logic.ts";
import {
  assertNoClientTeacherId,
  buildReportsHubPrintView,
  REPORTS_HUB_PRINT_BUTTON_LABEL,
  REPORTS_HUB_PRINT_DOMAIN_EMPTY,
  REPORTS_HUB_PRINT_DOMAIN_ERROR,
  REPORTS_HUB_PRINT_ROOT_ID,
  REPORTS_HUB_PRINT_TITLE,
} from "./reports-hub-print.logic.ts";

const range = { from: "2026-08-09", to: "2026-08-15" };

const lessonOk: LessonSessionReportView = {
  range,
  stats: {
    total: 4,
    scheduled: 1,
    preparing: 0,
    prepared: 2,
    completed: 1,
    cancelled: 0,
    completionRate: 25,
  },
  sessions: [
    {
      id: "s1",
      sessionDate: "2026-08-15",
      dayOfWeek: 6,
      periodNumber: 1,
      status: "completed",
      lessonLocked: true,
      curriculumLessonId: "cl-1",
      teacherId: "must-not-appear-in-print-dto",
      lessonTitle: "درس",
    },
  ],
};

const homeworkOk: HomeworkPeriodReport = {
  range,
  summary: {
    totalHomework: 3,
    draftHomework: 0,
    assignedHomework: 2,
    collectedHomework: 0,
    correctedHomework: 1,
    totalStudents: 10,
    totalSubmissions: 8,
    pendingSubmissions: 2,
    submittedSubmissions: 3,
    gradedSubmissions: 3,
    expectedSubmissions: 8,
    completionRate: 75,
    gradingRate: 50,
    averageScore: 8.5,
  },
  homework: [],
};

const testsOk: TestPeriodReport = {
  range,
  summary: {
    totalTests: 2,
    draftTests: 0,
    publishedTests: 1,
    closedTests: 1,
    totalStudents: 10,
    totalSubmissions: 6,
    pendingSubmissions: 1,
    submittedSubmissions: 2,
    gradedSubmissions: 3,
    expectedSubmissions: 6,
    completionRate: 83,
    gradingRate: 60,
    averageScore: 7,
  },
  tests: [],
};

describe("TASK 25.10 reports hub print logic", () => {
  it("maps three domain summaries from loaded snapshot", () => {
    const snapshot: ReportsHubSnapshot = {
      range,
      lessons: { status: "ok", data: lessonOk },
      homework: { status: "ok", data: { ...homeworkOk, homework: [{ id: "h1", title: "و", subject: null, grade: null, className: null, dueDate: "2026-08-12", status: "assigned" }] } },
      tests: { status: "ok", data: { ...testsOk, tests: [{ id: "t1", title: "ا", subject: null, grade: null, className: null, dueDate: "2026-08-13", status: "published" }] } },
    };

    const view = buildReportsHubPrintView(snapshot, new Date("2026-08-15T12:30:00Z"));
    assert.equal(view.title, REPORTS_HUB_PRINT_TITLE);
    assert.match(view.periodLabel, /٢٠٢٦|2026/);
    assert.ok(view.printedAtLabel.length > 0);
    assert.equal(view.domains.length, 3);
    assert.equal(view.domains[0]?.kind, "metrics");
    assert.equal(view.domains[1]?.kind, "metrics");
    assert.equal(view.domains[2]?.kind, "metrics");
    assert.ok((view.domains[0]?.metrics.length ?? 0) >= 4);
  });

  it("uses تعذر التحميل for errored domains without inventing zeros", () => {
    const snapshot: ReportsHubSnapshot = {
      range,
      lessons: { status: "error", message: "lesson boom" },
      homework: { status: "ok", data: { ...homeworkOk, homework: [{ id: "h1", title: "و", subject: null, grade: null, className: null, dueDate: null, status: "assigned" }] } },
      tests: { status: "ok", data: testsOk },
    };

    const view = buildReportsHubPrintView(snapshot);
    assert.equal(view.domains[0]?.kind, "error");
    assert.equal(view.domains[0]?.message, REPORTS_HUB_PRINT_DOMAIN_ERROR);
    assert.deepEqual(view.domains[0]?.metrics, []);
    assert.equal(view.domains[1]?.kind, "metrics");
    assert.equal(view.domains[2]?.kind, "empty");
    assert.equal(view.domains[2]?.message, REPORTS_HUB_PRINT_DOMAIN_EMPTY);
  });

  it("print DTO helpers omit teacher_id; constants are stable", () => {
    assert.equal(REPORTS_HUB_PRINT_ROOT_ID, "reports-hub-print");
    assert.equal(REPORTS_HUB_PRINT_BUTTON_LABEL, "طباعة التقرير");

    const snapshot: ReportsHubSnapshot = {
      range,
      lessons: { status: "ok", data: lessonOk },
      homework: { status: "ok", data: homeworkOk },
      tests: { status: "ok", data: testsOk },
    };
    const view = buildReportsHubPrintView(snapshot);
    assert.doesNotThrow(() => assertNoClientTeacherId(view));
    for (const domain of view.domains) {
      assert.doesNotThrow(() => assertNoClientTeacherId(domain));
      for (const metric of domain.metrics) {
        assert.doesNotThrow(() => assertNoClientTeacherId(metric));
      }
    }
    assert.throws(() => assertNoClientTeacherId({ teacher_id: "x" }), /teacher_id/);
  });
});
