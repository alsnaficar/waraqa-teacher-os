import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { saveAiGeneration } from "@/lib/ai/persistence.server";
import { aiOrchestrator } from "@/lib/ai/orchestrator";

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

export const generateLessonPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data, context }) => {
    const result = await aiOrchestrator.generate("lesson_plan", data);

    const row = await saveAiGeneration(context.supabase, {
      userId: context.userId,
      kind: "lesson_plan",
      prompt: `تحضير درس: ${data.title}`,
      output: {
        content: result.content,
        input: data,
        model: result.model,
        curriculumContextUsed: result.curriculumContextUsed,
      },
    });

    return { id: row.id, content: result.content, createdAt: row.createdAt };
  });

const WorksheetInput = z.object({
  stage: StageEnum,
  semester: SemesterEnum,
  grade: z.string().min(1).max(120),
  subject: z.string().min(1).max(120),
  title: z.string().min(1).max(200),
  questionCount: z.number().int().min(1).max(50),
  difficulty: z.enum(["easy", "medium", "hard"]),
  objectives: z.string().max(1000).optional().default(""),
  homeworkType: z.enum(["essay", "mcq", "true_false", "mixed"]).optional().default("mixed"),
  estimatedTime: z.number().int().min(1).max(180).optional().default(30),
});

export const generateWorksheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => WorksheetInput.parse(data))
  .handler(async ({ data, context }) => {
    const result = await aiOrchestrator.generate("worksheet", data);

    const row = await saveAiGeneration(context.supabase, {
      userId: context.userId,
      kind: "worksheet",
      prompt: `واجب منزلي: ${data.title}`,
      output: {
        content: result.content,
        input: data,
        model: result.model,
        curriculumContextUsed: result.curriculumContextUsed,
      },
    });

    return { id: row.id, content: result.content, createdAt: row.createdAt };
  });

const QuizInput = z.object({
  grade: z.string().min(1).max(120),
  subject: z.string().min(1).max(120),
  title: z.string().min(1).max(200),
  questionCount: z.number().int().min(1).max(50),
  questionType: z.enum(["mcq", "open", "mixed"]),
  difficulty: z.enum(["easy", "medium", "hard"]),
});

export const generateQuiz = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => QuizInput.parse(data))
  .handler(async ({ data, context }) => {
    const result = await aiOrchestrator.generate("quiz", data);

    const row = await saveAiGeneration(context.supabase, {
      userId: context.userId,
      kind: "quiz",
      prompt: `اختبار قصير: ${data.title}`,
      output: {
        content: result.content,
        input: data,
        model: result.model,
      },
    });

    return { id: row.id, content: result.content, createdAt: row.createdAt };
  });

const ActivityIdeasInput = z.object({
  grade: z.string().min(1).max(120),
  subject: z.string().min(1).max(120),
  title: z.string().min(1).max(200),
  count: z.number().int().min(1).max(20),
  duration: z.enum(["short", "medium", "long"]),
  groupType: z.enum(["individual", "pairs", "group", "whole_class"]),
});

export const generateActivityIdeas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ActivityIdeasInput.parse(data))
  .handler(async ({ data, context }) => {
    const result = await aiOrchestrator.generate("activity_ideas", data);

    const row = await saveAiGeneration(context.supabase, {
      userId: context.userId,
      kind: "activity_ideas",
      prompt: `أفكار أنشطة: ${data.title}`,
      output: {
        content: result.content,
        input: data,
        model: result.model,
      },
    });

    return { id: row.id, content: result.content, createdAt: row.createdAt };
  });
