import { z } from "zod";

import { assertAdmin } from "@/platform/auth/assert-admin";
import type { Json } from "@/platform/database/supabase/types";
import { BillingAccessError, BillingError } from "./types";
import type { CheckoutResult, CouponAssessment } from "./types";
import {
  activationStatusForPeriod,
  assessCoupon,
  authoritativePlanPrice,
  checkoutIdempotencyKey,
  classifyBillingPeriod,
  duplicateSubscriptionDecision,
  matchSubscriptionForPeriod,
  resolveBillingPeriod,
  roundMoney,
  subscriptionBoundsForPeriod,
  todayIso,
  validatePlan,
  type CouponLike,
  type ExistingSubscriptionRef,
  type OfficialBillingSemester,
  type OfficialBillingYear,
  type PlanCatalogueRow,
  type ResolvedBillingPeriod,
  type ValidatedPlan,
} from "./billing.logic";
import { getPaymentProvider } from "./providers/payment-provider";
import {
  RECEIPT_MAX_BASE64_CHARS,
  RECEIPT_SIGNED_URL_TTL_SECONDS,
  createSupabaseReceiptStorage,
  generateReceiptObjectPath,
  isOwnedReceiptPath,
  validateReceiptFile,
  type ReceiptStorage,
} from "./receipt";

const DEFAULT_PROVIDER = "manual";
const PAYMENT_PROVIDER = "bank";

export const checkoutInputSchema = z
  .object({
    planCode: z.string().min(1),
    couponCode: z.string().max(64).optional(),
  })
  .strict();

export const submitPaymentInputSchema = z
  .object({
    paymentId: z.string().uuid(),
    reference: z.string().min(3).max(128),
  })
  .strict();

export const activateSubscriptionInputSchema = z
  .object({
    subscriptionId: z.string().uuid(),
    note: z.string().max(500).optional(),
  })
  .strict();

export const attachPaymentReceiptInputSchema = z
  .object({
    paymentId: z.string().uuid(),
    contentBase64: z.string().min(1).max(RECEIPT_MAX_BASE64_CHARS),
    mimeType: z.string().max(128).optional(),
    fileName: z.string().max(255).optional(),
  })
  .strict();

export const getAdminReceiptUrlInputSchema = z
  .object({
    paymentId: z.string().uuid(),
  })
  .strict();

export const rejectPaymentInputSchema = z
  .object({
    paymentId: z.string().uuid(),
    reason: z.string().trim().min(3).max(500),
  })
  .strict();

type AdminClient = Awaited<
  typeof import("@/platform/database/supabase/client.server")
>["supabaseAdmin"];

interface CheckoutNote {
  planCode: string;
  couponCode: string | null;
  discount: number;
}

export interface StartCheckoutInput {
  userId: string;
  planCode: string;
  couponCode?: string;
  today?: string;
}

export interface ActivateSubscriptionInput {
  actorId: string;
  subscriptionId: string;
  note?: string;
  today?: string;
}

export interface SubmitPaymentInput {
  userId: string;
  paymentId: string;
  reference: string;
}

export interface AttachPaymentReceiptInput {
  userId: string;
  paymentId: string;
  bytes: Uint8Array;
  declaredMime?: string;
  declaredName?: string;
}

export interface GetAdminReceiptUrlInput {
  actorId: string;
  paymentId: string;
}

export interface RejectPaymentInput {
  actorId: string;
  paymentId: string;
  reason: string;
}

export const ADMIN_SUBSCRIBER_NAME_FALLBACK = "بدون اسم";
export const ADMIN_SUBSCRIBER_EMAIL_FALLBACK = "بدون بريد";

/** Explicit admin-review DTO. Not a raw payments/subscriptions row. */
export type AdminSubmittedPayment = {
  paymentId: string;
  userId: string;
  amountSar: number;
  discountSar: number;
  netSar: number;
  currency: string;
  transferReference: string | null;
  transactionNumber: string | null;
  createdAt: string | null;
  paidAt: string | null;
  verifiedAt: string | null;
  hasReceipt: boolean;
  subscriptionId: string;
  subscription: {
    id: string;
    status: string;
    startsOn: string;
    endsOn: string;
    billingAcademicYearId: string | null;
    billingSemesterId: string | null;
  };
  plan: {
    code: string;
    name: string;
    priceSar: number;
    termKind: string;
  };
  subscriber: {
    fullName: string;
    email: string;
  };
};

/** Activation payload from a trusted queue row. Never includes amount/user/dates. */
export function activationInputFromSubmittedPayment(item: AdminSubmittedPayment): {
  subscriptionId: string;
} {
  return { subscriptionId: item.subscription.id };
}

function failClosed(error: unknown, fallback: BillingError): never {
  if (error instanceof BillingError || error instanceof BillingAccessError) {
    throw error;
  }
  console.error("[billing]", fallback.code, error);
  throw fallback;
}

async function loadOfficialCalendar(
  client: AdminClient,
  termKind: ValidatedPlan["termKind"],
): Promise<{ years: OfficialBillingYear[]; semesters: OfficialBillingSemester[] }> {
  const { data: years, error: yearError } = await client
    .from("billing_academic_years")
    .select("id, starts_on, ends_on, is_current");

  if (yearError) {
    failClosed(
      yearError,
      new BillingError(
        "CALENDAR_UNAVAILABLE",
        "تقويم الفوترة الرسمي غير جاهز بعد. تعذر إنشاء الاشتراك.",
      ),
    );
  }

  if (termKind === "academic_year") {
    return { years: years ?? [], semesters: [] };
  }

  const { data: semesters, error: semesterError } = await client
    .from("billing_semesters")
    .select("id, academic_year_id, starts_on, ends_on, is_current, sequence");

  if (semesterError) {
    failClosed(
      semesterError,
      new BillingError(
        "CALENDAR_UNAVAILABLE",
        "تقويم الفوترة الرسمي غير جاهز بعد. تعذر إنشاء الاشتراك.",
      ),
    );
  }

  return { years: years ?? [], semesters: semesters ?? [] };
}

