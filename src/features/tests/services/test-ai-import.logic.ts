import type { StructuredQuizAndAssignmentData } from "@/platform/ai/docx";

import type { TestQuestionCreateInput, TestOptionInput } from "./test-question.service";

/** Default points for imported questions — matches TestQuestionService.create. */
export const AI_IMPORT_DEFAULT_POINTS = 1;

export type MappedImportQuestion = Omit<TestQuestionCreateInput, "testId">;

export type QuizImportMappingResult = {
  title: string;
  subject: string | null;
  grade: string | null;
  questions: MappedImportQuestion[];
  skippedShortAnswerCount: number;
  skippedMalformedCount: number;
};

export type QuizGenerationContentMeta = {
  subject?: string | null;
  grade?: string | null;
};

/**
 * Type guard for the production AI quiz JSON shape persisted in
 * ai_generations.output.content (kind = "quiz").
 */
export function isStructuredQuizContent(
  content: unknown,
): content is StructuredQuizAndAssignmentData {
  return (
    typeof content === "object" &&
    content !== null &&
    !Array.isArray(content) &&
    "title" in content &&
    "mcqs" in content &&
    "trueFalse" in content &&
    "shortAnswer" in content &&
    "homeworkAssignment" in content
  );
}

/**
 * Pure mapper: AI quiz JSON → TestQuestionCreateInput-shaped drafts (no testId).
 * V1 supports MCQ + true/false only. Short-answer items are skipped.
 */
export function mapQuizContentToImportQuestions(
  content: unknown,
  meta: QuizGenerationContentMeta = {},
): QuizImportMappingResult {
  if (!isStructuredQuizContent(content)) {
    throw new Error("محتوى توليد الاختبار غير صالح أو غير مكتمل.");
  }

  const title = typeof content.title === "string" ? content.title.trim() : "";
  if (!title) {
    throw new Error("عنوان الاختبار المستورد مطلوب.");
  }

  const questions: MappedImportQuestion[] = [];
  let skippedMalformedCount = 0;
  let position = 0;

  const mcqs = Array.isArray(content.mcqs) ? content.mcqs : [];
  for (const item of mcqs) {
    const mapped = mapMcqItem(item, position);
    if (!mapped) {
      skippedMalformedCount += 1;
      continue;
    }
    questions.push(mapped);
    position += 1;
  }

  const trueFalse = Array.isArray(content.trueFalse) ? content.trueFalse : [];
  for (const item of trueFalse) {
    const mapped = mapTrueFalseItem(item, position);
    if (!mapped) {
      skippedMalformedCount += 1;
      continue;
    }
    questions.push(mapped);
    position += 1;
  }

  const shortAnswer = Array.isArray(content.shortAnswer) ? content.shortAnswer : [];
  const skippedShortAnswerCount = shortAnswer.length;

  const subject =
    typeof meta.subject === "string" && meta.subject.trim() ? meta.subject.trim() : null;
  const grade = typeof meta.grade === "string" && meta.grade.trim() ? meta.grade.trim() : null;

  return {
    title,
    subject,
    grade,
    questions,
    skippedShortAnswerCount,
    skippedMalformedCount,
  };
}

function mapMcqItem(item: unknown, position: number): MappedImportQuestion | null {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  const row = item as Record<string, unknown>;

  const prompt = typeof row.question === "string" ? row.question.trim() : "";
  if (!prompt) return null;

  if (!Array.isArray(row.options) || row.options.length < 2) return null;

  const labels = row.options.map((opt) => (typeof opt === "string" ? opt.trim() : ""));
  if (labels.some((label) => !label)) return null;

  const correctAnswer =
    typeof row.correctAnswer === "string" ? row.correctAnswer.trim() : "";
  if (!correctAnswer) return null;

  const matchIndexes = labels
    .map((label, index) => (label === correctAnswer ? index : -1))
    .filter((index) => index >= 0);

  if (matchIndexes.length !== 1) return null;

  const correctIndex = matchIndexes[0]!;
  const options: TestOptionInput[] = labels.map((label, index) => ({
    label,
    isCorrect: index === correctIndex,
    position: index,
  }));

  const points = readOptionalPoints(row.points);

  return {
    type: "multiple_choice",
    prompt,
    position,
    points,
    options,
  };
}

function mapTrueFalseItem(item: unknown, position: number): MappedImportQuestion | null {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  const row = item as Record<string, unknown>;

  const prompt = typeof row.question === "string" ? row.question.trim() : "";
  if (!prompt) return null;

  if (typeof row.correctAnswer !== "boolean") return null;

  const points = readOptionalPoints(row.points);

  return {
    type: "true_false",
    prompt,
    position,
    points,
    correctBoolean: row.correctAnswer,
  };
}

function readOptionalPoints(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value;
  }
  return AI_IMPORT_DEFAULT_POINTS;
}

export function buildImportInstructions(result: QuizImportMappingResult): string {
  if (result.skippedShortAnswerCount <= 0) return "";
  return `تم تخطي ${result.skippedShortAnswerCount} سؤال مقالي قصير — غير مدعوم في الإصدار الحالي من الاختبارات.`;
}
