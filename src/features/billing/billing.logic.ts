import { BillingError } from "./types";
import type { CouponAssessment, SubscriptionAccess, SubscriptionStatus } from "./types";

/** How close to expiry the UI starts warning. */
export const EXPIRY_WARNING_DAYS = 14;

/**
 * Legacy fallback length. Phase 2 checkout must NOT use this — billing dates
 * come only from official billing_academic_years / billing_semesters.
 */
export const DEFAULT_TERM_DAYS = 365;

export const SUPPORTED_BILLING_PRODUCTS = ["core"] as const;
export const SUPPORTED_TERM_KINDS = ["semester", "academic_year"] as const;

export type BillingTermKind = (typeof SUPPORTED_TERM_KINDS)[number];
export type BillingPeriodWindow = "current" | "future" | "ended";

export interface OfficialBillingYear {
  id: string;
  starts_on: string;
  ends_on: string;
  is_current: boolean;
}

export interface OfficialBillingSemester {
  id: string;
  academic_year_id: string;
  starts_on: string;
  ends_on: string;
  is_current: boolean;
  sequence: number;
}

export interface ResolvedBillingPeriod {
  termKind: BillingTermKind;
  billingAcademicYearId: string;
  billingSemesterId: string | null;
  startsOn: string;
  endsOn: string;
  window: Exclude<BillingPeriodWindow, "ended">;
}

export interface PlanCatalogueRow {
  id: string;
  code: string;
  name: string;
  price: number | string;
  price_sar: number | string;
  currency: string | null;
  product: string | null;
  term_kind: string | null;
  is_active: boolean | null;
  starts_with: string;
}

export interface ValidatedPlan {
  id: string;
  code: string;
  name: string;
  price: number;
  priceSar: number;
  currency: string;
  product: string;
  termKind: BillingTermKind;
  isActive: true;
  startsWith: string;
}

export interface ExistingSubscriptionRef {
  id: string;
  user_id: string;
  plan_id: string;
  status: string;
  billing_academic_year_id: string | null;
  billing_semester_id: string | null;
}

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

/** Presentation-only vocabulary. Does not affect entitlement or access checks. */
export type SubscriptionDisplayKind =
  "none" | "awaiting_transfer" | "awaiting_admin" | "scheduled" | "active" | "expiring" | "expired";

export interface DeriveSubscriptionDisplayKindInput {
  access: SubscriptionAccess;
  subscriptionStartsAt?: string | null;
  subscriptionExpiresAt?: string | null;
  openCheckoutPaymentStatus?: string | null;
  today?: string;
}

/**
 * Maps server subscription/checkout state to UI labels without changing access logic.
 * Uses checkout payment status when present; otherwise infers scheduled subscriptions
 * from a future official start date with no open checkout.
 */
export function deriveSubscriptionDisplayKind(
  input: DeriveSubscriptionDisplayKindInput,
): SubscriptionDisplayKind {
  const today = input.today ?? todayIso();
  const paymentStatus = input.openCheckoutPaymentStatus?.trim() || null;

  if (input.access === "none") return "none";
  if (input.access === "active") return "active";
  if (input.access === "expiring") return "expiring";
  if (input.access === "expired") return "expired";

  if (paymentStatus === "submitted") return "awaiting_admin";
  if (paymentStatus === "created" || paymentStatus === "rejected") return "awaiting_transfer";

  const startsAt = input.subscriptionStartsAt?.trim() || null;
  if (startsAt && daysUntil(startsAt, today) > 0) return "scheduled";

  if (paymentStatus) return "awaiting_transfer";

  return "awaiting_admin";
}

/** Matches the server entitlement denial message for UI-only CTA wiring. */
export const ENTITLEMENT_DENIED_UI_MESSAGE =
  "هذه الميزة تتطلب اشتراكاً نشطاً. لا يمكن المتابعة بدون صلاحية.";

export function isEntitlementDeniedError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message;
  return (
    message.includes(ENTITLEMENT_DENIED_UI_MESSAGE) ||
    message.includes("FEATURE_ENTITLEMENT_REQUIRED")
  );
}

export function normaliseStatus(value: string | null | undefined): SubscriptionStatus {
  if (value === "active" || value === "pending" || value === "expired" || value === "cancelled") {
    return value;
  }
  if (value === "pending_payment" || value === "scheduled") return "pending";
  if (value === "suspended") return "expired";
  return "pending";
}

