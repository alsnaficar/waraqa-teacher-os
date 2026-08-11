import { z } from "zod";

import { assertAdmin } from "@/platform/auth/assert-admin";
import type { Json } from "@/platform/database/supabase/types";
import { BillingAccessError, BillingError } from "./types";
import type { CheckoutResult } from "./types";
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

async function applyCoupon(
  client: AdminClient,
  couponCode: string | undefined,
  listPrice: number,
): Promise<{ amount: number; discount: number; code: string | null; couponId: string | null }> {
  if (!couponCode?.trim()) {
    return { amount: listPrice, discount: 0, code: null, couponId: null };
  }

  const { data: coupon } = await client
    .from("coupons")
    .select("id, code, type, value, starts_at, expires_at, max_usage, used_count, is_active")
    .eq("code", couponCode.trim().toUpperCase())
    .maybeSingle();

  const assessment = assessCoupon((coupon as CouponLike | null) ?? null, listPrice);

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
  const coupon = await applyCoupon(client, input.couponCode, listPrice);
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

  if (!subscriptionId) {
    subscriptionId = await insertSubscription({
      client,
      userId: input.userId,
      plan,
      period,
      paymentId: payment.id,
    });

    const { error: linkError } = await client
      .from("payments")
      .update({ subscription_id: subscriptionId })
      .eq("id", payment.id)
      .eq("user_id", input.userId);

    if (linkError) {
      failClosed(linkError, new BillingError("INVALID_PAYMENT", "تعذر ربط عملية الدفع بالاشتراك."));
    }

    if (!payment.reused) {
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

  const { data: updated, error: updateError } = await client
    .from("payments")
    .update({
      transaction_number: reference,
      transfer_reference: reference,
      status: "submitted",
    })
    .eq("id", input.paymentId)
    .eq("user_id", input.userId)
    .neq("status", "submitted")
    .neq("status", "verified")
    .neq("status", "paid")
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

async function consumeCheckoutCoupon(client: AdminClient, subscriptionId: string): Promise<void> {
  const { data: log } = await client
    .from("subscription_logs")
    .select("notes")
    .eq("subscription_id", subscriptionId)
    .eq("action", "checkout_started")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!log?.notes) return;

  let note: CheckoutNote;
  try {
    note = JSON.parse(log.notes) as CheckoutNote;
  } catch {
    return;
  }

  if (!note.couponCode) return;

  const { data: coupon } = await client
    .from("coupons")
    .select("id, used_count")
    .eq("code", note.couponCode)
    .maybeSingle();

  if (!coupon) return;

  await client
    .from("coupons")
    .update({ used_count: (coupon.used_count ?? 0) + 1 })
    .eq("id", coupon.id);
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
  } | null = null;

  if (subscription.created_from_payment_id) {
    const { data } = await client
      .from("payments")
      .select("id, user_id, subscription_id, status")
      .eq("id", subscription.created_from_payment_id)
      .maybeSingle();
    payment = data;
  }

  if (!payment) {
    const { data } = await client
      .from("payments")
      .select("id, user_id, subscription_id, status")
      .eq("subscription_id", subscription.id)
      .maybeSingle();
    payment = data;
  }

  if (!payment || payment.user_id !== subscription.user_id) {
    throw new BillingError("INVALID_PAYMENT", "لا يمكن تفعيل اشتراك بلا عملية دفع مرتبطة.");
  }

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

  const { error: activateError } = await client
    .from("subscriptions")
    .update(subscriptionPatch)
    .eq("id", subscription.id)
    .eq("user_id", subscription.user_id);

  if (activateError) {
    failClosed(activateError, new BillingError("INVALID_PERIOD", "تعذر تحديث حالة الاشتراك."));
  }

  const { error: paymentError } = await client
    .from("payments")
    .update({
      status: "verified",
      verified_at: now,
      verified_by: input.actorId,
      paid_at: now,
    })
    .eq("id", payment.id)
    .eq("user_id", subscription.user_id);

  if (paymentError) {
    failClosed(paymentError, new BillingError("INVALID_PAYMENT", "تعذر تحديث عملية الدفع."));
  }

  await consumeCheckoutCoupon(client, subscription.id);

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
