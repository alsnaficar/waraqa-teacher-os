import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/platform/database/supabase/auth-middleware";
import type { StructuredLessonPlanData } from "@/platform/ai/docx";
import {
  AI_PROMPT_GRADE_MAX,
  AI_PROMPT_LESSON_NAME_MAX,
  AI_PROMPT_OBJECTIVES_MAX,
  AI_PROMPT_SUBJECT_MAX,
  AI_PROMPT_SUGGESTED_DATE_MAX,
  AI_PROMPT_UNIT_MAX,
} from "@/features/ai/providers/ai-request-limits.ts";
import { runSessionBoundGeneration } from "@/features/ai/services/session-bound-generation.server";
import type { GenerationResult } from "@/features/ai/services/session-bound-generation.types";
import { executeLessonPlanGeneration } from "@/features/ai/strategies/lesson-plan.strategy";

/** Display/context fields may accompany the session; binding identity is lessonSessionId only. */
export const LessonPrepInput = z.object({
  lessonSessionId: z.string().uuid("lessonSessionId مطلوب"),
  subject: z.string().min(1, "اسم المادة مطلوب").max(AI_PROMPT_SUBJECT_MAX).optional(),
  grade: z.string().min(1, "الصف الدراسي مطلوب").max(AI_PROMPT_GRADE_MAX).optional(),
  lessonName: z.string().max(AI_PROMPT_LESSON_NAME_MAX).optional(),
  objectives: z.string().max(AI_PROMPT_OBJECTIVES_MAX).optional().default(""),
  unit: z.string().max(AI_PROMPT_UNIT_MAX).optional().default(""),
  /** Ignored for binding — session.curriculumLessonId is authoritative. */
  lessonId: z.string().nullable().optional(),
  /**
   * Optional lesson date (product contract: YYYY-MM-DD).
   * Empty/omitted keeps existing fallback to session.sessionDate in the strategy.
   * Oversized or non-date strings are rejected (no silent truncation).
   */
  suggestedDate: z
    .union([
      z.literal(""),
      z
        .string()
        .max(AI_PROMPT_SUGGESTED_DATE_MAX)
        .regex(/^\d{4}-\d{2}-\d{2}$/, "تاريخ التنفيذ يجب أن يكون بصيغة YYYY-MM-DD"),
    ])
    .optional(),
});

/** Narrow unified pipeline content to the existing structured lesson-plan shape. */
function isStructuredLessonPlanContent(content: unknown): content is StructuredLessonPlanData {
  return (
    typeof content === "object" &&
    content !== null &&
    !Array.isArray(content) &&
    "behavioralObjectives" in content &&
    "strategiesAndDigitalSkills" in content &&
    "lessonScenario" in content &&
    "assessmentAndHomework" in content
  );
}

function requireStructuredLessonPlanContent(
  content: GenerationResult["content"],
): StructuredLessonPlanData {
  if (!isStructuredLessonPlanContent(content)) {
    throw new Error("مخرجات التحضير غير صالحة.");
  }
  return content;
}

/**
 * Live lesson_plan entry — thin wrapper over the unified session-bound pipeline.
 * Strategy: direct Gemini structured JSON (unchanged prompts/model/schema).
 * Entitlement (`lesson_plan`) is enforced in runSessionBoundGeneration.
 */
export const generateLessonPreparation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => LessonPrepInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/platform/database/supabase/client.server");
    const auth = { client: context.supabase, userId: context.userId };
    const result = await runSessionBoundGeneration(
      {
        lessonSessionId: data.lessonSessionId,
        kind: "lesson_plan",
        auth,
        supabase: context.supabase,
        userId: context.userId,
        billingWriteClient: supabaseAdmin,
      },
      (ctx) =>
        executeLessonPlanGeneration(ctx, {
          subject: data.subject,
          grade: data.grade,
          lessonName: data.lessonName,
          objectives: data.objectives,
          unit: data.unit,
          lessonId: data.lessonId,
          suggestedDate: data.suggestedDate,
        }),
    );

    return {
      id: result.id,
      content: requireStructuredLessonPlanContent(result.content),
      createdAt: result.createdAt,
      lessonSessionId: result.lessonSessionId,
      curriculumLessonId: result.curriculumLessonId,
    };
  });
