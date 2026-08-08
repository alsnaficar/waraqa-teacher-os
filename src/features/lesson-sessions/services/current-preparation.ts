import type { SupabaseUserContext } from "@/platform/database/supabase/context";
import { resolveUserContext } from "@/platform/database/supabase/context";
import type { LessonSession } from "../types";

/** Latest completed lesson_plan row for a session — not "current" unless session is prepared. */
export type LessonPlanPreparationArtifact = {
  id: string;
  kind: "lesson_plan";
  status: string;
  createdAt: string;
  lessonSessionId: string;
  output: Record<string, unknown>;
};

/**
 * Current preparation rule (P3 Step 4):
 * latest completed lesson_plan for the session, only when session.status === 'prepared'.
 * Scheduled sessions have no current preparation even if historical rows exist.
 */
export async function getCurrentLessonPlanPreparation(
  session: Pick<LessonSession, "id" | "status">,
  context?: SupabaseUserContext,
): Promise<LessonPlanPreparationArtifact | null> {
  if (session.status !== "prepared") {
    return null;
  }

  const resolved = await resolveUserContext(context);
  if (!resolved) return null;

  const { data, error } = await resolved.client
    .from("ai_generations")
    .select("id, kind, status, created_at, lesson_session_id, output")
    .eq("lesson_session_id", session.id)
    .eq("kind", "lesson_plan")
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    id: data.id,
    kind: "lesson_plan",
    status: data.status,
    createdAt: data.created_at,
    lessonSessionId: data.lesson_session_id as string,
    output: (data.output ?? {}) as Record<string, unknown>,
  };
}
