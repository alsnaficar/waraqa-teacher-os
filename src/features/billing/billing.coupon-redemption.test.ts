import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { BillingError } from "./types.ts";
import { activateSubscriptionOp } from "./billing.operations.ts";
import { registerPaymentProvider } from "./providers/payment-provider.ts";
import {
  attachTryInsertCouponRedemptionRpc,
  mockTryInsertCouponRedemption,
} from "./try-insert-coupon-redemption.mock.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const OPERATIONS_FILE = join(ROOT, "features/billing/billing.operations.ts");
const PROMOTE_FILE = join(ROOT, "features/billing/promote-scheduled.ts");
const MIGRATION_FILE = join(
  ROOT,
  "../supabase/migrations/20260812220000_coupon_per_user_redemption.sql",
);

const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ADMIN = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const PLAN_SEM = "11111111-1111-4111-8111-111111111111";
const YEAR_ID = "33333333-3333-4333-8333-333333333333";
const SEM_ID = "44444444-4444-4444-8444-444444444444";
const COUPON_ID = "66666666-6666-4666-8666-666666666666";
const SUB_A = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const SUB_B = "dddddddd-eeee-4eee-8eee-dddddddddddd";
const SUB_C = "dddddddd-ffff-4fff-8fff-dddddddddddd";
const PAY_A = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const PAY_B = "eeeeeeee-ffff-4fff-8fff-eeeeeeeeeeee";
const PAY_C = "eeeeeeee-aaaa-4aaa-8aaa-eeeeeeeeeeee";

registerPaymentProvider({
  id: "manual",
  label: "تحويل بنكي",
  async createCheckout(request) {
    return { kind: "manual", reference: `WRQ-${request.paymentId.slice(0, 8)}`, message: "حوّل" };
  },
  async confirmPayment() {
    return { settled: false, reference: null };
  },
});

type Row = Record<string, unknown>;
type Filter = { column: string; op: string; value: unknown };

type MockOptions = {
  failCouponUpdate?: boolean;
  failRedemptionInsert?: boolean;
  failPaymentVerify?: boolean;
  failSubscriptionUpdate?: boolean;
};

function matches(row: Row, filters: Filter[]): boolean {
  return filters.every((filter) => {
    const actual = row[filter.column];
    if (filter.op === "eq") return actual === filter.value;
    if (filter.op === "neq") return actual !== filter.value;
    if (filter.op === "lt") return Number(actual) < Number(filter.value);
    if (actual == null) return false;
    const left = String(actual);
    const right = String(filter.value);
    if (filter.op === "lte") return left <= right;
    if (filter.op === "gte") return left >= right;
    return true;
  });
}

function seedDb(overrides: Partial<Record<string, Row[]>> = {}): Record<string, Row[]> {
  return {
    user_roles: [{ user_id: ADMIN, role: "admin" }],
    plans: [
      {
        id: PLAN_SEM,
        code: "core_standard_semester",
        name: "فصل دراسي",
        price: 40,
        price_sar: 40,
        currency: "SAR",
        product: "core",
        term_kind: "semester",
        is_active: true,
        starts_with: "semester",
      },
    ],
    billing_academic_years: [
      { id: YEAR_ID, starts_on: "2026-08-23", ends_on: "2027-06-30", is_current: true },
    ],
    billing_semesters: [
      {
        id: SEM_ID,
        academic_year_id: YEAR_ID,
        starts_on: "2026-08-23",
        ends_on: "2027-01-07",
        is_current: true,
        sequence: 1,
      },
    ],
    coupons: [
      {
        id: COUPON_ID,
        code: "SEM10",
        type: "fixed",
        value: 10,
        max_usage: 1,
        used_count: 0,
        max_redemptions_per_user: 1,
        is_active: true,
      },
    ],
    coupon_plans: [{ coupon_id: COUPON_ID, plan_id: PLAN_SEM }],
    coupon_redemptions: [],
    subscriptions: [
      {
        id: SUB_A,
        user_id: USER_A,
        plan_id: PLAN_SEM,
        status: "pending_payment",
        starts_on: "2026-08-23",
        ends_on: "2027-01-07",
        starts_at: "2026-08-23",
        expires_at: "2027-01-07",
        billing_academic_year_id: YEAR_ID,
        billing_semester_id: SEM_ID,
        created_from_payment_id: PAY_A,
      },
    ],
    payments: [
      {
        id: PAY_A,
        user_id: USER_A,
        subscription_id: SUB_A,
        amount_sar: 40,
        discount_sar: 10,
        net_sar: 30,
        status: "submitted",
        coupon_id: COUPON_ID,
      },
    ],
    subscription_logs: [
      {
        id: "log-a",
        subscription_id: SUB_A,
        action: "checkout_started",
        notes: JSON.stringify({
          planCode: "core_standard_semester",
          couponCode: "SEM10",
          discount: 10,
        }),
        created_at: "2026-08-11T00:00:00Z",
      },
    ],
    billing_audit_log: [],
    ...overrides,
  };
}

