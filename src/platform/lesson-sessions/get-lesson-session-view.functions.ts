import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { LessonSessionService } from "@/features/lesson-sessions/services/lesson-session.service";
import { requireSupabaseAuth } from "@/platform/database/supabase/auth-middleware";

const GetLessonSessionViewInput = z.object({
  lessonSessionId: z.string().uuid("lessonSessionId مطلوب"),
});

/**
 * Returns the authenticated teacher's complete lesson-session context.
 *
 * The lessonSessionId is the only identity input. Subject, grade, class,
 * lesson and timetable data are resolved server-side from the owned session.
 */
export const getLessonSessionView = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => GetLessonSessionViewInput.parse(data))
  .handler(async ({ data, context }) => {
    const auth = {
      client: context.supabase,
      userId: context.userId,
    };

    const session = await LessonSessionService.getSessionViewById(data.lessonSessionId, auth);

    if (!session) {
      throw new Error("الحصة غير موجودة أو لا تملك صلاحية الوصول إليها.");
    }

    return session;
  });
