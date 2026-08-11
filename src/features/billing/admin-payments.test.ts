import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  activateSubscriptionOp,
  activationInputFromSubmittedPayment,
  listAdminSubmittedPaymentsOp,
  type AdminSubmittedPayment,
} from "./billing.operations.ts";
import { registerPaymentProvider } from "./providers/payment-provider.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const OPERATIONS_FILE = join(ROOT, "src/features/billing/billing.operations.ts");
const FUNCTIONS_FILE = join(ROOT, "src/features/billing/billing.functions.ts");
const PAYMENTS_ROUTE = join(ROOT, "src/routes/_authenticated/admin/payments.tsx");
const ADMIN_LAYOUT = join(ROOT, "src/routes/_authenticated/admin/route.tsx");
const ADMIN_SHELL = join(ROOT, "src/components/admin/admin-shell.tsx");

const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ADMIN = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const PLAN_SEM = "11111111-1111-4111-8111-111111111111";
const YEAR_ID = "33333333-3333-4333-8333-333333333333";
const SEM_ID = "44444444-4444-4444-8444-444444444444";
const METHOD_ID = "55555555-5555-4555-8555-555555555555";
const SUB_A = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const PAY_SUBMITTED = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const PAY_CREATED = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const PAY_VERIFIED = "99999999-9999-4999-8999-999999999999";

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
type CallLog = string[];
type Filter = { column: string; op: string; value: unknown };

function matches(row: Row, filters: Filter[]): boolean {
  return filters.every((filter) => {
    const actual = row[filter.column];
    if (filter.op === "eq") return actual === filter.value;
    if (filter.op === "neq") return actual !== filter.value;
    if (filter.op === "in") {
      return Array.isArray(filter.value) && filter.value.includes(actual);
    }
    if (actual == null) return false;
    const left = String(actual);
    const right = String(filter.value);
    if (filter.op === "lte") return left <= right;
    if (filter.op === "gte") return left >= right;
    return true;
  });
}

function seedQueue(overrides: Partial<Record<string, Row[]>> = {}): Record<string, Row[]> {
  return {
    user_roles: [{ user_id: ADMIN, role: "admin" }],
    profiles: [{ id: USER_A, full_name: "سارة المعلم", created_at: "2026-08-01T00:00:00Z" }],
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
    payment_methods: [
      { id: METHOD_ID, provider: "manual", is_active: true, settings: { iban: "SECRET-IBAN" } },
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
        created_from_payment_id: PAY_SUBMITTED,
      },
    ],
    payments: [
      {
        id: PAY_SUBMITTED,
        user_id: USER_A,
        subscription_id: SUB_A,
        amount: 40,
        amount_sar: 40,
        discount_sar: 0,
        net_sar: 40,
        currency: "SAR",
        status: "submitted",
        transfer_reference: "WRQ-123456",
        transaction_number: "WRQ-123456",
        created_at: "2026-08-11T10:00:00Z",
        paid_at: null,
        verified_at: null,
        payment_method_id: METHOD_ID,
      },
      {
        id: PAY_CREATED,
        user_id: USER_A,
        subscription_id: "created-sub",
        amount_sar: 40,
        discount_sar: 0,
        net_sar: 40,
        currency: "SAR",
        status: "created",
        transfer_reference: null,
        transaction_number: null,
        created_at: "2026-08-11T09:00:00Z",
      },
      {
        id: PAY_VERIFIED,
        user_id: USER_A,
        subscription_id: "verified-sub",
        amount_sar: 70,
        discount_sar: 0,
        net_sar: 70,
        currency: "SAR",
        status: "verified",
        transfer_reference: "OLD-REF",
        transaction_number: "OLD-REF",
        created_at: "2026-08-01T00:00:00Z",
        verified_at: "2026-08-02T00:00:00Z",
      },
    ],
    coupons: [],
    subscription_logs: [],
    billing_audit_log: [],
    academic_years: [],
    semesters: [],
    ...overrides,
  };
}