function createMockClient(db: Record<string, Row[]>, options: MockOptions = {}) {
  let seq = 0;
  const client = {
    from(table: string) {
      const filters: Filter[] = [];
      let pendingInsert: Row[] | null = null;
      let pendingUpdate: Row | null = null;
      let pendingDelete = false;

      const runSelect = () => (db[table] ?? []).filter((row) => matches(row, filters));

      const execute = async (mode: "many" | "maybe") => {
        if (pendingInsert) {
          if (options.failRedemptionInsert && table === "coupon_redemptions") {
            return { data: null, error: { message: "insert failed" } };
          }
          const inserted: Row[] = [];
          for (const row of pendingInsert) {
            if (
              table === "coupon_redemptions" &&
              (db.coupon_redemptions ?? []).some(
                (existing) =>
                  existing.coupon_id === row.coupon_id && existing.payment_id === row.payment_id,
              )
            ) {
              return { data: null, error: { code: "23505", message: "duplicate key" } };
            }
            const saved = {
              id: row.id ?? `id-${table}-${++seq}`,
              created_at: "2026-08-11T00:00:00Z",
              ...row,
            };
            db[table] = [...(db[table] ?? []), saved];
            inserted.push(saved);
          }
          return { data: mode === "many" ? inserted : (inserted[0] ?? null), error: null };
        }

        if (pendingUpdate) {
          if (options.failCouponUpdate && table === "coupons") {
            return { data: null, error: { message: "coupon update failed" } };
          }
          if (
            options.failPaymentVerify &&
            table === "payments" &&
            pendingUpdate.status === "verified"
          ) {
            return { data: null, error: { message: "payment verify failed" } };
          }
          if (options.failSubscriptionUpdate && table === "subscriptions") {
            return { data: null, error: null };
          }
          const rows = (db[table] ?? []).filter((row) => matches(row, filters));
          for (const row of rows) Object.assign(row, pendingUpdate);
          return { data: mode === "many" ? rows : (rows[0] ?? null), error: null };
        }

        if (pendingDelete) {
          const remaining: Row[] = [];
          const removed: Row[] = [];
          for (const row of db[table] ?? []) {
            if (matches(row, filters)) removed.push(row);
            else remaining.push(row);
          }
          db[table] = remaining;
          return { data: mode === "many" ? removed : (removed[0] ?? null), error: null };
        }

        const rows = runSelect();
        if (mode === "many") return { data: rows, error: null };
        return { data: rows[0] ?? null, error: null };
      };

      const api: Record<string, unknown> = {
        select() {
          return api;
        },
        insert(row: Row | Row[]) {
          pendingInsert = Array.isArray(row) ? row : [row];
          return api;
        },
        update(row: Row) {
          pendingUpdate = row;
          return api;
        },
        delete() {
          pendingDelete = true;
          return api;
        },
        eq(column: string, value: unknown) {
          filters.push({ column, op: "eq", value });
          return api;
        },
        neq(column: string, value: unknown) {
          filters.push({ column, op: "neq", value });
          return api;
        },
        lt(column: string, value: unknown) {
          filters.push({ column, op: "lt", value });
          return api;
        },
        order() {
          return api;
        },
        limit() {
          return api;
        },
        maybeSingle() {
          return execute("maybe");
        },
        then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
          return execute("many").then(onFulfilled, onRejected);
        },
      };
      return api;
    },
  };
  attachTryInsertCouponRedemptionRpc(client, db, {
    failRedemptionInsert: options.failRedemptionInsert,
    nextId: () => `id-coupon_redemptions-${++seq}`,
  });
  return { client, db };
}

