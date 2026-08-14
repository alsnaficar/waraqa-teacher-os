import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { prepareOwnedLessonSession } from "@/features/lesson-sessions/services/prepare-lesson-session.server";
import { requireSupabaseAuth } from "@/platform/database/supabase/auth-middleware";

const PrepareInput = z.object({
  lessonSessionId: z.string().uuid("lessonSessionId مطلوب"),
});

/**
 * P3 Step 4 — authenticated Prepare entry point.
 * Input is lessonSessionId only; session ownership and curriculum come from the DB.
 * Paid entitlement (`lesson_plan`) is enforced in prepareOwnedLessonSession
 * and again in runSessionBoundGeneration before Gemini/persist.
 */
export const prepareLessonSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => PrepareInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/platform/database/supabase/client.server");
    const auth = { client: context.supabase, userId: context.userId };
    const result = await prepareOwnedLessonSession({
      lessonSessionId: data.lessonSessionId,
      auth,
      supabase: context.supabase,
      userId: context.userId,
      billingWriteClient: supabaseAdmin,
    });

    return {
      session: result.session,
      generation: {
        id: result.generation.id,
        createdAt: result.generation.createdAt,
        lessonSessionId: result.generation.lessonSessionId,
        curriculumLessonId: result.generation.curriculumLessonId,
      },
    };
  });