async function loadOfficialPeriodForSubscription(
  client: AdminClient,
  billingAcademicYearId: string | null,
  billingSemesterId: string | null,
): Promise<{ startsOn: string; endsOn: string }> {
  if (!billingAcademicYearId) {
    throw new BillingError(
      "CALENDAR_UNAVAILABLE",
      "تقويم الفوترة الرسمي غير جاهز بعد. تعذر إنشاء الاشتراك.",
    );
  }

  const { data: year, error: yearError } = await client
    .from("billing_academic_years")
    .select("id, starts_on, ends_on")
    .eq("id", billingAcademicYearId)
    .maybeSingle();

  if (yearError || !year) {
    failClosed(
      yearError,
      new BillingError(
        "CALENDAR_UNAVAILABLE",
        "تقويم الفوترة الرسمي غير جاهز بعد. تعذر إنشاء الاشتراك.",
      ),
    );
  }

  if (!billingSemesterId) {
    return { startsOn: year.starts_on, endsOn: year.ends_on };
  }

  const { data: semester, error: semesterError } = await client
    .from("billing_semesters")
    .select("id, academic_year_id, starts_on, ends_on")
    .eq("id", billingSemesterId)
    .maybeSingle();

  if (semesterError || !semester || semester.academic_year_id !== year.id) {
    failClosed(
      semesterError,
      new BillingError(
        "CALENDAR_UNAVAILABLE",
        "تقويم الفوترة الرسمي غير جاهز بعد. تعذر إنشاء الاشتراك.",
      ),
    );
  }

  return { startsOn: semester.starts_on, endsOn: semester.ends_on };
}

async function loadValidatedPlan(client: AdminClient, planCode: string): Promise<ValidatedPlan> {
  const { data, error } = await client
    .from("plans")
    .select(
      "id, code, name, price, price_sar, currency, product, term_kind, is_active, starts_with",
    )
    .eq("code", planCode)
    .maybeSingle();

  if (error) {
    failClosed(error, new BillingError("INVALID_PLAN", "الباقة المطلوبة غير متاحة."));
  }

  return validatePlan(data as PlanCatalogueRow | null);
}

async function writeAudit(
  client: AdminClient,
  entry: {
    actorId: string;
    action: string;
    entityType: string;
    entityId: string;
    newValue: Json;
  },
): Promise<void> {
  const { error } = await client.from("billing_audit_log").insert({
    actor_id: entry.actorId,
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId,
    new_value: entry.newValue,
  });

  if (error) {
    console.error("[billing] audit insert failed", error);
  }
}

async function resolvePaymentMethodId(client: AdminClient): Promise<string | null> {
  const { data } = await client
    .from("payment_methods")
    .select("id")
    .eq("provider", DEFAULT_PROVIDER)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  return data?.id ?? null;
}

async function loadExistingForPeriod(
  client: AdminClient,
  userId: string,
  planId: string,
  period: ResolvedBillingPeriod,
): Promise<ExistingSubscriptionRef | null> {
  const { data, error } = await client
    .from("subscriptions")
    .select("id, user_id, plan_id, status, billing_academic_year_id, billing_semester_id")
    .eq("user_id", userId)
    .eq("plan_id", planId);

  if (error) {
    failClosed(error, new BillingError("DUPLICATE_CHECKOUT", "تعذر التحقق من الاشتراكات الحالية."));
  }

  return matchSubscriptionForPeriod(
    (data ?? []) as ExistingSubscriptionRef[],
    userId,
    planId,
    period,
  );
}

async function checkoutInstruction(
  planName: string,
  subscriptionId: string,
  paymentId: string,
  amount: number,
): Promise<CheckoutResult["instruction"]> {
  const provider = getPaymentProvider(DEFAULT_PROVIDER);
  if (!provider) {
    throw new BillingError("INVALID_PAYMENT", "لا توجد وسيلة دفع مفعّلة حالياً.");
  }

  return provider.createCheckout({
    subscriptionId,
    paymentId,
    planName,
    amount,
  });
}

async function loadPaymentForSubscription(
  client: AdminClient,
  subscriptionId: string,
): Promise<{ id: string; amount: number; net_sar: number | null } | null> {
  const { data } = await client
    .from("payments")
    .select("id, amount, net_sar")
    .eq("subscription_id", subscriptionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data;
}

async function linkPaymentToSubscription(
  client: AdminClient,
  input: { paymentId: string; userId: string; subscriptionId: string },
): Promise<void> {
  const { error } = await client
    .from("payments")
    .update({ subscription_id: input.subscriptionId })
    .eq("id", input.paymentId)
    .eq("user_id", input.userId);

  if (error) {
    failClosed(error, new BillingError("INVALID_PAYMENT", "تعذر ربط عملية الدفع بالاشتراك."));
  }
}

/**
 * After payment insert/reuse, re-read the official period row before creating a
 * subscription. Closes the checkout race where payment idempotency serializes
 * payment creation but two requests could still insert duplicate pending rows.
 */
async function resolveCheckoutSubscription(
  client: AdminClient,
  input: {
    userId: string;
    plan: ValidatedPlan;
    period: ResolvedBillingPeriod;
    paymentId: string;
  },
): Promise<{ subscriptionId: string; created: boolean }> {
  const raced = await loadExistingForPeriod(client, input.userId, input.plan.id, input.period);
  const racedDecision = duplicateSubscriptionDecision(raced);

  if (racedDecision === "reuse_checkout" && raced) {
    await linkPaymentToSubscription(client, {
      paymentId: input.paymentId,
      userId: input.userId,
      subscriptionId: raced.id,
    });
    return { subscriptionId: raced.id, created: false };
  }

  if (racedDecision === "block" && raced) {
    throw new BillingError(
      "EXISTING_SUBSCRIPTION",
      "لديك اشتراك قائم لهذه الفترة. لا حاجة لإنشاء طلب جديد.",
    );
  }

  const subscriptionId = await insertSubscription({
    client,
    userId: input.userId,
    plan: input.plan,
    period: input.period,
    paymentId: input.paymentId,
  });

  await linkPaymentToSubscription(client, {
    paymentId: input.paymentId,
    userId: input.userId,
    subscriptionId,
  });

  return { subscriptionId, created: true };
}

async function reuseCheckout(
  client: AdminClient,
  plan: ValidatedPlan,
  subscriptionId: string,
): Promise<CheckoutResult> {
  const payment = await loadPaymentForSubscription(client, subscriptionId);

  if (!payment) {
    throw new BillingError("DUPLICATE_CHECKOUT", "يوجد طلب دفع قيد المعالجة لهذه الباقة.");
  }

  const amount = roundMoney(Number(payment.net_sar ?? payment.amount));
  const instruction = await checkoutInstruction(plan.name, subscriptionId, payment.id, amount);

  return {
    subscriptionId,
    paymentId: payment.id,
    amount,
    instruction,
  };
}

async function loadPaymentByIdempotency(
  client: AdminClient,
  key: string,
): Promise<{
  id: string;
  subscription_id: string | null;
  amount: number;
  net_sar: number | null;
} | null> {
  const { data } = await client
    .from("payments")
    .select("id, subscription_id, amount, net_sar")
    .eq("idempotency_key", key)
    .maybeSingle();

  return data;
}

function isUniqueViolation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "23505" || (error.message ?? "").toLowerCase().includes("duplicate");
}

