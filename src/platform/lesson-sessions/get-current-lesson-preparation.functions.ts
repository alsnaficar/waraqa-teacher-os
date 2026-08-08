import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getCurrentLessonPlanPreparation } from "@/features/lesson-sessions/services/current-preparation";
import { LessonSessionService } from "@/features/lesson-sessions/services/lesson-session.service";
import { requireSupabaseAuth } from "@/platform/database/supabase/auth-middleware";

const Input = z.object({
  lessonSessionId: z.string().uuid("lessonSessionId مطلوب"),
});

type StructuredLessonPrep = {
  behavioralObjectives: {
    cognitive: string[];
    affective: string[];
    psychomotor: string[];
  };
  strategiesAndDigitalSkills: {
    strategies: string[];
    digitalSkills: string[];
  };
  lessonScenario: {
    introduction: string;
    exercises: string[];
    deliveryScript: string;
  };
  assessmentAndHomework: {
    homework: string;
    summativeAssessment: string[];
  };
};

function isStructuredLessonPrep(value: unknown): value is StructuredLessonPrep {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const data = value as Record<string, unknown>;

  return (
    typeof data.behavioralObjectives === "object" &&
    data.behavioralObjectives !== null &&
    typeof data.strategiesAndDigitalSkills === "object" &&
    data.strategiesAndDigitalSkills !== null &&
    typeof data.lessonScenario === "object" &&
    data.lessonScenario !== null &&
    typeof data.assessmentAndHomework === "object" &&
    data.assessmentAndHomework !== null
  );
}

/**
 * Returns the current persisted lesson preparation for an owned session.
 *
 * A preparation is current only when the session is prepared.
 * Historical generations remain hidden until the session is prepared again.
 */
export const getCurrentLessonPreparation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data, context }) => {
    const auth = {
      client: context.supabase,
      userId: context.userId,
    };

    const session = await LessonSessionService.getSessionById(data.lessonSessionId, auth);

    if (!session) {
      throw new Error("الحصة غير موجودة أو لا تملك صلاحية الوصول إليها.");
    }

    const artifact = await getCurrentLessonPlanPreparation(session, auth);

    if (!artifact) {
      return null;
    }

    const content = artifact.output.content;

    if (!isStructuredLessonPrep(content)) {
      throw new Error("مخرجات التحضير المحفوظة غير صالحة.");
    }

    return {
      id: artifact.id,
      createdAt: artifact.createdAt,
      lessonSessionId: artifact.lessonSessionId,
      content,
    };
  });
