import type { SupabaseClient } from "@supabase/supabase-js";

import { todayIso } from "./billing.logic";
import {
  isApprovedFeatureKey,
  selectEffectiveSubscription,
  type FeatureKey,
  type SubscriptionAccessRow,
} from "./entitlement.logic";
import { promoteDueScheduledSubscriptions } from "./promote-scheduled";
import { BillingError } from "./types";

export type EntitlementContext = {
  userId: string;
  subscriptionId: string;
  planId: string;
  featureKey: FeatureKey;
};

/**
 * Trusted server inputs only. `userId` must come from `requireSupabaseAuth`.
 * Client-supplied subscription/plan/entitlement fields are ignored.
 */
export type RequireEntitlementDeps = {
  userId: string;
  supabase: SupabaseClient;
  /**
   * Service-role client for scheduled→active CAS. Production callers pass
   * supabaseAdmin. Tests inject the in-memory client.
   */
  writeClient?: SupabaseClient;
  /** Test-only clock. Production omits this and uses server `todayIso()`. */
  today?: string;
};

async function resolveWriteClient(override: SupabaseClient | undefined): Promise<SupabaseClient> {
  if (override) return override;
  const { supabaseAdmin } = await import("@/platform/database/supabase/client.server");
  return supabaseAdmin;
}

const ENTITLEMENT_DENIED_MESSAGE = "هذه الميزة تتطلب اشتراكاً نشطاً. لا يمكن المتابعة بدون صلاحية.";

export function entitlementDeniedError(): BillingError {
  return new BillingError("FEATURE_ENTITLEMENT_REQUIRED", ENTITLEMENT_DENIED_MESSAGE);
}

function deny(): never {
  throw entitlementDeniedError();
}

/**
 * Server-side paid-feature gate. Fail closed.
 *
 * Granted only when all are true:
 * authenticated user, subscription.status = active, starts_on <= today,
 * ends_on >= today, row belongs to the user, plan exists and is_active,
 * plan_entitlements contains featureKey.
 */
export async function requireEntitlement(
  featureKey: FeatureKey,
  deps: RequireEntitlementDeps,
): Promise<EntitlementContext> {
  const userId = deps.userId;
  const today = deps.today ?? todayIso();

  if (!userId || !isApprovedFeatureKey(featureKey)) {
    deny();
  }

  try {
    const writeClient = await resolveWriteClient(deps.writeClient);
    await promoteDueScheduledSubscriptions(userId, {
      client: writeClient,
      today: deps.today,
    });
  } catch (error) {
    if (error instanceof BillingError) throw error;
    console.error("[billing] scheduled promotion failed");
    deny();
  }

  let rows: SubscriptionAccessRow[] = [];
  try {
    const { data, error } = await deps.supabase
      .from("subscriptions")
      .select("id, user_id, plan_id, status, starts_on, ends_on, product, created_at")
      .eq("user_id", userId);

    if (error) {
      console.error("[billing] entitlement subscription load failed");
      deny();
    }

    rows = (data ?? []) as SubscriptionAccessRow[];
  } catch (error) {
    if (error instanceof BillingError) throw error;
    console.error("[billing] entitlement subscription load failed");
    deny();
  }

  const selected = selectEffectiveSubscription(rows, userId, today);
  if (!selected) {
    deny();
  }

  let planActive = false;
  try {
    const { data: plan, error: planError } = await deps.supabase
      .from("plans")
      .select("id, is_active")
      .eq("id", selected.plan_id)
      .maybeSingle();

    if (planError) {
      console.error("[billing] entitlement plan load failed");
      deny();
    }

    planActive = plan?.is_active === true;
  } catch (error) {
    if (error instanceof BillingError) throw error;
    console.error("[billing] entitlement plan load failed");
    deny();
  }

  if (!planActive) {
    deny();
  }

  let entitled = false;
  try {
    const { data: entitlement, error: entitlementError } = await deps.supabase
      .from("plan_entitlements")
      .select("feature_key")
      .eq("plan_id", selected.plan_id)
      .eq("feature_key", featureKey)
      .maybeSingle();

    if (entitlementError) {
      console.error("[billing] entitlement feature load failed");
      deny();
    }

    entitled = entitlement?.feature_key === featureKey;
  } catch (error) {
    if (error instanceof BillingError) throw error;
    console.error("[billing] entitlement feature load failed");
    deny();
  }

  if (!entitled) {
    deny();
  }

  return {
    userId,
    subscriptionId: selected.id,
    planId: selected.plan_id,
    featureKey,
  };
}
