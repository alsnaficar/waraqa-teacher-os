import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { promoteDueScheduledSubscriptions } from "./promote-scheduled.ts";
import { loadSubscriptionState } from "./billing.functions.ts";
import { grantsAccess } from "./billing.logic.ts";
import { BillingError } from "./types.ts";
import { requireEntitlement } from "./require-entitlement.ts";
import type { FeatureKey } from "./entitlement.logic.ts";
import {
  ENTITLEMENT_TEST_PLAN_ID,
  allowEntitlementTables,
  createEntitlementTableHandler,
  type EntitlementMockTables,
} from "./entitlement.test-support.ts";

const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PLAN_ID = ENTITLEMENT_TEST_PLAN_ID;
const SUB_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SUB_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SUB_FUTURE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const START = "2026-08-23";
const END = "2027-01-07";
const BEFORE_START = "2026-08-22";
const MID = "2026-10-16";
const AFTER_END = "2027-01-08";

type Row = Record<string, unknown>;
type Filter = { column: string; op: "eq" | "neq" | "lte" | "gte"; value: unknown };

function scheduledRow(overrides: Row = {}): Row {
  return {
    id: SUB_A,
    user_id: USER_A,
    plan_id: PLAN_ID,
    status: "scheduled",
    starts_on: START,
    ends_on: END,
    starts_at: START,
    expires_at: END,
    activated_at: null,
    billing_academic_year_id: "year-1",
    billing_semester_id: "sem-1",
    academic_year_id: "year-1",
    semester_id: "sem-1",
    product: "core",
    created_at: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

function matches(row: Row, filters: Filter[]): boolean {
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

function createMockClient(
  db: Record<string, Row[]>,
  options: {
    failUpdate?: boolean;
    /** Runs after select and before applying an UPDATE — simulates a concurrent writer. */
    beforeUpdate?: () => void;
  } = {},
) {
  let seq = 0;
  const client = {
    from(table: string) {
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

      const execute = async (mode: "many" | "maybe") => {
        if (pendingInsert) {
          const inserted: Row[] = [];
          for (const row of pendingInsert) {
            const saved = { id: row.id ?? `id-${table}-${++seq}`, ...row };
            db[table] = [...(db[table] ?? []), saved];
            inserted.push(saved);
          }
          return { data: mode === "many" ? inserted : (inserted[0] ?? null), error: null };
        }

        if (pendingUpdate) {
          if (options.failUpdate) {
            return { data: null, error: { message: "update failed" } };
          }
          options.beforeUpdate?.();
          const rows = (db[table] ?? []).filter((row) => matches(row, filters));
          for (const row of rows) {
            Object.assign(row, pendingUpdate);
          }
          return { data: mode === "many" ? rows : (rows[0] ?? null), error: null };
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
        then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
          return execute("many").then(onFulfilled, onRejected);
        },
      };

      return api;
    },
  };

  return { client, db };
}

function snapshotDates(row: Row) {
  return {
    starts_on: row.starts_on,
    starts_at: row.starts_at,
    ends_on: row.ends_on,
    expires_at: row.expires_at,
    plan_id: row.plan_id,
    billing_academic_year_id: row.billing_academic_year_id,
    billing_semester_id: row.billing_semester_id,
  };
}

describe("promoteDueScheduledSubscriptions", () => {
  it("1. BEFORE START: scheduled remains scheduled", async () => {
    const { client, db } = createMockClient({
      subscriptions: [scheduledRow()],
      billing_audit_log: [],
    });
    const before = snapshotDates(db.subscriptions[0]);

    const result = await promoteDueScheduledSubscriptions(USER_A, {
      client: client as never,
      today: BEFORE_START,
    });

    assert.deepEqual(result.promotedIds, []);
    assert.equal(db.subscriptions[0].status, "scheduled");
    assert.equal(db.subscriptions[0].activated_at, null);
    assert.deepEqual(snapshotDates(db.subscriptions[0]), before);
    assert.equal(db.billing_audit_log.length, 0);
  });

  it("2. EXACT START DATE: scheduled → active, dates unchanged", async () => {
    const { client, db } = createMockClient({
      subscriptions: [scheduledRow()],
      billing_audit_log: [],
    });

    const result = await promoteDueScheduledSubscriptions(USER_A, {
      client: client as never,
      today: START,
    });

    assert.deepEqual(result.promotedIds, [SUB_A]);
    assert.equal(db.subscriptions[0].status, "active");
    assert.equal(db.subscriptions[0].activated_at, `${START}T00:00:00.000Z`);
    assert.equal(db.subscriptions[0].starts_on, START);
    assert.equal(db.subscriptions[0].starts_at, START);
    assert.equal(db.subscriptions[0].ends_on, END);
    assert.equal(db.subscriptions[0].expires_at, END);
    assert.equal(db.subscriptions[0].plan_id, PLAN_ID);
    assert.equal(db.billing_audit_log.length, 1);
    assert.equal(db.billing_audit_log[0].action, "subscription_promoted");
    assert.notEqual(db.billing_audit_log[0].action, "activated");
  });

  it("3. MID PERIOD: scheduled → active, official dates unchanged", async () => {
    const { client, db } = createMockClient({
      subscriptions: [scheduledRow()],
      billing_audit_log: [],
    });
    const before = snapshotDates(db.subscriptions[0]);

    await promoteDueScheduledSubscriptions(USER_A, {
      client: client as never,
      today: MID,
    });

    assert.equal(db.subscriptions[0].status, "active");
    assert.ok(db.subscriptions[0].activated_at);
    assert.deepEqual(snapshotDates(db.subscriptions[0]), before);
  });

  it("4. AFTER END: scheduled remains scheduled, no activation", async () => {
    const { client, db } = createMockClient({
      subscriptions: [scheduledRow()],
      billing_audit_log: [],
    });

    const result = await promoteDueScheduledSubscriptions(USER_A, {
      client: client as never,
      today: AFTER_END,
    });

    assert.deepEqual(result.promotedIds, []);
    assert.equal(db.subscriptions[0].status, "scheduled");
    assert.equal(db.subscriptions[0].activated_at, null);
    assert.equal(db.billing_audit_log.length, 0);
  });

  it("5. CONCURRENT PROMOTION: second attempt is idempotent; activated_at set once", async () => {
    // Limitation: this mock is not a real parallel race. It covers the CAS
    // operation: a 0-row UPDATE is not an error, and a second call does not
    // rewrite activated_at or insert a duplicate audit event.
    const { client, db } = createMockClient({
      subscriptions: [scheduledRow()],
      billing_audit_log: [],
    });

    const first = await promoteDueScheduledSubscriptions(USER_A, {
      client: client as never,
      today: START,
    });
    const activatedAt = db.subscriptions[0].activated_at;

    const second = await promoteDueScheduledSubscriptions(USER_A, {
      client: client as never,
      today: START,
    });

    assert.deepEqual(first.promotedIds, [SUB_A]);
    assert.deepEqual(second.promotedIds, []);
    assert.equal(db.subscriptions[0].status, "active");
    assert.equal(db.subscriptions[0].activated_at, activatedAt);
    assert.equal(db.billing_audit_log.length, 1);

    const raced = createMockClient(
      {
        subscriptions: [scheduledRow({ id: SUB_B })],
        billing_audit_log: [],
      },
      {
        beforeUpdate() {
          raced.db.subscriptions[0].status = "active";
          raced.db.subscriptions[0].activated_at = "2026-08-23T00:00:00.000Z";
        },
      },
    );

    const lost = await promoteDueScheduledSubscriptions(USER_A, {
      client: raced.client as never,
      today: START,
    });

    assert.deepEqual(lost.promotedIds, []);
    assert.equal(raced.db.subscriptions[0].status, "active");
    assert.equal(raced.db.subscriptions[0].activated_at, "2026-08-23T00:00:00.000Z");
    assert.equal(raced.db.billing_audit_log.length, 0);
  });

  it("6. MULTIPLE DUE SUBSCRIPTIONS: each promoted independently", async () => {
    const { client, db } = createMockClient({
      subscriptions: [
        scheduledRow({ id: SUB_A }),
        scheduledRow({ id: SUB_B, created_at: "2026-08-02T00:00:00Z" }),
      ],
      billing_audit_log: [],
    });

    const result = await promoteDueScheduledSubscriptions(USER_A, {
      client: client as never,
      today: START,
    });

    assert.equal(result.promotedIds.length, 2);
    assert.equal(db.subscriptions[0].status, "active");
    assert.equal(db.subscriptions[1].status, "active");
    assert.ok(db.subscriptions[0].activated_at);
    assert.ok(db.subscriptions[1].activated_at);
  });

  it("7. CURRENT ACTIVE + FUTURE SCHEDULED: future stays scheduled", async () => {
    const { client, db } = createMockClient({
      subscriptions: [
        scheduledRow({
          id: SUB_A,
          status: "active",
          activated_at: "2026-08-01T00:00:00.000Z",
        }),
        scheduledRow({
          id: SUB_FUTURE,
          starts_on: "2027-01-17",
          starts_at: "2027-01-17",
          ends_on: "2027-06-24",
          expires_at: "2027-06-24",
        }),
      ],
      billing_audit_log: [],
    });

    const result = await promoteDueScheduledSubscriptions(USER_A, {
      client: client as never,
      today: BEFORE_START,
    });

    assert.deepEqual(result.promotedIds, []);
    assert.equal(db.subscriptions[0].status, "active");
    assert.equal(db.subscriptions[1].status, "scheduled");
    assert.equal(db.subscriptions[1].activated_at, null);
  });

  it("8. CURRENT ACTIVE + DUE SCHEDULED: due is promoted, existing active stays active", async () => {
    const { client, db } = createMockClient({
      subscriptions: [
        scheduledRow({
          id: SUB_A,
          status: "active",
          starts_on: "2026-08-01",
          starts_at: "2026-08-01",
          ends_on: END,
          expires_at: END,
          activated_at: "2026-08-01T00:00:00.000Z",
        }),
        scheduledRow({ id: SUB_FUTURE }),
      ],
      billing_audit_log: [],
    });

    const result = await promoteDueScheduledSubscriptions(USER_A, {
      client: client as never,
      today: START,
    });

    assert.deepEqual(result.promotedIds, [SUB_FUTURE]);
    assert.equal(db.subscriptions[0].status, "active");
    assert.equal(db.subscriptions[0].activated_at, "2026-08-01T00:00:00.000Z");
    assert.equal(db.subscriptions[1].status, "active");
    assert.ok(db.subscriptions[1].activated_at);
  });

  it("9. OWNERSHIP: a user cannot promote another user's subscription", async () => {
    const { client, db } = createMockClient({
      subscriptions: [scheduledRow({ user_id: USER_A })],
      billing_audit_log: [],
    });

    const result = await promoteDueScheduledSubscriptions(USER_B, {
      client: client as never,
      today: START,
    });

    assert.deepEqual(result.promotedIds, []);
    assert.equal(db.subscriptions[0].status, "scheduled");
    assert.equal(db.subscriptions[0].activated_at, null);
    assert.equal(db.billing_audit_log.length, 0);
  });

  it("10. CLIENT DATE SAFETY: production path does not accept a client today", () => {
    const promoteSrc = readFileSync(new URL("./promote-scheduled.ts", import.meta.url), "utf8");
    assert.match(promoteSrc, /deps\.today \?\? todayIso\(\)/);

    const functionsSrc = readFileSync(new URL("./billing.functions.ts", import.meta.url), "utf8");
    const stateFn = functionsSrc.slice(
      functionsSrc.indexOf("export const getSubscriptionState"),
      functionsSrc.indexOf("export const listPlans"),
    );
    assert.doesNotMatch(stateFn, /inputValidator/);
    assert.doesNotMatch(stateFn, /data\.today/);
    assert.match(stateFn, /supabaseAdmin/);

    const entitlementSrc = readFileSync(
      new URL("./require-entitlement.ts", import.meta.url),
      "utf8",
    );
    assert.match(entitlementSrc, /deps\.today \?\? todayIso\(\)/);
    assert.match(entitlementSrc, /today: deps\.today/);
  });
});

describe("getSubscriptionState promotion", () => {
  it("before start: scheduled state", async () => {
    const { client, db } = createMockClient({
      subscriptions: [scheduledRow()],
      plans: [
        {
          id: PLAN_ID,
          code: "core_standard_semester",
          name: "فصل دراسي",
          price: 40,
          starts_with: "semester",
          is_active: true,
        },
      ],
      billing_audit_log: [],
    });

    const state = await loadSubscriptionState({
      userId: USER_A,
      supabase: client as never,
      writeClient: client as never,
      today: BEFORE_START,
    });

    assert.equal(db.subscriptions[0].status, "scheduled");
    assert.equal(state.subscription?.status, "pending");
    assert.equal(state.access, "pending");
    assert.equal(grantsAccess(state.access), false);
  });

  it("on start date: promotion occurs and access is active", async () => {
    const { client, db } = createMockClient({
      subscriptions: [scheduledRow()],
      plans: [
        {
          id: PLAN_ID,
          code: "core_standard_semester",
          name: "فصل دراسي",
          price: 40,
          starts_with: "semester",
          is_active: true,
        },
      ],
      billing_audit_log: [],
    });

    const state = await loadSubscriptionState({
      userId: USER_A,
      supabase: client as never,
      writeClient: client as never,
      today: START,
    });

    assert.equal(db.subscriptions[0].status, "active");
    assert.equal(state.subscription?.status, "active");
    assert.equal(state.access, "active");
    assert.equal(grantsAccess(state.access), true);
    assert.equal(state.expiresAt, END);
  });

  it("after expiry: access denied", async () => {
    const { client, db } = createMockClient({
      subscriptions: [scheduledRow()],
      plans: [
        {
          id: PLAN_ID,
          code: "core_standard_semester",
          name: "فصل دراسي",
          price: 40,
          starts_with: "semester",
          is_active: true,
        },
      ],
      billing_audit_log: [],
    });

    const state = await loadSubscriptionState({
      userId: USER_A,
      supabase: client as never,
      writeClient: client as never,
      today: AFTER_END,
    });

    assert.equal(db.subscriptions[0].status, "scheduled");
    assert.equal(grantsAccess(state.access), false);
  });
});

function entitlementClient(tables: EntitlementMockTables) {
  const billingFrom = createEntitlementTableHandler(tables);
  return {
    from(table: string) {
      const chain = billingFrom(table);
      if (!chain) throw new Error(`unexpected table ${table}`);
      return chain;
    },
  };
}

describe("requireEntitlement + promotion", () => {
  const FEATURE: FeatureKey = "lesson_plan";

  function denied(err: unknown): boolean {
    return err instanceof BillingError && err.code === "FEATURE_ENTITLEMENT_REQUIRED";
  }

  it("A. before start: scheduled → DENY", async () => {
    const tables = allowEntitlementTables(USER_A, {
      status: "scheduled",
      startsOn: START,
      endsOn: END,
    });
    const client = entitlementClient(tables);
    await assert.rejects(
      () =>
        requireEntitlement(FEATURE, {
          userId: USER_A,
          supabase: client as never,
          writeClient: client as never,
          today: BEFORE_START,
        }),
      denied,
    );
    assert.equal(tables.subscriptions[0].status, "scheduled");
  });

  it("B. exact start: scheduled → promoted → ALLOW", async () => {
    const tables = allowEntitlementTables(USER_A, {
      status: "scheduled",
      startsOn: START,
      endsOn: END,
    });
    const client = entitlementClient(tables);
    const granted = await requireEntitlement(FEATURE, {
      userId: USER_A,
      supabase: client as never,
      writeClient: client as never,
      today: START,
    });
    assert.equal(tables.subscriptions[0].status, "active");
    assert.equal(granted.subscriptionId, tables.subscriptions[0].id);
    assert.equal(granted.featureKey, FEATURE);
  });

  it("C. active but expired by date → DENY; status may remain active", async () => {
    const tables = allowEntitlementTables(USER_A, {
      status: "active",
      startsOn: START,
      endsOn: END,
    });
    const client = entitlementClient(tables);
    await assert.rejects(
      () =>
        requireEntitlement(FEATURE, {
          userId: USER_A,
          supabase: client as never,
          writeClient: client as never,
          today: AFTER_END,
        }),
      denied,
    );
    assert.equal(tables.subscriptions[0].status, "active");
  });

  it("D. promotion failure → DENY (fail closed)", async () => {
    const tables = allowEntitlementTables(USER_A, {
      status: "scheduled",
      startsOn: START,
      endsOn: END,
    });
    const failing = createMockClient(
      { subscriptions: [scheduledRow()], billing_audit_log: [] },
      {
        failUpdate: true,
      },
    );
    const readClient = entitlementClient(tables);

    await assert.rejects(
      () =>
        requireEntitlement(FEATURE, {
          userId: USER_A,
          supabase: readClient as never,
          writeClient: failing.client as never,
          today: START,
        }),
      denied,
    );
    assert.equal(tables.subscriptions[0].status, "scheduled");
  });
});
