import { resolveUserContext, type SupabaseUserContext } from "@/platform/database/supabase/context";

import {
  buildImportInstructions,
  isStructuredQuizContent,
  mapQuizContentToImportQuestions,
} from "./test-ai-import.logic";
import {
  TestQuestionService,
  type TestQuestion,
} from "./test-question.service";
import { TestService, type TeacherTest } from "./test.service";

export type TestAiImportResult = {
  test: TeacherTest;
  questions: TestQuestion[];
  skippedShortAnswerCount: number;
  skippedMalformedCount: number;
  reusedExisting: boolean;
};

type AiGenerationRow = {
  id: string;
  user_id: string;
  kind: string;
  lesson_session_id: string | null;
  output: unknown;
  prompt: string | null;
};

/**
 * TASK 22.8 — Import an owned AI quiz generation into a teacher Test draft.
 * Does not call Gemini and does not consume AI entitlement.
 */
export class TestAiImportService {
  static async createDraftFromQuizGeneration(
    generationId: string,
    context?: SupabaseUserContext,
  ): Promise<TestAiImportResult> {
    const resolved = await resolveUserContext(context);
    if (!resolved) {
      throw new Error("يجب تسجيل الدخول لاستيراد الاختبار.");
    }

    if (!generationId?.trim()) {
      throw new Error("معرّف التوليد مطلوب.");
    }

    const generation = await loadOwnedQuizGeneration(resolved, generationId.trim());

    const existing = await findOwnedTestBySourceGeneration(resolved, generation.id);
    if (existing) {
      const questions = await TestQuestionService.listByTest(existing.id, resolved);
      return {
        test: existing,
        questions,
        skippedShortAnswerCount: 0,
        skippedMalformedCount: 0,
        reusedExisting: true,
      };
    }

    const { content, subject, grade } = extractQuizPayload(generation);
    const mapped = mapQuizContentToImportQuestions(content, { subject, grade });

    if (mapped.questions.length === 0) {
      throw new Error(
        "لا توجد أسئلة قابلة للاستيراد (اختيار من متعدد أو صواب وخطأ).",
      );
    }

    const lessonSessionId = generation.lesson_session_id;

    const created = await TestService.create(
      {
        title: mapped.title,
        instructions: buildImportInstructions(mapped),
        subject: mapped.subject,
        grade: mapped.grade,
        status: "draft",
        lessonSessionId,
        sourceAiGenerationId: generation.id,
      },
      resolved,
    );

    if (!created) {
      throw new Error("تعذر إنشاء مسودة الاختبار.");
    }

    // Defensive: create path must never publish.
    if (created.status !== "draft") {
      throw new Error("يجب أن تبقى المسودة المستوردة بحالة draft.");
    }

    const questions: TestQuestion[] = [];
    for (const question of mapped.questions) {
      const saved = await TestQuestionService.create(
        {
          testId: created.id,
          type: question.type,
          prompt: question.prompt,
          position: question.position,
          points: question.points,
          options: question.options,
          correctBoolean: question.correctBoolean,
        },
        resolved,
      );
      if (!saved) {
        throw new Error("تعذر حفظ أحد الأسئلة المستوردة.");
      }
      questions.push(saved);
    }

    return {
      test: created,
      questions,
      skippedShortAnswerCount: mapped.skippedShortAnswerCount,
      skippedMalformedCount: mapped.skippedMalformedCount,
      reusedExisting: false,
    };
  }
}

async function loadOwnedQuizGeneration(
  context: SupabaseUserContext,
  generationId: string,
): Promise<AiGenerationRow> {
  const { data, error } = await context.client
    .from("ai_generations")
    .select("id, user_id, kind, lesson_session_id, output, prompt")
    .eq("id", generationId)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    throw new Error("توليد الذكاء الاصطناعي غير موجود.");
  }

  if (data.user_id !== context.userId) {
    throw new Error("لا تملك صلاحية الوصول إلى هذا التوليد.");
  }

  if (data.kind !== "quiz") {
    throw new Error("يمكن استيراد توليدات الاختبار (quiz) فقط.");
  }

  return data as AiGenerationRow;
}

async function findOwnedTestBySourceGeneration(
  context: SupabaseUserContext,
  generationId: string,
): Promise<TeacherTest | null> {
  const { data, error } = await context.client
    .from("tests")
    .select("*")
    .eq("teacher_id", context.userId)
    .eq("source_ai_generation_id", generationId)
    .order("created_at", { ascending: true })
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return TestService.getById(data.id as string, context);
}

function extractQuizPayload(generation: AiGenerationRow): {
  content: unknown;
  subject: string | null;
  grade: string | null;
} {
  const output = generation.output;
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    throw new Error("مخرجات التوليد غير موجودة.");
  }

  const record = output as Record<string, unknown>;
  const content = record.content;

  if (!isStructuredQuizContent(content)) {
    // Some older rows may store the quiz object at the root of output.
    if (isStructuredQuizContent(output)) {
      return {
        content: output,
        subject: readString(record.subject) ?? readNestedInputString(record, "subject"),
        grade: readString(record.grade) ?? readNestedInputString(record, "grade"),
      };
    }
    throw new Error("محتوى توليد الاختبار غير صالح أو غير مكتمل.");
  }

  const input =
    record.input && typeof record.input === "object" && !Array.isArray(record.input)
      ? (record.input as Record<string, unknown>)
      : {};

  return {
    content,
    subject: readString(input.subject),
    grade: readString(input.grade),
  };
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNestedInputString(
  record: Record<string, unknown>,
  key: string,
): string | null {
  const input = record.input;
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  return readString((input as Record<string, unknown>)[key]);
}
