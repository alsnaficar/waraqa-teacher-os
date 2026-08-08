import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/platform/database/supabase/auth-middleware";
import { saveAiGeneration } from "@/features/ai/services/persistence.server";
import { aiOrchestrator } from "@/features/ai/orchestrator";
import {
  loadCurriculumLessonForSession,
  requireOwnedLessonSession,
} from "@/features/lesson-sessions/services/require-owned-lesson-session";

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

export const generateWorksheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => WorksheetInput.parse(data))
  .handler(async ({ data, context }) => {
    const authContext = { client: context.supabase, userId: context.userId };
    const session = await requireOwnedLessonSession(data.lessonSessionId, authContext);
    const curriculumLesson = await loadCurriculumLessonForSession(session, authContext);

    const bound = {
      stage: data.stage,
      semester: data.semester,
      grade: data.grade?.trim() || "الصف",
      subject: data.subject?.trim() || "المادة",
      title: data.title?.trim() || curriculumLesson?.title || "الدرس",
      questionCount: data.questionCount,
      difficulty: data.difficulty,
      objectives: data.objectives || curriculumLesson?.objectives || "",
      homeworkType: data.homeworkType,
      estimatedTime: data.estimatedTime,
    };

    const result = await aiOrchestrator.generate("worksheet", bound);

    const row = await saveAiGeneration(context.supabase, {
      userId: context.userId,
      kind: "worksheet",
      prompt: `واجب منزلي: ${bound.title}`,
      lessonSessionId: session.id,
      output: {
        content: result.content,
        input: { ...bound, lessonSessionId: session.id },
        model: result.model,
        curriculumContextUsed: result.curriculumContextUsed,
        lessonContext: {
          lessonSessionId: session.id,
          curriculumLessonId: session.curriculumLessonId,
          sessionStatus: session.status,
        },
      },
    });

    return {
      id: row.id,
      content: result.content,
      createdAt: row.createdAt,
      lessonSessionId: session.id,
      curriculumLessonId: session.curriculumLessonId,
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

export const generateActivityIdeas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ActivityIdeasInput.parse(data))
  .handler(async ({ data, context }) => {
    const authContext = { client: context.supabase, userId: context.userId };
    const session = await requireOwnedLessonSession(data.lessonSessionId, authContext);
    const curriculumLesson = await loadCurriculumLessonForSession(session, authContext);

    const bound = {
      grade: data.grade?.trim() || "الصف",
      subject: data.subject?.trim() || "المادة",
      title: data.title?.trim() || curriculumLesson?.title || "الدرس",
      count: data.count,
      duration: data.duration,
      groupType: data.groupType,
    };

    const result = await aiOrchestrator.generate("activity_ideas", bound);

    const row = await saveAiGeneration(context.supabase, {
      userId: context.userId,
      kind: "activity_ideas",
      prompt: `أفكار أنشطة: ${bound.title}`,
      lessonSessionId: session.id,
      output: {
        content: result.content,
        input: { ...bound, lessonSessionId: session.id },
        model: result.model,
        lessonContext: {
          lessonSessionId: session.id,
          curriculumLessonId: session.curriculumLessonId,
          sessionStatus: session.status,
        },
      },
    });

    return {
      id: row.id,
      content: result.content,
      createdAt: row.createdAt,
      lessonSessionId: session.id,
      curriculumLessonId: session.curriculumLessonId,
    };
  });
