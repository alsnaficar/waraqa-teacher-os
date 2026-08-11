import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { BillingAccessError, BillingError } from "./types.ts";
import {
  activateSubscriptionInputSchema,
  activateSubscriptionOp,
  startCheckoutOp,
  submitPaymentInputSchema,
  submitPaymentReferenceOp,
} from "./billing.operations.ts";
import { registerPaymentProvider } from "./providers/payment-provider.ts";

const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ADMIN = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const PLAN_SEM = "11111111-1111-4111-8111-111111111111";
const PLAN_YEAR = "22222222-2222-4222-8222-222222222222";
const YEAR_ID = "33333333-3333-4333-8333-333333333333";
const SEM_ID = "44444444-4444-4444-8444-444444444444";
const METHOD_ID = "55555555-5555-4555-8555-555555555555";

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

function seedDb(overrides: Partial<Record<string, Row[]>> = {}): Record<string, Row[]> {
  return {
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
      {
        id: PLAN_YEAR,
        code: "core_standard_academic_year",
        name: "عام دراسي",
        price: 70,
        price_sar: 70,
        currency: "SAR",
        product: "core",
        term_kind: "academic_year",
        is_active: true,
        starts_with: "academic_year",
      },
      {
        id: "99999999-9999-4999-8999-999999999999",
        code: "inactive_plan",
        name: "متوقفة",
        price: 10,
        price_sar: 10,
        currency: "SAR",
        product: "core",
        term_kind: "semester",
        is_active: false,
        starts_with: "semester",
      },
    ],
    billing_academic_years: [
      {
        id: YEAR_ID,
        starts_on: "2026-08-23",
        ends_on: "2027-06-30",
        is_current: true,
      },
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
    subscriptions: [],
    payments: [],
    payment_methods: [{ id: METHOD_ID, provider: "manual", is_active: true }],
    coupons: [],
    subscription_logs: [],
    billing_audit_log: [],
    user_roles: [{ user_id: ADMIN, role: "admin" }],
    academic_years: [
      { id: "teacher-year", user_id: USER_A, is_active: true, end_date: "2099-01-01" },
    ],
    semesters: [{ id: "teacher-sem", user_id: USER_A, start_date: "2099-01-01" }],
    ...overrides,
  };
}

function matches(
  row: Row,
  filters: Array<{ column: string; op: string; value: unknown }>,
): boolean {
  return filters.every((filter) => {
    const actual = row[filter.column];
    if (filter.op === "eq") return actual === filter.value;
    if (filter.op === "neq") return actual !== filter.value;
    if (actual == null) return false;
    const left = String(actual);
    const right = String(filter.value);
    if (filter.op === "lte") return left <= right;
    if (filter.op === "gte") return left >= right;
    return true;
  });
}

