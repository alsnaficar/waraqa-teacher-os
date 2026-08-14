import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { BillingError } from "./types.ts";
import { requireEntitlement } from "./require-entitlement.ts";
import type { FeatureKey } from "./entitlement.logic.ts";
import {
  ENTITLEMENT_TEST_PLAN_ID,
  ENTITLEMENT_TEST_SUB_ID,
  ENTITLEMENT_TEST_TODAY,
  allowEntitlementTables,
  createEntitlementTableHandler,
  emptyEntitlementTables,
  type EntitlementMockTables,
} from "./entitlement.test-support.ts";

const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const FEATURE: FeatureKey = "lesson_plan";

function clientFor(tables: EntitlementMockTables) {
  const billingFrom = createEntitlementTableHandler(tables);
  return {
    from(table: string) {
      const chain = billingFrom(table);
      if (!chain) throw new Error(`unexpected table ${table}`);
      return chain;
    },
  };
}

function denied(err: unknown): boolean {
  return err instanceof BillingError && err.code === "FEATURE_ENTITLEMENT_REQUIRED";
}

async function check(tables: EntitlementMockTables, today = ENTITLEMENT_TEST_TODAY) {
  const client = clientFor(tables);
  return requireEntitlement(FEATURE, {
    userId: USER_A,
    supabase: client as never,
    writeClient: client as never,
    today,
  });
}

