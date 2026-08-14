import type { Student } from "@/features/homework/services/student.service";

import type { TestStatus } from "./test.service";
import type { TestQuestion } from "./test-question.service";
import type { TestAnswer } from "./test-answer.service";
import type {
  TestSubmission,
  TestSubmissionStatus,
} from "./test-submission.service";

export const TEST_SUBMISSION_STATUS_LABELS: Record<TestSubmissionStatus, string> = {
  pending: "لم يبدأ",
  submitted: "مُسلّم",
  graded: "مُصحّح",
};

export function formatTestScoreLabel(
  score: number | null,
  maxScore?: number | null,
): string {
  if (score == null) return "—";
  if (maxScore != null && Number.isFinite(maxScore)) {
    return `${score}/${maxScore}`;
  }
  return String(score);
}

export const TEST_SUBMISSIONS_EMPTY_TITLE = "لا توجد تسليمات بعد";
export const TEST_SUBMISSIONS_EMPTY_DESCRIPTION =
  "أسند الاختبار للطلاب النشطين لمتابعة حالة التسليم.";
export const TEST_SUBMISSIONS_ERROR_TITLE = "تعذر تحميل التسليمات";
export const TEST_SUBMISSIONS_HINT =
  "الإسناد متاح للاختبارات المنشورة فقط. سجّل إجابات الطلاب المعلّقين ثم علّمها كمُسلّمة قبل التصحيح التلقائي.";

export type TestSubmissionListItemView = {
  id: string;
  studentId: string;
  studentName: string;
  studentCodeLabel: string;
  status: TestSubmissionStatus;
  statusLabel: string;
  submittedAtLabel: string;
  gradedAtLabel: string;
  scoreLabel: string;
  feedbackLabel: string;
  canAutoGrade: boolean;
  autoGradeActionLabel: string;
  canEnterAnswers: boolean;
  answerEntryActionLabel: string;
  canEditFeedback: boolean;
  feedbackActionLabel: string;
};

export type AnswerDraftMap = Record<
  string,
  {
    selectedOptionId: string | null;
    booleanAnswer: boolean | null;
  }
>;

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

export function canAutoGradeTestSubmission(status: TestSubmissionStatus): boolean {
  return status === "submitted" || status === "graded";
}

export function autoGradeActionLabel(status: TestSubmissionStatus): string {
  return status === "graded" ? "إعادة التصحيح التلقائي" : "تصحيح تلقائي";
}

export function canEnterTestAnswers(
  status: TestSubmissionStatus,
  testStatus: TestStatus,
): boolean {
  return testStatus === "published" && status === "pending";
}

export function isTestAnswerEntryReadOnly(status: TestSubmissionStatus): boolean {
  return status === "submitted" || status === "graded";
}

export function answerEntryActionLabel(status: TestSubmissionStatus): string {
  if (status === "pending") return "تسجيل الإجابات";
  if (status === "submitted") return "عرض الإجابات";
  return "عرض الإجابات";
}

export const TEST_FEEDBACK_ACTION_LABEL = "ملاحظات المعلم";

export function canEditTestFeedback(status: TestSubmissionStatus): boolean {
  return status === "graded";
}

export function toTestSubmissionListItemView(
  submission: TestSubmission,
  student: Student | undefined,
  testStatus: TestStatus,
): TestSubmissionListItemView {
  return {
    id: submission.id,
    studentId: submission.studentId,
    studentName: student?.fullName ?? "طالب غير معروف",
    studentCodeLabel: student?.studentCode?.trim() || "بدون رمز",
    status: submission.status,
    statusLabel: TEST_SUBMISSION_STATUS_LABELS[submission.status],
    submittedAtLabel: formatTestSubmissionDate(submission.submittedAt),
    gradedAtLabel: formatTestSubmissionDate(submission.gradedAt),
    scoreLabel: formatTestScoreLabel(submission.score, submission.maxScore),
    feedbackLabel: submission.feedback?.trim() || "—",
    canAutoGrade: canAutoGradeTestSubmission(submission.status),
    autoGradeActionLabel: autoGradeActionLabel(submission.status),
    canEnterAnswers: canEnterTestAnswers(submission.status, testStatus),
    answerEntryActionLabel: answerEntryActionLabel(submission.status),
    canEditFeedback: canEditTestFeedback(submission.status),
    feedbackActionLabel: TEST_FEEDBACK_ACTION_LABEL,
  };
}

export function answersToDraftMap(answers: TestAnswer[]): AnswerDraftMap {
  const draft: AnswerDraftMap = {};
  for (const answer of answers) {
    draft[answer.questionId] = {
      selectedOptionId: answer.selectedOptionId,
      booleanAnswer: answer.booleanAnswer,
    };
  }
  return draft;
}

export function setMcqDraft(
  draft: AnswerDraftMap,
  questionId: string,
  selectedOptionId: string,
): AnswerDraftMap {
  return {
    ...draft,
    [questionId]: {
      selectedOptionId,
      booleanAnswer: null,
    },
  };
}

export function setTrueFalseDraft(
  draft: AnswerDraftMap,
  questionId: string,
  booleanAnswer: boolean,
): AnswerDraftMap {
  return {
    ...draft,
    [questionId]: {
      selectedOptionId: null,
      booleanAnswer,
    },
  };
}

export function draftToUpsertInputs(
  submissionId: string,
  questions: TestQuestion[],
  draft: AnswerDraftMap,
): Array<{
  submissionId: string;
  questionId: string;
  selectedOptionId: string | null;
  booleanAnswer: boolean | null;
}> {
  return questions
    .map((question) => {
      const row = draft[question.id];
      if (!row) return null;
      if (question.type === "multiple_choice") {
        if (!row.selectedOptionId) return null;
        return {
          submissionId,
          questionId: question.id,
          selectedOptionId: row.selectedOptionId,
          booleanAnswer: null,
        };
      }
      if (row.booleanAnswer === null || row.booleanAnswer === undefined) return null;
      return {
        submissionId,
        questionId: question.id,
        selectedOptionId: null,
        booleanAnswer: row.booleanAnswer,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row != null);
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
