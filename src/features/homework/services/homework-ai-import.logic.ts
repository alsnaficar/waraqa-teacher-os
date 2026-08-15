import type { HomeworkCreateInput } from "./homework.service";

export type WorksheetGenerationContentMeta = {
  title?: string | null;
  subject?: string | null;
  grade?: string | null;
  lessonSessionId?: string | null;
};

export type WorksheetImportMappingResult = HomeworkCreateInput & {
  status: "draft";
};

const DEFAULT_HOMEWORK_TITLE = "واجب منزلي";

/**
 * Type guard: production worksheet content is Markdown text stored in
 * ai_generations.output.content (kind = "worksheet").
 */
export function isWorksheetMarkdownContent(content: unknown): content is string {
  return typeof content === "string" && content.trim().length > 0;
}

/**
 * Pure mapper: persisted worksheet generation → HomeworkCreateInput (draft).
 * Does not invent new homework fields; maps into title + instructions only.
 */
export function mapWorksheetContentToHomeworkDraft(
  content: unknown,
  meta: WorksheetGenerationContentMeta = {},
): WorksheetImportMappingResult {
  if (!isWorksheetMarkdownContent(content)) {
    throw new Error("محتوى توليد الواجب غير صالح أو فارغ.");
  }

  const title = resolveTitle(meta.title);
  const subject =
    typeof meta.subject === "string" && meta.subject.trim() ? meta.subject.trim() : null;
  const grade =
    typeof meta.grade === "string" && meta.grade.trim() ? meta.grade.trim() : null;
  const lessonSessionId =
    typeof meta.lessonSessionId === "string" && meta.lessonSessionId.trim()
      ? meta.lessonSessionId.trim()
      : null;

  return {
    title,
    instructions: content.trim(),
    subject,
    grade,
    status: "draft",
    lessonSessionId,
  };
}

function resolveTitle(raw: string | null | undefined): string {
  if (typeof raw === "string" && raw.trim()) {
    const trimmed = raw.trim();
    if (/^واجب/.test(trimmed)) return trimmed;
    return `واجب: ${trimmed}`;
  }
  return DEFAULT_HOMEWORK_TITLE;
}
