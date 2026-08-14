import type { ReportsDateFilter } from "@/features/reports/services/reports.service";
import {
  buildReportsDateFilter,
  REPORTS_FILTER_OPTIONS,
  type ReportsFilterKind,
} from "@/features/reports/services/reports-ui.logic";

import { TEST_STATUS_LABELS } from "./tests-ui.logic";
import {
  formatTestScoreLabel,
  TEST_SUBMISSION_STATUS_LABELS,
} from "./tests-submissions-ui.logic";
import type { TestReportSummary } from "./test-reports.service";

export { formatTestScoreLabel };

export { REPORTS_FILTER_OPTIONS, buildReportsDateFilter };
export type { ReportsFilterKind };

export const TEST_REPORTS_EMPTY_TITLE = "لا توجد اختبارات في الفترة المحددة";
export const TEST_REPORTS_EMPTY_DESCRIPTION =
  "لم يُعثر على اختبارات بتاريخ استحقاق ضمن النطاق المختار. الاختبارات بلا موعد استحقاق لا تدخل تقرير الفترة.";
export const TEST_REPORTS_ERROR_TITLE = "تعذر تحميل تقارير الاختبارات";
export const TEST_REPORTS_HINT =
  "نسبة الإنجاز = (مُسلّم + مُصحّح) ÷ التسليمات المسجّلة. نسبة التصحيح = مُصحّح ÷ (مُسلّم + مُصحّح).";

export type TestSummaryItem = {
  key: keyof TestReportSummary;
  label: string;
  value: string;
};

export function buildTestSummaryItems(summary: TestReportSummary): TestSummaryItem[] {
  return [
    { key: "totalTests", label: "إجمالي الاختبارات", value: String(summary.totalTests) },
    { key: "draftTests", label: "مسودات", value: String(summary.draftTests) },
    { key: "publishedTests", label: "منشورة", value: String(summary.publishedTests) },
    { key: "closedTests", label: "مغلقة", value: String(summary.closedTests) },
    { key: "totalStudents", label: "الطلاب النشطون", value: String(summary.totalStudents) },
    { key: "totalSubmissions", label: "التسليمات", value: String(summary.totalSubmissions) },
    { key: "pendingSubmissions", label: "لم يبدأ", value: String(summary.pendingSubmissions) },
    { key: "submittedSubmissions", label: "مُسلّم", value: String(summary.submittedSubmissions) },
    { key: "gradedSubmissions", label: "مُصحّح", value: String(summary.gradedSubmissions) },
    { key: "completionRate", label: "نسبة الإنجاز", value: `${summary.completionRate}%` },
    { key: "gradingRate", label: "نسبة التصحيح", value: `${summary.gradingRate}%` },
    { key: "averageScore", label: "متوسط الدرجات", value: String(summary.averageScore) },
  ];
}

export function testStatusLabel(status: string): string {
  return TEST_STATUS_LABELS[status as keyof typeof TEST_STATUS_LABELS] ?? status;
}

export function testSubmissionStatusLabel(status: string): string {
  return (
    TEST_SUBMISSION_STATUS_LABELS[status as keyof typeof TEST_SUBMISSION_STATUS_LABELS] ?? status
  );
}

export function assertNoClientTeacherId(filter: ReportsDateFilter): void {
  if ("teacherId" in filter || "teacher_id" in filter) {
    throw new Error("Test report filters must not include teacher_id");
  }
}
