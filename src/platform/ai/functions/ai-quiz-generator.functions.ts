import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/platform/database/supabase/auth-middleware";
import type { StructuredQuizAndAssignmentData } from "@/platform/ai/docx";
import {
  AI_PROMPT_GRADE_MAX,
  AI_PROMPT_SEMESTER_MAX,
  AI_PROMPT_SUBJECT_MAX,
  AI_PROMPT_TITLE_MAX,
} from "@/features/ai/providers/ai-request-limits.ts";
import { runSessionBoundGeneration } from "@/features/ai/services/session-bound-generation.server";
import type { GenerationResult } from "@/features/ai/services/session-bound-generation.types";
import { executeQuizGeneration } from "@/features/ai/strategies/quiz.strategy";

export const QuizGeneratorInput = z.object({
  lessonSessionId: z.string().uuid("lessonSessionId مطلوب"),
  subject: z.string().min(1, "اسم المادة مطلوب").max(AI_PROMPT_SUBJECT_MAX).optional(),
  grade: z.string().min(1, "الصف الدراسي مطلوب").max(AI_PROMPT_GRADE_MAX).optional(),
  title: z.string().min(1, "عنوان الدرس مطلوب").max(AI_PROMPT_TITLE_MAX).optional(),
  questionCount: z.number().int().min(1).max(25).default(5),
  difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
  semester: z.string().max(AI_PROMPT_SEMESTER_MAX).optional().default(""),
  stage: z.enum(["primary", "intermediate", "secondary"]).optional(),
});

/** Narrow unified pipeline content to the existing structured quiz shape. */
function isStructuredQuizContent(content: unknown): content is StructuredQuizAndAssignmentData {
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

function requireStructuredQuizContent(
  content: GenerationResult["content"],
): StructuredQuizAndAssignmentData {
  if (!isStructuredQuizContent(content)) {
    throw new Error("مخرجات الاختبار غير صالحة.");
  }
  return content;
}

/**
 * Live quiz entry — thin wrapper over the unified session-bound pipeline.
 * Strategy: direct Gemini structured JSON (unchanged prompts/model/schema).
 * Entitlement (`quiz`) is enforced in runSessionBoundGeneration.
 */
export const generateQuizAndAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => QuizGeneratorInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/platform/database/supabase/client.server");
    const auth = { client: context.supabase, userId: context.userId };
    const result = await runSessionBoundGeneration(
      {
        lessonSessionId: data.lessonSessionId,
        kind: "quiz",
        auth,
        supabase: context.supabase,
        userId: context.userId,
        billingWriteClient: supabaseAdmin,
      },
      (ctx) =>
        executeQuizGeneration(ctx, {
          subject: data.subject,
          grade: data.grade,
          title: data.title,
          questionCount: data.questionCount,
          difficulty: data.difficulty,
          semester: data.semester,
          stage: data.stage,
        }),
    );

    return {
      id: result.id,
      content: requireStructuredQuizContent(result.content),
      createdAt: result.createdAt,
      lessonSessionId: result.lessonSessionId,
      curriculumLessonId: result.curriculumLessonId,
    };
  });
