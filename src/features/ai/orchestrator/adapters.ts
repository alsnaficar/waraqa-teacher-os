import { z } from "zod";
import { GeneratorAdapter, NormalizationResult } from "./types";
import {
  SYSTEM_INSTRUCTIONS,
  buildLessonPlanPrompt,
  buildHomeworkPrompt,
  buildQuizPrompt,
  buildActivitiesPrompt,
} from "./prompts";

// ==========================================
// LESSON PLAN ADAPTER
// ==========================================

export const LessonPlanInputSchema = z.object({
  stage: z.enum(["primary", "intermediate", "secondary"]).optional(),
  semester: z.string().optional(),
  grade: z.string().min(1).max(120),
  subject: z.string().min(1).max(120),
  title: z.string().min(1).max(200),
  objectives: z.string().max(4000).optional().default(""),
});

export type LessonPlanInput = z.input<typeof LessonPlanInputSchema>;

export class LessonPlanAdapter implements GeneratorAdapter<LessonPlanInput> {
  type = "lesson_plan" as const;
  inputSchema = LessonPlanInputSchema;

  getSystemInstruction(input: LessonPlanInput): string {
    return SYSTEM_INSTRUCTIONS.lesson_plan;
  }

  getUserPrompt(input: LessonPlanInput, context?: string): string {
    // Check if the objectives are packed or simple. We support both.
    // If we have packed objectives from the lesson plan page, we pass them as is.
    return buildLessonPlanPrompt(
      {
        grade: input.grade,
        subject: input.subject,
        title: input.title,
        objectives: input.objectives,
        duration: undefined, // packed inside objectives if generated from the new UI
      },
      context,
    );
  }

  normalizeResponse(rawContent: string, input: LessonPlanInput): NormalizationResult {
    const content = rawContent.trim();
    return {
      content,
      normalizedAt: new Date().toISOString(),
      metadata: {
        title: input.title,
        grade: input.grade,
        subject: input.subject,
        wordCount: content.split(/\s+/).filter(Boolean).length,
      },
    };
  }
}

// ==========================================
// HOMEWORK ADAPTER
// ==========================================

export const HomeworkInputSchema = z.object({
  stage: z.enum(["primary", "intermediate", "secondary"]).optional(),
  semester: z.string().optional(),
  grade: z.string().min(1).max(120),
  subject: z.string().min(1).max(120),
  title: z.string().min(1).max(200),
  questionCount: z.number().int().min(1).max(50),
  difficulty: z.enum(["easy", "medium", "hard"]),
  objectives: z.string().max(1000).optional().default(""),
  homeworkType: z.enum(["essay", "mcq", "true_false", "mixed"]).optional().default("mixed"),
  estimatedTime: z.number().int().min(1).max(180).optional().default(30),
});

export type HomeworkInput = z.input<typeof HomeworkInputSchema>;

export class HomeworkAdapter implements GeneratorAdapter<HomeworkInput> {
  type = "worksheet" as const;
  inputSchema = HomeworkInputSchema;

  getSystemInstruction(input: HomeworkInput): string {
    return SYSTEM_INSTRUCTIONS.worksheet;
  }

  getUserPrompt(input: HomeworkInput, context?: string): string {
    return buildHomeworkPrompt(
      {
        grade: input.grade,
        subject: input.subject,
        title: input.title,
        questionCount: input.questionCount,
        difficulty: input.difficulty,
        objectives: input.objectives,
        homeworkType: input.homeworkType,
        estimatedTime: input.estimatedTime,
      },
      context,
    );
  }

  normalizeResponse(rawContent: string, input: HomeworkInput): NormalizationResult {
    const content = rawContent.trim();
    return {
      content,
      normalizedAt: new Date().toISOString(),
      metadata: {
        title: input.title,
        grade: input.grade,
        subject: input.subject,
        wordCount: content.split(/\s+/).filter(Boolean).length,
      },
    };
  }
}

// ==========================================
// QUIZ ADAPTER (PLACEHOLDER / FUTURE-READY)
// ==========================================

export const QuizInputSchema = z.object({
  grade: z.string().min(1).max(120),
  subject: z.string().min(1).max(120),
  title: z.string().min(1).max(200),
  questionCount: z.number().int().min(1).max(50),
  questionType: z.enum(["mcq", "open", "mixed"]),
  difficulty: z.enum(["easy", "medium", "hard"]),
});

export type QuizInput = z.infer<typeof QuizInputSchema>;

export class QuizAdapter implements GeneratorAdapter<QuizInput> {
  type = "quiz" as const;
  inputSchema = QuizInputSchema;

  getSystemInstruction(input: QuizInput): string {
    return SYSTEM_INSTRUCTIONS.quiz;
  }

  getUserPrompt(input: QuizInput, context?: string): string {
    return buildQuizPrompt(
      {
        grade: input.grade,
        subject: input.subject,
        title: input.title,
        questionCount: input.questionCount,
        questionType: input.questionType,
        difficulty: input.difficulty,
      },
      context,
    );
  }

  normalizeResponse(rawContent: string, input: QuizInput): NormalizationResult {
    const content = rawContent.trim();
    return {
      content,
      normalizedAt: new Date().toISOString(),
      metadata: {
        title: input.title,
        grade: input.grade,
        subject: input.subject,
        wordCount: content.split(/\s+/).filter(Boolean).length,
      },
    };
  }
}

// ==========================================
// ACTIVITIES ADAPTER (PLACEHOLDER / FUTURE-READY)
// ==========================================

export const ActivitiesInputSchema = z.object({
  grade: z.string().min(1).max(120),
  subject: z.string().min(1).max(120),
  title: z.string().min(1).max(200),
  count: z.number().int().min(1).max(20),
  duration: z.enum(["short", "medium", "long"]),
  groupType: z.enum(["individual", "pairs", "group", "whole_class"]),
});

export type ActivitiesInput = z.infer<typeof ActivitiesInputSchema>;

export class ActivitiesAdapter implements GeneratorAdapter<ActivitiesInput> {
  type = "activity_ideas" as const;
  inputSchema = ActivitiesInputSchema;

  getSystemInstruction(input: ActivitiesInput): string {
    return SYSTEM_INSTRUCTIONS.activity_ideas;
  }

  getUserPrompt(input: ActivitiesInput, context?: string): string {
    return buildActivitiesPrompt(
      {
        grade: input.grade,
        subject: input.subject,
        title: input.title,
        count: input.count,
        duration: input.duration,
        groupType: input.groupType,
      },
      context,
    );
  }

  normalizeResponse(rawContent: string, input: ActivitiesInput): NormalizationResult {
    const content = rawContent.trim();
    return {
      content,
      normalizedAt: new Date().toISOString(),
      metadata: {
        title: input.title,
        grade: input.grade,
        subject: input.subject,
        wordCount: content.split(/\s+/).filter(Boolean).length,
      },
    };
  }
}