/** Arabic labels for payment row statuses. Does not change stored values. */
export function paymentStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case "created":
      return "بانتظار التحويل";
    case "submitted":
      return "تم إرسال رقم العملية";
    case "verified":
      return "تم التحقق";
    case "failed":
      return "فشلت";
    case "rejected":
      return "مرفوضة";
    case "pending":
      return "قيد الانتظار";
    case "paid":
      return "مدفوعة";
    default:
      return status?.trim() ? status : "—";
  }
}

export function classifyBillingPeriod(
  startsOn: string,
  endsOn: string,
  today: string = todayIso(),
): BillingPeriodWindow {
  if (today < startsOn) return "future";
  if (today > endsOn) return "ended";
  return "current";
}

export function activationStatusForPeriod(window: BillingPeriodWindow): "active" | "scheduled" {
  if (window === "ended") {
    throw new BillingError(
      "PERIOD_ENDED",
      "لا يمكن تفعيل اشتراك لفترة دراسية منتهية. حدّث التقويم الرسمي للفوترة.",
    );
  }
  return window === "future" ? "scheduled" : "active";
}

/**
 * Access dates written onto a subscription at successful activation.
 * `period` must be the official calendar bounds from resolveBillingPeriod,
 * not a previously overwritten mid-period starts_on.
 */
export function subscriptionBoundsForPeriod(
  period: { startsOn: string; endsOn: string; window: BillingPeriodWindow },
  activationDate: string,
): { startsOn: string; endsOn: string } {
  if (period.window === "ended") {
    throw new BillingError(
      "PERIOD_ENDED",
      "لا يمكن تفعيل اشتراك لفترة دراسية منتهية. حدّث التقويم الرسمي للفوترة.",
    );
  }

  if (period.window === "current") {
    return { startsOn: activationDate, endsOn: period.endsOn };
  }

  return { startsOn: period.startsOn, endsOn: period.endsOn };
}

export function toMoney(value: number | string): number {
  return roundMoney(typeof value === "number" ? value : Number(value));
}

export function validatePlan(row: PlanCatalogueRow | null | undefined): ValidatedPlan {
  if (!row) {
    throw new BillingError("INVALID_PLAN", "الباقة المطلوبة غير متاحة.");
  }

  if (row.is_active !== true) {
    throw new BillingError("INVALID_PLAN", "الباقة المطلوبة غير متاحة.");
  }

  const product = row.product ?? "";
  if (
    !SUPPORTED_BILLING_PRODUCTS.includes(product as (typeof SUPPORTED_BILLING_PRODUCTS)[number])
  ) {
    throw new BillingError("INVALID_PLAN", "الباقة المطلوبة غير متاحة.");
  }

  const termKind = row.term_kind ?? "";
  if (!SUPPORTED_TERM_KINDS.includes(termKind as BillingTermKind)) {
    throw new BillingError("UNSUPPORTED_TERM", "نوع مدة الباقة غير مدعوم حالياً.");
  }

  if ((row.currency ?? "SAR") !== "SAR") {
    throw new BillingError("INVALID_AMOUNT", "عملة الباقة غير صحيحة.");
  }

  const price = toMoney(row.price);
  const priceSar = toMoney(row.price_sar);

  if (!(price > 0) || !(priceSar > 0)) {
    throw new BillingError("INVALID_AMOUNT", "سعر الباقة غير صالح.");
  }

  if (price !== priceSar) {
    throw new BillingError("INVALID_AMOUNT", "سعر الباقة غير متسق. تعذر إتمام الطلب.");
  }

  return {
    id: row.id,
    code: row.code,
    name: row.name,
    price,
    priceSar,
    currency: "SAR",
    product,
    termKind: termKind as BillingTermKind,
    isActive: true,
    startsWith: row.starts_with,
  };
}

/** Authoritative checkout price. price and price_sar are required to match. */
export function authoritativePlanPrice(plan: ValidatedPlan): number {
  return plan.priceSar;
}

export function checkoutIdempotencyKey(
  userId: string,
  planId: string,
  billingAcademicYearId: string,
  billingSemesterId: string | null,
): string {
  return `checkout:${userId}:${planId}:${billingAcademicYearId}:${billingSemesterId ?? "year"}`;
}

