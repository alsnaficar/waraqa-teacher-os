import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/platform/database/supabase/auth-middleware";
import { runSessionBoundGeneration } from "@/features/ai/services/session-bound-generation.server";
import {
  executeActivityIdeasGeneration,
  executeWorksheetGeneration,
} from "@/features/ai/strategies/orchestrator.strategy";

const StageEnum = z.enum(["primary", "intermediate", "secondary"]).optional();
const SemesterEnum = z.string().optional();

const Input = z.object({
  stage: StageEnum,
  semester: SemesterEnum,
  grade: z.string().min(1).max(120),
  subject: z.string().min(1).max(120),
  title: z.string().min(1).max(200),
  objectives: z.string().max(4000).optional().default(""),
});

/** Legacy unused by live routes — kept for compatibility; not session-bound. */
export const generateLessonPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async () => {
    throw new Error(
      "generateLessonPlan لم يعد مدعوماً — استخدم generateLessonPreparation مع lessonSessionId.",
    );
  });

const WorksheetInput = z.object({
  lessonSessionId: z.string().uuid("lessonSessionId مطلوب"),
  stage: StageEnum,
  semester: SemesterEnum,
  grade: z.string().min(1).max(120).optional(),
  subject: z.string().min(1).max(120).optional(),
  title: z.string().min(1).max(200).optional(),
  questionCount: z.number().int().min(1).max(50),
  difficulty: z.enum(["easy", "medium", "hard"]),
  objectives: z.string().max(1000).optional().default(""),
  homeworkType: z.enum(["essay", "mcq", "true_false", "mixed"]).optional().default("mixed"),
  estimatedTime: z.number().int().min(1).max(180).optional().default(30),
});

/**
 * Live worksheet entry — thin wrapper over the unified session-bound pipeline.
 * Strategy: AIOrchestrator Markdown (unchanged prompts/model).
 * Entitlement (`worksheet`) is enforced in runSessionBoundGeneration.
 */
export const generateWorksheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => WorksheetInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/platform/database/supabase/client.server");
    const auth = { client: context.supabase, userId: context.userId };
    const result = await runSessionBoundGeneration(
      {
        lessonSessionId: data.lessonSessionId,
        kind: "worksheet",
        auth,
        supabase: context.supabase,
        userId: context.userId,
        billingWriteClient: supabaseAdmin,
      },
      (ctx) =>
        executeWorksheetGeneration(ctx, {
          stage: data.stage,
          semester: data.semester,
          grade: data.grade,
          subject: data.subject,
          title: data.title,
          questionCount: data.questionCount,
          difficulty: data.difficulty,
          objectives: data.objectives,
          homeworkType: data.homeworkType,
          estimatedTime: data.estimatedTime,
        }),
    );

    return {
      id: result.id,
      content: result.content as string,
      createdAt: result.createdAt,
      lessonSessionId: result.lessonSessionId,
      curriculumLessonId: result.curriculumLessonId,
    };
  });

const QuizInput = z.object({
  grade: z.string().min(1).max(120),
  subject: z.string().min(1).max(120),
  title: z.string().min(1).max(200),
  questionCount: z.number().int().min(1).max(50),
  questionType: z.enum(["mcq", "open", "mixed"]),
  difficulty: z.enum(["easy", "medium", "hard"]),
});

/** Legacy unused by live routes. */
export const generateQuiz = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => QuizInput.parse(data))
  .handler(async () => {
    throw new Error(
      "generateQuiz لم يعد مدعوماً — استخدم generateQuizAndAssignment مع lessonSessionId.",
    );
  });

const ActivityIdeasInput = z.object({
  lessonSessionId: z.string().uuid("lessonSessionId مطلوب"),
  grade: z.string().min(1).max(120).optional(),
  subject: z.string().min(1).max(120).optional(),
  title: z.string().min(1).max(200).optional(),
  count: z.number().int().min(1).max(20),
  duration: z.enum(["short", "medium", "long"]),
  groupType: z.enum(["individual", "pairs", "group", "whole_class"]),
});

/**
 * Live activity_ideas entry — thin wrapper over the unified session-bound pipeline.
 * Strategy: AIOrchestrator Markdown (unchanged prompts/model).
 * Entitlement (`activity_ideas`) is enforced in runSessionBoundGeneration.
 */
export const generateActivityIdeas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ActivityIdeasInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/platform/database/supabase/client.server");
    const auth = { client: context.supabase, userId: context.userId };
    const result = await runSessionBoundGeneration(
      {
        lessonSessionId: data.lessonSessionId,
        kind: "activity_ideas",
        auth,
        supabase: context.supabase,
        userId: context.userId,
        billingWriteClient: supabaseAdmin,
      },
      (ctx) =>
        executeActivityIdeasGeneration(ctx, {
          grade: data.grade,
          subject: data.subject,
          title: data.title,
          count: data.count,
          duration: data.duration,
          groupType: data.groupType,
        }),
    );

    return {
      id: result.id,
      content: result.content as string,
      createdAt: result.createdAt,
      lessonSessionId: result.lessonSessionId,
      curriculumLessonId: result.curriculumLessonId,
    };
  });
