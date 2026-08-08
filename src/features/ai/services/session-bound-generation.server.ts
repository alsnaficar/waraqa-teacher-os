import type { SupabaseClient } from "@supabase/supabase-js";

import { saveAiGeneration, type AiGenerationKind } from "@/features/ai/services/persistence.server";
import type { SupabaseUserContext } from "@/platform/database/supabase/context";
import {
  loadCurriculumLessonForSession,
  requireOwnedLessonSession,
  type SessionCurriculumLesson,
} from "@/features/lesson-sessions/services/require-owned-lesson-session";
import type {
  GenerationExecuteResult,
  GenerationResult,
  SessionBoundGenerationContext,
} from "./session-bound-generation.types";

/**
 * Build a prompt prefix from the session's authoritative curriculum lesson.
 * Prefer this over free-text grade/subject/title search for session-bound prep.
 */
export function buildSessionCurriculumPrefix(curriculumLesson: SessionCurriculumLesson | null): {
  promptPrefix: string;
  used: boolean;
} {
  if (!curriculumLesson) return { promptPrefix: "", used: false };

  const lines: string[] = ["--- سياق المنهج (من حصة الدرس) ---"];
  lines.push(`عنوان الدرس: ${curriculumLesson.title}`);
  if (curriculumLesson.objectives) {
    lines.push("الأهداف:", curriculumLesson.objectives);
  }
  if (curriculumLesson.notes) {
    lines.push(`ملاحظات: ${curriculumLesson.notes}`);
  }
  lines.push("--- نهاية سياق المنهج ---", "");
  return { promptPrefix: lines.join("\n"), used: true };
}

/**
 * P3 Step 3 unified pipeline:
 * lessonSessionId → owned session → curriculum → strategy → saveAiGeneration
 *
 * Kind-specific provider/prompt/output strategy is injected via `execute`.
 * Does not trust client teacher_id or curriculum_lesson_id.
 */
export async function runSessionBoundGeneration(
  params: {
    lessonSessionId: string;
    kind: AiGenerationKind;
    auth: SupabaseUserContext;
    supabase: SupabaseClient;
    userId: string;
  },
  execute: (ctx: SessionBoundGenerationContext) => Promise<GenerationExecuteResult>,
): Promise<GenerationResult> {
  const session = await requireOwnedLessonSession(params.lessonSessionId, params.auth);
  const curriculumLesson = await loadCurriculumLessonForSession(session, params.auth);

  const ctx: SessionBoundGenerationContext = {
    session,
    curriculumLesson,
    auth: params.auth,
    supabase: params.supabase,
    userId: params.userId,
  };

  const executed = await execute(ctx);

  const extra = executed.extraOutput ?? {};
  const extraLessonContext =
    extra.lessonContext && typeof extra.lessonContext === "object"
      ? (extra.lessonContext as Record<string, unknown>)
      : {};
  const { lessonContext: _, ...restExtra } = extra;

  const row = await saveAiGeneration(params.supabase, {
    userId: params.userId,
    kind: params.kind,
    prompt: executed.prompt,
    lessonSessionId: session.id,
    output: {
      content: executed.content,
      input: executed.input,
      model: executed.model,
      ...(executed.curriculumContextUsed !== undefined
        ? { curriculumContextUsed: executed.curriculumContextUsed }
        : {}),
      ...restExtra,
      lessonContext: {
        lessonSessionId: session.id,
        curriculumLessonId: session.curriculumLessonId,
        sessionStatus: session.status,
        ...extraLessonContext,
      },
    },
  });

  return {
    id: row.id,
    content: executed.content,
    createdAt: row.createdAt,
    lessonSessionId: session.id,
    curriculumLessonId: session.curriculumLessonId as string,
  };
}