function secondUserRows(): Partial<Record<string, Row[]>> {
  return {
    subscriptions: [
      ...seedDb().subscriptions,
      {
        id: SUB_B,
        user_id: USER_B,
        plan_id: PLAN_SEM,
        status: "pending_payment",
        starts_on: "2026-08-23",
        ends_on: "2027-01-07",
        starts_at: "2026-08-23",
        expires_at: "2027-01-07",
        billing_academic_year_id: YEAR_ID,
        billing_semester_id: SEM_ID,
        created_from_payment_id: PAY_B,
      },
    ],
    payments: [
      ...seedDb().payments,
      {
        id: PAY_B,
        user_id: USER_B,
        subscription_id: SUB_B,
        amount_sar: 40,
        discount_sar: 10,
        net_sar: 30,
        status: "submitted",
        coupon_id: COUPON_ID,
      },
    ],
  };
}

function sameUserSecondPaymentRows(): Partial<Record<string, Row[]>> {
  return {
    subscriptions: [
      ...seedDb().subscriptions,
      {
        id: SUB_C,
        user_id: USER_A,
        plan_id: PLAN_SEM,
        status: "pending_payment",
        starts_on: "2026-08-23",
        ends_on: "2027-01-07",
        starts_at: "2026-08-23",
        expires_at: "2027-01-07",
        billing_academic_year_id: YEAR_ID,
        billing_semester_id: SEM_ID,
        created_from_payment_id: PAY_C,
      },
    ],
    payments: [
      ...seedDb().payments,
      {
        id: PAY_C,
        user_id: USER_A,
        subscription_id: SUB_C,
        amount_sar: 40,
        discount_sar: 10,
        net_sar: 30,
        status: "submitted",
        coupon_id: COUPON_ID,
      },
    ],
  };
}

function sameUserThirdPaymentRows(): Partial<Record<string, Row[]>> {
  const base = sameUserSecondPaymentRows();
  const SUB_D = "dddddddd-aaaa-4aaa-8aaa-dddddddddddd";
  const PAY_D = "eeeeeeee-bbbb-4bbb-8bbb-eeeeeeeeeeee";
  return {
    subscriptions: [
      ...(base.subscriptions as Row[]),
      {
        id: SUB_D,
        user_id: USER_A,
        plan_id: PLAN_SEM,
        status: "pending_payment",
        starts_on: "2026-08-23",
        ends_on: "2027-01-07",
        starts_at: "2026-08-23",
        expires_at: "2027-01-07",
        billing_academic_year_id: YEAR_ID,
        billing_semester_id: SEM_ID,
        created_from_payment_id: PAY_D,
      },
    ],
    payments: [
      ...(base.payments as Row[]),
      {
        id: PAY_D,
        user_id: USER_A,
        subscription_id: SUB_D,
        amount_sar: 40,
        discount_sar: 10,
        net_sar: 30,
        status: "submitted",
        coupon_id: COUPON_ID,
      },
    ],
  };
}

async function activate(
  db: Record<string, Row[]>,
  subscriptionId = SUB_A,
  options: MockOptions = {},
) {
  const { client } = createMockClient(db, options);
  return activateSubscriptionOp(client as never, {
    actorId: ADMIN,
    subscriptionId,
    today: "2026-10-16",
  });
}

