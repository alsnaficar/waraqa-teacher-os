import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { BillingAccessError, BillingError } from "./types.ts";
import {
  activateSubscriptionOp,
  attachPaymentReceiptOp,
  listAdminSubmittedPaymentsOp,
  rejectPaymentInputSchema,
  rejectPaymentOp,
  submitPaymentReferenceOp,
} from "./billing.operations.ts";
import { loadOpenCheckout } from "./billing.functions.ts";
import type { ReceiptStorage } from "./receipt.ts";
import { registerPaymentProvider } from "./providers/payment-provider.ts";
import { attachTryInsertCouponRedemptionRpc } from "./try-insert-coupon-redemption.mock.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const OPERATIONS_FILE = join(ROOT, "features/billing/billing.operations.ts");
const FUNCTIONS_FILE = join(ROOT, "features/billing/billing.functions.ts");
const PAYMENTS_ROUTE = join(ROOT, "routes/_authenticated/admin/payments.tsx");
const SUBSCRIPTION_ROUTE = join(ROOT, "routes/_authenticated/subscription.tsx");

const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ADMIN = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ADMIN_B = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";
const PLAN_SEM = "11111111-1111-4111-8111-111111111111";
const YEAR_ID = "33333333-3333-4333-8333-333333333333";
const SEM_ID = "44444444-4444-4444-8444-444444444444";
const SUB_A = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const PAY_A = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const PAY_UNKNOWN = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const COUPON_ID = "66666666-6666-4666-8666-666666666666";
const REASON = "المبلغ المحول غير مطابق";

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

function jpegBytes(): Uint8Array {
  const bytes = new Uint8Array(32);
  bytes[0] = 0xff;
  bytes[1] = 0xd8;
  bytes[2] = 0xff;
  bytes[3] = 0xe0;
  return bytes;
}

function matches(row: Row, filters: Filter[]): boolean {
  return filters.every((filter) => {
    const actual = row[filter.column];
    if (filter.op === "eq") return actual === filter.value;
    if (filter.op === "neq") return actual !== filter.value;
    if (filter.op === "lt") return Number(actual) < Number(filter.value);
    if (filter.op === "in") {
      return Array.isArray(filter.value) && filter.value.includes(actual);
    }
    return true;
  });
}

function seedDb(overrides: Partial<Record<string, Row[]>> = {}): Record<string, Row[]> {
  return {
    user_roles: [
      { user_id: ADMIN, role: "admin" },
      { user_id: ADMIN_B, role: "admin" },
    ],
    profiles: [{ id: USER_A, full_name: "سارة المعلم" }],
    plans: [
      {
        id: PLAN_SEM,
        code: "core_standard_semester",
        name: "فصل دراسي",
        price: 40,
        price_sar: 40,
        starts_with: "semester",
        is_active: true,
        term_kind: "semester",
      },
    ],
    coupons: [{ id: COUPON_ID, code: "SEM10", used_count: 2, max_usage: 0 }],
    coupon_redemptions: [],
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
        created_at: "2026-08-11T00:00:00Z",
      },
    ],
    payments: [
      {
        id: PAY_A,
        user_id: USER_A,
        subscription_id: SUB_A,
        amount: 40,
        amount_sar: 40,
        discount_sar: 0,
        net_sar: 40,
        currency: "SAR",
        status: "submitted",
        transfer_reference: "BANK-OLD",
        transaction_number: "BANK-OLD",
        receipt_path: `${USER_A}/${PAY_A}/old.jpg`,
        rejection_reason: null,
        coupon_id: COUPON_ID,
        created_at: "2026-08-11T10:00:00Z",
        paid_at: null,
        verified_at: null,
        verified_by: null,
      },
    ],
    subscription_logs: [],
    billing_audit_log: [],
    ...overrides,
  };
}

