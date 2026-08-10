import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

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

    const { data: files, error: fileError } = await context.supabase
      .from("curriculum_files")
      .select("id")
      .eq("grade", view.grade)
      .eq("subject", view.subject)
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(1);

    if (fileError) throw fileError;

    const fileId = files?.[0]?.id;

    if (!fileId) {
      return {
        lessons: [],
        selectedLessonId: session.curriculumLessonId,
      };
    }

    const { data: lessons, error: lessonsError } = await context.supabase
      .from("curriculum_lessons")
      .select("id, title, objectives, notes, order_index")
      .eq("curriculum_file_id", fileId)
      .order("order_index", { ascending: true });

    if (lessonsError) throw lessonsError;

    return {
      lessons: lessons ?? [],
      selectedLessonId: session.curriculumLessonId,
    };
  });
