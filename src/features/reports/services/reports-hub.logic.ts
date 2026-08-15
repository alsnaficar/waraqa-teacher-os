import type { HomeworkPeriodReport, HomeworkReportSummary } from "@/features/homework/services/homework-reports.service";
import type { TestPeriodReport, TestReportSummary } from "@/features/tests/services/test-reports.service";

import type { LessonSessionReportView } from "./enrich-report-with-lesson-titles";
import type {
  LessonSessionReportStats,
  ReportsDateFilter,
} from "./reports.service";
import { buildReportsDateFilter } from "./reports-ui.logic";

/** Shared default period for Dashboard + /reports hub. */
export const REPORTS_HUB_DEFAULT_FILTER: ReportsDateFilter = buildReportsDateFilter("week");

export const REPORTS_HUB_VIEW_ALL_CTA = "عرض جميع التقارير";
export const REPORTS_HUB_HOMEWORK_CTA = "تفاصيل الواجبات";
export const REPORTS_HUB_TESTS_CTA = "تفاصيل الاختبارات";
export const REPORTS_HUB_SECTION_TITLE = "التقارير";
export const REPORTS_HUB_LESSONS_TITLE = "ملخص الحصص";
export const REPORTS_HUB_HOMEWORK_TITLE = "ملخص الواجبات";
export const REPORTS_HUB_TESTS_TITLE = "ملخص الاختبارات";

export type CompactReportMetric = {
  label: string;
  value: string;
};

export type HubDomainOk<T> = {
  status: "ok";
  data: T;
};

export type HubDomainError = {
  status: "error";
  message: string;
};

export type HubDomainResult<T> = HubDomainOk<T> | HubDomainError;

export type ReportsHubSnapshot = {
  range: { from: string; to: string };
  lessons: HubDomainResult<LessonSessionReportView>;
  homework: HubDomainResult<HomeworkPeriodReport>;
  tests: HubDomainResult<TestPeriodReport>;
};

export function hubErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

export function domainFromSettled<T>(
  result: PromiseSettledResult<T>,
  fallbackMessage: string,
): HubDomainResult<T> {
  if (result.status === "fulfilled") {
    return { status: "ok", data: result.value };
  }
  return {
    status: "error",
    message: hubErrorMessage(result.reason, fallbackMessage),
  };
}

export function buildReportsHubSnapshot(input: {
  range: { from: string; to: string };
  lessons: PromiseSettledResult<LessonSessionReportView>;
  homework: PromiseSettledResult<HomeworkPeriodReport>;
  tests: PromiseSettledResult<TestPeriodReport>;
}): ReportsHubSnapshot {
  return {
    range: input.range,
    lessons: domainFromSettled(input.lessons, "تعذر تحميل تقرير الحصص."),
    homework: domainFromSettled(input.homework, "تعذر تحميل تقرير الواجبات."),
    tests: domainFromSettled(input.tests, "تعذر تحميل تقرير الاختبارات."),
  };
}

/** Compact lesson metrics for Dashboard / hub cards — no session rows. */
export function compactLessonMetrics(stats: LessonSessionReportStats): CompactReportMetric[] {
  return [
    { label: "إجمالي الحصص", value: String(stats.total) },
    { label: "مكتملة", value: String(stats.completed) },
    { label: "معدة", value: String(stats.prepared) },
    { label: "نسبة الإنجاز", value: `${stats.completionRate}%` },
  ];
}

/** Compact homework metrics — no student/detail tables. */
export function compactHomeworkMetrics(summary: HomeworkReportSummary): CompactReportMetric[] {
  return [
    { label: "الواجبات", value: String(summary.totalHomework) },
    { label: "التسليمات", value: String(summary.totalSubmissions) },
    { label: "نسبة الإنجاز", value: `${summary.completionRate}%` },
    { label: "نسبة التصحيح", value: `${summary.gradingRate}%` },
  ];
}

/** Compact test metrics — no student/detail tables. */
export function compactTestMetrics(summary: TestReportSummary): CompactReportMetric[] {
  return [
    { label: "الاختبارات", value: String(summary.totalTests) },
    { label: "التسليمات", value: String(summary.totalSubmissions) },
    { label: "نسبة الإنجاز", value: `${summary.completionRate}%` },
    { label: "نسبة التصحيح", value: `${summary.gradingRate}%` },
  ];
}

export function isLessonHubEmpty(report: LessonSessionReportView): boolean {
  return report.sessions.length === 0;
}

export function isHomeworkHubEmpty(report: HomeworkPeriodReport): boolean {
  return report.homework.length === 0;
}

export function isTestHubEmpty(report: TestPeriodReport): boolean {
  return report.tests.length === 0;
}

export function assertNoClientTeacherId(view: object): void {
  const keys = Object.keys(view);
  if (keys.includes("teacherId") || keys.includes("teacher_id")) {
    throw new Error("Reports hub view must not expose teacher_id");
  }
}