function createMockClient(db: Record<string, Row[]>) {
  let seq = 0;
  const client = {
    auth: {
      admin: {
        async listUsers() {
          return {
            data: { users: [{ id: USER_A, email: "sara@example.com" }] },
            error: null,
          };
        },
      },
    },
    from(table: string) {
      const filters: Filter[] = [];
      let pendingInsert: Row[] | null = null;
      let pendingUpdate: Row | null = null;
      let pendingDelete = false;
      let orderCol: string | null = null;
      let orderAsc = true;
      let limitN = Number.POSITIVE_INFINITY;

      const runSelect = () => {
        let rows = (db[table] ?? []).filter((row) => matches(row, filters));
        if (orderCol) {
          const column = orderCol;
          rows = [...rows].sort((a, b) => {
            const left = String(a[column] ?? "");
            const right = String(b[column] ?? "");
            return orderAsc ? left.localeCompare(right) : right.localeCompare(left);
          });
        }
        return rows.slice(0, limitN);
      };

      const execute = async (mode: "many" | "maybe") => {
        if (pendingInsert) {
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
        lt(column: string, value: unknown) {
          filters.push({ column, op: "lt", value });
          return api;
        },
        neq(column: string, value: unknown) {
          filters.push({ column, op: "neq", value });
          return api;
        },
        in(column: string, value: unknown[]) {
          filters.push({ column, op: "in", value });
          return api;
        },
        order(column: string, options?: { ascending?: boolean }) {
          orderCol = column;
          orderAsc = options?.ascending !== false;
          return api;
        },
        limit(n: number) {
          limitN = n;
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
  attachTryInsertCouponRedemptionRpc(client, db);
  return { client, db };
}

function createMockStorage() {
  const objects = new Map<string, { body: Uint8Array; contentType: string }>();
  const storage: ReceiptStorage = {
    async upload(path, body, contentType) {
      objects.set(path, { body, contentType });
    },
    async remove(path) {
      objects.delete(path);
    },
    async createSignedUrl() {
      return "https://signed.example/receipt?ttl=90";
    },
  };
  return { storage, objects };
}

async function reject(
  db: Record<string, Row[]>,
  input: { actorId?: string; paymentId?: string; reason?: string } = {},
) {
  const { client } = createMockClient(db);
  return {
    result: await rejectPaymentOp(client as never, {
      actorId: input.actorId ?? ADMIN,
      paymentId: input.paymentId ?? PAY_A,
      reason: input.reason ?? REASON,
    }),
    client,
    db,
  };
}

function assertBillingError(err: unknown, code: string) {
  assert.equal(err instanceof BillingError, true);
  assert.equal((err as BillingError).code, code);
}

describe("rejectPaymentOp", () => {
  it("A. admin rejects submitted", async () => {
    const { result, db } = await reject(seedDb());
    assert.deepEqual(result, { ok: true });
    assert.equal(db.payments[0].status, "rejected");
    assert.equal(db.payments[0].rejection_reason, REASON);
    assert.equal(db.subscriptions[0].status, "pending_payment");
  });

  it("B. teacher cannot reject", async () => {
    await assert.rejects(
      () => reject(seedDb(), { actorId: USER_A }),
      (err: unknown) => {
        assert.equal(err instanceof Error && err.message.includes("Administrators"), true);
        return true;
      },
    );
  });

  it("C/D/E. reason length is validated", () => {
    assert.throws(() => rejectPaymentInputSchema.parse({ paymentId: PAY_A, reason: "" }));
    assert.throws(() => rejectPaymentInputSchema.parse({ paymentId: PAY_A, reason: "ab" }));
    assert.throws(() =>
      rejectPaymentInputSchema.parse({ paymentId: PAY_A, reason: "x".repeat(501) }),
    );
    assert.doesNotThrow(() => rejectPaymentInputSchema.parse({ paymentId: PAY_A, reason: "abc" }));
  });

  it("F. verified cannot reject", async () => {
    const db = seedDb();
    db.payments[0].status = "verified";
    await assert.rejects(
      () => reject(db),
      (err) => {
        assertBillingError(err, "INVALID_PAYMENT");
        return true;
      },
    );
  });

  it("G. created cannot reject", async () => {
    const db = seedDb();
    db.payments[0].status = "created";
    await assert.rejects(
      () => reject(db),
      (err) => {
        assertBillingError(err, "INVALID_PAYMENT");
        return true;
      },
    );
  });

  it("H. rejected same reason is idempotent", async () => {
    const db = seedDb();
    await reject(db);
    const audits = db.billing_audit_log.length;
    const logs = db.subscription_logs.length;
    const second = await reject(db);
    assert.equal(second.result.ok, true);
    assert.equal(db.billing_audit_log.length, audits);
    assert.equal(db.subscription_logs.length, logs);
  });

  it("I. rejected different reason is denied", async () => {
    const db = seedDb();
    await reject(db);
    await assert.rejects(
      () => reject(db, { reason: "سبب مختلف تماما" }),
      (err) => {
        assertBillingError(err, "INVALID_PAYMENT");
        return true;
      },
    );
    assert.equal(db.payments[0].rejection_reason, REASON);
  });

  it("J. payment not found", async () => {
    await assert.rejects(
      () => reject(seedDb(), { paymentId: PAY_UNKNOWN }),
      (err) => {
        assertBillingError(err, "INVALID_PAYMENT");
        return true;
      },
    );
  });

  it("K/L. wrong ownership / subscription relationship denied", async () => {
    const owned = seedDb();
    owned.payments[0].user_id = USER_B;
    await assert.rejects(
      () => reject(owned),
      (err) => {
        assertBillingError(err, "INVALID_PAYMENT");
        return true;
      },
    );

    const mismatched = seedDb();
    mismatched.subscriptions[0].user_id = USER_B;
    await assert.rejects(
      () => reject(mismatched),
      (err) => {
        assertBillingError(err, "INVALID_PAYMENT");
        return true;
      },
    );
  });

  it("M. queue excludes rejected", async () => {
    const db = seedDb();
    const { client } = createMockClient(db);
    assert.equal((await listAdminSubmittedPaymentsOp(client as never, ADMIN)).length, 1);
    await rejectPaymentOp(client as never, {
      actorId: ADMIN,
      paymentId: PAY_A,
      reason: REASON,
    });
    assert.equal((await listAdminSubmittedPaymentsOp(client as never, ADMIN)).length, 0);
  });

  it("R/S. rejection audit and subscription log once", async () => {
    const { db } = await reject(seedDb());
    const audits = db.billing_audit_log.filter((row) => row.action === "payment_rejected");
    const logs = db.subscription_logs.filter((row) => row.action === "payment_rejected");
    assert.equal(audits.length, 1);
    assert.equal(logs.length, 1);
    assert.equal(logs[0].notes, REASON);
    assert.equal((audits[0].new_value as { rejectionReason: string }).rejectionReason, REASON);
  });

  it("T. rejection preserves receipt and amounts", async () => {
    const db = seedDb();
    const before = { ...db.payments[0] };
    await reject(db);
    const after = db.payments[0];
    assert.equal(after.receipt_path, before.receipt_path);
    assert.equal(after.transfer_reference, before.transfer_reference);
    assert.equal(after.amount_sar, before.amount_sar);
    assert.equal(after.net_sar, before.net_sar);
    assert.equal(after.coupon_id, before.coupon_id);
    assert.equal(after.subscription_id, before.subscription_id);
    assert.equal(after.user_id, before.user_id);
    assert.equal(after.verified_at, null);
    assert.equal(after.paid_at, null);
  });

  it("AD. coupon is not consumed on reject", async () => {
    const { db } = await reject(seedDb());
    assert.equal(db.coupons[0].used_count, 2);
  });

  it("AE/AF. no new payment or subscription row", async () => {
    const db = seedDb();
    await reject(db);
    assert.equal(db.payments.length, 1);
    assert.equal(db.subscriptions.length, 1);
  });

  it("AG. concurrent reject with same reason leaves a single rejected row", async () => {
    const db = seedDb();
    const { client } = createMockClient(db);
    const results = await Promise.all([
      rejectPaymentOp(client as never, { actorId: ADMIN, paymentId: PAY_A, reason: REASON }),
      rejectPaymentOp(client as never, { actorId: ADMIN_B, paymentId: PAY_A, reason: REASON }),
    ]);
    assert.equal(results[0].ok, true);
    assert.equal(results[1].ok, true);
    assert.equal(db.payments[0].status, "rejected");
    assert.equal(db.payments[0].rejection_reason, REASON);
    assert.equal(db.payments.length, 1);
  });
});

describe("activation security after rejection", () => {
  it("N/Q. submitted activation allowed", async () => {
    const { client, db } = createMockClient(seedDb());
    await activateSubscriptionOp(client as never, {
      actorId: ADMIN,
      subscriptionId: SUB_A,
      today: "2026-10-16",
    });
    assert.equal(db.payments[0].status, "verified");
    assert.equal(db.subscriptions[0].status, "active");
  });

  it("O. rejected activation denied", async () => {
    const db = seedDb();
    await reject(db);
    const { client } = createMockClient(db);
    await assert.rejects(
      () =>
        activateSubscriptionOp(client as never, {
          actorId: ADMIN,
          subscriptionId: SUB_A,
          today: "2026-10-16",
        }),
      (err) => {
        assertBillingError(err, "INVALID_PAYMENT");
        return true;
      },
    );
    assert.equal(db.subscriptions[0].status, "pending_payment");
    assert.equal(db.payments[0].status, "rejected");
  });

  it("P. created activation denied", async () => {
    const db = seedDb();
    db.payments[0].status = "created";
    const { client } = createMockClient(db);
    await assert.rejects(
      () =>
        activateSubscriptionOp(client as never, {
          actorId: ADMIN,
          subscriptionId: SUB_A,
          today: "2026-10-16",
        }),
      (err) => {
        assertBillingError(err, "INVALID_PAYMENT");
        return true;
      },
    );
  });

  it("AH. reject vs activation: winner blocks the other", async () => {
    const rejectFirst = seedDb();
    await reject(rejectFirst);
    const rejectedClient = createMockClient(rejectFirst).client;
    await assert.rejects(() =>
      activateSubscriptionOp(rejectedClient as never, {
        actorId: ADMIN,
        subscriptionId: SUB_A,
        today: "2026-10-16",
      }),
    );

    const activateFirst = seedDb();
    const activatedClient = createMockClient(activateFirst).client;
    await activateSubscriptionOp(activatedClient as never, {
      actorId: ADMIN,
      subscriptionId: SUB_A,
      today: "2026-10-16",
    });
    await assert.rejects(() =>
      rejectPaymentOp(activatedClient as never, {
        actorId: ADMIN,
        paymentId: PAY_A,
        reason: REASON,
      }),
    );
  });
});

describe("teacher correction after rejection", () => {
  it("U/V. rejected can replace receipt without reopening", async () => {
    const db = seedDb();
    await reject(db);
    const { client } = createMockClient(db);
    const mock = createMockStorage();
    await attachPaymentReceiptOp(
      client as never,
      {
        userId: USER_A,
        paymentId: PAY_A,
        bytes: jpegBytes(),
        declaredMime: "image/jpeg",
        declaredName: "new.jpg",
      },
      mock.storage,
    );
    assert.equal(db.payments[0].status, "rejected");
    assert.equal(db.payments[0].rejection_reason, REASON);
    assert.notEqual(db.payments[0].receipt_path, `${USER_A}/${PAY_A}/old.jpg`);
  });

  it("W. rejected + same reference denied", async () => {
    const db = seedDb();
    await reject(db);
    const { client } = createMockClient(db);
    await assert.rejects(
      () =>
        submitPaymentReferenceOp(client as never, {
          userId: USER_A,
          paymentId: PAY_A,
          reference: "BANK-OLD",
        }),
      (err) => {
        assert.equal(err instanceof BillingError && err.code === "PAYMENT_REFERENCE_LOCKED", true);
        return true;
      },
    );
    assert.equal(db.payments[0].status, "rejected");
  });

  it("X/Y. rejected + new reference → submitted and clears reason", async () => {
    const db = seedDb();
    await reject(db);
    const { client } = createMockClient(db);
    await submitPaymentReferenceOp(client as never, {
      userId: USER_A,
      paymentId: PAY_A,
      reference: "BANK-NEW",
    });
    assert.equal(db.payments[0].status, "submitted");
    assert.equal(db.payments[0].transfer_reference, "BANK-NEW");
    assert.equal(db.payments[0].transaction_number, "BANK-NEW");
    assert.equal(db.payments[0].rejection_reason, null);
    assert.equal(db.payments[0].id, PAY_A);
    assert.equal(db.payments.length, 1);
    assert.equal(db.subscriptions.length, 1);
  });

  it("Z. getOpenCheckout returns rejectionReason", async () => {
    const db = seedDb();
    await reject(db);
    const { client } = createMockClient(db);
    const open = await loadOpenCheckout({
      userId: USER_A,
      supabase: client as never,
      env: {
        BILLING_BANK_NAME: "Test Bank",
        BILLING_BANK_BENEFICIARY: "Waraqa",
        BILLING_BANK_IBAN: "SA0000000000000000000000",
      },
    });
    assert.equal(open?.paymentStatus, "rejected");
    assert.equal(open?.rejectionReason, REASON);
    assert.equal(open?.paymentId, PAY_A);
    assert.equal(open && "receipt_path" in open, false);
    assert.equal(JSON.stringify(open).includes("receipt_path"), false);
  });

  it("AB. after resubmit the admin queue contains the payment again", async () => {
    const db = seedDb();
    const { client } = createMockClient(db);
    await rejectPaymentOp(client as never, {
      actorId: ADMIN,
      paymentId: PAY_A,
      reason: REASON,
    });
    await submitPaymentReferenceOp(client as never, {
      userId: USER_A,
      paymentId: PAY_A,
      reference: "BANK-NEW",
    });
    const queue = await listAdminSubmittedPaymentsOp(client as never, ADMIN);
    assert.equal(queue.length, 1);
    assert.equal(queue[0].paymentId, PAY_A);
  });

  it("AC. second reject after resubmit works", async () => {
    const db = seedDb();
    const { client } = createMockClient(db);
    await rejectPaymentOp(client as never, {
      actorId: ADMIN,
      paymentId: PAY_A,
      reason: REASON,
    });
    await submitPaymentReferenceOp(client as never, {
      userId: USER_A,
      paymentId: PAY_A,
      reference: "BANK-NEW",
    });
    await rejectPaymentOp(client as never, {
      actorId: ADMIN,
      paymentId: PAY_A,
      reason: "الإيصال غير واضح",
    });
    assert.equal(db.payments[0].status, "rejected");
    assert.equal(db.payments[0].rejection_reason, "الإيصال غير واضح");
  });

  it("other user cannot resubmit", async () => {
    const db = seedDb();
    await reject(db);
    const { client } = createMockClient(db);
    await assert.rejects(
      () =>
        submitPaymentReferenceOp(client as never, {
          userId: USER_B,
          paymentId: PAY_A,
          reference: "BANK-NEW",
        }),
      (err) => err instanceof BillingAccessError,
    );
  });
});

describe("rejection contracts", () => {
  it("AA. teacher UI shows the rejection message and resubmit CTA", () => {
    const src = readFileSync(SUBSCRIPTION_ROUTE, "utf8");
    assert.match(src, /تم رفض طلب الدفع/);
    assert.match(src, /سبب الرفض/);
    assert.match(src, /إعادة إرسال التحويل/);
  });

  it("AI/AJ/AK. client cannot supply status, userId, or subscriptionId", () => {
    assert.throws(() =>
      rejectPaymentInputSchema.parse({
        paymentId: PAY_A,
        reason: REASON,
        status: "verified",
      }),
    );
    assert.throws(() =>
      rejectPaymentInputSchema.parse({
        paymentId: PAY_A,
        reason: REASON,
        userId: USER_B,
      }),
    );
    assert.throws(() =>
      rejectPaymentInputSchema.parse({
        paymentId: PAY_A,
        reason: REASON,
        subscriptionId: SUB_A,
      }),
    );
    const fns = readFileSync(FUNCTIONS_FILE, "utf8");
    const start = fns.indexOf("export const rejectPayment = createServerFn");
    const body = fns.slice(start);
    assert.match(body, /context\.userId/);
    assert.doesNotMatch(body.slice(0, 700), /data\.userId/);
    assert.doesNotMatch(body.slice(0, 700), /data\.status/);
    assert.match(readFileSync(PAYMENTS_ROUTE, "utf8"), /رفض الدفع/);
    assert.match(readFileSync(OPERATIONS_FILE, "utf8"), /export async function rejectPaymentOp/);
  });
});
