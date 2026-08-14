export type CorrectionInboxSource = "homework" | "test";

export type CorrectionInboxRawHomework = {
  submissionId: string;
  homeworkId: string;
  studentId: string;
  studentName?: string | null;
  title?: string | null;
  status: string;
  submittedAt?: string | null;
  score?: number | null;
  feedback?: string | null;
};

export type CorrectionInboxRawTest = {
  submissionId: string;
  testId: string;
  studentId: string;
  studentName?: string | null;
  title?: string | null;
  status: string;
  submittedAt?: string | null;
  score?: number | null;
  maxScore?: number | null;
  feedback?: string | null;
};

export type CorrectionInboxItem = {
  id: string;
  source: CorrectionInboxSource;
  submissionId: string;
  parentId: string;
  title: string;
  studentId: string;
  studentName: string;
  submittedAt: string | null;
  status: string;
  statusLabel: string;
  sourceLabel: string;
  score: number | null;
  maxScore: number | null;
  feedback: string | null;
  href: string;
};

export const CORRECTIONS_EMPTY_TITLE = "لا توجد تسليمات تحتاج تصحيحاً";
export const CORRECTIONS_EMPTY_DESCRIPTION =
  "عندما يُسلَّم واجب أو اختبار، سيظهر هنا لتصححه من مكان واحد.";
export const CORRECTIONS_ERROR_TITLE = "تعذر تحميل قائمة التصحيح";
export const CORRECTIONS_HINT =
  "هذه القائمة تعرض التسليمات المُسلَّمة فقط. افتح العنصر للتصحيح عبر شاشات الواجبات أو الاختبارات الحالية.";

export function isActionableHomeworkStatus(status: string): boolean {
  return status === "submitted";
}

export function isActionableTestStatus(status: string): boolean {
  return status === "submitted";
}

export function homeworkDeepLink(homeworkId: string): string {
  return `/homework?homeworkId=${encodeURIComponent(homeworkId)}`;
}

export function testDeepLink(testId: string): string {
  return `/tests?testId=${encodeURIComponent(testId)}`;
}

export function normalizeHomeworkInboxItem(
  row: CorrectionInboxRawHomework,
): CorrectionInboxItem | null {
  if (!isActionableHomeworkStatus(row.status)) return null;
  if (!row.submissionId || !row.homeworkId || !row.studentId) return null;

  return {
    id: `homework:${row.submissionId}`,
    source: "homework",
    submissionId: row.submissionId,
    parentId: row.homeworkId,
    title: row.title?.trim() || "واجب بدون عنوان",
    studentId: row.studentId,
    studentName: row.studentName?.trim() || "طالب غير معروف",
    submittedAt: row.submittedAt ?? null,
    status: row.status,
    statusLabel: "مُسلّم — يحتاج تصحيحاً",
    sourceLabel: "واجب",
    score: row.score ?? null,
    maxScore: null,
    feedback: row.feedback ?? null,
    href: homeworkDeepLink(row.homeworkId),
  };
}

export function normalizeTestInboxItem(row: CorrectionInboxRawTest): CorrectionInboxItem | null {
  if (!isActionableTestStatus(row.status)) return null;
  if (!row.submissionId || !row.testId || !row.studentId) return null;

  return {
    id: `test:${row.submissionId}`,
    source: "test",
    submissionId: row.submissionId,
    parentId: row.testId,
    title: row.title?.trim() || "اختبار بدون عنوان",
    studentId: row.studentId,
    studentName: row.studentName?.trim() || "طالب غير معروف",
    submittedAt: row.submittedAt ?? null,
    status: row.status,
    statusLabel: "مُسلّم — يحتاج تصحيحاً",
    sourceLabel: "اختبار",
    score: row.score ?? null,
    maxScore: row.maxScore ?? null,
    feedback: row.feedback ?? null,
    href: testDeepLink(row.testId),
  };
}

export function mergeCorrectionInboxItems(
  homework: CorrectionInboxRawHomework[],
  tests: CorrectionInboxRawTest[],
): CorrectionInboxItem[] {
  const items: CorrectionInboxItem[] = [];

  for (const row of homework) {
    const item = normalizeHomeworkInboxItem(row);
    if (item) items.push(item);
  }
  for (const row of tests) {
    const item = normalizeTestInboxItem(row);
    if (item) items.push(item);
  }

  return sortCorrectionInboxItems(items);
}

export function sortCorrectionInboxItems(items: CorrectionInboxItem[]): CorrectionInboxItem[] {
  return [...items].sort((a, b) => {
    const aTime = a.submittedAt ? Date.parse(a.submittedAt) : 0;
    const bTime = b.submittedAt ? Date.parse(b.submittedAt) : 0;
    if (aTime !== bTime) return bTime - aTime;
    return a.id.localeCompare(b.id);
  });
}

export function formatCorrectionSubmittedAt(iso: string | null): string {
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

/** Guard used by tests: inbox views must never carry client teacher_id. */
export function assertNoClientTeacherId(view: object): void {
  const keys = Object.keys(view);
  if (keys.includes("teacherId") || keys.includes("teacher_id")) {
    throw new Error("Correction inbox view must not expose teacher_id");
  }
}
