import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { loadBillingHistory, loadOpenCheckout } from "./billing.functions.ts";
import {
  buildManualCheckoutInstruction,
  buildManualReference,
} from "./providers/manual-provider.ts";
import { PUBLIC_BANK_FIELDS, readPublicBankDetails } from "./public-bank.ts";

const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ADMIN = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const PLAN_ID = "11111111-1111-4111-8111-111111111111";
const SUB_A = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const PAY_A = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const PAY_B = "ffffffff-ffff-4fff-8fff-ffffffffffff";

const TEST_BANK = {
  BILLING_BANK_NAME: "Test Bank",
  BILLING_BANK_BENEFICIARY: "Waraqa Test",
  BILLING_BANK_IBAN: "SA0000000000000000000000",
};

type Row = Record<string, unknown>;
type Filter = { column: string; op: "eq" | "neq"; value: unknown };

function matches(row: Row, filters: Filter[]): boolean {
  return filters.every((filter) => {
    const actual = row[filter.column];
    if (filter.op === "eq") return actual === filter.value;
    if (filter.op === "neq") return actual !== filter.value;
    return true;
  });
}

function createMockClient(db: Record<string, Row[]>) {
  const client = {
    from(table: string) {
      const filters: Filter[] = [];
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
        const rows = runSelect();
        if (mode === "many") return { data: rows, error: null };
        return { data: rows[0] ?? null, error: null };
      };

      const api: Record<string, unknown> = {
        select() {
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

  return { client, db };
}

function paymentRow(overrides: Row = {}): Row {
  return {
    id: PAY_A,
    user_id: USER_A,
    subscription_id: SUB_A,
    amount: 40,
    net_sar: 40,
    status: "created",
    transfer_reference: null,
    transaction_number: null,
    receipt_path: null,
    rejection_reason: null,
    paid_at: null,
    created_at: "2026-08-11T00:00:00Z",
    ...overrides,
  };
}

function subscriptionRow(overrides: Row = {}): Row {
  return {
    id: SUB_A,
    user_id: USER_A,
    plan_id: PLAN_ID,
    status: "pending_payment",
    created_at: "2026-08-11T00:00:00Z",
    ...overrides,
  };
}

function seedCheckout(overrides: { payment?: Row; subscription?: Row } = {}) {
  return {
    plans: [
      { id: PLAN_ID, name: "فصل دراسي", price: 70, is_active: true, starts_with: "semester" },
    ],
    subscriptions: [subscriptionRow(overrides.subscription)],
    payments: [paymentRow(overrides.payment)],
  };
}

describe("loadBillingHistory ownership", () => {
  const mixed = {
    payments: [
      paymentRow({ id: PAY_A, user_id: USER_A, amount: 40 }),
      paymentRow({ id: PAY_B, user_id: USER_B, amount: 70, subscription_id: "other" }),
    ],
  };

  it("A. Teacher A sees only A payments", async () => {
    const { client } = createMockClient(mixed);
    const rows = await loadBillingHistory({ userId: USER_A, supabase: client as never });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, PAY_A);
    assert.equal(rows[0].amount, 40);
    assert.equal("userId" in rows[0], false);
  });

  it("B. Teacher B sees only B payments", async () => {
    const { client } = createMockClient(mixed);
    const rows = await loadBillingHistory({ userId: USER_B, supabase: client as never });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, PAY_B);
  });

  it("C. Admin JWT cannot use teacher history as an all-payments endpoint", async () => {
    const { client } = createMockClient(mixed);
    const rows = await loadBillingHistory({ userId: ADMIN, supabase: client as never });
    assert.deepEqual(rows, []);
  });

  it("empty userId returns no history", async () => {
    const { client } = createMockClient(mixed);
    const rows = await loadBillingHistory({ userId: "", supabase: client as never });
    assert.deepEqual(rows, []);
  });
});

describe("loadOpenCheckout restoration", () => {
  it("reconstructs pending checkout from server rows after a refresh", async () => {
    const { client } = createMockClient(seedCheckout());
    const first = await loadOpenCheckout({
      userId: USER_A,
      supabase: client as never,
      env: TEST_BANK,
    });
    const second = await loadOpenCheckout({
      userId: USER_A,
      supabase: client as never,
      env: TEST_BANK,
    });

    assert.ok(first);
    assert.deepEqual(first, second);
    assert.equal(first.paymentId, PAY_A);
    assert.equal(first.amount, 40);
    assert.equal(first.planName, "فصل دراسي");
    assert.equal(first.paymentStatus, "created");
    assert.equal(first.hasReceipt, false);
    assert.equal(first.rejectionReason, null);
    assert.equal("receipt_path" in first, false);
    assert.equal("rejection_reason" in first, false);
    assert.equal(first.instruction.kind, "manual");
    if (first.instruction.kind === "manual") {
      assert.equal(first.instruction.reference, buildManualReference(PAY_A));
    }
  });

  it("uses server net_sar, not the catalogue plan price", async () => {
    const { client } = createMockClient(
      seedCheckout({
        payment: paymentRow({ amount: 40, net_sar: 25 }),
      }),
    );
    const open = await loadOpenCheckout({
      userId: USER_A,
      supabase: client as never,
      env: TEST_BANK,
    });
    assert.equal(open?.amount, 25);
    assert.notEqual(open?.amount, 70);
  });

  it("does not reconstruct another user's checkout", async () => {
    const { client } = createMockClient(seedCheckout());
    const open = await loadOpenCheckout({
      userId: USER_B,
      supabase: client as never,
      env: TEST_BANK,
    });
    assert.equal(open, null);
  });

  it("does not treat a scheduled subscription as an unpaid checkout", async () => {
    const { client } = createMockClient(
      seedCheckout({
        subscription: subscriptionRow({ status: "scheduled" }),
        payment: paymentRow({ status: "verified" }),
      }),
    );
    const open = await loadOpenCheckout({
      userId: USER_A,
      supabase: client as never,
      env: TEST_BANK,
    });
    assert.equal(open, null);
  });
});

describe("public bank instructions", () => {
  it("returns only public destination fields", () => {
    const bank = readPublicBankDetails(TEST_BANK);
    assert.deepEqual(bank, {
      name: "Test Bank",
      beneficiary: "Waraqa Test",
      iban: "SA0000000000000000000000",
    });
    assert.deepEqual(Object.keys(bank ?? {}), [...PUBLIC_BANK_FIELDS]);
  });

  it("omits bank when env is incomplete", () => {
    assert.equal(readPublicBankDetails({ BILLING_BANK_NAME: "Test Bank" }), null);
  });

  it("never includes settings on the instruction", async () => {
    const instruction = buildManualCheckoutInstruction(PAY_A, TEST_BANK);
    assert.equal(instruction.kind, "manual");
    assert.equal("settings" in instruction, false);
    assert.equal(instruction.bank && "settings" in instruction.bank, false);

    const { client } = createMockClient(seedCheckout());
    const open = await loadOpenCheckout({
      userId: USER_A,
      supabase: client as never,
      env: { ...TEST_BANK, PAYMENT_METHODS_SETTINGS: "must-not-leak" },
    });
    assert.ok(open);
    const serialized = JSON.stringify(open);
    assert.equal(serialized.includes("settings"), false);
    assert.equal(serialized.includes("must-not-leak"), false);
    if (open.instruction.kind === "manual") {
      assert.deepEqual(Object.keys(open.instruction.bank ?? {}), [...PUBLIC_BANK_FIELDS]);
    }
  });
});

describe("teacher billing function contracts", () => {
  it("production path does not accept a client user_id", () => {
    const src = readFileSync(new URL("./billing.functions.ts", import.meta.url), "utf8");

    const historyFn = src.slice(
      src.indexOf("export const getBillingHistory"),
      src.indexOf("export async function loadOpenCheckout"),
    );
    assert.doesNotMatch(historyFn, /inputValidator/);
    assert.doesNotMatch(historyFn, /data\.userId/);
    assert.match(historyFn, /context\.userId/);

    const openFn = src.slice(
      src.indexOf("export const getOpenCheckout"),
      src.indexOf("export const assessCouponCode"),
    );
    assert.doesNotMatch(openFn, /inputValidator/);
    assert.doesNotMatch(openFn, /data\.userId/);
    assert.doesNotMatch(openFn, /data\.paymentId/);
    assert.match(openFn, /context\.userId/);
    assert.doesNotMatch(src, /payment_methods\.settings/);
    assert.doesNotMatch(src, /from\("payment_methods"\)/);
  });

  it("E. coupon preview and checkout never use plans[0]", () => {
    const functionsSrc = readFileSync(new URL("./billing.functions.ts", import.meta.url), "utf8");
    const operationsSrc = readFileSync(new URL("./billing.operations.ts", import.meta.url), "utf8");
    const subscriptionSrc = readFileSync(
      new URL("../../routes/_authenticated/subscription.tsx", import.meta.url),
      "utf8",
    );

    assert.doesNotMatch(functionsSrc, /plans\.data\[0\]/);
    assert.doesNotMatch(operationsSrc, /plans\[0\]/);
    assert.doesNotMatch(subscriptionSrc, /plans\.data\[0\]/);
    assert.match(functionsSrc, /assessCouponForPlanOp/);
    assert.match(operationsSrc, /from\("coupon_plans"\)/);
    assert.match(subscriptionSrc, /selectedPlan\.code/);
  });

  it("assessCouponCode has no client amount or user_id", () => {
    const src = readFileSync(new URL("./billing.functions.ts", import.meta.url), "utf8");
    const fn = src.slice(src.indexOf("export const assessCouponCode"));
    const next = fn.indexOf("export const startCheckout");
    const body = next >= 0 ? fn.slice(0, next) : fn;
    assert.match(body, /planCode: z\.string\(\)\.min\(1\)/);
    assert.doesNotMatch(body, /data\.amount/);
    assert.doesNotMatch(body, /data\.userId/);
    assert.match(body, /planCode: data\.planCode/);
  });
});
