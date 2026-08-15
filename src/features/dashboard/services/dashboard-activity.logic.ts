import {
  homeworkDeepLink,
  testDeepLink,
  type CorrectionInboxItem,
} from "@/features/corrections/services/corrections-inbox.logic";

export const DASHBOARD_ACTIVITY_LIMIT = 15;
export const DASHBOARD_PENDING_LIMIT = 15;

export type DashboardPendingKind =
  | "homework_submitted"
  | "test_submitted"
  | "homework_needs_feedback"
  | "test_needs_feedback";

export type DashboardPendingTask = {
  id: string;
  kind: DashboardPendingKind;
  title: string;
  studentName: string;
  actionLabel: string;
  href: string;
  /** Sort key — may be null; nulls sort last among pending. */
  at: string | null;
};

export type DashboardActivityKind =
  | "homework_submitted"
  | "test_submitted"
  | "homework_graded"
  | "test_graded";

export type DashboardActivityItem = {
  id: string;
  kind: DashboardActivityKind;
  title: string;
  studentName: string;
  label: string;
  href: string;
  /** Required for activity rows — events without a reliable timestamp are dropped. */
  at: string;
};

export type GradedSubmissionForDashboard = {
  submissionId: string;
  parentId: string;
  parentTitle: string | null;
  studentName: string | null;
  status: string;
  feedback: string | null;
  submittedAt: string | null;
  gradedAt: string | null;
  source: "homework" | "test";
};

export const DASHBOARD_PENDING_EMPTY_TITLE = "لا توجد مهام معلقة";
export const DASHBOARD_PENDING_EMPTY_DESCRIPTION =
  "عندما يُسلَّم واجب أو اختبار، ستظهر هنا مهام التصحيح.";
export const DASHBOARD_ACTIVITY_EMPTY_TITLE = "لا يوجد نشاط حديث";
export const DASHBOARD_ACTIVITY_EMPTY_DESCRIPTION =
  "ستظهر هنا آخر التسليمات والتصحيحات من واجباتك واختباراتك.";
export const DASHBOARD_VIEW_ALL_CORRECTIONS = "عرض الكل";

export function isEmptyFeedback(feedback: string | null | undefined): boolean {
  return !feedback?.trim();
}

export function pendingTaskFromInboxItem(item: CorrectionInboxItem): DashboardPendingTask {
  const kind: DashboardPendingKind =
    item.source === "homework" ? "homework_submitted" : "test_submitted";
  const actionLabel =
    item.source === "homework" ? "يحتاج تصحيح" : "يحتاج تصحيح تلقائي";

  return {
    id: `pending:${item.id}`,
    kind,
    title: item.title,
    studentName: item.studentName,
    actionLabel,
    href: item.href,
    at: item.submittedAt,
  };
}

export function pendingFeedbackTaskFromGraded(
  row: GradedSubmissionForDashboard,
): DashboardPendingTask | null {
  if (row.status !== "graded") return null;
  if (!isEmptyFeedback(row.feedback)) return null;
  if (!row.submissionId || !row.parentId) return null;

  const isHomework = row.source === "homework";
  return {
    id: `pending-feedback:${row.source}:${row.submissionId}`,
    kind: isHomework ? "homework_needs_feedback" : "test_needs_feedback",
    title: row.parentTitle?.trim() || (isHomework ? "واجب بدون عنوان" : "اختبار بدون عنوان"),
    studentName: row.studentName?.trim() || "طالب غير معروف",
    actionLabel: "يحتاج ملاحظات",
    href: isHomework ? homeworkDeepLink(row.parentId) : testDeepLink(row.parentId),
    at: row.gradedAt,
  };
}

export function buildPendingTasks(input: {
  inbox: CorrectionInboxItem[];
  gradedNeedingFeedback: GradedSubmissionForDashboard[];
  limit?: number;
}): DashboardPendingTask[] {
  const limit = input.limit ?? DASHBOARD_PENDING_LIMIT;
  const tasks: DashboardPendingTask[] = [];

  for (const item of input.inbox) {
    tasks.push(pendingTaskFromInboxItem(item));
  }
  for (const row of input.gradedNeedingFeedback) {
    const task = pendingFeedbackTaskFromGraded(row);
    if (task) tasks.push(task);
  }

  return sortPendingTasks(tasks).slice(0, limit);
}

export function sortPendingTasks(tasks: DashboardPendingTask[]): DashboardPendingTask[] {
  return [...tasks].sort((a, b) => {
    const aTime = a.at ? Date.parse(a.at) : 0;
    const bTime = b.at ? Date.parse(b.at) : 0;
    if (aTime !== bTime) return bTime - aTime;
    return a.id.localeCompare(b.id);
  });
}

export function activityFromSubmittedInbox(
  item: CorrectionInboxItem,
): DashboardActivityItem | null {
  if (!item.submittedAt) return null;
  const kind: DashboardActivityKind =
    item.source === "homework" ? "homework_submitted" : "test_submitted";
  return {
    id: `activity:submitted:${item.id}`,
    kind,
    title: item.title,
    studentName: item.studentName,
    label: item.source === "homework" ? "تم تسليم واجب" : "تم تسليم اختبار",
    href: item.href,
    at: item.submittedAt,
  };
}

export function activityFromGraded(
  row: GradedSubmissionForDashboard,
): DashboardActivityItem | null {
  if (row.status !== "graded") return null;
  if (!row.gradedAt) return null;
  if (!row.submissionId || !row.parentId) return null;

  const isHomework = row.source === "homework";
  return {
    id: `activity:graded:${row.source}:${row.submissionId}`,
    kind: isHomework ? "homework_graded" : "test_graded",
    title: row.parentTitle?.trim() || (isHomework ? "واجب بدون عنوان" : "اختبار بدون عنوان"),
    studentName: row.studentName?.trim() || "طالب غير معروف",
    label: isHomework ? "تم تصحيح واجب" : "تم تصحيح اختبار",
    href: isHomework ? homeworkDeepLink(row.parentId) : testDeepLink(row.parentId),
    at: row.gradedAt,
  };
}

export function buildActivityFeed(input: {
  inbox: CorrectionInboxItem[];
  graded: GradedSubmissionForDashboard[];
  limit?: number;
}): DashboardActivityItem[] {
  const limit = input.limit ?? DASHBOARD_ACTIVITY_LIMIT;
  const items: DashboardActivityItem[] = [];

  for (const item of input.inbox) {
    const row = activityFromSubmittedInbox(item);
    if (row) items.push(row);
  }
  for (const graded of input.graded) {
    const row = activityFromGraded(graded);
    if (row) items.push(row);
  }

  return sortActivityItems(items).slice(0, limit);
}

export function sortActivityItems(items: DashboardActivityItem[]): DashboardActivityItem[] {
  return [...items].sort((a, b) => {
    const aTime = Date.parse(a.at);
    const bTime = Date.parse(b.at);
    if (aTime !== bTime) return bTime - aTime;
    return a.id.localeCompare(b.id);
  });
}

export function assertNoClientTeacherId(view: object): void {
  const keys = Object.keys(view);
  if (keys.includes("teacherId") || keys.includes("teacher_id")) {
    throw new Error("Dashboard activity view must not expose teacher_id");
  }
}
