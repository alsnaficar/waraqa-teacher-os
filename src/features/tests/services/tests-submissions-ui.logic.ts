import type { Student } from "@/features/homework/services/student.service";

import type { TestStatus } from "./test.service";
import type {
  TestSubmission,
  TestSubmissionStatus,
} from "./test-submission.service";

export const TEST_SUBMISSION_STATUS_LABELS: Record<TestSubmissionStatus, string> = {
  pending: "لم يبدأ",
  submitted: "مُسلّم",
  graded: "مُصحّح",
};

export const TEST_SUBMISSIONS_EMPTY_TITLE = "لا توجد تسليمات بعد";
export const TEST_SUBMISSIONS_EMPTY_DESCRIPTION =
  "أسند الاختبار للطلاب النشطين لمتابعة حالة التسليم.";
export const TEST_SUBMISSIONS_ERROR_TITLE = "تعذر تحميل التسليمات";
export const TEST_SUBMISSIONS_HINT =
  "الإسناد متاح للاختبارات المنشورة فقط. الاختبار المغلق للعرض فقط.";

export type TestSubmissionListItemView = {
  id: string;
  studentId: string;
  studentName: string;
  studentCodeLabel: string;
  status: TestSubmissionStatus;
  statusLabel: string;
  submittedAtLabel: string;
};

export function formatTestSubmissionDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("ar-SA", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function toTestSubmissionListItemView(
  submission: TestSubmission,
  student: Student | undefined,
): TestSubmissionListItemView {
  return {
    id: submission.id,
    studentId: submission.studentId,
    studentName: student?.fullName ?? "طالب غير معروف",
    studentCodeLabel: student?.studentCode?.trim() || "بدون رمز",
    status: submission.status,
    statusLabel: TEST_SUBMISSION_STATUS_LABELS[submission.status],
    submittedAtLabel: formatTestSubmissionDate(submission.submittedAt),
  };
}

export function canAssignTestSubmissions(testStatus: TestStatus): boolean {
  return testStatus === "published";
}

export function canViewTestSubmissions(testStatus: TestStatus): boolean {
  return testStatus === "published" || testStatus === "closed";
}

export function studentsWithoutTestSubmission(
  students: Student[],
  submissions: Array<{ studentId: string }>,
): Student[] {
  const assigned = new Set(submissions.map((row) => row.studentId));
  return students.filter((student) => student.active && !assigned.has(student.id));
}

export function filterAssignableStudents(
  students: Student[],
  options: {
    search?: string;
    classId?: string | "all";
    submissions?: Array<{ studentId: string }>;
  },
): Student[] {
  const search = options.search?.trim().toLowerCase() ?? "";
  const assigned = new Set((options.submissions ?? []).map((row) => row.studentId));

  return students.filter((student) => {
    if (!student.active) return false;
    if (assigned.has(student.id)) return false;
    if (options.classId && options.classId !== "all" && student.classId !== options.classId) {
      return false;
    }
    if (!search) return true;
    const haystack = `${student.fullName} ${student.studentCode ?? ""}`.toLowerCase();
    return haystack.includes(search);
  });
}

export function toggleStudentSelection(
  selectedIds: readonly string[],
  studentId: string,
): string[] {
  if (selectedIds.includes(studentId)) {
    return selectedIds.filter((id) => id !== studentId);
  }
  return [...selectedIds, studentId];
}
