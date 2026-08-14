import { aiOrchestrator } from "@/features/ai/orchestrator";
import { buildSessionCurriculumPrefix } from "@/features/ai/services/session-bound-generation.server";
import type {
  GenerationExecuteResult,
  SessionBoundGenerationContext,
} from "@/features/ai/services/session-bound-generation.types";

export type WorksheetOptions = {
  stage?: "primary" | "intermediate" | "secondary";
  semester?: string;
  grade?: string;
  subject?: string;
  title?: string;
  questionCount: number;
  difficulty: "easy" | "medium" | "hard";
  objectives?: string;
  homeworkType?: "essay" | "mcq" | "true_false" | "mixed";
  estimatedTime?: number;
};

export type ActivityIdeasOptions = {
  grade?: string;
  subject?: string;
  title?: string;
  count: number;
  duration: "short" | "medium" | "long";
  groupType: "individual" | "pairs" | "group" | "whole_class";
};

/**
 * Orchestrator Markdown strategy for worksheet.
 * Uses session curriculum prefix instead of free-text title search.
 */
export async function executeWorksheetGeneration(
  ctx: SessionBoundGenerationContext,
  options: WorksheetOptions,
): Promise<GenerationExecuteResult> {
  const { session, curriculumLesson } = ctx;
  const sessionCurriculum = buildSessionCurriculumPrefix(curriculumLesson);

  const bound = {
    stage: options.stage,
    semester: options.semester,
    grade: options.grade?.trim() || "الصف",
    subject: options.subject?.trim() || "المادة",
    title: options.title?.trim() || curriculumLesson?.title || "الدرس",
    questionCount: options.questionCount,
    difficulty: options.difficulty,
    objectives: options.objectives || curriculumLesson?.objectives || "",
    homeworkType: options.homeworkType,
    estimatedTime: options.estimatedTime,
  };

  // Paid path: at most one Gemini attempt (no orchestrator retries).
  const result = await aiOrchestrator.generate("worksheet", bound, {
    curriculumPrefix: sessionCurriculum.promptPrefix,
    skipAutoCurriculum: true,
    retries: 0,
  });

  return {
    content: result.content,
    model: result.model,
    prompt: `واجب منزلي: ${bound.title}`,
    input: { ...bound, lessonSessionId: session.id },
    curriculumContextUsed: sessionCurriculum.used || result.curriculumContextUsed,
  };
}

/**
 * Orchestrator Markdown strategy for activity_ideas.
 * Uses session curriculum prefix instead of free-text title search.
 */
export async function executeActivityIdeasGeneration(
  ctx: SessionBoundGenerationContext,
  options: ActivityIdeasOptions,
): Promise<GenerationExecuteResult> {
  const { session, curriculumLesson } = ctx;
  const sessionCurriculum = buildSessionCurriculumPrefix(curriculumLesson);

  const bound = {
    grade: options.grade?.trim() || "الصف",
    subject: options.subject?.trim() || "المادة",
    title: options.title?.trim() || curriculumLesson?.title || "الدرس",
    count: options.count,
    duration: options.duration,
    groupType: options.groupType,
  };

  // Paid path: at most one Gemini attempt (no orchestrator retries).
  const result = await aiOrchestrator.generate("activity_ideas", bound, {
    curriculumPrefix: sessionCurriculum.promptPrefix,
    skipAutoCurriculum: true,
    retries: 0,
  });

  return {
    content: result.content,
    model: result.model,
    prompt: `أفكار أنشطة: ${bound.title}`,
    input: { ...bound, lessonSessionId: session.id },
    curriculumContextUsed: sessionCurriculum.used || result.curriculumContextUsed,
  };
}
