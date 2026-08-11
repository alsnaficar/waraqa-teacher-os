import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireSupabaseAuth } from "@/platform/database/supabase/auth-middleware";
import { computeAccess, daysUntil, normaliseStatus, todayIso } from "./billing.logic";
import { promoteDueScheduledSubscriptions } from "./promote-scheduled";
import {
  activateSubscriptionInputSchema,
  activateSubscriptionOp,
  assessCouponForPlanOp,
  attachPaymentReceiptInputSchema,
  attachPaymentReceiptOp,
  checkoutInputSchema,
  getAdminReceiptUrlInputSchema,
  getAdminReceiptUrlOp,
  listAdminSubmittedPaymentsOp,
  rejectPaymentInputSchema,
  rejectPaymentOp,
  startCheckoutOp,
  submitPaymentInputSchema,
  submitPaymentReferenceOp,
  type AdminSubmittedPayment,
} from "./billing.operations";
import { decodeReceiptBase64 } from "./receipt";
import "./providers/manual-provider";
import { buildManualCheckoutInstruction } from "./providers/manual-provider";
import type {
  CheckoutResult,
  CouponAssessment,
  OpenCheckout,
  PaymentRecord,
  Plan,
  Subscription,
  SubscriptionState,
} from "./types";
import { BillingError } from "./types";

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

export type LoadSubscriptionStateDeps = {
  userId: string;
  supabase: SupabaseClient;
  /** Service-role client for scheduled→active CAS. */
  writeClient: SupabaseClient;
  /** Test-only clock. Production omits this. */
  today?: string;
};

/**
 * Promote due scheduled rows, then return the teacher's subscription state.
 * `today` is server-derived in production; tests may inject it.
 */
export async function loadSubscriptionState(
  deps: LoadSubscriptionStateDeps,
): Promise<SubscriptionState> {
  const today = deps.today ?? todayIso();

  await promoteDueScheduledSubscriptions(deps.userId, {
    client: deps.writeClient,
    today: deps.today,
  });

  const { data: rows, error } = await deps.supabase
    .from("subscriptions")
    .select("id, plan_id, status, starts_at, expires_at, academic_year_id, semester_id, created_at")
    .eq("user_id", deps.userId)
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

  const ranked = [...rows].sort(
    (a, b) => rank(a.status, a.expires_at, today) - rank(b.status, b.expires_at, today),
  );
  const current = toSubscription(ranked[0]);

  const { data: planRow } = await deps.supabase
    .from("plans")
    .select("id, code, name, price, starts_with, is_active")
    .eq("id", current.planId)
    .maybeSingle();

  return {
    access: computeAccess(current.status, current.expiresAt, today),
    subscription: current,
    plan: planRow ? toPlan(planRow) : null,
    daysRemaining: daysUntil(current.expiresAt, today),
    expiresAt: current.expiresAt,
  };
}

/**
 * The teacher's current subscription, newest first.
 *
 * Read through the caller's own client so RLS still applies even if this
 * function is ever reached without the expected filters. Promotion writes
 * use the service-role client. The client cannot supply today or billing ids.
 */
export const getSubscriptionState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SubscriptionState> => {
    const { supabaseAdmin } = await import("@/platform/database/supabase/client.server");
    return loadSubscriptionState({
      userId: context.userId,
      supabase: context.supabase,
      writeClient: supabaseAdmin,
    });
  });

/** Lower sorts first: live access, then paid-future, then unpaid checkout. */
function rank(status: string, expiresAt: string, today: string): number {
  const remaining = daysUntil(expiresAt, today);
  if (status === "active" && remaining >= 0) return 0;
  if (status === "scheduled") return 1;
  if (status === "pending_payment" || status === "pending") return 2;
  return 3;
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

export async function loadBillingHistory(deps: {
  userId: string;
  supabase: SupabaseClient;
}): Promise<PaymentRecord[]> {
  if (!deps.userId) return [];

  const { data, error } = await deps.supabase
    .from("payments")
    .select("id, amount, status, transaction_number, paid_at, created_at, user_id")
    .eq("user_id", deps.userId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw error;

  return (data ?? [])
    .filter((row) => row.user_id === deps.userId)
    .map((row) => ({
      id: row.id,
      amount: Number(row.amount),
      status: row.status,
      transactionNumber: row.transaction_number,
      paidAt: row.paid_at,
      createdAt: row.created_at,
    }));
}

/**
 * Teacher payment history. Always scoped to the authenticated JWT user.
 * Client cannot supply user_id. Response shape is unchanged.
 */
export const getBillingHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PaymentRecord[]> => {
    return loadBillingHistory({
      userId: context.userId,
      supabase: context.supabase,
    });
  });

export async function loadOpenCheckout(deps: {
  userId: string;
  supabase: SupabaseClient;
  /** Test-only env. Production omits this and reads server process.env. */
  env?: Record<string, string | undefined>;
}): Promise<OpenCheckout | null> {
  if (!deps.userId) return null;

  const { data: sub, error: subError } = await deps.supabase
    .from("subscriptions")
    .select("id, plan_id, status, user_id")
    .eq("user_id", deps.userId)
    .eq("status", "pending_payment")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (subError) throw subError;
  if (!sub || sub.user_id !== deps.userId || sub.status !== "pending_payment") {
    return null;
  }

  const { data: payment, error: payError } = await deps.supabase
    .from("payments")
    .select(
      "id, amount, net_sar, status, user_id, subscription_id, transfer_reference, transaction_number, receipt_path, rejection_reason",
    )
    .eq("user_id", deps.userId)
    .eq("subscription_id", sub.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (payError) throw payError;
  if (!payment || payment.user_id !== deps.userId || payment.subscription_id !== sub.id) {
    return null;
  }

  const { data: plan } = await deps.supabase
    .from("plans")
    .select("name")
    .eq("id", sub.plan_id)
    .maybeSingle();

  const amount = Number(payment.net_sar ?? payment.amount);
  const instruction = buildManualCheckoutInstruction(payment.id, deps.env);

  return {
    subscriptionId: sub.id,
    paymentId: payment.id,
    amount,
    instruction,
    paymentStatus: String(payment.status),
    planName: plan?.name ?? "",
    transferReference:
      (payment.transfer_reference as string | null) ??
      (payment.transaction_number as string | null) ??
      null,
    hasReceipt: Boolean(payment.receipt_path && String(payment.receipt_path).trim().length > 0),
    rejectionReason:
      String(payment.status) === "rejected"
        ? (payment.rejection_reason as string | null)?.trim() || null
        : null,
  };
}

/**
 * Reconstruct the caller's unpaid checkout from server rows.
 * No client-supplied ids. Uses pending_payment + latest owned payment.
 */
export const getOpenCheckout = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OpenCheckout | null> => {
    return loadOpenCheckout({
      userId: context.userId,
      supabase: context.supabase,
    });
  });

/**
 * Prices a coupon against a plan without ever exposing the coupons table.
 * The client only learns about a code it already typed.
 */
export const assessCouponCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ planCode: z.string().min(1), couponCode: z.string().min(1).max(64) })
      .strict()
      .parse(data),
  )
  .handler(async ({ data }): Promise<CouponAssessment> => {
    const { supabaseAdmin } = await import("@/platform/database/supabase/client.server");

    try {
      return await assessCouponForPlanOp(supabaseAdmin, {
        planCode: data.planCode,
        couponCode: data.couponCode,
      });
    } catch (error) {
      if (error instanceof BillingError) {
        return {
          valid: false,
          reason: error.message,
          code: data.couponCode,
          discount: 0,
          finalAmount: 0,
        };
      }
      throw error;
    }
  });

