import type {
  TestCreateInput,
  TestStatus,
  TeacherTest,
} from "./test.service";
import type {
  TestOptionInput,
  TestQuestion,
  TestQuestionCreateInput,
  TestQuestionType,
} from "./test-question.service";

export const TEST_STATUS_LABELS: Record<TestStatus, string> = {
  draft: "مسودة",
  published: "منشورة",
  closed: "مغلقة",
};

export const TEST_STATUS_OPTIONS: ReadonlyArray<{
  value: TestStatus;
  label: string;
}> = [
  { value: "draft", label: TEST_STATUS_LABELS.draft },
  { value: "published", label: TEST_STATUS_LABELS.published },
  { value: "closed", label: TEST_STATUS_LABELS.closed },
];

export const TEST_QUESTION_TYPE_LABELS: Record<TestQuestionType, string> = {
  multiple_choice: "اختيار من متعدد",
  true_false: "صح / خطأ",
};

export const TEST_EMPTY_TITLE = "لا توجد اختبارات بعد";
export const TEST_EMPTY_DESCRIPTION =
  "أنشئ اختباراً جديداً، أضف الأسئلة، ثم انشره عندما يصبح جاهزاً.";
export const TEST_ERROR_TITLE = "تعذر تحميل الاختبارات";
export const TEST_ERROR_DESCRIPTION = "حدث خطأ أثناء قراءة اختباراتك. حاول مرة أخرى.";
export const TEST_STATUS_HINT =
  "المسودة قابلة للتعديل والحذف. بعد النشر يمكن الإغلاق. الاختبار المغلق للعرض فقط.";

export type TestFormState = {
  title: string;
  instructions: string;
  subject: string;
  grade: string;
  className: string;
  dueDate: string;
  lessonSessionId: string;
  sessionPickerDate: string;
};

export function emptyTestForm(overrides: Partial<TestFormState> = {}): TestFormState {
  return {
    title: "",
    instructions: "",
    subject: "",
    grade: "",
    className: "",
    dueDate: "",
    lessonSessionId: "",
    sessionPickerDate: "",
    ...overrides,
  };
}

export function testToFormState(test: TeacherTest, sessionPickerDate = ""): TestFormState {
  return {
    title: test.title,
    instructions: test.instructions,
    subject: test.subject ?? "",
    grade: test.grade ?? "",
    className: test.className ?? "",
    dueDate: test.dueDate ?? "",
    lessonSessionId: test.lessonSessionId ?? "",
    sessionPickerDate,
  };
}

export function formStateToCreateInput(state: TestFormState): TestCreateInput {
  return {
    title: state.title.trim(),
    instructions: state.instructions.trim(),
    subject: state.subject.trim() || null,
    grade: state.grade.trim() || null,
    className: state.className.trim() || null,
    dueDate: state.dueDate.trim() || null,
    lessonSessionId: state.lessonSessionId.trim() || null,
  };
}

export type TestListItemView = {
  id: string;
  title: string;
  status: TestStatus;
  statusLabel: string;
  dueDateLabel: string;
  metaLabel: string;
  hasLessonSession: boolean;
  canEdit: boolean;
  canPublish: boolean;
  canClose: boolean;
  canDelete: boolean;
  canManageQuestions: boolean;
};

export function toTestListItemView(test: TeacherTest): TestListItemView {
  const metaParts = [test.subject, test.grade, test.className].filter(Boolean);
  const isDraft = test.status === "draft";
  const isPublished = test.status === "published";
  const isClosed = test.status === "closed";

  return {
    id: test.id,
    title: test.title,
    status: test.status,
    statusLabel: TEST_STATUS_LABELS[test.status],
    dueDateLabel: test.dueDate ? formatTestDate(test.dueDate) : "بدون موعد",
    metaLabel: metaParts.length > 0 ? metaParts.join(" · ") : "بدون تصنيف",
    hasLessonSession: Boolean(test.lessonSessionId),
    canEdit: !isClosed,
    canPublish: isDraft,
    canClose: isPublished,
    canDelete: isDraft,
    canManageQuestions: !isClosed,
  };
}

export function formatTestDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("ar-SA", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date(`${iso}T00:00:00Z`));
  } catch {
    return iso;
  }
}

