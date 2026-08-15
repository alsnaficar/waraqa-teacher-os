import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { HomeworkPeriodReport } from "@/features/homework/services/homework-reports.service.ts";
import type { TestPeriodReport } from "@/features/tests/services/test-reports.service.ts";

import type { LessonSessionReportView } from "./enrich-report-with-lesson-titles.ts";
import {
  assertNoClientTeacherId,
  buildReportsHubSnapshot,
  compactHomeworkMetrics,
  compactLessonMetrics,
  compactTestMetrics,
  domainFromSettled,
  isHomeworkHubEmpty,
  isLessonHubEmpty,
  isTestHubEmpty,
  REPORTS_HUB_DEFAULT_FILTER,
  REPORTS_HUB_HOMEWORK_CTA,
  REPORTS_HUB_TESTS_CTA,
  REPORTS_HUB_VIEW_ALL_CTA,
} from "./reports-hub.logic.ts";

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
      teacherId: "should-not-leak-to-compact",
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
  homework: [{ id: "hw-1", title: "واجب", subject: null, grade: null, className: null, dueDate: "2026-08-12", status: "assigned" }],
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
  tests: [{ id: "t-1", title: "اختبار", subject: null, grade: null, className: null, dueDate: "2026-08-13", status: "published" }],
};

describe("TASK 25.8 reports hub logic", () => {
  it("maps all 3 domain summaries correctly", () => {
    const snapshot = buildReportsHubSnapshot({
      range,
      lessons: { status: "fulfilled", value: lessonOk },
      homework: { status: "fulfilled", value: homeworkOk },
      tests: { status: "fulfilled", value: testsOk },
    });

    assert.equal(snapshot.lessons.status, "ok");
    assert.equal(snapshot.homework.status, "ok");
    assert.equal(snapshot.tests.status, "ok");

    if (snapshot.lessons.status !== "ok") throw new Error("expected lessons ok");
    if (snapshot.homework.status !== "ok") throw new Error("expected homework ok");
    if (snapshot.tests.status !== "ok") throw new Error("expected tests ok");

    assert.deepEqual(compactLessonMetrics(snapshot.lessons.data.stats), [
      { label: "إجمالي الحصص", value: "4" },
      { label: "مكتملة", value: "1" },
      { label: "معدة", value: "2" },
      { label: "نسبة الإنجاز", value: "25%" },
    ]);
    assert.deepEqual(compactHomeworkMetrics(snapshot.homework.data.summary), [
      { label: "الواجبات", value: "3" },
      { label: "التسليمات", value: "8" },
      { label: "نسبة الإنجاز", value: "75%" },
      { label: "نسبة التصحيح", value: "50%" },
    ]);
    assert.deepEqual(compactTestMetrics(snapshot.tests.data.summary), [
      { label: "الاختبارات", value: "2" },
      { label: "التسليمات", value: "6" },
      { label: "نسبة الإنجاز", value: "83%" },
      { label: "نسبة التصحيح", value: "60%" },
    ]);
  });

  it("empty states detect zero rows without inventing data", () => {
    const emptyLessons: LessonSessionReportView = {
      ...lessonOk,
      stats: { ...lessonOk.stats, total: 0, completionRate: 0, prepared: 0, completed: 0, scheduled: 0 },
      sessions: [],
    };
    const emptyHw: HomeworkPeriodReport = {
      ...homeworkOk,
      homework: [],
      summary: { ...homeworkOk.summary, totalHomework: 0, totalSubmissions: 0, completionRate: 0, gradingRate: 0 },
    };
    const emptyTests: TestPeriodReport = {
      ...testsOk,
      tests: [],
      summary: { ...testsOk.summary, totalTests: 0, totalSubmissions: 0, completionRate: 0, gradingRate: 0 },
    };

    assert.equal(isLessonHubEmpty(emptyLessons), true);
    assert.equal(isHomeworkHubEmpty(emptyHw), true);
    assert.equal(isTestHubEmpty(emptyTests), true);
    assert.equal(isLessonHubEmpty(lessonOk), false);
  });

  it("independent error states — one failure does not invent zeros for others", () => {
    const snapshot = buildReportsHubSnapshot({
      range,
      lessons: { status: "rejected", reason: new Error("lesson boom") },
      homework: { status: "fulfilled", value: homeworkOk },
      tests: { status: "fulfilled", value: testsOk },
    });

    assert.equal(snapshot.lessons.status, "error");
    if (snapshot.lessons.status === "error") {
      assert.match(snapshot.lessons.message, /lesson boom/);
    }
    assert.equal(snapshot.homework.status, "ok");
    assert.equal(snapshot.tests.status, "ok");

    const onlyError = domainFromSettled(
      { status: "rejected", reason: "raw" } as PromiseSettledResult<never>,
      "fallback",
    );
    assert.equal(onlyError.status, "error");
    if (onlyError.status === "error") assert.equal(onlyError.message, "fallback");
  });

  it("DTO helpers and CTAs omit teacher_id; default filter is week", () => {
    assert.equal(REPORTS_HUB_DEFAULT_FILTER.kind, "week");
    assert.equal(REPORTS_HUB_VIEW_ALL_CTA, "عرض جميع التقارير");
    assert.equal(REPORTS_HUB_HOMEWORK_CTA, "تفاصيل الواجبات");
    assert.equal(REPORTS_HUB_TESTS_CTA, "تفاصيل الاختبارات");

    const metrics = compactLessonMetrics(lessonOk.stats);
    for (const row of metrics) {
      assert.doesNotThrow(() => assertNoClientTeacherId(row));
    }
    assert.throws(() => assertNoClientTeacherId({ teacher_id: "x" }), /teacher_id/);
  });
});