async function insertPayment(input: {
  client: AdminClient;
  userId: string;
  amountSar: number;
  discountSar: number;
  netSar: number;
  couponId: string | null;
  idempotencyKey: string;
}): Promise<{ id: string; reused: boolean; subscriptionId: string | null; amount: number }> {
  const paymentMethodId = await resolvePaymentMethodId(input.client);

  const { data, error } = await input.client
    .from("payments")
    .insert({
      user_id: input.userId,
      provider: PAYMENT_PROVIDER,
      payment_method_id: paymentMethodId,
      amount: input.amountSar,
      amount_sar: input.amountSar,
      discount_sar: input.discountSar,
      net_sar: input.netSar,
      currency: "SAR",
      status: "created",
      coupon_id: input.couponId,
      idempotency_key: input.idempotencyKey,
    })
    .select("id, subscription_id, amount, net_sar")
    .single();

  if (error && isUniqueViolation(error)) {
    const existing = await loadPaymentByIdempotency(input.client, input.idempotencyKey);
    if (!existing) {
      throw new BillingError("DUPLICATE_CHECKOUT", "تم استلام طلب الدفع مسبقاً.");
    }
    return {
      id: existing.id,
      reused: true,
      subscriptionId: existing.subscription_id,
      amount: roundMoney(Number(existing.net_sar ?? existing.amount)),
    };
  }

  if (error || !data) {
    failClosed(error, new BillingError("INVALID_PAYMENT", "تعذر إنشاء عملية الدفع."));
  }

  return {
    id: data.id,
    reused: false,
    subscriptionId: data.subscription_id,
    amount: roundMoney(Number(data.net_sar ?? input.netSar)),
  };
}

async function insertSubscription(input: {
  client: AdminClient;
  userId: string;
  plan: ValidatedPlan;
  period: ResolvedBillingPeriod;
  paymentId: string;
}): Promise<string> {
  const { data, error } = await input.client
    .from("subscriptions")
    .insert({
      user_id: input.userId,
      plan_id: input.plan.id,
      product: input.plan.product,
      status: "pending_payment",
      starts_on: input.period.startsOn,
      ends_on: input.period.endsOn,
      starts_at: input.period.startsOn,
      expires_at: input.period.endsOn,
      billing_academic_year_id: input.period.billingAcademicYearId,
      billing_semester_id: input.period.billingSemesterId,
      created_from_payment_id: input.paymentId,
      academic_year_id: null,
      semester_id: null,
    })
    .select("id")
    .single();

  if (error || !data) {
    failClosed(error, new BillingError("INVALID_PERIOD", "تعذر إنشاء الاشتراك من التقويم الرسمي."));
  }

  return data.id;
}

async function loadCouponRow(
  client: AdminClient,
  couponCode: string,
): Promise<(CouponLike & { id: string }) | null> {
  const { data } = await client
    .from("coupons")
    .select("id, code, type, value, starts_at, expires_at, max_usage, used_count, is_active")
    .eq("code", couponCode.trim().toUpperCase())
    .maybeSingle();

  return (data as (CouponLike & { id: string }) | null) ?? null;
}

async function couponAppliesToPlan(
  client: AdminClient,
  couponId: string,
  planId: string,
): Promise<boolean> {
  const { data, error } = await client
    .from("coupon_plans")
    .select("coupon_id")
    .eq("coupon_id", couponId)
    .eq("plan_id", planId)
    .maybeSingle();

  if (error || !data) return false;
  return data.coupon_id === couponId;
}

/** Coupon is usable only when coupon_plans links it to the selected plan. */
async function loadBoundCoupon(
  client: AdminClient,
  couponCode: string,
  planId: string,
): Promise<(CouponLike & { id: string }) | null> {
  const coupon = await loadCouponRow(client, couponCode);
  if (!coupon) return null;
  const allowed = await couponAppliesToPlan(client, coupon.id, planId);
  return allowed ? coupon : null;
}

/**
 * Preview a coupon against the selected planCode.
 * Plan and price come from the database. Unbound coupons use the existing
 * invalid-coupon assessment (valid: false, "رمز الخصم غير صحيح.").
 */
export async function assessCouponForPlanOp(
  client: AdminClient,
  input: { planCode: string; couponCode: string },
): Promise<CouponAssessment> {
  const plan = await loadValidatedPlan(client, input.planCode);
  const listPrice = authoritativePlanPrice(plan);
  const coupon = await loadBoundCoupon(client, input.couponCode, plan.id);
  return assessCoupon(coupon, listPrice);
}

async function applyCoupon(
  client: AdminClient,
  couponCode: string | undefined,
  plan: ValidatedPlan,
): Promise<{ amount: number; discount: number; code: string | null; couponId: string | null }> {
  const listPrice = authoritativePlanPrice(plan);
  if (!couponCode?.trim()) {
    return { amount: listPrice, discount: 0, code: null, couponId: null };
  }

  const coupon = await loadBoundCoupon(client, couponCode, plan.id);
  const assessment = assessCoupon(coupon, listPrice);

  if (!assessment.valid) {
    return { amount: listPrice, discount: 0, code: null, couponId: null };
  }

  return {
    amount: assessment.finalAmount,
    discount: assessment.discount,
    code: assessment.code,
    couponId: coupon?.id ?? null,
  };
}

