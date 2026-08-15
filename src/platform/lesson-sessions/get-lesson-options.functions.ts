import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { loadLessonOptionsForOwnedSessions } from "@/features/lesson-sessions/services/lesson-options";
import { LessonSessionBindingError } from "@/features/lesson-sessions/services/require-owned-lesson-session";
import { requireSupabaseAuth } from "@/platform/database/supabase/auth-middleware";

const Input = z.object({
  lessonSessionId: z.string().uuid(),
});

const BatchInput = z.object({
  lessonSessionIds: z.array(z.string().uuid()).max(80),
});

export const getLessonOptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data, context }) => {
    const auth = {
      client: context.supabase,
      userId: context.userId,
    };

    const optionsBySessionId = await loadLessonOptionsForOwnedSessions(
      [data.lessonSessionId],
      auth,
    );
    const result = optionsBySessionId[data.lessonSessionId];

    if (!result) {
      throw new LessonSessionBindingError(
        "NOT_FOUND",
        "حصة الدرس غير موجودة أو غير مصرح بالوصول إليها.",
      );
    }

    return result;
  });

export const getLessonOptionsBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => BatchInput.parse(data))
  .handler(async ({ data, context }) => {
    const auth = {
      client: context.supabase,
      userId: context.userId,
    };

    return loadLessonOptionsForOwnedSessions(data.lessonSessionIds, auth);
  });