function createMockClient(db: Record<string, Row[]>) {
  const fromCalls: string[] = [];
  let seq = 0;

  const client = {
    from(table: string) {
      fromCalls.push(table);
      const filters: Array<{ column: string; op: string; value: unknown }> = [];
      let pendingInsert: Row[] | null = null;
      let pendingUpdate: Row | null = null;
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

      const execute = async (mode: "many" | "single" | "maybe") => {
        if (pendingInsert) {
          const inserted: Row[] = [];
          for (const row of pendingInsert) {
            if (
              table === "payments" &&
              row.idempotency_key &&
              (db.payments ?? []).some(
                (existing) => existing.idempotency_key === row.idempotency_key,
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
          const data = mode === "many" ? inserted : (inserted[0] ?? null);
          return { data, error: null };
        }

        if (pendingUpdate) {
          const rows = (db[table] ?? []).filter((row) => matches(row, filters));
          for (const row of rows) {
            Object.assign(row, pendingUpdate);
          }
          return { data: mode === "many" ? rows : (rows[0] ?? null), error: null };
        }

        const rows = runSelect();
        if (mode === "many") return { data: rows, error: null };
        if (mode === "maybe") return { data: rows[0] ?? null, error: null };
        if (!rows[0]) return { data: null, error: { message: "not found" } };
        return { data: rows[0], error: null };
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
        eq(column: string, value: unknown) {
          filters.push({ column, op: "eq", value });
          return api;
        },
        neq(column: string, value: unknown) {
          filters.push({ column, op: "neq", value });
          return api;
        },
        lte(column: string, value: unknown) {
          filters.push({ column, op: "lte", value });
          return api;
        },
        gte(column: string, value: unknown) {
          filters.push({ column, op: "gte", value });
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
        single() {
          return execute("single");
        },
        then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
          return execute("many").then(onFulfilled, onRejected);
        },
      };

      return api;
    },
  };

  return { client, fromCalls, db };
}

describe("Phase 2 billing operations", () => {
  it("rejects inactive and nonexistent plans", async () => {
    const { client } = createMockClient(seedDb());
    await assert.rejects(
      () =>
        startCheckoutOp(client as never, {
          userId: USER_A,
          planCode: "inactive_plan",
          today: "2026-09-01",
        }),
      (err: unknown) => err instanceof BillingError && err.code === "INVALID_PLAN",
    );
    await assert.rejects(
      () =>
        startCheckoutOp(client as never, {
          userId: USER_A,
          planCode: "missing",
          today: "2026-09-01",
        }),
      (err: unknown) => err instanceof BillingError && err.code === "INVALID_PLAN",
    );
  });

  it("charges the database price, not a client-supplied amount", async () => {
    const { client } = createMockClient(seedDb());
    const result = await startCheckoutOp(client as never, {
      userId: USER_A,
      planCode: "core_standard_semester",
      today: "2026-09-01",
    });
    assert.equal(result.amount, 40);
  });

  it("fails closed when the official calendar is empty", async () => {
    const { client } = createMockClient(
      seedDb({ billing_academic_years: [], billing_semesters: [] }),
    );
    await assert.rejects(
      () =>
        startCheckoutOp(client as never, {
          userId: USER_A,
          planCode: "core_standard_semester",
          today: "2026-09-01",
        }),
      (err: unknown) => err instanceof BillingError && err.code === "CALENDAR_UNAVAILABLE",
    );
  });

  it("does not query teacher academic_years or semesters for billing dates", async () => {
    const { client, fromCalls } = createMockClient(seedDb());
    await startCheckoutOp(client as never, {
      userId: USER_A,
      planCode: "core_standard_semester",
      today: "2026-09-01",
    });
    assert.equal(fromCalls.includes("academic_years"), false);
    assert.equal(fromCalls.includes("semesters"), false);
    assert.equal(fromCalls.includes("billing_academic_years"), true);
    assert.equal(fromCalls.includes("billing_semesters"), true);
  });

  it("writes official semester dates onto the subscription", async () => {
    const { client, db } = createMockClient(seedDb());
    await startCheckoutOp(client as never, {
      userId: USER_A,
      planCode: "core_standard_semester",
      today: "2026-09-01",
    });
    const sub = db.subscriptions[0];
    assert.equal(sub.billing_academic_year_id, YEAR_ID);
    assert.equal(sub.billing_semester_id, SEM_ID);
    assert.equal(sub.starts_on, "2026-08-23");
    assert.equal(sub.ends_on, "2027-01-07");
    assert.equal(sub.starts_at, "2026-08-23");
    assert.equal(sub.expires_at, "2027-01-07");
    assert.equal(sub.academic_year_id, null);
    assert.equal(sub.semester_id, null);
    assert.equal(sub.status, "pending_payment");
  });

  it("writes official academic-year dates and leaves billing_semester_id null", async () => {
    const { client, db } = createMockClient(seedDb());
    await startCheckoutOp(client as never, {
      userId: USER_A,
      planCode: "core_standard_academic_year",
      today: "2026-09-01",
    });
    const sub = db.subscriptions[0];
    assert.equal(sub.billing_academic_year_id, YEAR_ID);
    assert.equal(sub.billing_semester_id, null);
    assert.equal(sub.starts_on, "2026-08-23");
    assert.equal(sub.ends_on, "2027-06-30");
  });

  it("current semester activation starts on approval date, not official start", async () => {
    const { client, db } = createMockClient(seedDb());
    const checkout = await startCheckoutOp(client as never, {
      userId: USER_A,
      planCode: "core_standard_semester",
      today: "2026-10-15",
    });
    assert.equal(db.subscriptions[0].starts_on, "2026-08-23");

    const result = await activateSubscriptionOp(client as never, {
      actorId: ADMIN,
      subscriptionId: checkout.subscriptionId,
      today: "2026-10-16",
    });

    const sub = db.subscriptions[0];
    assert.equal(result.status, "active");
    assert.equal(sub.status, "active");
    assert.equal(sub.starts_on, "2026-10-16");
    assert.equal(sub.starts_at, "2026-10-16");
    assert.equal(sub.ends_on, "2027-01-07");
    assert.equal(sub.expires_at, "2027-01-07");
    assert.equal(sub.activated_at, "2026-10-16T00:00:00.000Z");
    assert.notEqual(sub.starts_on, "2026-08-23");
    assert.notEqual(sub.starts_on, "2026-10-15");
  });

  it("current academic year activation starts on approval date", async () => {
    const { client, db } = createMockClient(seedDb());
    const checkout = await startCheckoutOp(client as never, {
      userId: USER_A,
      planCode: "core_standard_academic_year",
      today: "2026-10-15",
    });
    const result = await activateSubscriptionOp(client as never, {
      actorId: ADMIN,
      subscriptionId: checkout.subscriptionId,
      today: "2026-10-16",
    });
    const sub = db.subscriptions[0];
    assert.equal(result.status, "active");
    assert.equal(sub.status, "active");
    assert.equal(sub.starts_on, "2026-10-16");
    assert.equal(sub.starts_at, "2026-10-16");
    assert.equal(sub.ends_on, "2027-06-30");
    assert.equal(sub.expires_at, "2027-06-30");
    assert.equal(sub.billing_semester_id, null);
  });

  it("future semester stays on official bounds and becomes scheduled", async () => {
    const { client, db } = createMockClient(seedDb());
    const checkout = await startCheckoutOp(client as never, {
      userId: USER_A,
      planCode: "core_standard_semester",
      today: "2026-08-01",
    });
    const result = await activateSubscriptionOp(client as never, {
      actorId: ADMIN,
      subscriptionId: checkout.subscriptionId,
      today: "2026-08-01",
    });
    const sub = db.subscriptions[0];
    assert.equal(result.status, "scheduled");
    assert.equal(sub.status, "scheduled");
    assert.equal(sub.starts_on, "2026-08-23");
    assert.equal(sub.starts_at, "2026-08-23");
    assert.equal(sub.ends_on, "2027-01-07");
    assert.equal(sub.expires_at, "2027-01-07");
    assert.equal(sub.activated_at ?? null, null);
    assert.equal(db.payments[0].status, "verified");
  });

  it("future academic year stays on official bounds with null semester", async () => {
    const { client, db } = createMockClient(seedDb());
    const checkout = await startCheckoutOp(client as never, {
      userId: USER_A,
      planCode: "core_standard_academic_year",
      today: "2026-08-01",
    });
    const result = await activateSubscriptionOp(client as never, {
      actorId: ADMIN,
      subscriptionId: checkout.subscriptionId,
      today: "2026-08-01",
    });
    const sub = db.subscriptions[0];
    assert.equal(result.status, "scheduled");
    assert.equal(sub.starts_on, "2026-08-23");
    assert.equal(sub.starts_at, "2026-08-23");
    assert.equal(sub.ends_on, "2027-06-30");
    assert.equal(sub.expires_at, "2027-06-30");
    assert.equal(sub.billing_semester_id, null);
    assert.equal(sub.activated_at ?? null, null);
  });

  it("does not create a second subscription for the same official period", async () => {
    const { client, db } = createMockClient(seedDb());
    const first = await startCheckoutOp(client as never, {
      userId: USER_A,
      planCode: "core_standard_semester",
      today: "2026-09-01",
    });
    await activateSubscriptionOp(client as never, {
      actorId: ADMIN,
      subscriptionId: first.subscriptionId,
      today: "2026-09-01",
    });
    await assert.rejects(
      () =>
        startCheckoutOp(client as never, {
          userId: USER_A,
          planCode: "core_standard_semester",
          today: "2026-09-01",
        }),
      (err: unknown) => err instanceof BillingError && err.code === "EXISTING_SUBSCRIPTION",
    );
    assert.equal(db.subscriptions.length, 1);
  });

  it("retries the same checkout instead of inserting a duplicate payment", async () => {
    const { client, db } = createMockClient(seedDb());
    const first = await startCheckoutOp(client as never, {
      userId: USER_A,
      planCode: "core_standard_semester",
      today: "2026-09-01",
    });
    const second = await startCheckoutOp(client as never, {
      userId: USER_A,
      planCode: "core_standard_semester",
      today: "2026-09-01",
    });
    assert.equal(second.subscriptionId, first.subscriptionId);
    assert.equal(second.paymentId, first.paymentId);
    assert.equal(db.subscriptions.length, 1);
    assert.equal(db.payments.length, 1);
  });

  it("enforces payment ownership on reference submit", async () => {
    const { client } = createMockClient(seedDb());
    const checkout = await startCheckoutOp(client as never, {
      userId: USER_A,
      planCode: "core_standard_semester",
      today: "2026-09-01",
    });
    await assert.rejects(
      () =>
        submitPaymentReferenceOp(client as never, {
          userId: USER_B,
          paymentId: checkout.paymentId,
          reference: "BANK-123",
        }),
      (err: unknown) => err instanceof BillingAccessError,
    );
  });

  it("locks a submitted bank reference: first submit, same-ref idempotent, different-ref denied", async () => {
    const { client, db } = createMockClient(seedDb());
    const checkout = await startCheckoutOp(client as never, {
      userId: USER_A,
      planCode: "core_standard_semester",
      today: "2026-09-01",
    });

    await submitPaymentReferenceOp(client as never, {
      userId: USER_A,
      paymentId: checkout.paymentId,
      reference: "BANK-AAA",
    });
    assert.equal(db.payments[0].status, "submitted");
    assert.equal(db.payments[0].transfer_reference, "BANK-AAA");
    assert.equal(db.payments[0].transaction_number, "BANK-AAA");
    assert.equal(db.payments.length, 1);
    const logsAfterFirst = db.subscription_logs.filter(
      (row) => row.action === "payment_reference_submitted",
    ).length;

    const again = await submitPaymentReferenceOp(client as never, {
      userId: USER_A,
      paymentId: checkout.paymentId,
      reference: "BANK-AAA",
    });
    assert.equal(again.ok, true);
    assert.equal(db.payments[0].transfer_reference, "BANK-AAA");
    assert.equal(db.payments[0].transaction_number, "BANK-AAA");
    assert.equal(db.payments.length, 1);
    assert.equal(
      db.subscription_logs.filter((row) => row.action === "payment_reference_submitted").length,
      logsAfterFirst,
    );

    await assert.rejects(
      () =>
        submitPaymentReferenceOp(client as never, {
          userId: USER_A,
          paymentId: checkout.paymentId,
          reference: "BANK-BBB",
        }),
      (err: unknown) => err instanceof BillingError && err.code === "PAYMENT_REFERENCE_LOCKED",
    );
    assert.equal(db.payments[0].transfer_reference, "BANK-AAA");
    assert.equal(db.payments[0].transaction_number, "BANK-AAA");
    assert.equal(db.payments[0].status, "submitted");
    assert.equal(db.payments.length, 1);
  });

  it("rejects a new reference after the payment is verified", async () => {
    const { client, db } = createMockClient(seedDb());
    const checkout = await startCheckoutOp(client as never, {
      userId: USER_A,
      planCode: "core_standard_semester",
      today: "2026-09-01",
    });
    await submitPaymentReferenceOp(client as never, {
      userId: USER_A,
      paymentId: checkout.paymentId,
      reference: "BANK-AAA",
    });
    await activateSubscriptionOp(client as never, {
      actorId: ADMIN,
      subscriptionId: checkout.subscriptionId,
      today: "2026-09-01",
    });
    assert.equal(db.payments[0].status, "verified");

    await assert.rejects(
      () =>
        submitPaymentReferenceOp(client as never, {
          userId: USER_A,
          paymentId: checkout.paymentId,
          reference: "BANK-NEW",
        }),
      (err: unknown) => err instanceof BillingError && err.code === "INVALID_PAYMENT",
    );
    assert.equal(db.payments[0].transfer_reference, "BANK-AAA");
  });

  it("rejects empty or too-short references at the input schema", () => {
    const paymentId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    assert.throws(() => submitPaymentInputSchema.parse({ paymentId, reference: "" }));
    assert.throws(() => submitPaymentInputSchema.parse({ paymentId, reference: "ab" }));
    assert.doesNotThrow(() => submitPaymentInputSchema.parse({ paymentId, reference: "ABC" }));
  });

  it("rejects a transfer reference already used by another payment", async () => {
    const { client, db } = createMockClient(seedDb());
    const first = await startCheckoutOp(client as never, {
      userId: USER_A,
      planCode: "core_standard_semester",
      today: "2026-09-01",
    });
    await submitPaymentReferenceOp(client as never, {
      userId: USER_A,
      paymentId: first.paymentId,
      reference: "BANK-SHARED",
    });

    const second = await startCheckoutOp(client as never, {
      userId: USER_B,
      planCode: "core_standard_semester",
      today: "2026-09-01",
    });
    await assert.rejects(
      () =>
        submitPaymentReferenceOp(client as never, {
          userId: USER_B,
          paymentId: second.paymentId,
          reference: "BANK-SHARED",
        }),
      (err: unknown) => err instanceof BillingError && err.code === "INVALID_PAYMENT",
    );

    assert.equal(db.payments.length, 2);
    assert.equal(db.payments[0].transfer_reference, "BANK-SHARED");
    assert.equal(db.payments[0].status, "submitted");
    assert.equal(db.payments[1].status, "created");
    assert.equal(db.payments[1].transfer_reference ?? null, null);
  });

  it("refuses activation when the payment belongs to a different user", async () => {
    const { client, db } = createMockClient(seedDb());
    const checkout = await startCheckoutOp(client as never, {
      userId: USER_A,
      planCode: "core_standard_semester",
      today: "2026-09-01",
    });
    db.payments[0].user_id = USER_B;
    await assert.rejects(
      () =>
        activateSubscriptionOp(client as never, {
          actorId: ADMIN,
          subscriptionId: checkout.subscriptionId,
          today: "2026-09-01",
        }),
      (err: unknown) => err instanceof BillingError && err.code === "INVALID_PAYMENT",
    );
  });

  it("activation ignores client-supplied dates and keeps the stored plan", async () => {
    assert.throws(() =>
      activateSubscriptionInputSchema.parse({
        subscriptionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        startsOn: "1999-01-01",
        activationDate: "1999-01-01",
      }),
    );

    const { client, db } = createMockClient(seedDb());
    const checkout = await startCheckoutOp(client as never, {
      userId: USER_A,
      planCode: "core_standard_semester",
      today: "2026-10-15",
    });
    await activateSubscriptionOp(client as never, {
      actorId: ADMIN,
      subscriptionId: checkout.subscriptionId,
      today: "2026-10-16",
      note: "confirmed",
    });
    const sub = db.subscriptions[0];
    assert.equal(sub.plan_id, PLAN_SEM);
    assert.equal(sub.starts_on, "2026-10-16");
    assert.equal(sub.starts_at, sub.starts_on);
    assert.equal(sub.ends_on, "2027-01-07");
    assert.equal(sub.expires_at, sub.ends_on);
  });

  it("classifies current vs future from official billing ids, not provisional starts_on", async () => {
    const { client, db } = createMockClient(seedDb());
    const checkout = await startCheckoutOp(client as never, {
      userId: USER_A,
      planCode: "core_standard_semester",
      today: "2026-10-15",
    });
    db.subscriptions[0].starts_on = "2026-08-23";
    db.subscriptions[0].starts_at = "2026-08-23";
    const result = await activateSubscriptionOp(client as never, {
      actorId: ADMIN,
      subscriptionId: checkout.subscriptionId,
      today: "2026-10-16",
    });
    assert.equal(result.status, "active");
    assert.equal(db.subscriptions[0].starts_on, "2026-10-16");
  });

  it("new payments use created and new subscriptions use pending_payment", async () => {
    const { client, db } = createMockClient(seedDb());
    await startCheckoutOp(client as never, {
      userId: USER_A,
      planCode: "core_standard_semester",
      today: "2026-09-01",
    });
    assert.equal(db.payments[0].status, "created");
    assert.equal(db.subscriptions[0].status, "pending_payment");
    assert.equal(
      db.billing_audit_log.some((row) => row.action === "checkout_created"),
      true,
    );
    assert.equal(
      db.billing_audit_log.some((row) => row.action === "subscription_created"),
      true,
    );
  });

  it("teachers cannot activate; admin is required", async () => {
    const { client } = createMockClient(seedDb());
    const checkout = await startCheckoutOp(client as never, {
      userId: USER_A,
      planCode: "core_standard_semester",
      today: "2026-09-01",
    });
    await assert.rejects(() =>
      activateSubscriptionOp(client as never, {
        actorId: USER_A,
        subscriptionId: checkout.subscriptionId,
        today: "2026-09-01",
      }),
    );
  });
});