export async function startCheckoutOp(
  client: AdminClient,
  input: StartCheckoutInput,
): Promise<CheckoutResult> {
  const today = input.today ?? todayIso();
  const plan = await loadValidatedPlan(client, input.planCode);
  const calendar = await loadOfficialCalendar(client, plan.termKind);
  const period = resolveBillingPeriod(plan.termKind, calendar.years, calendar.semesters, today);

  const existing = await loadExistingForPeriod(client, input.userId, plan.id, period);
  const decision = duplicateSubscriptionDecision(existing);

  if (decision === "block" && existing) {
    throw new BillingError(
      "EXISTING_SUBSCRIPTION",
      "لديك اشتراك قائم لهذه الفترة. لا حاجة لإنشاء طلب جديد.",
    );
  }

  if (decision === "reuse_checkout" && existing) {
    return reuseCheckout(client, plan, existing.id);
  }

  const listPrice = authoritativePlanPrice(plan);
  const coupon = await applyCoupon(client, input.couponCode, plan);
  const idempotencyKey = checkoutIdempotencyKey(
    input.userId,
    plan.id,
    period.billingAcademicYearId,
    period.billingSemesterId,
  );

  const payment = await insertPayment({
    client,
    userId: input.userId,
    amountSar: listPrice,
    discountSar: coupon.discount,
    netSar: coupon.amount,
    couponId: coupon.couponId,
    idempotencyKey,
  });

  let subscriptionId = payment.subscriptionId;
  let subscriptionCreated = false;

  if (!subscriptionId) {
    const resolved = await resolveCheckoutSubscription(client, {
      userId: input.userId,
      plan,
      period,
      paymentId: payment.id,
    });
    subscriptionId = resolved.subscriptionId;
    subscriptionCreated = resolved.created;
  }

  if (!payment.reused && subscriptionCreated) {
    await writeAudit(client, {
      actorId: input.userId,
      action: "checkout_created",
      entityType: "payment",
      entityId: payment.id,
      newValue: {
        planCode: plan.code,
        amountSar: listPrice,
        netSar: coupon.amount,
        billingAcademicYearId: period.billingAcademicYearId,
        billingSemesterId: period.billingSemesterId,
      },
    });

    await writeAudit(client, {
      actorId: input.userId,
      action: "subscription_created",
      entityType: "subscription",
      entityId: subscriptionId,
      newValue: {
        planId: plan.id,
        status: "pending_payment",
        startsOn: period.startsOn,
        endsOn: period.endsOn,
        window: period.window,
      },
    });

    const note: CheckoutNote = {
      planCode: plan.code,
      couponCode: coupon.code,
      discount: coupon.discount,
    };

    await client.from("subscription_logs").insert({
      subscription_id: subscriptionId,
      action: "checkout_started",
      performed_by: input.userId,
      notes: JSON.stringify(note),
    });
  }

  const instruction = await checkoutInstruction(
    plan.name,
    subscriptionId,
    payment.id,
    payment.amount,
  );

  return {
    subscriptionId,
    paymentId: payment.id,
    amount: payment.amount,
    instruction,
  };
}

export async function submitPaymentReferenceOp(
  client: AdminClient,
  input: SubmitPaymentInput,
): Promise<{ ok: true }> {
  const { data: payment, error } = await client
    .from("payments")
    .select("id, status, subscription_id, user_id, transfer_reference, transaction_number")
    .eq("id", input.paymentId)
    .maybeSingle();

  if (error) {
    failClosed(error, new BillingError("INVALID_PAYMENT", "تعذر تحديث عملية الدفع."));
  }

  if (!payment || payment.user_id !== input.userId) {
    throw new BillingAccessError("لا تملك صلاحية تعديل هذه العملية.");
  }

  if (payment.status === "paid" || payment.status === "verified") {
    throw new BillingError("INVALID_PAYMENT", "تم تأكيد هذه العملية مسبقاً.");
  }

  if (!payment.subscription_id) {
    throw new BillingError("INVALID_PAYMENT", "لا يمكن ربط هذه العملية باشتراك.");
  }

  const { data: subscription } = await client
    .from("subscriptions")
    .select("id, user_id")
    .eq("id", payment.subscription_id)
    .maybeSingle();

  if (!subscription || subscription.user_id !== input.userId) {
    throw new BillingAccessError("لا تملك صلاحية تعديل هذه العملية.");
  }

  const reference = input.reference.trim();
  const storedReference = (payment.transfer_reference ?? payment.transaction_number ?? "").trim();

  if (payment.status === "submitted") {
    if (storedReference === reference) {
      return { ok: true };
    }
    throw new BillingError("PAYMENT_REFERENCE_LOCKED", "تم حفظ رقم التحويل ولا يمكن تغييره.");
  }

  if (payment.status === "rejected" && storedReference === reference) {
    throw new BillingError("PAYMENT_REFERENCE_LOCKED", "تم حفظ رقم التحويل ولا يمكن تغييره.");
  }

  if (payment.status !== "created" && payment.status !== "rejected") {
    throw new BillingError("INVALID_PAYMENT", "تعذر تحديث عملية الدفع.");
  }

  const { data: taken, error: takenError } = await client
    .from("payments")
    .select("id")
    .eq("transfer_reference", reference)
    .neq("id", payment.id)
    .maybeSingle();

  if (takenError) {
    failClosed(takenError, new BillingError("INVALID_PAYMENT", "تعذر تحديث عملية الدفع."));
  }

  if (taken) {
    throw new BillingError("INVALID_PAYMENT", "رقم التحويل البنكي مستخدم مسبقاً.");
  }

  const fromStatus = payment.status;
  const patch =
    fromStatus === "rejected"
      ? {
          transaction_number: reference,
          transfer_reference: reference,
          status: "submitted" as const,
          rejection_reason: null,
        }
      : {
          transaction_number: reference,
          transfer_reference: reference,
          status: "submitted" as const,
        };

  const { data: updated, error: updateError } = await client
    .from("payments")
    .update(patch)
    .eq("id", input.paymentId)
    .eq("user_id", input.userId)
    .eq("status", fromStatus)
    .select("id, transfer_reference, transaction_number, status")
    .maybeSingle();

  if (updateError) {
    if (isUniqueViolation(updateError)) {
      throw new BillingError("INVALID_PAYMENT", "رقم التحويل البنكي مستخدم مسبقاً.");
    }
    failClosed(updateError, new BillingError("INVALID_PAYMENT", "تعذر تحديث عملية الدفع."));
  }

  if (!updated) {
    const { data: latest } = await client
      .from("payments")
      .select("status, transfer_reference, transaction_number")
      .eq("id", input.paymentId)
      .eq("user_id", input.userId)
      .maybeSingle();
    const latestReference = (latest?.transfer_reference ?? latest?.transaction_number ?? "").trim();
    if (latest?.status === "submitted" && latestReference === reference) {
      return { ok: true };
    }
    if (latest?.status === "submitted") {
      throw new BillingError("PAYMENT_REFERENCE_LOCKED", "تم حفظ رقم التحويل ولا يمكن تغييره.");
    }
    throw new BillingError("INVALID_PAYMENT", "تعذر تحديث عملية الدفع.");
  }

  await client.from("subscription_logs").insert({
    subscription_id: payment.subscription_id,
    action: "payment_reference_submitted",
    performed_by: input.userId,
  });

  return { ok: true };
}

const COUPON_EXHAUSTED = new BillingError("INVALID_PAYMENT", "تم استخدام رمز الخصم بالكامل.");
const COUPON_PER_USER_EXHAUSTED = new BillingError(
  "INVALID_PAYMENT",
  "تم استنفاد الحد المسموح لاستخدام هذا الكوبون.",
);
const COUPON_CONSUME_FAILED = new BillingError("INVALID_PAYMENT", "تعذر استخدام رمز الخصم.");