function assertBillingError(err: unknown, code: string) {
  assert.equal(err instanceof BillingError, true);
  assert.equal((err as BillingError).code, code);
}

describe("coupon redemption at activation", () => {
  it("CAS success: max_usage=1 increments once and records one redemption", async () => {
    const db = seedDb();
    const result = await activate(db);
    assert.equal(result.ok, true);
    assert.equal(result.status, "active");
    assert.equal(db.coupons[0].used_count, 1);
    assert.equal(db.coupon_redemptions.length, 1);
    assert.equal(db.coupon_redemptions[0].coupon_id, COUPON_ID);
    assert.equal(db.coupon_redemptions[0].payment_id, PAY_A);
    assert.equal(db.coupon_redemptions[0].user_id, USER_A);
    assert.equal(db.payments[0].status, "verified");
    assert.equal(db.subscriptions[0].status, "active");
  });

  it("CAS miss: exhausted max_usage=1 fails closed without verifying payment", async () => {
    const db = seedDb();
    db.coupons[0].used_count = 1;
    await assert.rejects(
      () => activate(db),
      (err) => {
        assertBillingError(err, "INVALID_PAYMENT");
        assert.equal((err as BillingError).message, "تم استخدام رمز الخصم بالكامل.");
        return true;
      },
    );
    assert.equal(db.payments[0].status, "submitted");
    assert.equal(db.subscriptions[0].status, "pending_payment");
    assert.equal(db.coupons[0].used_count, 1);
    assert.equal(db.coupon_redemptions.length, 0);
  });

  it("duplicate redemption for the same payment does not increment twice", async () => {
    const db = seedDb();
    await activate(db);
    assert.equal(db.coupons[0].used_count, 1);
    db.subscriptions[0].status = "pending_payment";
    db.payments[0].status = "submitted";
    db.payments[0].verified_at = null;
    db.payments[0].verified_by = null;
    db.payments[0].paid_at = null;

    const second = await activate(db);
    assert.equal(second.ok, true);
    assert.equal(db.coupons[0].used_count, 1);
    assert.equal(db.coupon_redemptions.length, 1);
  });

  it("max_usage=0 never blocks and still records a redemption", async () => {
    const db = seedDb();
    db.coupons[0].max_usage = 0;
    db.coupons[0].used_count = 9;
    await activate(db);
    assert.equal(db.coupons[0].used_count, 10);
    assert.equal(db.coupon_redemptions.length, 1);
    assert.equal(db.payments[0].status, "verified");
  });

  it("coupon update error fails closed and rolls back the redemption", async () => {
    const db = seedDb();
    await assert.rejects(
      () => activate(db, SUB_A, { failCouponUpdate: true }),
      (err) => {
        assertBillingError(err, "INVALID_PAYMENT");
        return true;
      },
    );
    assert.equal(db.payments[0].status, "submitted");
    assert.equal(db.subscriptions[0].status, "pending_payment");
    assert.equal(db.coupons[0].used_count, 0);
    assert.equal(db.coupon_redemptions.length, 0);
  });

  it("redemption insert error fails closed without incrementing usage", async () => {
    const db = seedDb();
    await assert.rejects(
      () => activate(db, SUB_A, { failRedemptionInsert: true }),
      (err) => {
        assertBillingError(err, "INVALID_PAYMENT");
        return true;
      },
    );
    assert.equal(db.payments[0].status, "submitted");
    assert.equal(db.subscriptions[0].status, "pending_payment");
    assert.equal(db.coupons[0].used_count, 0);
    assert.equal(db.coupon_redemptions.length, 0);
  });

  it("same-payment retry after success is blocked as already activated", async () => {
    const db = seedDb();
    await activate(db);
    await assert.rejects(
      () => activate(db),
      (err) => {
        assertBillingError(err, "EXISTING_SUBSCRIPTION");
        return true;
      },
    );
    assert.equal(db.coupons[0].used_count, 1);
    assert.equal(db.coupon_redemptions.length, 1);
  });

  it("two competing activations: only one discounted payment is verified", async () => {
    const db = seedDb(secondUserRows());
    const { client } = createMockClient(db);
    const results = await Promise.allSettled([
      activateSubscriptionOp(client as never, {
        actorId: ADMIN,
        subscriptionId: SUB_A,
        today: "2026-10-16",
      }),
      activateSubscriptionOp(client as never, {
        actorId: ADMIN,
        subscriptionId: SUB_B,
        today: "2026-10-16",
      }),
    ]);

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.equal(db.coupons[0].used_count, 1);
    assert.equal(db.coupon_redemptions.length, 1);
    const verified = db.payments.filter((row) => row.status === "verified");
    const submitted = db.payments.filter((row) => row.status === "submitted");
    assert.equal(verified.length, 1);
    assert.equal(submitted.length, 1);
    assert.equal(db.subscriptions.filter((row) => row.status === "active").length, 1);
    assert.equal(db.subscriptions.filter((row) => row.status === "pending_payment").length, 1);
  });

  it("failed coupon slot leaves payment unverified and subscription pending_payment", async () => {
    const db = seedDb();
    db.coupons[0].used_count = 1;
    await assert.rejects(() => activate(db));
    assert.equal(db.payments[0].status, "submitted");
    assert.equal(db.payments[0].verified_at, undefined);
    assert.equal(db.subscriptions[0].status, "pending_payment");
  });

  it("successful coupon slot allows activation to continue", async () => {
    const db = seedDb();
    const result = await activate(db);
    assert.equal(result.status, "active");
    assert.equal(db.payments[0].status, "verified");
    assert.equal(db.subscriptions[0].status, "active");
  });

  it("payment CAS failure after a new redemption rolls usage back", async () => {
    const db = seedDb();
    await assert.rejects(
      () => activate(db, SUB_A, { failPaymentVerify: true }),
      (err) => {
        assertBillingError(err, "INVALID_PAYMENT");
        return true;
      },
    );
    assert.equal(db.payments[0].status, "submitted");
    assert.equal(db.subscriptions[0].status, "pending_payment");
    assert.equal(db.coupons[0].used_count, 0);
    assert.equal(db.coupon_redemptions.length, 0);
  });

  it("subscription update failure reverts payment and rolls the coupon slot back", async () => {
    const db = seedDb();
    await assert.rejects(
      () => activate(db, SUB_A, { failSubscriptionUpdate: true }),
      (err) => {
        assertBillingError(err, "INVALID_PERIOD");
        return true;
      },
    );
    assert.equal(db.payments[0].status, "submitted");
    assert.equal(db.payments[0].verified_at, null);
    assert.equal(db.subscriptions[0].status, "pending_payment");
    assert.equal(db.coupons[0].used_count, 0);
    assert.equal(db.coupon_redemptions.length, 0);
  });

  it("legacy checkout log is used only when payments.coupon_id is null", async () => {
    const db = seedDb();
    db.payments[0].coupon_id = null;
    await activate(db);
    assert.equal(db.coupon_redemptions[0].coupon_id, COUPON_ID);
    assert.equal(db.coupons[0].used_count, 1);
  });

  it("no coupon on payment or log skips redemption entirely", async () => {
    const db = seedDb();
    db.payments[0].coupon_id = null;
    db.subscription_logs = [];
    await activate(db);
    assert.equal(db.coupon_redemptions.length, 0);
    assert.equal(db.coupons[0].used_count, 0);
    assert.equal(db.payments[0].status, "verified");
  });
});

