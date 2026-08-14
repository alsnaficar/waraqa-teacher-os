import type { SupabaseClient } from "@supabase/supabase-js";

import { saveAiGeneration, type AiGenerationKind } from "@/features/ai/services/persistence.server";
import {
  AI_PROMPT_CURRICULUM_NOTES_MAX,
  AI_PROMPT_CURRICULUM_OBJECTIVES_MAX,
  AI_PROMPT_CURRICULUM_TITLE_MAX,
  clampAiPromptText,
} from "@/features/ai/providers/ai-request-limits";
import { featureKeyForGenerationKind } from "@/features/billing/entitlement.logic";
import { entitlementDeniedError, requireEntitlement } from "@/features/billing/require-entitlement";
import {
  acquirePaidAiRequest,
  paidAiGuardReasonMessage,
} from "@/features/ai/providers/paid-ai-request-guard";
import { TeacherTimetableService } from "@/features/teacher-timetable/services/teacher-timetable.service";
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
 * Curriculum fields are clamped for AI prompt size only (Hotfix #2.7); DB values unchanged.
 */
export function buildSessionCurriculumPrefix(curriculumLesson: SessionCurriculumLesson | null): {
  promptPrefix: string;
  used: boolean;
} {
  if (!curriculumLesson) return { promptPrefix: "", used: false };

  const lines: string[] = ["--- سياق المنهج (من حصة الدرس) ---"];
  lines.push(
    `عنوان الدرس: ${clampAiPromptText(curriculumLesson.title, AI_PROMPT_CURRICULUM_TITLE_MAX)}`,
  );
  if (curriculumLesson.objectives) {
    lines.push(
      "الأهداف:",
      clampAiPromptText(curriculumLesson.objectives, AI_PROMPT_CURRICULUM_OBJECTIVES_MAX),
    );
  }
  if (curriculumLesson.notes) {
    lines.push(
      `ملاحظات: ${clampAiPromptText(curriculumLesson.notes, AI_PROMPT_CURRICULUM_NOTES_MAX)}`,
    );
  }
  lines.push("--- نهاية سياق المنهج ---", "");
  return { promptPrefix: lines.join("\n"), used: true };
}

/**
 * P3 Step 3 unified pipeline:
 * entitlement → owned session → paid-AI guard → curriculum → strategy → saveAiGeneration
 *
 * Kind-specific provider/prompt/output strategy is injected via `execute`.
 * Does not trust client teacher_id, curriculum_lesson_id, or billing ids.
 * Gemini and persist never run without requireEntitlement(kind).
 * Process-local paid AI concurrency/rate guard (Hotfix #2.6) wraps execute+persist.
 */
export async function runSessionBoundGeneration(
  params: {
    lessonSessionId: string;
    kind: AiGenerationKind;
    auth: SupabaseUserContext;
    supabase: SupabaseClient;
    userId: string;
    /** Service-role client for scheduled promotion. Production must pass supabaseAdmin. */
    billingWriteClient?: SupabaseClient;
    /** Test-only clock. */
    today?: string;
  },
  execute: (ctx: SessionBoundGenerationContext) => Promise<GenerationExecuteResult>,
): Promise<GenerationResult> {
  const featureKey = featureKeyForGenerationKind(params.kind);
  if (!featureKey) {
    throw entitlementDeniedError();
  }

  await requireEntitlement(featureKey, {
    userId: params.userId,
    supabase: params.supabase,
    writeClient: params.billingWriteClient ?? params.supabase,
    today: params.today,
  });

  const session = await requireOwnedLessonSession(params.lessonSessionId, params.auth);

  const guard = acquirePaidAiRequest(params.userId);
  if (!guard.ok) {
    throw new Error(paidAiGuardReasonMessage(guard.reason));
  }

  try {
    const curriculumLesson = await loadCurriculumLessonForSession(session, params.auth);

    const timetable = await TeacherTimetableService.getTimetable(params.auth);

    const timetableEntry =
      timetable.find(
        (entry) => entry.dayOfWeek === session.dayOfWeek && entry.period === session.periodNumber,
      ) ?? null;

    const ctx: SessionBoundGenerationContext = {
      session,
      curriculumLesson,
      timetableEntry,
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
  } finally {
    guard.release();
  }
}