type ActivationCoupon = {
  id: string;
  used_count: number;
  max_usage: number;
};

type CouponRedemptionInsertResult = "inserted" | "existing" | "per_user_exhausted";

type CouponRedemptionSlot =
  | { kind: "none" }
  | { kind: "existing" }
  | { kind: "acquired"; couponId: string; previousCount: number; nextCount: number };

async function loadCouponById(client: AdminClient, couponId: string): Promise<ActivationCoupon> {
  const { data, error } = await client
    .from("coupons")
    .select("id, used_count, max_usage")
    .eq("id", couponId)
    .maybeSingle();

  if (error) {
    failClosed(error, COUPON_CONSUME_FAILED);
  }
  if (!data) {
    throw COUPON_CONSUME_FAILED;
  }

  return {
    id: data.id,
    used_count: data.used_count ?? 0,
    max_usage: data.max_usage ?? 0,
  };
}

async function loadCouponCodeFromCheckoutLog(
  client: AdminClient,
  subscriptionId: string,
): Promise<string | null> {
  const { data, error } = await client
    .from("subscription_logs")
    .select("notes")
    .eq("subscription_id", subscriptionId)
    .eq("action", "checkout_started")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    failClosed(error, COUPON_CONSUME_FAILED);
  }
  if (!data?.notes) return null;

  try {
    const note = JSON.parse(data.notes) as CheckoutNote;
    const code = note.couponCode?.trim();
    return code ? code : null;
  } catch {
    throw COUPON_CONSUME_FAILED;
  }
}

/**
 * Prefer payments.coupon_id. Fall back to checkout_started log only when
 * coupon_id is null (legacy rows). Never trusts a client-supplied coupon id.
 */
async function resolveActivationCoupon(
  client: AdminClient,
  payment: { coupon_id: string | null },
  subscriptionId: string,
): Promise<ActivationCoupon | null> {
  if (payment.coupon_id) {
    return loadCouponById(client, payment.coupon_id);
  }

  const code = await loadCouponCodeFromCheckoutLog(client, subscriptionId);
  if (!code) return null;

  const { data, error } = await client
    .from("coupons")
    .select("id, used_count, max_usage")
    .eq("code", code.trim().toUpperCase())
    .maybeSingle();

  if (error) {
    failClosed(error, COUPON_CONSUME_FAILED);
  }
  if (!data) {
    throw COUPON_CONSUME_FAILED;
  }

  return {
    id: data.id,
    used_count: data.used_count ?? 0,
    max_usage: data.max_usage ?? 0,
  };
}

function couponHasCapacity(coupon: ActivationCoupon): boolean {
  return coupon.max_usage === 0 || coupon.used_count < coupon.max_usage;
}

async function incrementCouponUsageCas(
  client: AdminClient,
  coupon: ActivationCoupon,
): Promise<boolean> {
  const expected = coupon.used_count;
  const nextCount = expected + 1;
  const base = client
    .from("coupons")
    .update({ used_count: nextCount })
    .eq("id", coupon.id)
    .eq("used_count", expected);

  const { data, error } =
    coupon.max_usage > 0
      ? await base.lt("used_count", coupon.max_usage).select("id, used_count").maybeSingle()
      : await base.select("id, used_count").maybeSingle();

  if (error) {
    failClosed(error, COUPON_CONSUME_FAILED);
  }
  return Boolean(data?.id);
}

/**
 * Atomic per-user redemption insert via SECURITY DEFINER RPC.
 * Owner must be payment.user_id — never the admin actor.
 */
async function insertCouponRedemption(
  client: AdminClient,
  input: { couponId: string; userId: string; paymentId: string },
): Promise<CouponRedemptionInsertResult> {
  const { data, error } = await client.rpc("try_insert_coupon_redemption", {
    p_coupon_id: input.couponId,
    p_user_id: input.userId,
    p_payment_id: input.paymentId,
  });

  if (error) {
    failClosed(error, COUPON_CONSUME_FAILED);
  }

  if (data === "inserted" || data === "existing" || data === "per_user_exhausted") {
    return data;
  }

  throw COUPON_CONSUME_FAILED;
}

async function deleteCouponRedemption(
  client: AdminClient,
  input: { couponId: string; paymentId: string },
): Promise<void> {
  const { error } = await client
    .from("coupon_redemptions")
    .delete()
    .eq("coupon_id", input.couponId)
    .eq("payment_id", input.paymentId);

  if (error) {
    console.error("[billing] coupon redemption rollback delete failed", error);
  }
}

async function decrementCouponUsageCas(
  client: AdminClient,
  slot: Extract<CouponRedemptionSlot, { kind: "acquired" }>,
): Promise<void> {
  const { data, error } = await client
    .from("coupons")
    .update({ used_count: slot.previousCount })
    .eq("id", slot.couponId)
    .eq("used_count", slot.nextCount)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[billing] coupon usage rollback failed", error);
    return;
  }
  if (!data?.id) {
    console.error("[billing] coupon usage rollback CAS missed");
  }
}

/**
 * Obtain a finite coupon slot before payment verification.
 * Same payment is idempotent via try_insert_coupon_redemption (coupon_id, payment_id).
 * Per-user cap is enforced atomically in that RPC (payment.user_id owner).
 * max_usage = 0 never blocks. Global capacity still uses incrementCouponUsageCas.
 */
async function obtainCouponRedemptionSlot(
  client: AdminClient,
  input: {
    payment: { id: string; user_id: string; coupon_id: string | null };
    subscriptionId: string;
  },
): Promise<CouponRedemptionSlot> {
  const coupon = await resolveActivationCoupon(client, input.payment, input.subscriptionId);
  if (!coupon) {
    return { kind: "none" };
  }

  const insertResult = await insertCouponRedemption(client, {
    couponId: coupon.id,
    userId: input.payment.user_id,
    paymentId: input.payment.id,
  });

  if (insertResult === "existing") {
    return { kind: "existing" };
  }

  if (insertResult === "per_user_exhausted") {
    throw COUPON_PER_USER_EXHAUSTED;
  }

  try {
    if (!couponHasCapacity(coupon)) {
      throw COUPON_EXHAUSTED;
    }

    const incremented = await incrementCouponUsageCas(client, coupon);
    if (!incremented) {
      throw COUPON_EXHAUSTED;
    }

    return {
      kind: "acquired",
      couponId: coupon.id,
      previousCount: coupon.used_count,
      nextCount: coupon.used_count + 1,
    };
  } catch (error) {
    await deleteCouponRedemption(client, {
      couponId: coupon.id,
      paymentId: input.payment.id,
    });
    throw error;
  }
}