/**
 * Opens a pending_payment subscription and its created payment using the
 * official billing calendar. Price and dates are never taken from the client.
 */
export const startCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => checkoutInputSchema.parse(data))
  .handler(async ({ data, context }): Promise<CheckoutResult> => {
    const { supabaseAdmin } = await import("@/platform/database/supabase/client.server");
    return startCheckoutOp(supabaseAdmin, {
      userId: context.userId,
      planCode: data.planCode,
      couponCode: data.couponCode,
    });
  });

/** Teacher supplies the bank transaction number for their pending payment. */
export const submitPaymentReference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => submitPaymentInputSchema.parse(data))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { supabaseAdmin } = await import("@/platform/database/supabase/client.server");
    return submitPaymentReferenceOp(supabaseAdmin, {
      userId: context.userId,
      paymentId: data.paymentId,
      reference: data.reference,
    });
  });

/**
 * Admin confirms a transfer landed. Current official periods become active
 * from the activation date to the official end. Future periods become
 * scheduled on the official calendar bounds.
 */
export const activateSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => activateSubscriptionInputSchema.parse(data))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { supabaseAdmin } = await import("@/platform/database/supabase/client.server");
    const result = await activateSubscriptionOp(supabaseAdmin, {
      actorId: context.userId,
      subscriptionId: data.subscriptionId,
      note: data.note,
    });
    return { ok: result.ok };
  });

export type { AdminSubmittedPayment };

/**
 * Admin submitted-payment queue. JWT actor only. Status is enforced in the op.
 * Client cannot supply user_id, status, amount, or payment_id.
 */
export const listAdminSubmittedPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ payments: AdminSubmittedPayment[] }> => {
    const { supabaseAdmin } = await import("@/platform/database/supabase/client.server");
    const payments = await listAdminSubmittedPaymentsOp(supabaseAdmin, context.userId);
    return { payments };
  });

/**
 * Teacher receipt upload. JWT ownership is enforced in the op.
 * Client may send paymentId + file bytes only — never a storage path.
 */
export const attachPaymentReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => attachPaymentReceiptInputSchema.parse(data))
  .handler(async ({ data, context }): Promise<{ ok: true; hasReceipt: true }> => {
    const { supabaseAdmin } = await import("@/platform/database/supabase/client.server");
    const bytes = decodeReceiptBase64(data.contentBase64);
    return attachPaymentReceiptOp(supabaseAdmin, {
      userId: context.userId,
      paymentId: data.paymentId,
      bytes,
      declaredMime: data.mimeType,
      declaredName: data.fileName,
    });
  });

/**
 * Admin short-lived signed URL for a payment receipt.
 * JWT → assertAdmin → service_role. Client supplies paymentId only.
 */
export const getAdminReceiptUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => getAdminReceiptUrlInputSchema.parse(data))
  .handler(async ({ data, context }): Promise<{ url: string; expiresIn: number }> => {
    const { supabaseAdmin } = await import("@/platform/database/supabase/client.server");
    return getAdminReceiptUrlOp(supabaseAdmin, {
      actorId: context.userId,
      paymentId: data.paymentId,
    });
  });

/**
 * Admin rejects a submitted bank transfer. JWT → assertAdmin → service_role.
 * Client supplies paymentId + reason only.
 */
export const rejectPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => rejectPaymentInputSchema.parse(data))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { supabaseAdmin } = await import("@/platform/database/supabase/client.server");
    return rejectPaymentOp(supabaseAdmin, {
      actorId: context.userId,
      paymentId: data.paymentId,
      reason: data.reason,
    });
  });
