import type { CouponAssessment, SubscriptionAccess, SubscriptionStatus } from "./types";

/** How close to expiry the UI starts warning. */
export const EXPIRY_WARNING_DAYS = 14;

/** Fallback subscription length when no academic year bounds the term. */
export const DEFAULT_TERM_DAYS = 365;

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addDays(dateIso: string, days: number): string {
  const date = new Date(`${dateIso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`; negative once `to` is in the past. */
export function daysUntil(to: string, from: string = todayIso()): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/**
 * Derives what the app should show. A row stored as 'active' whose expiry has
 * passed is reported as expired: the stored status is only as fresh as the last
 * write, so expiry is always recomputed against today.
 */
export function computeAccess(
  status: SubscriptionStatus | null,
  expiresAt: string | null,
  today: string = todayIso(),
): SubscriptionAccess {
  if (!status || !expiresAt) return "none";
  if (status === "cancelled") return "expired";
  if (status === "pending") return "pending";
  if (status === "expired") return "expired";

  const remaining = daysUntil(expiresAt, today);

  if (remaining < 0) return "expired";
  if (remaining <= EXPIRY_WARNING_DAYS) return "expiring";

  return "active";
}

/** Only 'active' and 'expiring' grant use of paid features. */
export function grantsAccess(access: SubscriptionAccess): boolean {
  return access === "active" || access === "expiring";
}

export function normaliseStatus(value: string | null | undefined): SubscriptionStatus {
  return value === "active" || value === "pending" || value === "expired" || value === "cancelled"
    ? value
    : "pending";
}

/** Rounds to two decimals without floating point drift creeping into totals. */
export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export interface CouponLike {
  code: string;
  type: string;
  value: number;
  starts_at: string | null;
  expires_at: string | null;
  max_usage: number | null;
  used_count: number | null;
  is_active: boolean | null;
}

/**
 * Validates a coupon and computes the resulting price.
 *
 * Runs server-side only: the coupons table is unreadable by teachers, so the
 * client never sees a code it did not already type.
 */
export function assessCoupon(
  coupon: CouponLike | null,
  amount: number,
  now: Date = new Date(),
): CouponAssessment {
  const base = { code: coupon?.code ?? "", discount: 0, finalAmount: roundMoney(amount) };

  if (!coupon) {
    return { ...base, valid: false, reason: "رمز الخصم غير صحيح." };
  }

  if (coupon.is_active === false) {
    return { ...base, valid: false, reason: "رمز الخصم غير مفعّل." };
  }

  if (coupon.starts_at && now < new Date(coupon.starts_at)) {
    return { ...base, valid: false, reason: "رمز الخصم لم يبدأ بعد." };
  }

  if (coupon.expires_at && now > new Date(coupon.expires_at)) {
    return { ...base, valid: false, reason: "انتهت صلاحية رمز الخصم." };
  }

  // max_usage of 0 means unlimited, matching the column default.
  const limit = coupon.max_usage ?? 0;
  const used = coupon.used_count ?? 0;

  if (limit > 0 && used >= limit) {
    return { ...base, valid: false, reason: "تم استخدام رمز الخصم بالكامل." };
  }

  const discount =
    coupon.type === "percent"
      ? roundMoney((amount * coupon.value) / 100)
      : roundMoney(coupon.value);

  const capped = Math.min(discount, amount);

  return {
    valid: true,
    reason: null,
    code: coupon.code,
    discount: capped,
    finalAmount: roundMoney(amount - capped),
  };
}