async function rollbackCouponRedemptionSlot(
  client: AdminClient,
  slot: CouponRedemptionSlot,
  paymentId: string,
): Promise<void> {
  if (slot.kind !== "acquired") return;

  await deleteCouponRedemption(client, { couponId: slot.couponId, paymentId });
  await decrementCouponUsageCas(client, slot);
}

export async function activateSubscriptionOp(
  client: AdminClient,
  input: ActivateSubscriptionInput,
): Promise<{ ok: true; status: "active" | "scheduled" }> {
  await assertAdmin(client, input.actorId);

  const today = input.today ?? todayIso();

  const { data: subscription, error } = await client
    .from("subscriptions")
    .select(
      "id, user_id, plan_id, status, starts_on, ends_on, created_from_payment_id, billing_academic_year_id, billing_semester_id",
    )
    .eq("id", input.subscriptionId)
    .maybeSingle();

  if (error) {
    failClosed(error, new BillingError("SUBSCRIPTION_NOT_FOUND", "الاشتراك غير موجود."));
  }
  if (!subscription) {
    throw new BillingError("SUBSCRIPTION_NOT_FOUND", "الاشتراك غير موجود.");
  }

  if (subscription.status === "active" || subscription.status === "scheduled") {
    throw new BillingError("EXISTING_SUBSCRIPTION", "الاشتراك مفعّل مسبقاً.");
  }

  if (subscription.status !== "pending_payment") {
    throw new BillingError("INVALID_PERIOD", "تعذر تحديث حالة الاشتراك.");
  }

  const official = await loadOfficialPeriodForSubscription(
    client,
    subscription.billing_academic_year_id,
    subscription.billing_semester_id,
  );
  const window = classifyBillingPeriod(official.startsOn, official.endsOn, today);
  const nextStatus = activationStatusForPeriod(window);
  const bounds = subscriptionBoundsForPeriod(
    { startsOn: official.startsOn, endsOn: official.endsOn, window },
    today,
  );

  let payment: {
    id: string;
    user_id: string;
    subscription_id: string | null;
    status: string;
    coupon_id: string | null;
  } | null = null;

  if (subscription.created_from_payment_id) {
    const { data, error: paymentLoadError } = await client
      .from("payments")
      .select("id, user_id, subscription_id, status, coupon_id")
      .eq("id", subscription.created_from_payment_id)
      .maybeSingle();
    if (paymentLoadError) {
      failClosed(
        paymentLoadError,
        new BillingError("INVALID_PAYMENT", "لا يمكن تفعيل اشتراك بلا عملية دفع مرتبطة."),
      );
    }
    payment = data;
  }

  if (!payment) {
    const { data, error: paymentLoadError } = await client
      .from("payments")
      .select("id, user_id, subscription_id, status, coupon_id")
      .eq("subscription_id", subscription.id)
      .maybeSingle();
    if (paymentLoadError) {
      failClosed(
        paymentLoadError,
        new BillingError("INVALID_PAYMENT", "لا يمكن تفعيل اشتراك بلا عملية دفع مرتبطة."),
      );
    }
    payment = data;
  }

  if (!payment || payment.user_id !== subscription.user_id) {
    throw new BillingError("INVALID_PAYMENT", "لا يمكن تفعيل اشتراك بلا عملية دفع مرتبطة.");
  }

  if (payment.status !== "submitted") {
    throw new BillingError("INVALID_PAYMENT", "لا يمكن تفعيل هذه الدفعة.");
  }

  const couponSlot = await obtainCouponRedemptionSlot(client, {
    payment,
    subscriptionId: subscription.id,
  });

  const now = input.today ? `${today}T00:00:00.000Z` : new Date().toISOString();
  const subscriptionPatch: {
    status: "active" | "scheduled";
    starts_on: string;
    starts_at: string;
    ends_on: string;
    expires_at: string;
    activated_at?: string | null;
  } = {
    status: nextStatus,
    starts_on: bounds.startsOn,
    starts_at: bounds.startsOn,
    ends_on: bounds.endsOn,
    expires_at: bounds.endsOn,
  };

  if (nextStatus === "active") {
    subscriptionPatch.activated_at = now;
  }

  const { data: verifiedPayment, error: paymentError } = await client
    .from("payments")
    .update({
      status: "verified",
      verified_at: now,
      verified_by: input.actorId,
      paid_at: now,
    })
    .eq("id", payment.id)
    .eq("user_id", subscription.user_id)
    .eq("status", "submitted")
    .select("id")
    .maybeSingle();

  if (paymentError || !verifiedPayment) {
    await rollbackCouponRedemptionSlot(client, couponSlot, payment.id);
    failClosed(
      paymentError ?? new Error("activation payment CAS missed"),
      new BillingError("INVALID_PAYMENT", "لا يمكن تفعيل هذه الدفعة."),
    );
  }

  const { data: activatedSubscription, error: activateError } = await client
    .from("subscriptions")
    .update(subscriptionPatch)
    .eq("id", subscription.id)
    .eq("user_id", subscription.user_id)
    .eq("status", "pending_payment")
    .select("id")
    .maybeSingle();

  if (activateError || !activatedSubscription) {
    const { error: revertError } = await client
      .from("payments")
      .update({
        status: "submitted",
        verified_at: null,
        verified_by: null,
        paid_at: null,
      })
      .eq("id", payment.id)
      .eq("user_id", subscription.user_id)
      .eq("status", "verified");

    if (revertError) {
      console.error("[billing] activation payment revert failed", revertError);
    }

    await rollbackCouponRedemptionSlot(client, couponSlot, payment.id);
    failClosed(
      activateError ?? new Error("activation subscription CAS missed"),
      new BillingError("INVALID_PERIOD", "تعذر تحديث حالة الاشتراك."),
    );
  }

  await client.from("subscription_logs").insert({
    subscription_id: subscription.id,
    action: "activated",
    performed_by: input.actorId,
    notes: input.note ?? null,
  });

  await writeAudit(client, {
    actorId: input.actorId,
    action: "subscription_activated",
    entityType: "subscription",
    entityId: subscription.id,
    newValue: { status: nextStatus, paymentId: payment.id },
  });

  return { ok: true, status: nextStatus };
}

async function listAuthEmailsByUserId(
  client: AdminClient,
): Promise<Map<string, string | undefined>> {
  const perPage = 200;
  let page = 1;
  const emails = new Map<string, string | undefined>();

  for (;;) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.error("[billing] admin listUsers failed:", error.message);
      throw new Error("تعذّر جلب بيانات المشتركين");
    }
    const batch = data?.users ?? [];
    for (const user of batch) {
      emails.set(user.id, user.email);
    }
    if (batch.length < perPage) break;
    page += 1;
    if (page > 50) break;
  }

  return emails;
}

