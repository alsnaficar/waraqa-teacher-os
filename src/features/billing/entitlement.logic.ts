/**
 * Launch feature keys. Must match persisted `plan_entitlements.feature_key`
 * and `ai_generations.kind`. Do not invent additional keys here.
 */
export const APPROVED_FEATURE_KEYS = [
  "lesson_plan",
  "worksheet",
  "quiz",
  "activity_ideas",
] as const;

export type FeatureKey = (typeof APPROVED_FEATURE_KEYS)[number];

/** Raw stored statuses that must never grant paid access. */
export const DENIED_SUBSCRIPTION_STATUSES = [
  "pending_payment",
  "pending",
  "scheduled",
  "expired",
  "suspended",
  "cancelled",
] as const;

export type SubscriptionAccessRow = {
  id: string;
  user_id: string;
  plan_id: string;
  status: string;
  starts_on: string;
  ends_on: string;
  product: string;
  created_at: string | null;
};

export function isApprovedFeatureKey(value: string): value is FeatureKey {
  return (APPROVED_FEATURE_KEYS as readonly string[]).includes(value);
}

export function featureKeyForGenerationKind(kind: string): FeatureKey | null {
  return isApprovedFeatureKey(kind) ? kind : null;
}

/**
 * Effective paid access: raw status must be `active` and today must fall
 * inside `[starts_on, ends_on]`. Ownership is checked explicitly.
 * Does not use `normaliseStatus`.
 */
export function subscriptionIsEffective(
  row: SubscriptionAccessRow,
  userId: string,
  today: string,
): boolean {
  if (!userId || row.user_id !== userId) return false;
  if (row.status !== "active") return false;
  if (row.starts_on > today) return false;
  if (row.ends_on < today) return false;
  return true;
}

/**
 * Pick the subscription that may grant access.
 * Never prefers scheduled/future rows. Never picks another user's row.
 * If several actives cover today: core product, then latest ends_on, then id.
 */
export function selectEffectiveSubscription(
  rows: readonly SubscriptionAccessRow[],
  userId: string,
  today: string,
): SubscriptionAccessRow | null {
  const eligible = rows.filter((row) => subscriptionIsEffective(row, userId, today));
  if (eligible.length === 0) return null;
  return [...eligible].sort(compareEffectiveSubscriptions)[0] ?? null;
}

function compareEffectiveSubscriptions(a: SubscriptionAccessRow, b: SubscriptionAccessRow): number {
  if (a.product === "core" && b.product !== "core") return -1;
  if (b.product === "core" && a.product !== "core") return 1;
  const ends = b.ends_on.localeCompare(a.ends_on);
  if (ends !== 0) return ends;
  const starts = a.starts_on.localeCompare(b.starts_on);
  if (starts !== 0) return starts;
  return a.id.localeCompare(b.id);
}
