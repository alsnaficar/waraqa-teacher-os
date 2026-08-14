import { resolveUserContext, type SupabaseUserContext } from "@/platform/database/supabase/context";
import type { Database } from "@/platform/database/supabase/types";

import { assertOwnedTest } from "./test.service";

type QuestionRow = Database["public"]["Tables"]["test_questions"]["Row"];
type QuestionInsert = Database["public"]["Tables"]["test_questions"]["Insert"];
type OptionRow = Database["public"]["Tables"]["test_options"]["Row"];
type OptionInsert = Database["public"]["Tables"]["test_options"]["Insert"];

export type TestQuestionType = "multiple_choice" | "true_false";

const QUESTION_TYPES: readonly TestQuestionType[] = ["multiple_choice", "true_false"];

export function assertTestQuestionType(value: string): asserts value is TestQuestionType {
  if (!(QUESTION_TYPES as readonly string[]).includes(value)) {
    throw new Error("نوع السؤال غير صالح. القيم المسموحة: multiple_choice و true_false.");
  }
}

export interface TestOption {
  id: string;
  questionId: string;
  position: number;
  label: string;
  isCorrect: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TestQuestion {
  id: string;
  testId: string;
  position: number;
  type: TestQuestionType;
  prompt: string;
  points: number;
  createdAt: string;
  updatedAt: string;
  options: TestOption[];
}

export type TestOptionInput = {
  label: string;
  isCorrect?: boolean;
  position?: number;
};

export type TestQuestionCreateInput = {
  testId: string;
  type: TestQuestionType;
  prompt: string;
  position: number;
  points?: number;
  options?: TestOptionInput[];
  /** Convenience for true_false — synthesizes صواب/خطأ options when options omitted. */
  correctBoolean?: boolean;
};

export type TestQuestionUpdateInput = {
  type?: TestQuestionType;
  prompt?: string;
  position?: number;
  points?: number;
  options?: TestOptionInput[];
  correctBoolean?: boolean;
};

function toOption(row: OptionRow): TestOption {
  return {
    id: row.id,
    questionId: row.question_id,
    position: row.position,
    label: row.label,
    isCorrect: row.is_correct,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toQuestion(row: QuestionRow, options: TestOption[] = []): TestQuestion {
  return {
    id: row.id,
    testId: row.test_id,
    position: row.position,
    type: row.type as TestQuestionType,
    prompt: row.prompt,
    points: Number(row.points),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    options: options.sort((a, b) => a.position - b.position),
  };
}

function normalizeOptions(
  type: TestQuestionType,
  options: TestOptionInput[] | undefined,
  correctBoolean: boolean | undefined,
): Array<{ label: string; isCorrect: boolean; position: number }> {
  let raw = options;

  if ((!raw || raw.length === 0) && type === "true_false" && correctBoolean !== undefined) {
    raw = [
      { label: "صواب", isCorrect: correctBoolean === true },
      { label: "خطأ", isCorrect: correctBoolean === false },
    ];
  }

  if (!raw || raw.length === 0) {
    throw new Error("يجب توفير خيارات السؤال.");
  }

  const normalized = raw.map((option, index) => {
    const label = option.label?.trim();
    if (!label) {
      throw new Error("نص الخيار مطلوب.");
    }
    return {
      label,
      isCorrect: Boolean(option.isCorrect),
      position: option.position ?? index,
    };
  });

  const positions = new Set(normalized.map((o) => o.position));
  if (positions.size !== normalized.length) {
    throw new Error("ترتيب الخيارات يجب أن يكون فريداً.");
  }

  const correctCount = normalized.filter((o) => o.isCorrect).length;
  if (correctCount !== 1) {
    throw new Error("يجب تحديد إجابة صحيحة واحدة فقط.");
  }

  if (type === "multiple_choice" && normalized.length < 2) {
    throw new Error("سؤال الاختيار من متعدد يحتاج خيارين على الأقل.");
  }

  if (type === "true_false" && normalized.length !== 2) {
    throw new Error("سؤال الصواب والخطأ يحتاج خيارين فقط.");
  }

  return normalized.sort((a, b) => a.position - b.position);
}

function assertPoints(points: number): void {
  if (!Number.isFinite(points) || points < 0) {
    throw new Error("درجة السؤال يجب أن تكون رقماً أكبر من أو يساوي صفر.");
  }
}

function assertPosition(position: number): void {
  if (!Number.isInteger(position) || position < 0) {
    throw new Error("ترتيب السؤال غير صالح.");
  }
}

/**
 * Teacher-owned test questions + options.
 * Ownership resolved through the parent test.
 */
export class TestQuestionService {
  static async listByTest(
    testId: string,
    context?: SupabaseUserContext,
  ): Promise<TestQuestion[]> {
    const resolved = await resolveUserContext(context);
    if (!resolved) return [];

    await assertOwnedTest(resolved, testId);

    const { data: questions, error } = await resolved.client
      .from("test_questions")
      .select("*")
      .eq("test_id", testId)
      .order("position", { ascending: true });

    if (error) throw error;
    if (!questions?.length) return [];

    const questionIds = questions.map((q) => q.id);
    const { data: options, error: optionsError } = await resolved.client
      .from("test_options")
      .select("*")
      .in("question_id", questionIds)
      .order("position", { ascending: true });

    if (optionsError) throw optionsError;

    const byQuestion = new Map<string, TestOption[]>();
    for (const option of options ?? []) {
      const list = byQuestion.get(option.question_id) ?? [];
      list.push(toOption(option));
      byQuestion.set(option.question_id, list);
    }

    return questions.map((row) => toQuestion(row, byQuestion.get(row.id) ?? []));
  }

  static async getById(
    id: string,
    context?: SupabaseUserContext,
  ): Promise<TestQuestion | null> {
    const resolved = await resolveUserContext(context);
    if (!resolved) return null;

    const { data, error } = await resolved.client
      .from("test_questions")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    // Ownership gate via parent test.
    await assertOwnedTest(resolved, data.test_id);

    const { data: options, error: optionsError } = await resolved.client
      .from("test_options")
      .select("*")
      .eq("question_id", id)
      .order("position", { ascending: true });

    if (optionsError) throw optionsError;
    return toQuestion(data, (options ?? []).map(toOption));
  }

  static async create(
    input: TestQuestionCreateInput,
    context?: SupabaseUserContext,
  ): Promise<TestQuestion | null> {
    const resolved = await resolveUserContext(context);
    if (!resolved) return null;

    assertTestQuestionType(input.type);
    if (!input.prompt?.trim()) {
      throw new Error("نص السؤال مطلوب.");
    }
    assertPosition(input.position);
    const points = input.points ?? 1;
    assertPoints(points);

    await assertOwnedTest(resolved, input.testId);

    const options = normalizeOptions(input.type, input.options, input.correctBoolean);

    const insertRow: QuestionInsert = {
      test_id: input.testId,
      type: input.type,
      prompt: input.prompt.trim(),
      position: input.position,
      points,
    };

    const { data, error } = await resolved.client
      .from("test_questions")
      .insert(insertRow)
      .select("*")
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    await insertOptions(resolved, data.id, options);
    return this.getById(data.id, resolved);
  }

  static async update(
    id: string,
    patch: TestQuestionUpdateInput,
    context?: SupabaseUserContext,
  ): Promise<TestQuestion | null> {
    const resolved = await resolveUserContext(context);
    if (!resolved) return null;

    const existing = await this.getById(id, resolved);
    if (!existing) return null;

    if (patch.type !== undefined) assertTestQuestionType(patch.type);
    if (patch.prompt !== undefined && !patch.prompt.trim()) {
      throw new Error("نص السؤال مطلوب.");
    }
    if (patch.position !== undefined) assertPosition(patch.position);
    if (patch.points !== undefined) assertPoints(patch.points);

    const nextType = patch.type ?? existing.type;
    const row: Database["public"]["Tables"]["test_questions"]["Update"] = {};
    if (patch.type !== undefined) row.type = patch.type;
    if (patch.prompt !== undefined) row.prompt = patch.prompt.trim();
    if (patch.position !== undefined) row.position = patch.position;
    if (patch.points !== undefined) row.points = patch.points;

    if (Object.keys(row).length > 0) {
      const { error } = await resolved.client
        .from("test_questions")
        .update(row)
        .eq("id", id)
        .eq("test_id", existing.testId);
      if (error) throw error;
    }

    if (patch.options !== undefined || patch.correctBoolean !== undefined) {
      const options = normalizeOptions(nextType, patch.options, patch.correctBoolean);
      await resolved.client.from("test_options").delete().eq("question_id", id);
      await insertOptions(resolved, id, options);
    } else if (patch.type !== undefined && patch.type !== existing.type) {
      // Type change without new options — re-validate existing shape.
      normalizeOptions(
        nextType,
        existing.options.map((o) => ({
          label: o.label,
          isCorrect: o.isCorrect,
          position: o.position,
        })),
        undefined,
      );
    }

    return this.getById(id, resolved);
  }

  static async delete(id: string, context?: SupabaseUserContext): Promise<boolean> {
    const resolved = await resolveUserContext(context);
    if (!resolved) return false;

    const existing = await this.getById(id, resolved);
    if (!existing) return false;

    const { data, error } = await resolved.client
      .from("test_questions")
      .delete()
      .eq("id", id)
      .eq("test_id", existing.testId)
      .select("id")
      .maybeSingle();

    if (error) throw error;
    return Boolean(data);
  }

  /**
   * Replace the full question set for a test (delete + recreate).
   * Used by editors that submit the whole list.
   */
  static async replaceQuestions(
    testId: string,
    questions: Array<Omit<TestQuestionCreateInput, "testId">>,
    context?: SupabaseUserContext,
  ): Promise<TestQuestion[]> {
    const resolved = await resolveUserContext(context);
    if (!resolved) return [];

    await assertOwnedTest(resolved, testId);

    const { error: deleteError } = await resolved.client
      .from("test_questions")
      .delete()
      .eq("test_id", testId);
    if (deleteError) throw deleteError;

    const created: TestQuestion[] = [];
    for (const question of questions) {
      const row = await this.create({ ...question, testId }, resolved);
      if (row) created.push(row);
    }
    return created;
  }
}

async function insertOptions(
  context: SupabaseUserContext,
  questionId: string,
  options: Array<{ label: string; isCorrect: boolean; position: number }>,
): Promise<void> {
  const rows: OptionInsert[] = options.map((option) => ({
    question_id: questionId,
    label: option.label,
    is_correct: option.isCorrect,
    position: option.position,
  }));

  const { error } = await context.client.from("test_options").insert(rows);
  if (error) throw error;
}
