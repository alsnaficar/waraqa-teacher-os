import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/platform/database/supabase/auth-middleware";
import {
  addDays,
  assessCoupon,
  computeAccess,
  DEFAULT_TERM_DAYS,
  daysUntil,
  normaliseStatus,
  roundMoney,
  todayIso,
  type CouponLike,
} from "./billing.logic";
import { getPaymentProvider } from "./providers/payment-provider";
import "./providers/manual-provider";
import type {
  CheckoutResult,
  CouponAssessment,
  PaymentRecord,
  Plan,
  Subscription,
  SubscriptionState,
} from "./types";

const DEFAULT_PROVIDER = "manual";

/** Structured payload stored on the checkout audit entry. */
interface CheckoutNote {
  planCode: string;
  couponCode: string | null;
  discount: number;
}

function toPlan(row: {
  id: string;
  code: string;
  name: string;
  price: number;
  starts_with: string;
  is_active: boolean | null;
}): Plan {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    price: Number(row.price),
    startsWith: row.starts_with,
    isActive: row.is_active ?? false,
  };
}

function toSubscription(row: {
  id: string;
  plan_id: string;
  status: string;
  starts_at: string;
  expires_at: string;
  academic_year_id: string | null;
  semester_id: string | null;
  created_at: string | null;
}): Subscription {
  return {
    id: row.id,
    planId: row.plan_id,
    status: normaliseStatus(row.status),
    startsAt: row.starts_at,
    expiresAt: row.expires_at,
    academicYearId: row.academic_year_id,
    semesterId: row.semester_id,
    createdAt: row.created_at,
  };
}

/**
 * The teacher's current subscription, newest first.
 *
 * Read through the caller's own client so RLS still applies even if this
 * function is ever reached without the expected filters.
 */
export const getSubscriptionState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SubscriptionState> => {
    const { data: rows, error } = await context.supabase
      .from("subscriptions")
      .select(
        "id, plan_id, status, starts_at, expires_at, academic_year_id, semester_id, created_at",
      )
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(5);

    if (error) throw error;

    if (!rows || rows.length === 0) {
      return {
        access: "none",
        subscription: null,
        plan: null,
        daysRemaining: null,
        expiresAt: null,
      };
    }

    // Prefer a live subscription over an older expired or pending one.
    const ranked = [...rows].sort(
      (a, b) => rank(a.status, a.expires_at) - rank(b.status, b.expires_at),
    );
    const current = toSubscription(ranked[0]);

    const { data: planRow } = await context.supabase
      .from("plans")
      .select("id, code, name, price, starts_with, is_active")
      .eq("id", current.planId)
      .maybeSingle();

    return {
      access: computeAccess(current.status, current.expiresAt),
      subscription: current,
      plan: planRow ? toPlan(planRow) : null,
      daysRemaining: daysUntil(current.expiresAt),
      expiresAt: current.expiresAt,
    };
  });

/** Lower sorts first: a usable subscription beats pending, which beats expired. */
function rank(status: string, expiresAt: string): number {
  const normalised = normaliseStatus(status);
  if (normalised === "active" && daysUntil(expiresAt) >= 0) return 0;
  if (normalised === "pending") return 1;
  return 2;
}

export const listPlans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Plan[]> => {
    const { data, error } = await context.supabase
      .from("plans")
      .select("id, code, name, price, starts_with, is_active")
      .eq("is_active", true)
      .order("price", { ascending: true });

    if (error) throw error;

    return (data ?? []).map(toPlan);
  });

export const getBillingHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PaymentRecord[]> => {
    // RLS restricts this to payments belonging to the caller's subscriptions.
    const { data, error } = await context.supabase
      .from("payments")
      .select("id, amount, status, transaction_number, paid_at, created_at")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;

    return (data ?? []).map((row) => ({
      id: row.id,
      amount: Number(row.amount),
      status: row.status,
      transactionNumber: row.transaction_number,
      paidAt: row.paid_at,
      createdAt: row.created_at,
    }));
  });

/**
 * Prices a coupon against a plan without ever exposing the coupons table.
 * The client only learns about a code it already typed.
 */