describe("coupon redemption contracts", () => {
  it("activation obtains the coupon slot before payment verification", () => {
    const src = readFileSync(OPERATIONS_FILE, "utf8");
    const body = src.slice(src.indexOf("export async function activateSubscriptionOp"));
    const slot = body.indexOf("obtainCouponRedemptionSlot");
    const verify = body.indexOf('.eq("status", "submitted")');
    assert.equal(slot >= 0, true);
    assert.equal(verify >= 0, true);
    assert.equal(slot < verify, true);
    assert.match(src, /try_insert_coupon_redemption/);
    assert.match(src, /payment\.user_id/);
    assert.match(src, /COUPON_PER_USER_EXHAUSTED|تم استنفاد الحد المسموح لاستخدام هذا الكوبون/);
    assert.doesNotMatch(src, /consumeCheckoutCoupon/);
  });

  it("scheduled promotion does not consume coupons", () => {
    const src = readFileSync(PROMOTE_FILE, "utf8");
    assert.doesNotMatch(src, /coupon/);
    assert.doesNotMatch(src, /used_count/);
    assert.doesNotMatch(src, /coupon_redemptions/);
  });

  it("migration RPC is service_role only with controlled search_path", () => {
    const sql = readFileSync(MIGRATION_FILE, "utf8");
    assert.match(sql, /create or replace function public\.try_insert_coupon_redemption/i);
    assert.match(sql, /security definer/i);
    assert.match(sql, /set search_path = public/);
    assert.match(sql, /for update/i);
    assert.match(sql, /coalesce\(max_redemptions_per_user, 1\)/);
    assert.match(sql, /PAYMENT_OWNER_MISMATCH/);
    assert.match(sql, /from public\.payments/);
    assert.match(sql, /and user_id = p_user_id/);
    // Ownership check must not also require payments.coupon_id equality.
    const paymentsBlock = sql.slice(
      sql.indexOf("from public.payments"),
      sql.indexOf("PAYMENT_OWNER_MISMATCH"),
    );
    assert.doesNotMatch(paymentsBlock, /coupon_id/);
    assert.match(sql, /revoke all on function public\.try_insert_coupon_redemption/i);
    assert.match(sql, /from public, anon, authenticated/);
    assert.match(sql, /grant execute on function public\.try_insert_coupon_redemption/);
    assert.match(sql, /to service_role/);
    assert.doesNotMatch(sql, /grant execute[\s\S]*to authenticated/);
    assert.doesNotMatch(sql, /unique\s*\(\s*coupon_id\s*,\s*user_id\s*\)/i);

    const ownerIdx = sql.search(/PAYMENT_OWNER_MISMATCH/);
    const existingIdx = sql.search(/Same-payment idempotency/);
    const quotaIdx = sql.search(/v_count >= v_limit/);
    assert.equal(ownerIdx >= 0 && existingIdx > ownerIdx && quotaIdx > existingIdx, true);
  });
});

