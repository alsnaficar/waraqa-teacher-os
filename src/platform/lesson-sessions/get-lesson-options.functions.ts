import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  listPublishedCurriculumLessons,
  resolvePublishedCurriculumFileId,
} from "@/features/lesson-sessions/services/lesson-curriculum-authorization";
import { LessonSessionService } from "@/features/lesson-sessions/services/lesson-session.service";
import { requireOwnedLessonSession } from "@/features/lesson-sessions/services/require-owned-lesson-session";
import { requireSupabaseAuth } from "@/platform/database/supabase/auth-middleware";

const Input = z.object({
  lessonSessionId: z.string().uuid(),
});

export const getLessonOptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data, context }) => {
    const auth = {
      client: context.supabase,
      userId: context.userId,
    };

    const session = await requireOwnedLessonSession(data.lessonSessionId, auth);

    const view = await LessonSessionService.getSessionViewById(data.lessonSessionId, auth);

    if (!view) {
      throw new Error("تعذر تحميل بيانات حصة الدرس.");
    }

    const fileId = await resolvePublishedCurriculumFileId(auth, view.grade, view.subject);

    if (!fileId) {
      return {
        lessons: [],
        selectedLessonId: session.curriculumLessonId,
      };
    }

    const lessons = await listPublishedCurriculumLessons(auth, fileId);

    return {
      lessons,
      selectedLessonId: session.curriculumLessonId,
    };
  });