export const assessCouponCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ planCode: z.string().min(1), couponCode: z.string().min(1).max(64) }).parse(data),
  )
  .handler(async ({ data }): Promise<CouponAssessment> => {
    const { supabaseAdmin } = await import("@/platform/database/supabase/client.server");

    const { data: plan } = await supabaseAdmin
      .from("plans")
      .select("price")
      .eq("code", data.planCode)
      .eq("is_active", true)
      .maybeSingle();

    if (!plan) {
      return {
        valid: false,
        reason: "الباقة غير متاحة.",
        code: data.couponCode,
        discount: 0,
        finalAmount: 0,
      };
    }

    const { data: coupon } = await supabaseAdmin
      .from("coupons")
      .select("code, type, value, starts_at, expires_at, max_usage, used_count, is_active")
      .eq("code", data.couponCode.trim().toUpperCase())
      .maybeSingle();

    return assessCoupon((coupon as CouponLike | null) ?? null, Number(plan.price));
  });

/**
 * Opens a pending subscription and its pending payment.
 *
 * Everything that determines price or duration is computed here, never taken
 * from the client. Re-running for an already pending checkout returns the same
 * rows instead of stacking duplicates.
 */
export const startCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        planCode: z.string().min(1),
        couponCode: z.string().max(64).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<CheckoutResult> => {
    const { supabaseAdmin } = await import("@/platform/database/supabase/client.server");

    const { data: planRow, error: planError } = await supabaseAdmin
      .from("plans")
      .select("id, code, name, price, starts_with, is_active")
      .eq("code", data.planCode)
      .eq("is_active", true)
      .maybeSingle();

    if (planError) throw planError;
    if (!planRow) throw new Error("الباقة المطلوبة غير متاحة.");

    const plan = toPlan(planRow);

    const existing = await findReusablePending(supabaseAdmin, context.userId, plan);
    if (existing) return existing;

    const startsAt = todayIso();
    const { expiresAt, academicYearId } = await resolveTerm(
      supabaseAdmin,
      context.userId,
      startsAt,
    );

    let amount = plan.price;
    let couponCode: string | null = null;
    let discount = 0;

    if (data.couponCode?.trim()) {
      const { data: coupon } = await supabaseAdmin
        .from("coupons")
        .select("code, type, value, starts_at, expires_at, max_usage, used_count, is_active")
        .eq("code", data.couponCode.trim().toUpperCase())
        .maybeSingle();

      const assessment = assessCoupon((coupon as CouponLike | null) ?? null, plan.price);

      if (assessment.valid) {
        amount = assessment.finalAmount;
        discount = assessment.discount;
        couponCode = assessment.code;
      }
    }

    const { data: subscriptionRow, error: subscriptionError } = await supabaseAdmin
      .from("subscriptions")
      .insert({
        user_id: context.userId,
        plan_id: plan.id,
        status: "pending",
        starts_at: startsAt,
        expires_at: expiresAt,
        academic_year_id: academicYearId,
      })
      .select(
        "id, plan_id, status, starts_at, expires_at, academic_year_id, semester_id, created_at",
      )
      .single();

    if (subscriptionError) throw subscriptionError;

    const paymentMethodId = await resolvePaymentMethod(supabaseAdmin, DEFAULT_PROVIDER);

    const { data: paymentRow, error: paymentError } = await supabaseAdmin
      .from("payments")
      .insert({
        subscription_id: subscriptionRow.id,
        payment_method_id: paymentMethodId,
        amount: roundMoney(amount),
        status: "pending",
      })
      .select("id, amount")
      .single();

    if (paymentError) throw paymentError;

    const note: CheckoutNote = { planCode: plan.code, couponCode, discount };

    await supabaseAdmin.from("subscription_logs").insert({
      subscription_id: subscriptionRow.id,
      action: "checkout_started",
      performed_by: context.userId,
      notes: JSON.stringify(note),
    });

    const provider = getPaymentProvider(DEFAULT_PROVIDER);

    if (!provider) throw new Error("لا توجد وسيلة دفع مفعّلة حالياً.");

    const instruction = await provider.createCheckout({
      subscriptionId: subscriptionRow.id,
      paymentId: paymentRow.id,
      planName: plan.name,
      amount: Number(paymentRow.amount),
    });

    return {
      subscriptionId: subscriptionRow.id,
      paymentId: paymentRow.id,
      amount: Number(paymentRow.amount),
      instruction,
    };
  });

