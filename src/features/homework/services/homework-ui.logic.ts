import type {
  Homework,
  HomeworkCreateInput,
  HomeworkStatus,
} from "./homework.service";

export const HOMEWORK_STATUS_LABELS: Record<HomeworkStatus, string> = {
  draft: "مسودة",
  assigned: "مكلّف",
  collected: "مُسلّم",
  corrected: "مُصحّح",
};

export const HOMEWORK_STATUS_OPTIONS: ReadonlyArray<{
  value: HomeworkStatus;
  label: string;
}> = [
  { value: "draft", label: HOMEWORK_STATUS_LABELS.draft },
  { value: "assigned", label: HOMEWORK_STATUS_LABELS.assigned },
  { value: "collected", label: HOMEWORK_STATUS_LABELS.collected },
  { value: "corrected", label: HOMEWORK_STATUS_LABELS.corrected },
];

export const HOMEWORK_EMPTY_TITLE = "لا توجد واجبات بعد";
export const HOMEWORK_EMPTY_DESCRIPTION =
  "أنشئ واجباً جديداً للمادة والصف. حالات «مُسلّم» و«مُصحّح» تخص سجل الواجب نفسه وليست تسليمات طلاب حتى الآن.";
export const HOMEWORK_ERROR_TITLE = "تعذر تحميل الواجبات";
export const HOMEWORK_ERROR_DESCRIPTION = "حدث خطأ أثناء قراءة واجباتك. حاول مرة أخرى.";
export const HOMEWORK_STATUS_HINT =
  "حالات مُسلّم ومُصحّح تخص سجل الواجب فقط، ولا تعني وجود تسليمات طلاب حالياً.";

export type HomeworkFormState = {
  title: string;
  instructions: string;
  subject: string;
  grade: string;
  className: string;
  dueDate: string;
  status: HomeworkStatus;
  lessonSessionId: string;
  sessionPickerDate: string;
};

export function emptyHomeworkForm(
  overrides: Partial<HomeworkFormState> = {},
): HomeworkFormState {
  return {
    title: "",
    instructions: "",
    subject: "",
    grade: "",
    className: "",
    dueDate: "",
    status: "draft",
    lessonSessionId: "",
    sessionPickerDate: "",
    ...overrides,
  };
}

export function homeworkToFormState(
  homework: Homework,
  sessionPickerDate = "",
): HomeworkFormState {
  return {
    title: homework.title,
    instructions: homework.instructions,
    subject: homework.subject ?? "",
    grade: homework.grade ?? "",
    className: homework.className ?? "",
    dueDate: homework.dueDate ?? "",
    status: homework.status,
    lessonSessionId: homework.lessonSessionId ?? "",
    sessionPickerDate,
  };
}

export function formStateToCreateInput(state: HomeworkFormState): HomeworkCreateInput {
  return {
    title: state.title.trim(),
    instructions: state.instructions.trim(),
    subject: state.subject.trim() || null,
    grade: state.grade.trim() || null,
    className: state.className.trim() || null,
    dueDate: state.dueDate.trim() || null,
    status: state.status,
    lessonSessionId: state.lessonSessionId.trim() || null,
  };
}

export type HomeworkListItemView = {
  id: string;
  title: string;
  statusLabel: string;
  dueDateLabel: string;
  metaLabel: string;
  hasLessonSession: boolean;
};

export function toHomeworkListItemView(homework: Homework): HomeworkListItemView {
  const metaParts = [homework.subject, homework.grade, homework.className].filter(Boolean);
  return {
    id: homework.id,
    title: homework.title,
    statusLabel: HOMEWORK_STATUS_LABELS[homework.status],
    dueDateLabel: homework.dueDate ? formatHomeworkDate(homework.dueDate) : "بدون موعد",
    metaLabel: metaParts.length > 0 ? metaParts.join(" · ") : "بدون تصنيف",
    hasLessonSession: Boolean(homework.lessonSessionId),
  };
}

export function formatHomeworkDate(iso: string): string {
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
  return `${formatHomeworkDate(session.sessionDate)} · الحصة ${session.periodNumber} — ${session.lessonTitle}${subject}`;
}

/** Filters must never carry a client teacher_id. */
export function assertNoClientTeacherId(value: object): void {
  if ("teacherId" in value || "teacher_id" in value) {
    throw new Error("Homework UI must not include teacher_id");
  }
}
