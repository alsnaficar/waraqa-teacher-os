import type { SupabaseClient } from "@supabase/supabase-js";

import { todayIso } from "./billing.logic";
import type { Json } from "@/platform/database/supabase/types";

export type PromoteScheduledDeps = {
  /** Trusted service-role client. Never the teacher JWT client. */
  client: SupabaseClient;
  /** Test-only clock. Production omits this. */
  today?: string;
};

export type ScheduledPromotionRow = {
  id: string;
  user_id: string;
  status: string;
  starts_on: string;
  ends_on: string;
  starts_at: string | null;
  expires_at: string | null;
  activated_at: string | null;
  plan_id: string;
  billing_academic_year_id: string | null;
  billing_semester_id: string | null;
};

function promotionTimestamp(today: string, injected: boolean): string {
  return injected ? `${today}T00:00:00.000Z` : new Date().toISOString();
}

function isDueScheduled(row: ScheduledPromotionRow, userId: string, today: string): boolean {
  return (
    row.user_id === userId &&
    row.status === "scheduled" &&
    row.starts_on <= today &&
    row.ends_on >= today
  );
}

async function writePromotionAudit(
  client: SupabaseClient,
  userId: string,
  subscriptionId: string,
): Promise<void> {
  const { error } = await client.from("billing_audit_log").insert({
    actor_id: userId,
    action: "subscription_promoted",
    entity_type: "subscription",
    entity_id: subscriptionId,
    new_value: { status: "active" } as Json,
  });

  if (error) {
    console.error("[billing] promotion audit insert failed");
  }
}

/**
 * Request-time CAS: scheduled → active when server today is inside the
 * official window. Does not change period dates. Idempotent.
 */
export async function promoteDueScheduledSubscriptions(
  userId: string,
  deps: PromoteScheduledDeps,
): Promise<{ promotedIds: string[] }> {
  if (!userId) {
    return { promotedIds: [] };
  }

  const injectedToday = deps.today !== undefined;
  const today = deps.today ?? todayIso();
  const activatedAt = promotionTimestamp(today, injectedToday);

  const { data, error } = await deps.client
    .from("subscriptions")
    .select(
      "id, user_id, status, starts_on, ends_on, starts_at, expires_at, activated_at, plan_id, billing_academic_year_id, billing_semester_id",
    )
    .eq("user_id", userId)
    .eq("status", "scheduled");

  if (error) {
    console.error("[billing] scheduled subscription load failed");
    throw error;
  }

  const due = ((data ?? []) as ScheduledPromotionRow[]).filter((row) =>
    isDueScheduled(row, userId, today),
  );

  const promotedIds: string[] = [];

  for (const row of due) {
    const { data: updated, error: updateError } = await deps.client
      .from("subscriptions")
      .update({
        status: "active",
        activated_at: row.activated_at ?? activatedAt,
      })
      .eq("id", row.id)
      .eq("user_id", userId)
      .eq("status", "scheduled")
      .lte("starts_on", today)
      .gte("ends_on", today)
      .select("id")
      .maybeSingle();

    if (updateError) {
      console.error("[billing] scheduled subscription promotion failed");
      throw updateError;
    }

    if (updated?.id) {
      promotedIds.push(updated.id);
      await writePromotionAudit(deps.client, userId, updated.id);
      continue;
    }

    // Lost the CAS race: another request already promoted this row.
    const { data: latest, error: rereadError } = await deps.client
      .from("subscriptions")
      .select("id, status")
      .eq("id", row.id)
      .eq("user_id", userId)
      .maybeSingle();

    if (rereadError) {
      console.error("[billing] scheduled subscription re-read failed");
      throw rereadError;
    }

    if (latest?.status === "active") {
      continue;
    }
  }

  return { promotedIds };
}