/**
 * Admin-only submitted bank-transfer queue.
 * Authorization: JWT actorId → assertAdmin → service_role reads.
 * Status filter is hardcoded to `submitted`. Client cannot supply filters.
 */
export async function listAdminSubmittedPaymentsOp(
  client: AdminClient,
  actorId: string,
): Promise<AdminSubmittedPayment[]> {
  await assertAdmin(client, actorId);

  const { data: paymentRows, error: paymentError } = await client
    .from("payments")
    .select(
      "id, user_id, amount_sar, discount_sar, net_sar, currency, transfer_reference, transaction_number, created_at, paid_at, verified_at, receipt_path, subscription_id, status",
    )
    .eq("status", "submitted")
    .order("created_at", { ascending: false });

  if (paymentError) {
    console.error("[billing] admin submitted payments read failed:", paymentError.message);
    throw new Error("تعذّر جلب الدفعات بانتظار المراجعة");
  }

  const submitted = (paymentRows ?? []).filter(
    (row) =>
      row.status === "submitted" && typeof row.subscription_id === "string" && row.subscription_id,
  );

  if (submitted.length === 0) {
    return [];
  }

  const subscriptionIds = [...new Set(submitted.map((row) => row.subscription_id as string))];
  const userIds = [...new Set(submitted.map((row) => row.user_id))];

  const { data: subscriptionRows, error: subscriptionError } = await client
    .from("subscriptions")
    .select(
      "id, status, starts_on, ends_on, billing_academic_year_id, billing_semester_id, plan_id, user_id",
    )
    .in("id", subscriptionIds);

  if (subscriptionError) {
    console.error(
      "[billing] admin submitted subscriptions read failed:",
      subscriptionError.message,
    );
    throw new Error("تعذّر جلب الدفعات بانتظار المراجعة");
  }

  const subscriptionById = new Map((subscriptionRows ?? []).map((row) => [row.id, row]));
  const planIds = [
    ...new Set(
      (subscriptionRows ?? [])
        .map((row) => row.plan_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];

  const { data: planRows, error: planError } =
    planIds.length > 0
      ? await client.from("plans").select("id, code, name, price_sar, term_kind").in("id", planIds)
      : { data: [], error: null };

  if (planError) {
    console.error("[billing] admin submitted plans read failed:", planError.message);
    throw new Error("تعذّر جلب الدفعات بانتظار المراجعة");
  }

  const planById = new Map((planRows ?? []).map((row) => [row.id, row]));

  const { data: profileRows, error: profileError } = await client
    .from("profiles")
    .select("id, full_name")
    .in("id", userIds);

  if (profileError) {
    console.error("[billing] admin submitted profiles read failed:", profileError.message);
    throw new Error("تعذّر جلب بيانات المشتركين");
  }

  const nameById = new Map(
    (profileRows ?? []).map((row) => [row.id, row.full_name as string | null]),
  );
  const emailById = await listAuthEmailsByUserId(client);

  const items: AdminSubmittedPayment[] = [];
  for (const payment of submitted) {
    const subscriptionId = payment.subscription_id as string;
    const subscription = subscriptionById.get(subscriptionId);
    if (!subscription || subscription.user_id !== payment.user_id) {
      continue;
    }

    const plan = planById.get(subscription.plan_id);
    const fullName = nameById.get(payment.user_id)?.trim();
    const email = emailById.get(payment.user_id)?.trim();

    items.push({
      paymentId: payment.id,
      userId: payment.user_id,
      amountSar: Number(payment.amount_sar ?? 0),
      discountSar: Number(payment.discount_sar ?? 0),
      netSar: Number(payment.net_sar ?? payment.amount_sar ?? 0),
      currency: payment.currency || "SAR",
      transferReference: payment.transfer_reference ?? null,
      transactionNumber: payment.transaction_number ?? null,
      createdAt: payment.created_at ?? null,
      paidAt: payment.paid_at ?? null,
      verifiedAt: payment.verified_at ?? null,
      hasReceipt: Boolean(payment.receipt_path && String(payment.receipt_path).trim()),
      subscriptionId,
      subscription: {
        id: subscription.id,
        status: subscription.status,
        startsOn: subscription.starts_on,
        endsOn: subscription.ends_on,
        billingAcademicYearId: subscription.billing_academic_year_id,
        billingSemesterId: subscription.billing_semester_id,
      },
      plan: {
        code: plan?.code ?? "",
        name: plan?.name ?? "",
        priceSar: Number(plan?.price_sar ?? 0),
        termKind: plan?.term_kind ?? "",
      },
      subscriber: {
        fullName: fullName || ADMIN_SUBSCRIBER_NAME_FALLBACK,
        email: email || ADMIN_SUBSCRIBER_EMAIL_FALLBACK,
      },
    });
  }

  return items;
}

const RECEIPT_ATTACHABLE_PAYMENT_STATUSES = ["created", "submitted", "rejected"] as const;
const RECEIPT_BLOCKED_SUBSCRIPTION_STATUSES = new Set([
  "scheduled",
  "active",
  "expired",
  "cancelled",
]);

export async function attachPaymentReceiptOp(
  client: AdminClient,
  input: AttachPaymentReceiptInput,
  storage: ReceiptStorage = createSupabaseReceiptStorage(client as never),
): Promise<{ ok: true; hasReceipt: true }> {
  const validated = validateReceiptFile({
    bytes: input.bytes,
    declaredMime: input.declaredMime,
    declaredName: input.declaredName,
  });

  const { data: payment, error } = await client
    .from("payments")
    .select("id, status, user_id, subscription_id, receipt_path")
    .eq("id", input.paymentId)
    .maybeSingle();

  if (error) {
    failClosed(error, new BillingError("INVALID_PAYMENT", "تعذر تحديث عملية الدفع."));
  }

  if (!payment) {
    throw new BillingError("INVALID_PAYMENT", "عملية الدفع غير موجودة.");
  }

  if (payment.user_id !== input.userId) {
    throw new BillingAccessError("لا تملك صلاحية تعديل هذه العملية.");
  }

  if (
    payment.status === "verified" ||
    payment.status === "paid" ||
    payment.status === "failed" ||
    !RECEIPT_ATTACHABLE_PAYMENT_STATUSES.includes(
      payment.status as (typeof RECEIPT_ATTACHABLE_PAYMENT_STATUSES)[number],
    )
  ) {
    throw new BillingError("INVALID_PAYMENT", "لا يمكن رفع إيصال لهذه العملية.");
  }

  if (!payment.subscription_id) {
    throw new BillingError("INVALID_PAYMENT", "لا يمكن ربط هذه العملية باشتراك.");
  }

  const { data: subscription } = await client
    .from("subscriptions")
    .select("id, user_id, status")
    .eq("id", payment.subscription_id)
    .maybeSingle();

  if (!subscription || subscription.user_id !== input.userId) {
    throw new BillingAccessError("لا تملك صلاحية تعديل هذه العملية.");
  }

  if (RECEIPT_BLOCKED_SUBSCRIPTION_STATUSES.has(subscription.status)) {
    throw new BillingError("INVALID_PAYMENT", "لا يمكن رفع إيصال لهذه العملية.");
  }

  const objectPath = generateReceiptObjectPath(input.userId, payment.id, validated.ext);
  const previousPath =
    typeof payment.receipt_path === "string" && payment.receipt_path.trim()
      ? payment.receipt_path.trim()
      : null;

  await storage.upload(objectPath, input.bytes, validated.mime);

  const { data: updated, error: updateError } = await client
    .from("payments")
    .update({ receipt_path: objectPath })
    .eq("id", payment.id)
    .eq("user_id", input.userId)
    .in("status", [...RECEIPT_ATTACHABLE_PAYMENT_STATUSES])
    .select("id, receipt_path, status")
    .maybeSingle();

  if (updateError || !updated) {
    try {
      await storage.remove(objectPath);
    } catch (cleanupError) {
      console.error("[billing] failed to clean uploaded receipt after CAS miss:", cleanupError);
    }
    failClosed(
      updateError ?? new Error("receipt CAS missed"),
      new BillingError("INVALID_PAYMENT", "تعذر حفظ الإيصال."),
    );
  }

  if (previousPath && previousPath !== objectPath) {
    try {
      await storage.remove(previousPath);
    } catch (cleanupError) {
      console.error("[billing] failed to delete replaced receipt object:", cleanupError);
    }
  }

  return { ok: true, hasReceipt: true };
}

export async function getAdminReceiptUrlOp(
  client: AdminClient,
  input: GetAdminReceiptUrlInput,
  storage: ReceiptStorage = createSupabaseReceiptStorage(client as never),
): Promise<{ url: string; expiresIn: number }> {
  await assertAdmin(client, input.actorId);

  const { data: payment, error } = await client
    .from("payments")
    .select("id, user_id, receipt_path")
    .eq("id", input.paymentId)
    .maybeSingle();

  if (error) {
    failClosed(error, new BillingError("INVALID_PAYMENT", "تعذر عرض الإيصال."));
  }

  if (!payment) {
    throw new BillingError("INVALID_PAYMENT", "عملية الدفع غير موجودة.");
  }

  const receiptPath = typeof payment.receipt_path === "string" ? payment.receipt_path.trim() : "";
  if (!receiptPath || !isOwnedReceiptPath(payment.user_id, receiptPath)) {
    throw new BillingError("INVALID_PAYMENT", "لا يوجد إيصال لهذه العملية.");
  }

  const url = await storage.createSignedUrl(receiptPath, RECEIPT_SIGNED_URL_TTL_SECONDS);
  return { url, expiresIn: RECEIPT_SIGNED_URL_TTL_SECONDS };
}

function normalizeRejectionReason(raw: string): string {
  const reason = raw.trim();
  if (reason.length < 3 || reason.length > 500) {
    throw new BillingError("INVALID_PAYMENT", "سبب الرفض يجب أن يكون بين 3 و500 حرف.");
  }
  return reason;
}

export async function rejectPaymentOp(
  client: AdminClient,
  input: RejectPaymentInput,
): Promise<{ ok: true }> {
  await assertAdmin(client, input.actorId);

  const reason = normalizeRejectionReason(input.reason);

  const { data: payment, error } = await client
    .from("payments")
    .select("id, status, user_id, subscription_id, rejection_reason")
    .eq("id", input.paymentId)
    .maybeSingle();

  if (error) {
    failClosed(error, new BillingError("INVALID_PAYMENT", "تعذر تحديث عملية الدفع."));
  }

  if (!payment) {
    throw new BillingError("INVALID_PAYMENT", "عملية الدفع غير موجودة.");
  }

  if (payment.status === "rejected") {
    const previous = (payment.rejection_reason ?? "").trim();
    if (previous === reason) {
      return { ok: true };
    }
    throw new BillingError("INVALID_PAYMENT", "تم رفض هذه العملية مسبقاً.");
  }

  if (payment.status !== "submitted") {
    throw new BillingError("INVALID_PAYMENT", "لا يمكن رفض هذه الدفعة.");
  }

  if (!payment.subscription_id) {
    throw new BillingError("INVALID_PAYMENT", "لا يمكن ربط هذه العملية باشتراك.");
  }

  const { data: subscription } = await client
    .from("subscriptions")
    .select("id, user_id, status")
    .eq("id", payment.subscription_id)
    .maybeSingle();

  if (!subscription || subscription.user_id !== payment.user_id) {
    throw new BillingError("INVALID_PAYMENT", "لا يمكن ربط هذه العملية باشتراك.");
  }

  const { data: updated, error: updateError } = await client
    .from("payments")
    .update({
      status: "rejected",
      rejection_reason: reason,
    })
    .eq("id", payment.id)
    .eq("status", "submitted")
    .select("id, status, rejection_reason")
    .maybeSingle();

  if (updateError) {
    failClosed(updateError, new BillingError("INVALID_PAYMENT", "تعذر تحديث عملية الدفع."));
  }

  if (!updated) {
    const { data: latest } = await client
      .from("payments")
      .select("status, rejection_reason")
      .eq("id", payment.id)
      .maybeSingle();
    if (latest?.status === "rejected" && (latest.rejection_reason ?? "").trim() === reason) {
      return { ok: true };
    }
    if (latest?.status === "rejected") {
      throw new BillingError("INVALID_PAYMENT", "تم رفض هذه العملية مسبقاً.");
    }
    throw new BillingError("INVALID_PAYMENT", "تعذر تحديث عملية الدفع.");
  }

  await writeAudit(client, {
    actorId: input.actorId,
    action: "payment_rejected",
    entityType: "payment",
    entityId: payment.id,
    newValue: {
      status: "rejected",
      rejectionReason: reason,
      subscriptionId: payment.subscription_id,
    },
  });

  await client.from("subscription_logs").insert({
    subscription_id: payment.subscription_id,
    action: "payment_rejected",
    performed_by: input.actorId,
    notes: reason,
  });

  return { ok: true };
}