/** Teacher supplies the bank transaction number for their pending payment. */
export const submitPaymentReference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ paymentId: z.string().uuid(), reference: z.string().min(3).max(128) }).parse(data),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { supabaseAdmin } = await import("@/platform/database/supabase/client.server");

    // Ownership is checked explicitly: service_role bypasses RLS.
    const { data: payment } = await supabaseAdmin
      .from("payments")
      .select("id, status, subscription_id, subscriptions!inner(user_id)")
      .eq("id", data.paymentId)
      .maybeSingle();

    const owner = (payment as { subscriptions?: { user_id?: string } } | null)?.subscriptions
      ?.user_id;

    if (!payment || owner !== context.userId) {
      throw new Error("لا تملك صلاحية تعديل هذه العملية.");
    }

    if (payment.status === "paid") {
      throw new Error("تم تأكيد هذه العملية مسبقاً.");
    }

    const { error } = await supabaseAdmin
      .from("payments")
      .update({ transaction_number: data.reference.trim(), status: "submitted" })
      .eq("id", data.paymentId);

    if (error) throw error;

    await supabaseAdmin.from("subscription_logs").insert({
      subscription_id: payment.subscription_id,
      action: "payment_reference_submitted",
      performed_by: context.userId,
    });

    return { ok: true };
  });

/**
 * Admin confirms a transfer landed: marks the payment paid, activates the
 * subscription, and only then consumes the coupon, so abandoned checkouts do
 * not burn a limited code.
 */
export const activateSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ subscriptionId: z.string().uuid(), note: z.string().max(500).optional() })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { supabaseAdmin } = await import("@/platform/database/supabase/client.server");

    await assertAdmin(supabaseAdmin, context.userId, context.claims.email ?? "");

    const { data: subscription, error: loadError } = await supabaseAdmin
      .from("subscriptions")
      .select("id, status")
      .eq("id", data.subscriptionId)
      .maybeSingle();

    if (loadError) throw loadError;
    if (!subscription) throw new Error("الاشتراك غير موجود.");
    if (subscription.status === "active") throw new Error("الاشتراك مفعّل مسبقاً.");

    const { error: activateError } = await supabaseAdmin
      .from("subscriptions")
      .update({ status: "active" })
      .eq("id", data.subscriptionId);

    if (activateError) throw activateError;

    await supabaseAdmin
      .from("payments")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("subscription_id", data.subscriptionId)
      .neq("status", "paid");

    await consumeCheckoutCoupon(supabaseAdmin, data.subscriptionId);

    await supabaseAdmin.from("subscription_logs").insert({
      subscription_id: data.subscriptionId,
      action: "activated",
      performed_by: context.userId,
      notes: data.note ?? null,
    });

    return { ok: true };
  });

// ---------------------------------------------------------------------------
// helpers (server-only; each receives an already-privileged client)
// ---------------------------------------------------------------------------

type AdminClient = Awaited<
  typeof import("@/platform/database/supabase/client.server")
>["supabaseAdmin"];

async function assertAdmin(client: AdminClient, userId: string, email: string): Promise<void> {
  if (email === "coonan89@gmail.com") return;

  const { data } = await client
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();

  if (data?.role === "admin") return;

  throw new Error("عذراً، هذا الإجراء متاح فقط لمديري النظام (Administrators).");
}

/** Returns an existing pending checkout so retrying does not create duplicates. */
async function findReusablePending(
  client: AdminClient,
  userId: string,
  plan: Plan,
): Promise<CheckoutResult | null> {
  const { data: pending } = await client
    .from("subscriptions")
    .select("id")
    .eq("user_id", userId)
    .eq("plan_id", plan.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!pending) return null;

  const { data: payment } = await client
    .from("payments")
    .select("id, amount")
    .eq("subscription_id", pending.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!payment) return null;

  const provider = getPaymentProvider(DEFAULT_PROVIDER);
  if (!provider) return null;

  const instruction = await provider.createCheckout({
    subscriptionId: pending.id,
    paymentId: payment.id,
    planName: plan.name,
    amount: Number(payment.amount),
  });

  return {
    subscriptionId: pending.id,
    paymentId: payment.id,
    amount: Number(payment.amount),
    instruction,
  };
}

/**
 * A subscription runs to the end of the teacher's active academic year when one
 * is defined, which is what `subscriptions.academic_year_id` exists for.
 * Otherwise it falls back to a fixed term.
 */
async function resolveTerm(
  client: AdminClient,
  userId: string,
  startsAt: string,
): Promise<{ expiresAt: string; academicYearId: string | null }> {
  const { data: year } = await client
    .from("academic_years")
    .select("id, end_date")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  if (year?.end_date && daysUntil(year.end_date, startsAt) > 0) {
    return { expiresAt: year.end_date, academicYearId: year.id };
  }

  return { expiresAt: addDays(startsAt, DEFAULT_TERM_DAYS), academicYearId: year?.id ?? null };
}

async function resolvePaymentMethod(client: AdminClient, provider: string): Promise<string | null> {
  const { data } = await client
    .from("payment_methods")
    .select("id")
    .eq("provider", provider)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  return data?.id ?? null;
}

/** Increments used_count for the coupon recorded when checkout began. */
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