function createMockClient(
  db: Record<string, Row[]>,
  options: {
    callLog?: CallLog;
    authUsers?: Array<{ id: string; email?: string; created_at?: string }>;
    listUsersError?: string;
  } = {},
) {
  const callLog = options.callLog ?? [];
  let seq = 0;
  const client = {
    from(table: string) {
      callLog.push(`from:${table}`);
      const filters: Filter[] = [];
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
            const saved = {
              id: row.id ?? `id-${table}-${++seq}`,
              created_at: "2026-08-11T00:00:00Z",
              ...row,
            };
            db[table] = [...(db[table] ?? []), saved];
            inserted.push(saved);
          }
          return {
            data: mode === "many" ? inserted : (inserted[0] ?? null),
            error: null,
          };
        }
        if (pendingUpdate) {
          const rows = (db[table] ?? []).filter((row) => matches(row, filters));
          for (const row of rows) Object.assign(row, pendingUpdate);
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
          callLog.push(`${table}:select`);
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
        in(column: string, value: unknown[]) {
          filters.push({ column, op: "in", value });
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
        order(column: string, opts?: { ascending?: boolean }) {
          orderCol = column;
          orderAsc = opts?.ascending !== false;
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
    auth: {
      admin: {
        async listUsers() {
          callLog.push("auth.admin.listUsers");
          if (options.listUsersError) {
            return { data: null, error: { message: options.listUsersError } };
          }
          return {
            data: {
              users: options.authUsers ?? [
                { id: USER_A, email: "sara@example.com", created_at: "2026-08-01T00:00:00Z" },
              ],
            },
            error: null,
          };
        },
      },
    },
  };
  return { client, db, callLog };
}

function assertSafeProjection(item: AdminSubmittedPayment) {
  const raw = JSON.stringify(item);
  assert.equal(raw.includes("settings"), false);
  assert.equal(raw.includes("SECRET-IBAN"), false);
  assert.equal(raw.includes("service_role"), false);
  assert.equal(raw.includes("SUPABASE_SERVICE"), false);
  assert.equal(raw.includes("payment_methods"), false);
  assert.equal("whatsapp" in item.subscriber, false);
  assert.equal("school" in item.subscriber, false);
  assert.equal("avatar_url" in item.subscriber, false);
  assert.equal("receipt_path" in item, false);
  assert.equal(typeof item.hasReceipt, "boolean");
}

describe("listAdminSubmittedPaymentsOp authorization", () => {
  it("A. non-admin cannot list submitted payments", async () => {
    const callLog: CallLog = [];
    const { client } = createMockClient(seedQueue({ user_roles: [] }), { callLog });
    await assert.rejects(
      () => listAdminSubmittedPaymentsOp(client as never, USER_A),
      (err: unknown) => err instanceof Error && err.message.includes("Administrators"),
    );
    assert.equal(callLog.includes("auth.admin.listUsers"), false);
    assert.equal(callLog.includes("payments:select"), false);
    assert.equal(callLog.includes("profiles:select"), false);
  });

  it("C. admin can list submitted payments after assertAdmin", async () => {
    const callLog: CallLog = [];
    const { client } = createMockClient(seedQueue(), { callLog });
    const rows = await listAdminSubmittedPaymentsOp(client as never, ADMIN);
    assert.equal(rows.length, 1);
    assert.ok(callLog.indexOf("from:user_roles") < callLog.indexOf("payments:select"));
    assert.ok(callLog.indexOf("payments:select") < callLog.indexOf("auth.admin.listUsers"));
  });
});

describe("listAdminSubmittedPaymentsOp filtering", () => {
  it("D/E/F. returns only submitted payments; created and verified are excluded", async () => {
    const { client } = createMockClient(seedQueue());
    const rows = await listAdminSubmittedPaymentsOp(client as never, ADMIN);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].paymentId, PAY_SUBMITTED);
    assert.equal(
      rows.some((row) => row.paymentId === PAY_CREATED || row.paymentId === PAY_VERIFIED),
      false,
    );
  });

  it("empty queue returns [] and skips Auth Admin", async () => {
    const callLog: CallLog = [];
    const { client } = createMockClient(seedQueue({ payments: [] }), { callLog });
    const rows = await listAdminSubmittedPaymentsOp(client as never, ADMIN);
    assert.deepEqual(rows, []);
    assert.equal(callLog.includes("auth.admin.listUsers"), false);
  });
});

describe("listAdminSubmittedPaymentsOp projection and identity", () => {
  it("G/H. response is a review DTO without secrets or payment_methods.settings", async () => {
    const { client, callLog } = createMockClient(seedQueue());
    const rows = await listAdminSubmittedPaymentsOp(client as never, ADMIN);
    assert.equal(rows.length, 1);
    const item = rows[0];
    assert.equal(item.paymentId, PAY_SUBMITTED);
    assert.equal(item.subscriptionId, SUB_A);
    assert.equal(item.amountSar, 40);
    assert.equal(item.netSar, 40);
    assert.equal(item.transferReference, "WRQ-123456");
    assert.equal(item.plan.code, "core_standard_semester");
    assert.equal(item.plan.termKind, "semester");
    assert.equal(item.subscription.status, "pending_payment");
    assertSafeProjection(item);
    assert.equal(callLog.includes("from:payment_methods"), false);
  });

  it("loads full_name and Auth email after assertAdmin, with Arabic fallbacks", async () => {
    const { client } = createMockClient(seedQueue({ profiles: [] }), { authUsers: [] });
    const rows = await listAdminSubmittedPaymentsOp(client as never, ADMIN);
    assert.equal(rows[0].subscriber.fullName, "بدون اسم");
    assert.equal(rows[0].subscriber.email, "بدون بريد");
  });

  it("uses profile name and Auth email when present", async () => {
    const { client } = createMockClient(seedQueue());
    const rows = await listAdminSubmittedPaymentsOp(client as never, ADMIN);
    assert.equal(rows[0].subscriber.fullName, "سارة المعلم");
    assert.equal(rows[0].subscriber.email, "sara@example.com");
  });
});

