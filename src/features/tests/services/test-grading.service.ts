import { resolveUserContext, type SupabaseUserContext } from "@/platform/database/supabase/context";

import {
  assertSubmissionAutoGradable,
  gradeAnswers,
  type GradableAnswer,
  type GradableQuestion,
  type GradedSubmissionResult,
} from "./test-grading.logic";
import { TestAnswerService, type TestAnswer } from "./test-answer.service";
import { TestQuestionService, type TestQuestion } from "./test-question.service";
import {
  TestSubmissionService,
  type TestSubmission,
} from "./test-submission.service";

export type AutoGradeResult = {
  submission: TestSubmission;
  grading: GradedSubmissionResult;
  answers: TestAnswer[];
};

/**
 * TASK 22.5 — Automatic grading for teacher-owned test submissions.
 * Grades MCQ / true_false answers, writes per-answer results, then updates the submission.
 */
export class TestGradingService {
  static async gradeSubmission(
    submissionId: string,
    context?: SupabaseUserContext,
  ): Promise<AutoGradeResult | null> {
    const resolved = await resolveUserContext(context);
    if (!resolved) return null;

    const submission = await TestSubmissionService.getById(submissionId, resolved);
    if (!submission) {
      throw new Error("التسليم غير موجود أو لا تملك صلاحية الوصول إليه.");
    }

    assertSubmissionAutoGradable(submission.status);

    const questions = await TestQuestionService.listByTest(submission.testId, resolved);
    const existingAnswers = await TestAnswerService.listBySubmission(submissionId, resolved);

    const gradableQuestions: GradableQuestion[] = questions.map((question) =>
      toGradableQuestion(question),
    );
    const gradableAnswers: GradableAnswer[] = existingAnswers.map((answer) => ({
      questionId: answer.questionId,
      selectedOptionId: answer.selectedOptionId,
      booleanAnswer: answer.booleanAnswer,
    }));

    const grading = gradeAnswers(gradableQuestions, gradableAnswers);

    for (const graded of grading.answers) {
      const existing = existingAnswers.find((row) => row.questionId === graded.questionId);
      if (existing) {
        await updateAnswerGrading(resolved, existing.id, graded.isCorrect, graded.pointsAwarded);
      } else {
        // Persist a graded blank answer so every question has a row after auto-grade.
        await insertGradedBlankAnswer(
          resolved,
          submissionId,
          graded.questionId,
          graded.isCorrect,
          graded.pointsAwarded,
        );
      }
    }

    const gradedAt = new Date().toISOString();
    const { data, error } = await resolved.client
      .from("test_submissions")
      .update({
        status: "graded",
        score: grading.score,
        max_score: grading.maxScore,
        graded_at: gradedAt,
      })
      .eq("id", submissionId)
      .eq("teacher_id", resolved.userId)
      .select("*")
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    const updatedSubmission = (await TestSubmissionService.getById(submissionId, resolved))!;
    const updatedAnswers = await TestAnswerService.listBySubmission(submissionId, resolved);

    return {
      submission: updatedSubmission,
      grading,
      answers: updatedAnswers,
    };
  }
}

function toGradableQuestion(question: TestQuestion): GradableQuestion {
  if (question.type !== "multiple_choice" && question.type !== "true_false") {
    throw new Error("نوع السؤال غير مدعوم للتصحيح التلقائي.");
  }
  return {
    id: question.id,
    type: question.type,
    points: question.points,
    options: question.options.map((option) => ({
      id: option.id,
      isCorrect: option.isCorrect,
      label: option.label,
    })),
  };
}

async function updateAnswerGrading(
  context: SupabaseUserContext,
  answerId: string,
  isCorrect: boolean,
  pointsAwarded: number,
): Promise<void> {
  const { error } = await context.client
    .from("test_answers")
    .update({
      is_correct: isCorrect,
      points_awarded: pointsAwarded,
    })
    .eq("id", answerId)
    .select("id")
    .maybeSingle();

  if (error) throw error;
}

async function insertGradedBlankAnswer(
  context: SupabaseUserContext,
  submissionId: string,
  questionId: string,
  isCorrect: boolean,
  pointsAwarded: number,
): Promise<void> {
  const { error } = await context.client.from("test_answers").insert({
    submission_id: submissionId,
    question_id: questionId,
    selected_option_id: null,
    boolean_answer: null,
    is_correct: isCorrect,
    points_awarded: pointsAwarded,
  });

  if (error) throw error;
}
