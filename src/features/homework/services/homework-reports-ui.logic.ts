import type { ReportsDateFilter } from "@/features/reports/services/reports.service";
import {
  buildReportsDateFilter,
  REPORTS_FILTER_OPTIONS,
  type ReportsFilterKind,
} from "@/features/reports/services/reports-ui.logic";

import { HOMEWORK_STATUS_LABELS } from "./homework-ui.logic";
import { SUBMISSION_STATUS_LABELS } from "./students-ui.logic";
import type { HomeworkReportSummary } from "./homework-reports.service";

export { REPORTS_FILTER_OPTIONS, buildReportsDateFilter };
export type { ReportsFilterKind };

export const HOMEWORK_REPORTS_EMPTY_TITLE = "لا توجد واجبات في الفترة المحددة";
export const HOMEWORK_REPORTS_EMPTY_DESCRIPTION =
  "لم يُعثر على واجبات بتاريخ استحقاق ضمن النطاق المختار. الواجبات بلا موعد استحقاق لا تدخل تقرير الفترة.";
export const HOMEWORK_REPORTS_ERROR_TITLE = "تعذر تحميل تقارير الواجبات";
export const HOMEWORK_REPORTS_HINT =
  "نسبة الإنجاز = (مُسلّم + مُصحّح) ÷ التسليمات المسجّلة. نسبة التصحيح = مُصحّح ÷ (مُسلّم + مُصحّح).";

export type HomeworkSummaryItem = {
  key: keyof HomeworkReportSummary;
  label: string;
  value: string;
};

export function buildHomeworkSummaryItems(summary: HomeworkReportSummary): HomeworkSummaryItem[] {
  return [
    { key: "totalHomework", label: "إجمالي الواجبات", value: String(summary.totalHomework) },
    { key: "draftHomework", label: "مسودات", value: String(summary.draftHomework) },
    { key: "assignedHomework", label: "مكلّفة", value: String(summary.assignedHomework) },
    { key: "collectedHomework", label: "مجمّعة", value: String(summary.collectedHomework) },
    { key: "correctedHomework", label: "مصحّحة", value: String(summary.correctedHomework) },
    { key: "totalStudents", label: "الطلاب النشطون", value: String(summary.totalStudents) },
    { key: "totalSubmissions", label: "التسليمات", value: String(summary.totalSubmissions) },
    { key: "pendingSubmissions", label: "لم يسلّم", value: String(summary.pendingSubmissions) },
    { key: "submittedSubmissions", label: "مُسلّم", value: String(summary.submittedSubmissions) },
    { key: "gradedSubmissions", label: "مُصحّح", value: String(summary.gradedSubmissions) },
    { key: "completionRate", label: "نسبة الإنجاز", value: `${summary.completionRate}%` },
    { key: "gradingRate", label: "نسبة التصحيح", value: `${summary.gradingRate}%` },
    { key: "averageScore", label: "متوسط الدرجات", value: String(summary.averageScore) },
  ];
}

export function homeworkStatusLabel(status: string): string {
  return HOMEWORK_STATUS_LABELS[status as keyof typeof HOMEWORK_STATUS_LABELS] ?? status;
}

export function submissionStatusLabel(status: string): string {
  return SUBMISSION_STATUS_LABELS[status as keyof typeof SUBMISSION_STATUS_LABELS] ?? status;
}

export function assertNoClientTeacherId(filter: ReportsDateFilter): void {
  if ("teacherId" in filter || "teacher_id" in filter) {
    throw new Error("Homework report filters must not include teacher_id");
  }
}