describe("activation payload from queue", () => {
  it("J. activation uses subscriptionId from the trusted server row only", async () => {
    const { client } = createMockClient(seedQueue());
    const [item] = await listAdminSubmittedPaymentsOp(client as never, ADMIN);
    const payload = activationInputFromSubmittedPayment(item);
    assert.deepEqual(Object.keys(payload), ["subscriptionId"]);
    assert.equal(payload.subscriptionId, item.subscription.id);
    assert.equal("amount" in payload, false);
    assert.equal("userId" in payload, false);
    assert.equal("planId" in payload, false);
    assert.equal("paymentId" in payload, false);
    assert.equal("status" in payload, false);
  });
});

describe("queue after verification", () => {
  it("L. successful activation removes the payment from the submitted queue", async () => {
    const { client, db } = createMockClient(seedQueue());
    const before = await listAdminSubmittedPaymentsOp(client as never, ADMIN);
    assert.equal(before.length, 1);

    await activateSubscriptionOp(client as never, {
      actorId: ADMIN,
      subscriptionId: before[0].subscription.id,
      today: "2026-10-16",
    });

    assert.equal(db.payments.find((row) => row.id === PAY_SUBMITTED)?.status, "verified");
    const after = await listAdminSubmittedPaymentsOp(client as never, ADMIN);
    assert.equal(after.length, 0);
  });

  it("K. existing activateSubscriptionOp remains admin-only", async () => {
    const { client } = createMockClient(seedQueue());
    await assert.rejects(
      () =>
        activateSubscriptionOp(client as never, {
          actorId: USER_A,
          subscriptionId: SUB_A,
          today: "2026-10-16",
        }),
      (err: unknown) => err instanceof Error && err.message.includes("Administrators"),
    );
  });
});

describe("server function and route contracts", () => {
  it("I. listAdminSubmittedPayments accepts no client user_id/status/amount", () => {
    const src = readFileSync(FUNCTIONS_FILE, "utf8");
    const start = src.indexOf("export const listAdminSubmittedPayments");
    assert.ok(start >= 0);
    const rest = src.slice(start);
    const next = rest.indexOf("export const attachPaymentReceipt");
    const fn = next >= 0 ? rest.slice(0, next) : rest;
    assert.equal(fn.includes(".inputValidator"), false);
    assert.match(fn, /listAdminSubmittedPaymentsOp\(supabaseAdmin,\s*context\.userId\)/);
    assert.equal(fn.includes("data.userId"), false);
    assert.equal(fn.includes("data.status"), false);
    assert.equal(fn.includes("data.amount"), false);
    assert.equal(fn.includes("data.paymentId"), false);
  });

  it("B. /admin/payments is nested under the admin layout gate", () => {
    const route = readFileSync(PAYMENTS_ROUTE, "utf8");
    const layout = readFileSync(ADMIN_LAYOUT, "utf8");
    assert.match(route, /createFileRoute\("\/_authenticated\/admin\/payments"\)/);
    assert.match(layout, /requireAdminAccess/);
    assert.match(route, /activationInputFromSubmittedPayment/);
    assert.match(route, /activateSubscription\(\{\s*data: activationInputFromSubmittedPayment/);
  });

  it("activation requires a submitted payment and remains admin-only", () => {
    const ops = readFileSync(OPERATIONS_FILE, "utf8");
    const fns = readFileSync(FUNCTIONS_FILE, "utf8");
    assert.match(ops, /export async function activateSubscriptionOp/);
    assert.match(fns, /export const activateSubscription = createServerFn/);
    const activateOp = ops.slice(ops.indexOf("export async function activateSubscriptionOp"));
    const listStart = activateOp.indexOf("export async function listAdminSubmittedPaymentsOp");
    const activateBody = listStart >= 0 ? activateOp.slice(0, listStart) : activateOp;
    assert.match(activateBody, /await assertAdmin\(client, input\.actorId\)/);
    assert.match(activateBody, /\.eq\("status", "submitted"\)/);
    assert.match(activateBody, /payment\.status !== "submitted"/);
  });

  it("admin shell and dashboard expose /admin/payments", () => {
    const shell = readFileSync(ADMIN_SHELL, "utf8");
    assert.match(shell, /to: "\/admin\/payments"/);
    const dashboard = readFileSync(join(ROOT, "src/routes/_authenticated/admin/index.tsx"), "utf8");
    assert.match(dashboard, /to="\/admin\/payments"/);
  });

  it("op signature does not accept client filters", () => {
    const src = readFileSync(OPERATIONS_FILE, "utf8");
    assert.match(
      src,
      /export async function listAdminSubmittedPaymentsOp\(\s*client: AdminClient,\s*actorId: string,\s*\)/,
    );
    const start = src.indexOf("export async function listAdminSubmittedPaymentsOp");
    const body = src.slice(start, start + 1800);
    assert.match(body, /\.eq\("status", "submitted"\)/);
    assert.equal(body.includes("input.status"), false);
    assert.equal(body.includes("input.userId"), false);
  });
});
