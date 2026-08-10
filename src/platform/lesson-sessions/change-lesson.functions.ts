import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { LessonSessionService } from "@/features/lesson-sessions/services/lesson-session.service";
import { requireSupabaseAuth } from "@/platform/database/supabase/auth-middleware";

const Input = z.object({
  lessonSessionId: z.string().uuid(),
  curriculumLessonId: z.string().uuid(),
});

export const changeLesson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data, context }) => {
    const auth = {
      client: context.supabase,
      userId: context.userId,
    };

    const session = await LessonSessionService.changeLesson(
      data.lessonSessionId,
      data.curriculumLessonId,
      auth,
    );

    if (!session) {
      throw new Error("تعذر تحديث درس الحصة.");
    }

    return session;
  });
