import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { BillingError } from "./types.ts";
import {
  activateSubscriptionOp,
  startCheckoutOp,
  submitPaymentReferenceOp,
} from "./billing.operations.ts";
import { APPROVED_FEATURE_KEYS } from "./entitlement.logic.ts";
import { requireEntitlement } from "./require-entitlement.ts";
import { registerPaymentProvider } from "./providers/payment-provider.ts";

const TEACHER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TEACHER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ADMIN = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const PLAN_SEM = "11111111-1111-4111-8111-111111111111";
const YEAR_ID = "33333333-3333-4333-8333-333333333333";
const SEM_ID = "44444444-4444-4444-8444-444444444444";
const METHOD_ID = "55555555-5555-4555-8555-555555555555";

const FUTURE_TODAY = "2026-08-11";
const CURRENT_TODAY = "2026-10-16";
const AFTER_EXPIRY = "2027-01-08";
const SEMESTER_START = "2026-08-23";
const SEMESTER_END = "2027-01-07";

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

function seedDb(): Record<string, Row[]> {
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
    ],
    billing_academic_years: [
      {
        id: YEAR_ID,
        code: "1448-1449",
        starts_on: SEMESTER_START,
        ends_on: "2027-06-24",
        is_current: false,
      },
    ],
    billing_semesters: [
      {
        id: SEM_ID,
        academic_year_id: YEAR_ID,
        code: "semester_1",
        starts_on: SEMESTER_START,
        ends_on: SEMESTER_END,
        is_current: false,
        sequence: 1,
      },
    ],
    plan_entitlements: APPROVED_FEATURE_KEYS.map((feature_key) => ({
      plan_id: PLAN_SEM,
      feature_key,
    })),
    subscriptions: [],
    payments: [],
    payment_methods: [{ id: METHOD_ID, provider: "manual", is_active: true }],
    coupons: [],
    coupon_redemptions: [],
    subscription_logs: [],
    billing_audit_log: [],
    user_roles: [{ user_id: ADMIN, role: "admin" }],
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
  let seq = 0;

  const client = {
    from(table: string) {
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

  return { client, db };
}

function denied(err: unknown): boolean {
  return err instanceof BillingError && err.code === "FEATURE_ENTITLEMENT_REQUIRED";
}

async function checkoutSemester(
  client: ReturnType<typeof createMockClient>["client"],
  today: string,
) {
  return startCheckoutOp(client as never, {
    userId: TEACHER_A,
    planCode: "core_standard_semester",
    today,
  });
}

async function submitReference(
  client: ReturnType<typeof createMockClient>["client"],
  paymentId: string,
  reference = "BANK-REF-001",
) {
  return submitPaymentReferenceOp(client as never, {
    userId: TEACHER_A,
    paymentId,
    reference,
  });
}

async function activateAsAdmin(
  client: ReturnType<typeof createMockClient>["client"],
  subscriptionId: string,
  today: string,
) {
  return activateSubscriptionOp(client as never, {
    actorId: ADMIN,
    subscriptionId,
    today,
  });
}

describe("Phase 3.3 mocked billing lifecycle", () => {
  it("A. future purchase: created → submitted → scheduled → DENY before start, ALLOW on start", async () => {
    const { client, db } = createMockClient(seedDb());
    const checkout = await checkoutSemester(client, FUTURE_TODAY);

    assert.equal(db.payments[0].status, "created");
    assert.equal(db.subscriptions[0].status, "pending_payment");
    assert.equal(db.subscriptions[0].starts_on, SEMESTER_START);
    assert.equal(db.subscriptions[0].ends_on, SEMESTER_END);
    assert.equal(db.subscriptions[0].billing_academic_year_id, YEAR_ID);
    assert.equal(db.subscriptions[0].billing_semester_id, SEM_ID);
    assert.equal(db.billing_academic_years[0].code, "1448-1449");
    assert.equal(db.billing_semesters[0].code, "semester_1");
    assert.equal(checkout.amount, 40);

    await submitReference(client, checkout.paymentId);
    assert.equal(db.payments[0].status, "submitted");

    const activated = await activateAsAdmin(client, checkout.subscriptionId, FUTURE_TODAY);
    assert.equal(activated.status, "scheduled");
    assert.equal(db.payments[0].status, "verified");
    assert.equal(db.subscriptions[0].status, "scheduled");
    assert.equal(db.subscriptions[0].starts_on, SEMESTER_START);
    assert.equal(db.subscriptions[0].ends_on, SEMESTER_END);
    assert.equal(db.subscriptions[0].activated_at ?? null, null);

    await assert.rejects(
      () =>
        requireEntitlement("lesson_plan", {
          userId: TEACHER_A,
          supabase: client as never,
          writeClient: client as never,
          today: FUTURE_TODAY,
        }),
      denied,
    );

    const onStart = await requireEntitlement("lesson_plan", {
      userId: TEACHER_A,
      supabase: client as never,
      writeClient: client as never,
      today: SEMESTER_START,
    });
    assert.equal(onStart.subscriptionId, checkout.subscriptionId);
    assert.equal(db.subscriptions[0].status, "active");
    assert.ok(db.subscriptions[0].activated_at);
    assert.equal(db.subscriptions[0].starts_on, SEMESTER_START);
    assert.equal(db.subscriptions[0].ends_on, SEMESTER_END);
  });

  it("B. current purchase: created → submitted → active → entitlement ALLOW", async () => {
    const { client, db } = createMockClient(seedDb());
    const checkout = await checkoutSemester(client, CURRENT_TODAY);

    assert.equal(db.payments[0].status, "created");
    assert.equal(db.subscriptions[0].status, "pending_payment");
    assert.equal(db.subscriptions[0].starts_on, SEMESTER_START);
    assert.equal(db.subscriptions[0].ends_on, SEMESTER_END);

    await submitReference(client, checkout.paymentId);
    assert.equal(db.payments[0].status, "submitted");

    const activated = await activateAsAdmin(client, checkout.subscriptionId, CURRENT_TODAY);
    const sub = db.subscriptions[0];

    assert.equal(activated.status, "active");
    assert.equal(db.payments[0].status, "verified");
    assert.equal(sub.status, "active");
    assert.equal(sub.starts_on, CURRENT_TODAY);
    assert.equal(sub.starts_at, CURRENT_TODAY);
    assert.equal(sub.ends_on, SEMESTER_END);
    assert.equal(sub.expires_at, SEMESTER_END);
    assert.ok(sub.activated_at);
    assert.notEqual(sub.activated_at, null);

    const lesson = await requireEntitlement("lesson_plan", {
      userId: TEACHER_A,
      supabase: client as never,
      writeClient: client as never,
      today: CURRENT_TODAY,
    });
    assert.equal(lesson.userId, TEACHER_A);
    assert.equal(lesson.subscriptionId, checkout.subscriptionId);
    assert.equal(lesson.planId, PLAN_SEM);
    assert.equal(lesson.featureKey, "lesson_plan");

    const worksheet = await requireEntitlement("worksheet", {
      userId: TEACHER_A,
      supabase: client as never,
      writeClient: client as never,
      today: CURRENT_TODAY,
    });
    assert.equal(worksheet.featureKey, "worksheet");
    assert.equal(worksheet.subscriptionId, checkout.subscriptionId);
  });

  it("C. expiry: active subscription after ends_on → entitlement DENY", async () => {
    const { client } = createMockClient(seedDb());
    const checkout = await checkoutSemester(client, CURRENT_TODAY);
    await submitReference(client, checkout.paymentId);
    await activateAsAdmin(client, checkout.subscriptionId, CURRENT_TODAY);

    await assert.rejects(
      () =>
        requireEntitlement("lesson_plan", {
          userId: TEACHER_A,
          supabase: client as never,
          writeClient: client as never,
          today: AFTER_EXPIRY,
        }),
      denied,
    );
  });

  it("D. ownership: another teacher cannot use the first teacher's subscription", async () => {
    const { client } = createMockClient(seedDb());
    const checkout = await checkoutSemester(client, CURRENT_TODAY);
    await submitReference(client, checkout.paymentId);
    await activateAsAdmin(client, checkout.subscriptionId, CURRENT_TODAY);

    await assert.rejects(
      () =>
        requireEntitlement("lesson_plan", {
          userId: TEACHER_B,
          supabase: client as never,
          writeClient: client as never,
          today: CURRENT_TODAY,
        }),
      denied,
    );
  });

  it("E. submitted reference is immutable; same value is idempotent", async () => {
    const { client, db } = createMockClient(seedDb());
    const checkout = await checkoutSemester(client, CURRENT_TODAY);

    await submitReference(client, checkout.paymentId, "BANK-FIRST");
    assert.equal(db.payments[0].status, "submitted");
    assert.equal(db.payments[0].transfer_reference, "BANK-FIRST");

    const same = await submitReference(client, checkout.paymentId, "BANK-FIRST");
    assert.equal(same.ok, true);
    assert.equal(db.payments[0].transfer_reference, "BANK-FIRST");
    assert.equal(db.payments.length, 1);

    await assert.rejects(
      () => submitReference(client, checkout.paymentId, "BANK-SECOND"),
      (err: unknown) => err instanceof BillingError && err.code === "PAYMENT_REFERENCE_LOCKED",
    );
    assert.equal(db.payments[0].transfer_reference, "BANK-FIRST");
    assert.equal(db.payments[0].transaction_number, "BANK-FIRST");
    assert.equal(db.payments.length, 1);
  });
});