export function formatSessionOptionLabel(session: {
  periodNumber: number;
  lessonTitle: string;
  subject?: string;
  sessionDate: string;
}): string {
  const subject = session.subject?.trim() ? ` — ${session.subject}` : "";
  return `${formatTestDate(session.sessionDate)} · الحصة ${session.periodNumber} — ${session.lessonTitle}${subject}`;
}

export function filterTestsByTitle(tests: TeacherTest[], query: string): TeacherTest[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return tests;
  return tests.filter((test) => test.title.toLowerCase().includes(needle));
}

export type QuestionDraftOption = {
  label: string;
  isCorrect: boolean;
};

export type QuestionDraft = {
  localId: string;
  type: TestQuestionType;
  prompt: string;
  points: string;
  options: QuestionDraftOption[];
  correctBoolean: boolean;
};

export function emptyQuestionDraft(
  overrides: Partial<QuestionDraft> = {},
): QuestionDraft {
  return {
    localId: `local-${Math.random().toString(36).slice(2, 10)}`,
    type: "multiple_choice",
    prompt: "",
    points: "1",
    options: [
      { label: "", isCorrect: true },
      { label: "", isCorrect: false },
      { label: "", isCorrect: false },
      { label: "", isCorrect: false },
    ],
    correctBoolean: true,
    ...overrides,
  };
}

export function questionToDraft(question: TestQuestion): QuestionDraft {
  if (question.type === "true_false") {
    const correct = question.options.find((option) => option.isCorrect);
    const isTrue = correct?.label === "صواب";
    return emptyQuestionDraft({
      localId: question.id,
      type: "true_false",
      prompt: question.prompt,
      points: String(question.points),
      options: [],
      correctBoolean: isTrue,
    });
  }

  return emptyQuestionDraft({
    localId: question.id,
    type: "multiple_choice",
    prompt: question.prompt,
    points: String(question.points),
    options: question.options.map((option) => ({
      label: option.label,
      isCorrect: option.isCorrect,
    })),
    correctBoolean: true,
  });
}

export function validateQuestionDraft(draft: QuestionDraft): string | null {
  if (!draft.prompt.trim()) return "نص السؤال مطلوب.";
  const points = Number(draft.points);
  if (!Number.isFinite(points) || points < 0) {
    return "درجة السؤال يجب أن تكون رقماً أكبر من أو يساوي صفر.";
  }

  if (draft.type === "multiple_choice") {
    const filled = draft.options
      .map((option) => ({
        label: option.label.trim(),
        isCorrect: option.isCorrect,
      }))
      .filter((option) => option.label.length > 0);
    if (filled.length < 2) return "سؤال الاختيار من متعدد يحتاج خيارين على الأقل.";
    const correctCount = filled.filter((option) => option.isCorrect).length;
    if (correctCount !== 1) return "يجب تحديد إجابة صحيحة واحدة فقط.";
    return null;
  }

  return null;
}

export function draftToQuestionCreateInput(
  draft: QuestionDraft,
  position: number,
): Omit<TestQuestionCreateInput, "testId"> {
  const points = Number(draft.points);
  if (draft.type === "true_false") {
    return {
      type: "true_false",
      prompt: draft.prompt.trim(),
      position,
      points,
      correctBoolean: draft.correctBoolean,
    };
  }

  const options: TestOptionInput[] = draft.options
    .map((option, index) => ({
      label: option.label.trim(),
      isCorrect: option.isCorrect,
      position: index,
    }))
    .filter((option) => option.label.length > 0);

  return {
    type: "multiple_choice",
    prompt: draft.prompt.trim(),
    position,
    points,
    options,
  };
}

export function moveQuestionDraft(
  drafts: QuestionDraft[],
  localId: string,
  direction: -1 | 1,
): QuestionDraft[] {
  const index = drafts.findIndex((draft) => draft.localId === localId);
  if (index < 0) return drafts;
  const next = index + direction;
  if (next < 0 || next >= drafts.length) return drafts;
  const copy = [...drafts];
  const [item] = copy.splice(index, 1);
  copy.splice(next, 0, item!);
  return copy;
}

/** Filters must never carry a client teacher_id. */
export function assertNoClientTeacherId(value: object): void {
  if ("teacherId" in value || "teacher_id" in value) {
    throw new Error("Tests UI must not include teacher_id");
  }
}