const REUSABLE_CHECKOUT_STATUSES = new Set(["pending_payment", "pending"]);
const BLOCKING_PERIOD_STATUSES = new Set(["active", "scheduled"]);

export function matchSubscriptionForPeriod(
  rows: ExistingSubscriptionRef[],
  userId: string,
  planId: string,
  period: ResolvedBillingPeriod,
): ExistingSubscriptionRef | null {
  return (
    rows.find(
      (row) =>
        row.user_id === userId &&
        row.plan_id === planId &&
        row.billing_academic_year_id === period.billingAcademicYearId &&
        (row.billing_semester_id ?? null) === period.billingSemesterId,
    ) ?? null
  );
}

export function duplicateSubscriptionDecision(
  existing: ExistingSubscriptionRef | null,
): "reuse_checkout" | "block" | "create" {
  if (!existing) return "create";
  if (REUSABLE_CHECKOUT_STATUSES.has(existing.status)) return "reuse_checkout";
  if (BLOCKING_PERIOD_STATUSES.has(existing.status)) return "block";
  return "create";
}

function pickOpenPeriod<T extends { starts_on: string; ends_on: string; is_current: boolean }>(
  rows: T[],
  today: string,
): T {
  const open = rows.filter(
    (row) => classifyBillingPeriod(row.starts_on, row.ends_on, today) !== "ended",
  );

  if (open.length === 0) {
    throw new BillingError(
      "INVALID_PERIOD",
      "لا توجد فترة فوترة حالية أو قادمة. حدّث التقويم الرسمي للفوترة.",
    );
  }

  const current = open.filter(
    (row) => classifyBillingPeriod(row.starts_on, row.ends_on, today) === "current",
  );

  if (current.length > 0) {
    return current.find((row) => row.is_current) ?? current[0];
  }

  const future = [...open].sort((a, b) => a.starts_on.localeCompare(b.starts_on));
  return future[0];
}

/**
 * Resolves the official billing period for a plan. Callers must pass rows from
 * billing_academic_years / billing_semesters only — never teacher calendars.
 */
export function resolveBillingPeriod(
  termKind: string,
  years: OfficialBillingYear[],
  semesters: OfficialBillingSemester[],
  today: string = todayIso(),
): ResolvedBillingPeriod {
  if (!SUPPORTED_TERM_KINDS.includes(termKind as BillingTermKind)) {
    throw new BillingError("UNSUPPORTED_TERM", "نوع مدة الباقة غير مدعوم حالياً.");
  }

  if (years.length === 0) {
    throw new BillingError(
      "CALENDAR_UNAVAILABLE",
      "تقويم الفوترة الرسمي غير جاهز بعد. تعذر إنشاء الاشتراك.",
    );
  }

  if (termKind === "academic_year") {
    const year = pickOpenPeriod(years, today);
    const window = classifyBillingPeriod(year.starts_on, year.ends_on, today);
    if (window === "ended") {
      throw new BillingError(
        "INVALID_PERIOD",
        "لا توجد فترة فوترة حالية أو قادمة. حدّث التقويم الرسمي للفوترة.",
      );
    }
    return {
      termKind,
      billingAcademicYearId: year.id,
      billingSemesterId: null,
      startsOn: year.starts_on,
      endsOn: year.ends_on,
      window,
    };
  }

  if (semesters.length === 0) {
    throw new BillingError(
      "CALENDAR_UNAVAILABLE",
      "تقويم الفوترة الرسمي غير جاهز بعد. تعذر إنشاء الاشتراك.",
    );
  }

  const semester = pickOpenPeriod(semesters, today);
  const year = years.find((row) => row.id === semester.academic_year_id);

  if (!year) {
    throw new BillingError(
      "CALENDAR_UNAVAILABLE",
      "تقويم الفوترة الرسمي غير جاهز بعد. تعذر إنشاء الاشتراك.",
    );
  }

  const window = classifyBillingPeriod(semester.starts_on, semester.ends_on, today);
  if (window === "ended") {
    throw new BillingError(
      "INVALID_PERIOD",
      "لا توجد فترة فوترة حالية أو قادمة. حدّث التقويم الرسمي للفوترة.",
    );
  }

  return {
    termKind: "semester",
    billingAcademicYearId: year.id,
    billingSemesterId: semester.id,
    startsOn: semester.starts_on,
    endsOn: semester.ends_on,
    window,
  };
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