describe("requireEntitlement", () => {
  it("1. no subscription → DENY", async () => {
    await assert.rejects(() => check(emptyEntitlementTables()), denied);
  });

  it("2. pending_payment → DENY", async () => {
    await assert.rejects(
      () => check(allowEntitlementTables(USER_A, { status: "pending_payment" })),
      denied,
    );
  });

  it("3. pending → DENY", async () => {
    await assert.rejects(
      () => check(allowEntitlementTables(USER_A, { status: "pending" })),
      denied,
    );
  });

  it("4. scheduled before starts_on → DENY", async () => {
    await assert.rejects(
      () =>
        check(
          allowEntitlementTables(USER_A, {
            status: "scheduled",
            startsOn: "2026-08-23",
            endsOn: "2027-01-07",
          }),
        ),
      denied,
    );
  });

  it("5. scheduled on/after starts_on is promoted then ALLOW", async () => {
    const tables = allowEntitlementTables(USER_A, {
      status: "scheduled",
      startsOn: "2026-08-01",
      endsOn: "2027-01-07",
    });
    const granted = await check(tables);
    assert.equal(tables.subscriptions[0].status, "active");
    assert.equal(granted.subscriptionId, ENTITLEMENT_TEST_SUB_ID);
  });

  it("6. active before starts_on → DENY", async () => {
    await assert.rejects(
      () => check(allowEntitlementTables(USER_A, { startsOn: "2026-08-12" })),
      denied,
    );
  });

  it("7. active after ends_on → DENY", async () => {
    await assert.rejects(
      () => check(allowEntitlementTables(USER_A, { endsOn: "2026-08-10" })),
      denied,
    );
  });

  it("8. suspended → DENY", async () => {
    await assert.rejects(
      () => check(allowEntitlementTables(USER_A, { status: "suspended" })),
      denied,
    );
  });

  it("9. cancelled → DENY", async () => {
    await assert.rejects(
      () => check(allowEntitlementTables(USER_A, { status: "cancelled" })),
      denied,
    );
  });

  it("10. active + valid dates + no entitlement row → DENY", async () => {
    const tables = allowEntitlementTables(USER_A);
    tables.plan_entitlements = [];
    await assert.rejects(() => check(tables), denied);
  });

  it("11. active + valid dates + inactive plan → DENY", async () => {
    await assert.rejects(
      () => check(allowEntitlementTables(USER_A, { planActive: false })),
      denied,
    );
  });

  it("12. active + valid dates + entitlement → ALLOW", async () => {
    const granted = await check(allowEntitlementTables(USER_A));
    assert.deepEqual(granted, {
      userId: USER_A,
      subscriptionId: ENTITLEMENT_TEST_SUB_ID,
      planId: ENTITLEMENT_TEST_PLAN_ID,
      featureKey: FEATURE,
    });
  });

  it("13. another user's subscription → DENY", async () => {
    await assert.rejects(() => check(allowEntitlementTables(USER_B)), denied);
  });

  it("14. current active beats future scheduled", async () => {
    const tables = allowEntitlementTables(USER_A, { subscriptionId: "active-now" });
    tables.subscriptions.push({
      id: "future-scheduled",
      user_id: USER_A,
      plan_id: ENTITLEMENT_TEST_PLAN_ID,
      status: "scheduled",
      starts_on: "2027-01-17",
      ends_on: "2027-06-24",
      product: "core",
      created_at: "2026-08-12T00:00:00Z",
    });
    const granted = await check(tables);
    assert.equal(granted.subscriptionId, "active-now");
  });

  it("15. multiple historical expired subscriptions → DENY", async () => {
    const tables = emptyEntitlementTables();
    tables.plans = [{ id: ENTITLEMENT_TEST_PLAN_ID, is_active: true }];
    tables.plan_entitlements = [{ plan_id: ENTITLEMENT_TEST_PLAN_ID, feature_key: FEATURE }];
    tables.subscriptions = [
      {
        id: "old-1",
        user_id: USER_A,
        plan_id: ENTITLEMENT_TEST_PLAN_ID,
        status: "expired",
        starts_on: "2024-01-01",
        ends_on: "2024-06-01",
        product: "core",
        created_at: "2024-01-01T00:00:00Z",
      },
      {
        id: "old-2",
        user_id: USER_A,
        plan_id: ENTITLEMENT_TEST_PLAN_ID,
        status: "expired",
        starts_on: "2025-01-01",
        ends_on: "2025-06-01",
        product: "core",
        created_at: "2025-01-01T00:00:00Z",
      },
    ];
    await assert.rejects(() => check(tables), denied);
  });

  it("16. unknown feature key from outside the server allowlist → DENY", async () => {
    await assert.rejects(
      () =>
        requireEntitlement("planner" as FeatureKey, {
          userId: USER_A,
          supabase: clientFor(allowEntitlementTables(USER_A)) as never,
          writeClient: clientFor(allowEntitlementTables(USER_A)) as never,
          today: ENTITLEMENT_TEST_TODAY,
        }),
      denied,
    );
  });

  it("17/18. client subscription_id and plan_id cannot override selection", async () => {
    const tables = allowEntitlementTables(USER_A);
    const client = clientFor(tables);
    const granted = await requireEntitlement(FEATURE, {
      userId: USER_A,
      supabase: client as never,
      writeClient: client as never,
      today: ENTITLEMENT_TEST_TODAY,
      subscriptionId: "client-sub",
      planId: "client-plan",
      entitled: true,
    } as never);
    assert.equal(granted.subscriptionId, ENTITLEMENT_TEST_SUB_ID);
    assert.equal(granted.planId, ENTITLEMENT_TEST_PLAN_ID);
    assert.notEqual(granted.subscriptionId, "client-sub");
    assert.notEqual(granted.planId, "client-plan");
  });

  it("empty userId is denied without granting", async () => {
    await assert.rejects(
      () =>
        requireEntitlement(FEATURE, {
          userId: "",
          supabase: clientFor(allowEntitlementTables(USER_A)) as never,
          writeClient: clientFor(allowEntitlementTables(USER_A)) as never,
          today: ENTITLEMENT_TEST_TODAY,
        }),
      denied,
    );
  });

  it("error message is Arabic and does not leak SQL", async () => {
    await assert.rejects(
      () => check(emptyEntitlementTables()),
      (err: unknown) => {
        if (!(err instanceof BillingError)) return false;
        assert.equal(err.code, "FEATURE_ENTITLEMENT_REQUIRED");
        assert.match(err.message, /اشتراك/);
        assert.doesNotMatch(err.message, /select/i);
        assert.doesNotMatch(err.message, /plan_entitlements/);
        assert.doesNotMatch(err.message, /service_role/);
        return true;
      },
    );
  });
});
