import type { TestSubmissionStatus } from "./test-submission.service";

/**
 * TASK 22.5 — Pure automatic grading helpers (no I/O).
 *
 * Supports V1 question types: multiple_choice and true_false.
 * Correctness is derived from option.isCorrect (and optional booleanAnswer).
 */

export type GradableQuestionType = "multiple_choice" | "true_false";

export type GradableOption = {
  id: string;
  isCorrect: boolean;
  label?: string;
};

export type GradableQuestion = {
  id: string;
  type: GradableQuestionType;
  points: number;
  options: GradableOption[];
};

export type GradableAnswer = {
  questionId: string;
  selectedOptionId: string | null;
  booleanAnswer: boolean | null;
};

export type GradedAnswerResult = {
  questionId: string;
  isCorrect: boolean;
  pointsAwarded: number;
};

export type GradedSubmissionResult = {
  answers: GradedAnswerResult[];
  score: number;
  maxScore: number;
};

export function assertSubmissionAutoGradable(status: TestSubmissionStatus): void {
  if (status === "pending") {
    throw new Error("لا يمكن التصحيح التلقائي لتسليم لم يُسلَّم بعد.");
  }
  if (status !== "submitted" && status !== "graded") {
    throw new Error("حالة التسليم لا تسمح بالتصحيح التلقائي.");
  }
}

export function normalizeQuestionPoints(points: unknown): number {
  const value = typeof points === "number" ? points : Number(points);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("درجة السؤال غير صالحة.");
  }
  return value;
}

/**
 * Resolve whether the student response matches the keyed correct option.
 * Unanswered → incorrect (0 points).
 */
export function isAnswerCorrect(
  question: GradableQuestion,
  answer: GradableAnswer | null | undefined,
): boolean {
  if (!answer) return false;

  const correctOption = question.options.find((option) => option.isCorrect) ?? null;

  if (answer.selectedOptionId) {
    if (!correctOption) return false;
    return answer.selectedOptionId === correctOption.id;
  }

  if (answer.booleanAnswer !== null && answer.booleanAnswer !== undefined) {
    if (question.type !== "true_false") return false;
    if (!correctOption) return false;
    const correctIsTrue = isTrueFalseOptionTrue(correctOption);
    return answer.booleanAnswer === correctIsTrue;
  }

  return false;
}

function isTrueFalseOptionTrue(option: GradableOption): boolean {
  const label = (option.label ?? "").trim();
  if (label === "صواب" || label.toLowerCase() === "true") return true;
  if (label === "خطأ" || label.toLowerCase() === "false") return false;
  // Fallback: treat the keyed correct option as the truth value when labels are custom.
  return option.isCorrect;
}

export function gradeAnswer(
  question: GradableQuestion,
  answer: GradableAnswer | null | undefined,
): GradedAnswerResult {
  const points = normalizeQuestionPoints(question.points);
  const correct = isAnswerCorrect(question, answer);
  return {
    questionId: question.id,
    isCorrect: correct,
    pointsAwarded: correct ? points : 0,
  };
}

export function gradeAnswers(
  questions: GradableQuestion[],
  answers: GradableAnswer[],
): GradedSubmissionResult {
  const byQuestion = new Map(answers.map((row) => [row.questionId, row]));
  const graded = questions.map((question) => gradeAnswer(question, byQuestion.get(question.id)));

  const score = graded.reduce((sum, row) => sum + row.pointsAwarded, 0);
  const maxScore = questions.reduce(
    (sum, question) => sum + normalizeQuestionPoints(question.points),
    0,
  );

  return {
    answers: graded,
    score,
    maxScore,
  };
}
