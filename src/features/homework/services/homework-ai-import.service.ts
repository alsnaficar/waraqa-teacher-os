import { resolveUserContext, type SupabaseUserContext } from "@/platform/database/supabase/context";

import { mapWorksheetContentToHomeworkDraft } from "./homework-ai-import.logic";
import { HomeworkService, type Homework } from "./homework.service";

export type HomeworkAiImportResult = {
  homework: Homework;
  /**
   * Always false in V1: homework has no source_ai_generation_id, so
   * idempotent duplicate reuse is not available without a migration.
   * Re-importing the same generation creates another draft (known limitation).
   */
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
 * TASK 24 — Import an owned AI worksheet generation into a Homework draft.
 * Does not call an AI provider and does not consume AI entitlement.
 * Does not auto-assign.
 *
 * Known limitation: without source_ai_generation_id on homework, duplicate
 * imports of the same generation are allowed (each creates a new draft).
 */
export class HomeworkAiImportService {
  static async createDraftFromWorksheetGeneration(
    generationId: string,
    context?: SupabaseUserContext,
  ): Promise<HomeworkAiImportResult> {
    const resolved = await resolveUserContext(context);
    if (!resolved) {
      throw new Error("يجب تسجيل الدخول لاستيراد الواجب.");
    }

    if (!generationId?.trim()) {
      throw new Error("معرّف التوليد مطلوب.");
    }

    const generation = await loadOwnedWorksheetGeneration(resolved, generationId.trim());
    const { content, title, subject, grade } = extractWorksheetPayload(generation);

    const mapped = mapWorksheetContentToHomeworkDraft(content, {
      title,
      subject,
      grade,
      lessonSessionId: generation.lesson_session_id,
    });

    const created = await HomeworkService.create(mapped, resolved);

    if (!created) {
      throw new Error("تعذر إنشاء مسودة الواجب.");
    }

    if (created.status !== "draft") {
      throw new Error("يجب أن تبقى المسودة المستوردة بحالة draft.");
    }

    return {
      homework: created,
      reusedExisting: false,
    };
  }
}

async function loadOwnedWorksheetGeneration(
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

  if (data.kind !== "worksheet") {
    throw new Error("يمكن استيراد توليدات الواجب (worksheet) فقط.");
  }

  return data as AiGenerationRow;
}

function extractWorksheetPayload(generation: AiGenerationRow): {
  content: string;
  title: string | null;
  subject: string | null;
  grade: string | null;
} {
  const output = generation.output;
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    throw new Error("مخرجات التوليد غير موجودة.");
  }

  const record = output as Record<string, unknown>;
  const content = record.content;

  if (typeof content !== "string" || !content.trim()) {
    throw new Error("محتوى توليد الواجب غير صالح أو فارغ.");
  }

  const input =
    record.input && typeof record.input === "object" && !Array.isArray(record.input)
      ? (record.input as Record<string, unknown>)
      : {};

  const titleFromInput = readString(input.title);
  const titleFromPrompt = readTitleFromPrompt(generation.prompt);

  return {
    content,
    title: titleFromInput ?? titleFromPrompt,
    subject: readString(input.subject),
    grade: readString(input.grade),
  };
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Prompt is typically `واجب منزلي: ${title}` from executeWorksheetGeneration. */
function readTitleFromPrompt(prompt: string | null): string | null {
  if (!prompt?.trim()) return null;
  const trimmed = prompt.trim();
  const match = trimmed.match(/^واجب منزلي:\s*(.+)$/);
  if (match?.[1]?.trim()) return match[1].trim();
  return trimmed;
}
