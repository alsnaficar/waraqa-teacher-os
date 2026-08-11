import type { SupabaseClient } from "@supabase/supabase-js";

import { runSessionBoundGeneration } from "@/features/ai/services/session-bound-generation.server";
import { requireEntitlement } from "@/features/billing/require-entitlement";
import type {
  GenerationExecuteResult,
  GenerationResult,
  SessionBoundGenerationContext,
} from "@/features/ai/services/session-bound-generation.types";
import { executeLessonPlanGeneration } from "@/features/ai/strategies/lesson-plan.strategy";
import type { SupabaseUserContext } from "@/platform/database/supabase/context";
import type { LessonSession } from "../types";
import { LessonSessionService } from "./lesson-session.service";
import { requireOwnedLessonSession } from "./require-owned-lesson-session";

export class LessonSessionAlreadyPreparedError extends Error {
  readonly code = "ALREADY_PREPARED" as const;

  constructor(message = "الحصة محضّرة مسبقاً. استخدم إعادة التعيين ثم التحضير لإعادة التوليد.") {
    super(message);
    this.name = "LessonSessionAlreadyPreparedError";
  }
}

export class LessonSessionAlreadyPreparingError extends Error {
  readonly code = "ALREADY_PREPARING" as const;

  constructor(message = "جاري تحضير هذه الحصة حالياً. انتظر انتهاء العملية.") {
    super(message);
    this.name = "LessonSessionAlreadyPreparingError";
  }
}

export class LessonSessionPrepareStateError extends Error {
  readonly code: "INVALID_STATE" | "PARTIAL_STATE";

  constructor(code: LessonSessionPrepareStateError["code"], message: string) {
    super(message);
    this.name = "LessonSessionPrepareStateError";
    this.code = code;
  }
}

export type PrepareLessonSessionResult = {
  session: LessonSession;
  generation: GenerationResult;
};

async function rejectFailedClaim(
  lessonSessionId: string,
  auth: SupabaseUserContext,
): Promise<never> {
  const latest = await requireOwnedLessonSession(lessonSessionId, auth);

  if (latest.status === "prepared" || latest.lessonLocked) {
    throw new LessonSessionAlreadyPreparedError();
  }

  if (latest.status === "preparing") {
    throw new LessonSessionAlreadyPreparingError();
  }

  throw new LessonSessionPrepareStateError(
    "INVALID_STATE",
    "لا يمكن تحضير الحصة في حالتها الحالية. أعد التعيين أولاً إن لزم.",
  );
}

/**
 * P3 Step 4 Prepare orchestration with durable `preparing` claim:
 * owned session → claim scheduled→preparing → lesson_plan generation →
 * mark preparing→prepared+locked only after persist.
 *
 * Concurrent losers never call the AI provider.
 */
export async function prepareOwnedLessonSession(
  params: {
    lessonSessionId: string;
    auth: SupabaseUserContext;
    supabase: SupabaseClient;
    userId: string;
    billingWriteClient?: SupabaseClient;
    today?: string;
  },
  execute?: (ctx: SessionBoundGenerationContext) => Promise<GenerationExecuteResult>,
): Promise<PrepareLessonSessionResult> {
  // Entitlement before claim so unpaid callers never mutate session state.
  // runSessionBoundGeneration repeats the gate before Gemini/persist.
  await requireEntitlement("lesson_plan", {
    userId: params.userId,
    supabase: params.supabase,
    writeClient: params.billingWriteClient ?? params.supabase,
    today: params.today,
  });

  // Ownership gate before claim (also used after failed claim to classify error).
  await requireOwnedLessonSession(params.lessonSessionId, params.auth);

  const claimed = await LessonSessionService.claimPrepareInProgress(
    params.lessonSessionId,
    params.auth,
  );

  if (!claimed) {
    await rejectFailedClaim(params.lessonSessionId, params.auth);
  }

  let generation: GenerationResult;
  try {
    generation = await runSessionBoundGeneration(
      {
        lessonSessionId: claimed!.id,
        kind: "lesson_plan",
        auth: params.auth,
        supabase: params.supabase,
        userId: params.userId,
        billingWriteClient: params.billingWriteClient ?? params.supabase,
        today: params.today,
      },
      execute ??
        ((ctx) =>
          // Session/curriculum are authoritative — no client identity fields.
          executeLessonPlanGeneration(ctx, {})),
    );
  } catch (error) {
    await LessonSessionService.releasePrepareClaim(claimed!.id, params.auth);
    throw error;
  }

  const prepared = await LessonSessionService.markPreparedAfterGeneration(claimed!.id, params.auth);

  if (!prepared) {
    // Generation already persisted; claim/finalize did not reach prepared.
    // Do not delete the generation. Do not silently succeed.
    throw new LessonSessionPrepareStateError(
      "PARTIAL_STATE",
      `تم حفظ التوليد (${generation.id}) لكن تعذّر تحديث حالة الحصة إلى محضّرة. أعد المحاولة أو راجع حالة الحصة.`,
    );
  }

  return { session: prepared, generation };
}