describe("max_redemptions_per_user enforcement", () => {
  it("1. NULL max_redemptions_per_user behaves as 1", async () => {
    const db = seedDb(sameUserSecondPaymentRows());
    db.coupons[0].max_redemptions_per_user = null;
    db.coupons[0].max_usage = 0;
    await activate(db, SUB_A);
    assert.equal(db.coupon_redemptions.length, 1);
    await assert.rejects(
      () => activate(db, SUB_C),
      (err) => {
        assertBillingError(err, "INVALID_PAYMENT");
        assert.equal(
          (err as BillingError).message,
          "تم استنفاد الحد المسموح لاستخدام هذا الكوبون.",
        );
        return true;
      },
    );
    assert.equal(db.coupon_redemptions.length, 1);
  });

  it("2. max_redemptions_per_user = 0 is unlimited per user", async () => {
    const db = seedDb(sameUserSecondPaymentRows());
    db.coupons[0].max_redemptions_per_user = 0;
    db.coupons[0].max_usage = 0;
    await activate(db, SUB_A);
    await activate(db, SUB_C);
    assert.equal(db.coupon_redemptions.length, 2);
    assert.equal(db.coupons[0].used_count, 2);
  });

  it("3/4. N=1: first succeeds, second payment for same user fails", async () => {
    const db = seedDb(sameUserSecondPaymentRows());
    db.coupons[0].max_redemptions_per_user = 1;
    db.coupons[0].max_usage = 0;
    const first = await activate(db, SUB_A);
    assert.equal(first.ok, true);
    assert.equal(db.coupon_redemptions[0].user_id, USER_A);
    await assert.rejects(
      () => activate(db, SUB_C),
      (err) => {
        assertBillingError(err, "INVALID_PAYMENT");
        assert.equal(
          (err as BillingError).message,
          "تم استنفاد الحد المسموح لاستخدام هذا الكوبون.",
        );
        return true;
      },
    );
    assert.equal(db.coupon_redemptions.length, 1);
    assert.equal(db.payments.find((p) => p.id === PAY_C)?.status, "submitted");
  });

  it("5/6/7. N=2: two succeed, third fails", async () => {
    const db = seedDb(sameUserThirdPaymentRows());
    db.coupons[0].max_redemptions_per_user = 2;
    db.coupons[0].max_usage = 0;
    const SUB_D = "dddddddd-aaaa-4aaa-8aaa-dddddddddddd";
    await activate(db, SUB_A);
    await activate(db, SUB_C);
    assert.equal(db.coupon_redemptions.length, 2);
    await assert.rejects(
      () => activate(db, SUB_D),
      (err) => {
        assertBillingError(err, "INVALID_PAYMENT");
        assert.match((err as BillingError).message, /استنفاد الحد المسموح/);
        return true;
      },
    );
    assert.equal(db.coupon_redemptions.length, 2);
  });

  it("8. cross-user isolation: User A at limit does not block User B", async () => {
    const db = seedDb(secondUserRows());
    db.coupons[0].max_redemptions_per_user = 1;
    db.coupons[0].max_usage = 0;
    await activate(db, SUB_A);
    const b = await activate(db, SUB_B);
    assert.equal(b.ok, true);
    assert.equal(db.coupon_redemptions.length, 2);
    assert.equal(db.coupon_redemptions.filter((r) => r.user_id === USER_A).length, 1);
    assert.equal(db.coupon_redemptions.filter((r) => r.user_id === USER_B).length, 1);
  });

  it("9. same user + different payments share the per-user quota", async () => {
    const db = seedDb(sameUserSecondPaymentRows());
    db.coupons[0].max_redemptions_per_user = 1;
    db.coupons[0].max_usage = 0;
    await activate(db, SUB_A);
    await assert.rejects(() => activate(db, SUB_C));
    assert.equal(db.coupon_redemptions.filter((r) => r.user_id === USER_A).length, 1);
  });

  it("10. global max_usage remains enforced", async () => {
    const db = seedDb(secondUserRows());
    db.coupons[0].max_redemptions_per_user = 0;
    db.coupons[0].max_usage = 1;
    db.coupons[0].used_count = 0;
    await activate(db, SUB_A);
    await assert.rejects(
      () => activate(db, SUB_B),
      (err) => {
        assertBillingError(err, "INVALID_PAYMENT");
        assert.equal((err as BillingError).message, "تم استخدام رمز الخصم بالكامل.");
        return true;
      },
    );
    assert.equal(db.coupon_redemptions.length, 1);
  });

  it("11. redemption owner is payment.user_id, never admin actorId", async () => {
    const db = seedDb();
    db.coupons[0].max_redemptions_per_user = 1;
    db.coupons[0].max_usage = 0;
    await activate(db, SUB_A);
    assert.equal(db.coupon_redemptions[0].user_id, USER_A);
    assert.notEqual(db.coupon_redemptions[0].user_id, ADMIN);
    const ops = readFileSync(OPERATIONS_FILE, "utf8");
    const obtain = ops.slice(ops.indexOf("async function obtainCouponRedemptionSlot"));
    const insertCall = obtain.slice(
      obtain.indexOf("insertCouponRedemption"),
      obtain.indexOf('if (insertResult === "existing")'),
    );
    assert.match(insertCall, /userId:\s*input\.payment\.user_id/);
    assert.doesNotMatch(insertCall, /actorId/);
  });

  it("12. same-payment idempotency does not consume another per-user slot", async () => {
    const db = seedDb();
    db.coupons[0].max_redemptions_per_user = 1;
    db.coupons[0].max_usage = 0;
    await activate(db, SUB_A);
    assert.equal(db.coupons[0].used_count, 1);
    db.subscriptions[0].status = "pending_payment";
    db.payments[0].status = "submitted";
    db.payments[0].verified_at = null;
    db.payments[0].verified_by = null;
    db.payments[0].paid_at = null;
    const second = await activate(db, SUB_A);
    assert.equal(second.ok, true);
    assert.equal(db.coupon_redemptions.length, 1);
    assert.equal(db.coupons[0].used_count, 1);
  });

  it("13. concurrent same-user redemptions cannot both pass when one slot remains", async () => {
    const db = seedDb(sameUserSecondPaymentRows());
    db.coupons[0].max_redemptions_per_user = 1;
    db.coupons[0].max_usage = 0;
    const { client } = createMockClient(db);
    const results = await Promise.allSettled([
      activateSubscriptionOp(client as never, {
        actorId: ADMIN,
        subscriptionId: SUB_A,
        today: "2026-10-16",
      }),
      activateSubscriptionOp(client as never, {
        actorId: ADMIN,
        subscriptionId: SUB_C,
        today: "2026-10-16",
      }),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.equal(db.coupon_redemptions.length, 1);
    assert.equal(db.coupons[0].used_count, 1);
  });

  it("14. global CAS failure leaves no orphan redemption", async () => {
    const db = seedDb();
    db.coupons[0].max_redemptions_per_user = 1;
    db.coupons[0].max_usage = 1;
    db.coupons[0].used_count = 1;
    await assert.rejects(() => activate(db, SUB_A));
    assert.equal(db.coupon_redemptions.length, 0);
    assert.equal(db.payments[0].status, "submitted");
  });

  it("15. payment ownership mismatch fails closed", async () => {
    const db = seedDb();
    db.coupons[0].max_redemptions_per_user = 1;
    db.coupons[0].max_usage = 0;
    const result = await mockTryInsertCouponRedemption(db, {
      p_coupon_id: COUPON_ID,
      p_user_id: USER_B,
      p_payment_id: PAY_A,
    });
    assert.equal(result.data, null);
    assert.equal(result.error?.message, "PAYMENT_OWNER_MISMATCH");
    assert.equal(db.coupon_redemptions.length, 0);
  });

  it("16. missing payment fails closed", async () => {
    const db = seedDb();
    db.coupons[0].max_redemptions_per_user = 1;
    db.coupons[0].max_usage = 0;
    const result = await mockTryInsertCouponRedemption(db, {
      p_coupon_id: COUPON_ID,
      p_user_id: USER_A,
      p_payment_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    });
    assert.equal(result.data, null);
    assert.equal(result.error?.message, "PAYMENT_OWNER_MISMATCH");
    assert.equal(db.coupon_redemptions.length, 0);
  });

  it("17. same-payment at limit returns existing via mock", async () => {
    const db = seedDb();
    db.coupons[0].max_redemptions_per_user = 1;
    db.coupons[0].max_usage = 0;
    db.coupon_redemptions = [
      {
        id: "redemption-1",
        coupon_id: COUPON_ID,
        user_id: USER_A,
        payment_id: PAY_A,
        created_at: "2026-08-11T00:00:00Z",
      },
    ];
    const usedBefore = Number(db.coupons[0].used_count);
    const result = await mockTryInsertCouponRedemption(db, {
      p_coupon_id: COUPON_ID,
      p_user_id: USER_A,
      p_payment_id: PAY_A,
    });
    assert.equal(result.data, "existing");
    assert.equal(result.error, null);
    assert.equal(db.coupon_redemptions.length, 1);
    assert.equal(db.coupons[0].used_count, usedBefore);
  });
});
