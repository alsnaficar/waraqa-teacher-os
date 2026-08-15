import type { HomeworkSubmission, HomeworkSubmissionStatus } from "./homework-submission.service";
import type { Student } from "./student.service";

export const SUBMISSION_STATUS_LABELS: Record<HomeworkSubmissionStatus, string> = {
  pending: "لم يسلّم",
  submitted: "مُسلّم",
  graded: "مُصحّح",
};

export const SUBMISSION_STATUS_HINT =
  "حالة «مُصحّح» تعني أن التسليم صُحّح يدوياً. التصحيح بالذكاء الاصطناعي غير مفعّل بعد.";

export const STUDENTS_EMPTY_TITLE = "لا يوجد طلاب بعد";
export const STUDENTS_EMPTY_DESCRIPTION =
  "أضف طلابك يدوياً أو الصق قائمة أسماء بعد اختيار الفصل. الطلاب سجلات يملكها المعلم وليست حسابات دخول.";
export const STUDENTS_ERROR_TITLE = "تعذر تحميل الطلاب";
export const STUDENTS_SELECT_CLASS_HINT =
  "اختر الصف ثم الفصل لعرض الطلاب أو استيراد قائمة.";
export const SUBMISSIONS_EMPTY_TITLE = "لا توجد تسليمات لهذا الواجب";
export const SUBMISSIONS_EMPTY_DESCRIPTION =
  "أنشئ سجلات تسليم للطلاب، أو اختر واجباً آخر. يمكنك تصحيح التسليمات المُسلَّمة يدوياً.";
export const SUBMISSIONS_ERROR_TITLE = "تعذر تحميل التسليمات";

export function formatScoreLabel(
  score: number | null,
  maxScore?: number | null,
): string {
  if (score == null) return "—";
  if (maxScore != null && Number.isFinite(maxScore)) {
    return `${score}/${maxScore}`;
  }
  return String(score);
}

export function canOpenGradingDialog(status: HomeworkSubmissionStatus): boolean {
  return status === "submitted" || status === "graded";
}

export function gradingActionLabel(status: HomeworkSubmissionStatus): string {
  return status === "graded" ? "إعادة التصحيح" : "تصحيح";
}

export type StudentFormState = {
  fullName: string;
  classId: string;
  gradeId: string;
  studentCode: string;
  active: boolean;
};

export function emptyStudentForm(overrides: Partial<StudentFormState> = {}): StudentFormState {
  return {
    fullName: "",
    classId: "",
    gradeId: "",
    studentCode: "",
    active: true,
    ...overrides,
  };
}

export function studentToFormState(student: Student): StudentFormState {
  return {
    fullName: student.fullName,
    classId: student.classId ?? "",
    gradeId: student.gradeId ?? "",
    studentCode: student.studentCode ?? "",
    active: student.active,
  };
}

export function formStateToStudentInput(state: StudentFormState) {
  return {
    fullName: state.fullName.trim(),
    classId: state.classId.trim() || null,
    gradeId: state.gradeId.trim() || null,
    studentCode: state.studentCode.trim() || null,
    active: state.active,
  };
}

export type StudentListItemView = {
  id: string;
  fullName: string;
  studentCodeLabel: string;
  classLabel: string;
  gradeLabel: string;
  activeLabel: string;
  active: boolean;
};

export function toStudentListItemView(
  student: Student,
  catalogs: {
    classNameById: Map<string, string>;
    gradeNameById: Map<string, string>;
  },
): StudentListItemView {
  return {
    id: student.id,
    fullName: student.fullName,
    studentCodeLabel: student.studentCode?.trim() || "بدون رمز",
    classLabel: student.classId
      ? (catalogs.classNameById.get(student.classId) ?? "فصل غير معروف")
      : "بدون فصل",
    gradeLabel: student.gradeId
      ? (catalogs.gradeNameById.get(student.gradeId) ?? "صف غير معروف")
      : "بدون صف",
    activeLabel: student.active ? "نشط" : "موقوف",
    active: student.active,
  };
}

export function filterStudents(
  students: Student[],
  options: {
    search?: string;
    classId?: string | "all";
    gradeId?: string | "all";
    active?: "all" | "active" | "inactive";
  },
): Student[] {
  const search = options.search?.trim().toLowerCase() ?? "";
  return students.filter((student) => {
    if (options.classId && options.classId !== "all" && student.classId !== options.classId) {
      return false;
    }
    if (options.gradeId && options.gradeId !== "all" && student.gradeId !== options.gradeId) {
      return false;
    }
    if (options.active === "active" && !student.active) return false;
    if (options.active === "inactive" && student.active) return false;
    if (!search) return true;
    const haystack = `${student.fullName} ${student.studentCode ?? ""}`.toLowerCase();
    return haystack.includes(search);
  });
}

export type SubmissionListItemView = {
  id: string;
  studentId: string;
  studentName: string;
  studentCodeLabel: string;
  status: HomeworkSubmissionStatus;
  statusLabel: string;
  submittedAtLabel: string;
  scoreLabel: string;
  feedbackLabel: string;
};

export function formatSubmissionDate(iso: string | null): string {
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

export function toSubmissionListItemView(
  submission: HomeworkSubmission,
  student: Student | undefined,
  options: { maxScore?: number | null } = {},
): SubmissionListItemView {
  return {
    id: submission.id,
    studentId: submission.studentId,
    studentName: student?.fullName ?? "طالب غير معروف",
    studentCodeLabel: student?.studentCode?.trim() || "بدون رمز",
    status: submission.status,
    statusLabel: SUBMISSION_STATUS_LABELS[submission.status],
    submittedAtLabel: formatSubmissionDate(submission.submittedAt),
    scoreLabel: formatScoreLabel(submission.score, options.maxScore),
    feedbackLabel: submission.feedback?.trim() || "—",
  };
}

export function studentsWithoutSubmission(
  students: Student[],
  submissions: HomeworkSubmission[],
): Student[] {
  const taken = new Set(submissions.map((row) => row.studentId));
  return students.filter((student) => student.active && !taken.has(student.id));
}

export function assertNoClientTeacherId(value: object): void {
  if ("teacherId" in value || "teacher_id" in value) {
    throw new Error("Homework UI must not include teacher_id");
  }
}
