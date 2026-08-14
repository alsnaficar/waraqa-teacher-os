import { resolveUserContext, type SupabaseUserContext } from "@/platform/database/supabase/context";
import type { Database } from "@/platform/database/supabase/types";

import { assertOwnedTest } from "./test.service";
import { TestSubmissionService } from "./test-submission.service";

type AnswerRow = Database["public"]["Tables"]["test_answers"]["Row"];
type AnswerInsert = Database["public"]["Tables"]["test_answers"]["Insert"];
type AnswerUpdate = Database["public"]["Tables"]["test_answers"]["Update"];

export interface TestAnswer {
  id: string;
  submissionId: string;
  questionId: string;
  selectedOptionId: string | null;
  booleanAnswer: boolean | null;
  isCorrect: boolean | null;
  pointsAwarded: number | null;
  createdAt: string;
  updatedAt: string;
}

export type TestAnswerUpsertInput = {
  submissionId: string;
  questionId: string;
  selectedOptionId?: string | null;
  booleanAnswer?: boolean | null;
};

function toAnswer(row: AnswerRow): TestAnswer {
  return {
    id: row.id,
    submissionId: row.submission_id,
    questionId: row.question_id,
    selectedOptionId: row.selected_option_id,
    booleanAnswer: row.boolean_answer,
    isCorrect: row.is_correct,
    pointsAwarded: row.points_awarded == null ? null : Number(row.points_awarded),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Teacher-owned test answers. No grading in this task.
 */
export class TestAnswerService {
  static async listBySubmission(
    submissionId: string,
    context?: SupabaseUserContext,
  ): Promise<TestAnswer[]> {
    const resolved = await resolveUserContext(context);
    if (!resolved) return [];

    const submission = await TestSubmissionService.getById(submissionId, resolved);
    if (!submission) return [];

    const { data, error } = await resolved.client
      .from("test_answers")
      .select("*")
      .eq("submission_id", submissionId)
      .order("created_at", { ascending: true });

    if (error) throw error;
    return (data ?? []).map(toAnswer);
  }

  static async upsertAnswer(
    input: TestAnswerUpsertInput,
    context?: SupabaseUserContext,
  ): Promise<TestAnswer | null> {
    const resolved = await resolveUserContext(context);
    if (!resolved) return null;

    const submission = await TestSubmissionService.getById(input.submissionId, resolved);
    if (!submission) {
      throw new Error("التسليم غير موجود أو لا تملك صلاحية الوصول إليه.");
    }

    if (submission.status !== "pending") {
      throw new Error("لا يمكن تعديل إجابات إلا لتسليم بحالة «لم يبدأ».");
    }

    const test = await assertOwnedTest(resolved, submission.testId);
    if (test.status === "draft") {
      throw new Error("لا يمكن تسجيل إجابات لاختبار ما زال مسودة.");
    }
    if (test.status === "closed") {
      throw new Error("لا يمكن تسجيل إجابات لاختبار مغلق.");
    }

    await assertQuestionOnTest(resolved, input.questionId, submission.testId);

    if (input.selectedOptionId) {
      await assertOptionOnQuestion(resolved, input.selectedOptionId, input.questionId);
    }

    const { data: existing, error: existingError } = await resolved.client
      .from("test_answers")
      .select("*")
      .eq("submission_id", input.submissionId)
      .eq("question_id", input.questionId)
      .maybeSingle();

    if (existingError) throw existingError;

    if (existing) {
      const patch: AnswerUpdate = {
        selected_option_id:
          input.selectedOptionId !== undefined
            ? input.selectedOptionId
            : existing.selected_option_id,
        boolean_answer:
          input.booleanAnswer !== undefined ? input.booleanAnswer : existing.boolean_answer,
      };

      const { data, error } = await resolved.client
        .from("test_answers")
        .update(patch)
        .eq("id", existing.id)
        .select("*")
        .maybeSingle();

      if (error) throw error;
      return data ? toAnswer(data) : null;
    }

    const insertRow: AnswerInsert = {
      submission_id: input.submissionId,
      question_id: input.questionId,
      selected_option_id: input.selectedOptionId ?? null,
      boolean_answer: input.booleanAnswer ?? null,
      is_correct: null,
      points_awarded: null,
    };

    const { data, error } = await resolved.client
      .from("test_answers")
      .insert(insertRow)
      .select("*")
      .maybeSingle();

    if (error) throw error;
    return data ? toAnswer(data) : null;
  }

  static async deleteAnswer(id: string, context?: SupabaseUserContext): Promise<boolean> {
    const resolved = await resolveUserContext(context);
    if (!resolved) return false;

    const { data: existing, error: existingError } = await resolved.client
      .from("test_answers")
      .select("id, submission_id")
      .eq("id", id)
      .maybeSingle();

    if (existingError) throw existingError;
    if (!existing) return false;

    const submission = await TestSubmissionService.getById(existing.submission_id, resolved);
    if (!submission) return false;

    const { data, error } = await resolved.client
      .from("test_answers")
      .delete()
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (error) throw error;
    return Boolean(data);
  }
}

async function assertQuestionOnTest(
  context: SupabaseUserContext,
  questionId: string,
  testId: string,
): Promise<void> {
  const { data, error } = await context.client
    .from("test_questions")
    .select("id, test_id")
    .eq("id", questionId)
    .maybeSingle();

  if (error) throw error;
  if (!data || data.test_id !== testId) {
    throw new Error("السؤال غير مرتبط بهذا الاختبار.");
  }
}

async function assertOptionOnQuestion(
  context: SupabaseUserContext,
  optionId: string,
  questionId: string,
): Promise<void> {
  const { data, error } = await context.client
    .from("test_options")
    .select("id, question_id")
    .eq("id", optionId)
    .maybeSingle();

  if (error) throw error;
  if (!data || data.question_id !== questionId) {
    throw new Error("الخيار المحدد لا ينتمي إلى السؤال.");
  }
}
