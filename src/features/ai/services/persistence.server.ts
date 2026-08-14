import type { SupabaseClient } from "@supabase/supabase-js";

export type AiGenerationKind = "lesson_plan" | "worksheet" | "quiz" | "activity_ideas";

export async function saveAiGeneration(
  supabase: SupabaseClient,
  params: {
    userId: string;
    kind: AiGenerationKind;
    prompt: string;
    output: Record<string, unknown>;
    /** Required for new product generations (P3 Step 2 Session Binding). */
    lessonSessionId: string;
  },
): Promise<{ id: string; createdAt: string }> {
  const { data, error } = await supabase
    .from("ai_generations")
    .insert({
      user_id: params.userId,
      kind: params.kind,
      prompt: params.prompt,
      output: params.output,
      status: "completed",
      lesson_session_id: params.lessonSessionId,
    })
    .select("id, created_at")
    .single();

  if (error) {
    console.error("ai_generations insert failed", error);
    throw new Error("تعذر حفظ النتيجة.");
  }
  return { id: data.id, createdAt: data.created_at };
}
