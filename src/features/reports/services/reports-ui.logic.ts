import type { LessonSessionStatus } from "@/features/lesson-sessions/types";

import type {
  LessonSessionReportStats,
  ReportsDateFilter,
} from "./reports.service";

export type ReportsFilterKind = "today" | "week" | "month" | "custom";

export const REPORTS_FILTER_OPTIONS: ReadonlyArray<{
  kind: ReportsFilterKind;
  label: string;
}> = [
  { kind: "today", label: "اليوم" },
  { kind: "week", label: "هذا الأسبوع" },
  { kind: "month", label: "هذا الشهر" },
  { kind: "custom", label: "فترة مخصصة" },
];

/** Arabic labels for the reports summary + detail (task wording). */
export const REPORT_STATUS_LABELS: Record<LessonSessionStatus, string> = {
  scheduled: "مجدولة",
  preparing: "قيد الإعداد",
  prepared: "معدة",
  completed: "مكتملة",
  cancelled: "ملغاة",
};

export const REPORTS_EMPTY_TITLE = "لا توجد حصص درسية في الفترة المحددة";
export const REPORTS_EMPTY_DESCRIPTION =
  "لم يُعثر على أي حصة في نطاق التواريخ المختار. جرّب فترة أخرى أو أنشئ حصصك من جدولك الأسبوعي.";
export const REPORTS_ERROR_TITLE = "تعذر تحميل التقرير";
export const REPORTS_ERROR_DESCRIPTION = "حدث خطأ أثناء قراءة حصصك. حاول مرة أخرى.";

export function reportLockLabel(lessonLocked: boolean): string {
  return lessonLocked ? "مقفلة" : "غير مقفلة";
}

/**
 * Builds the ReportsService filter contract from UI selection.
 * Never accepts or forwards teacher_id.
 */
export function buildReportsDateFilter(
  kind: ReportsFilterKind,
  custom?: { from: string; to: string },
): ReportsDateFilter {
  if (kind === "custom") {
    const from = custom?.from?.trim() ?? "";
    const to = custom?.to?.trim() ?? "";
    if (!from || !to) {
      throw new Error("يجب تحديد تاريخ البداية والنهاية للفترة المخصصة.");
    }
    if (from > to) {
      throw new Error("تاريخ البداية يجب أن يكون قبل تاريخ النهاية أو مساوياً له.");
    }
    return { kind: "custom", from, to };
  }

  return { kind };
}

export type ReportSummaryItem = {
  key: keyof LessonSessionReportStats;
  label: string;
  value: string;
};

export function buildReportSummaryItems(stats: LessonSessionReportStats): ReportSummaryItem[] {
  return [
    { key: "total", label: "إجمالي الحصص", value: String(stats.total) },
    { key: "scheduled", label: "مجدولة", value: String(stats.scheduled) },
    { key: "preparing", label: "قيد الإعداد", value: String(stats.preparing) },
    { key: "prepared", label: "معدة", value: String(stats.prepared) },
    { key: "completed", label: "مكتملة", value: String(stats.completed) },
    { key: "cancelled", label: "ملغاة", value: String(stats.cancelled) },
    { key: "completionRate", label: "نسبة الإنجاز", value: `${stats.completionRate}%` },
  ];
}

/** Guard used by tests: filters must never carry a client teacher_id. */
export function assertNoClientTeacherId(filter: ReportsDateFilter): void {
  if ("teacherId" in filter || "teacher_id" in filter) {
    throw new Error("Reports filters must not include teacher_id");
  }
}
