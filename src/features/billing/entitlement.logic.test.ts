import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  featureKeyForGenerationKind,
  isApprovedFeatureKey,
  selectEffectiveSubscription,
  subscriptionIsEffective,
  type SubscriptionAccessRow,
} from "./entitlement.logic.ts";

const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TODAY = "2026-08-11";

function row(overrides: Partial<SubscriptionAccessRow> = {}): SubscriptionAccessRow {
  return {
    id: "sub-1",
    user_id: USER_A,
    plan_id: "plan-1",
    status: "active",
    starts_on: "2026-08-01",
    ends_on: "2027-01-07",
    product: "core",
    created_at: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

describe("entitlement selection (raw status + date window)", () => {
  it("denies missing, pending_payment, pending, scheduled, expired, suspended, cancelled", () => {
    assert.equal(selectEffectiveSubscription([], USER_A, TODAY), null);
    for (const status of [
      "pending_payment",
      "pending",
      "scheduled",
      "expired",
      "suspended",
      "cancelled",
    ]) {
      assert.equal(subscriptionIsEffective(row({ status }), USER_A, TODAY), false, status);
    }
  });

  it("denies scheduled even when today is on/after starts_on", () => {
    assert.equal(
      subscriptionIsEffective(
        row({ status: "scheduled", starts_on: "2026-08-01", ends_on: "2027-01-07" }),
        USER_A,
        TODAY,
      ),
      false,
    );
    assert.equal(
      subscriptionIsEffective(
        row({ status: "scheduled", starts_on: "2026-08-11", ends_on: "2027-01-07" }),
        USER_A,
        TODAY,
      ),
      false,
    );
  });

  it("denies active outside the date window", () => {
    assert.equal(
      subscriptionIsEffective(
        row({ starts_on: "2026-08-12", ends_on: "2027-01-07" }),
        USER_A,
        TODAY,
      ),
      false,
    );
    assert.equal(
      subscriptionIsEffective(
        row({ starts_on: "2026-01-01", ends_on: "2026-08-10" }),
        USER_A,
        TODAY,
      ),
      false,
    );
  });

  it("allows active covering today inclusive of starts_on and ends_on", () => {
    assert.equal(subscriptionIsEffective(row({ starts_on: TODAY }), USER_A, TODAY), true);
    assert.equal(subscriptionIsEffective(row({ ends_on: TODAY }), USER_A, TODAY), true);
    assert.equal(subscriptionIsEffective(row(), USER_A, TODAY), true);
  });

  it("ignores another user's subscription even if active", () => {
    assert.equal(subscriptionIsEffective(row({ user_id: USER_B }), USER_A, TODAY), false);
    assert.equal(selectEffectiveSubscription([row({ user_id: USER_B })], USER_A, TODAY), null);
  });

  it("current active beats future scheduled", () => {
    const selected = selectEffectiveSubscription(
      [
        row({
          id: "scheduled-future",
          status: "scheduled",
          starts_on: "2027-01-17",
          ends_on: "2027-06-24",
          created_at: "2026-08-12T00:00:00Z",
        }),
        row({ id: "active-now", status: "active" }),
      ],
      USER_A,
      TODAY,
    );
    assert.equal(selected?.id, "active-now");
  });

  it("multiple historical expired subscriptions grant nothing", () => {
    assert.equal(
      selectEffectiveSubscription(
        [
          row({ id: "old-1", status: "expired", starts_on: "2024-01-01", ends_on: "2024-06-01" }),
          row({ id: "old-2", status: "expired", starts_on: "2025-01-01", ends_on: "2025-06-01" }),
        ],
        USER_A,
        TODAY,
      ),
      null,
    );
  });

  it("among several actives covering today, prefers core then latest ends_on", () => {
    const selected = selectEffectiveSubscription(
      [
        row({
          id: "other-product",
          product: "plus",
          ends_on: "2028-01-01",
        }),
        row({
          id: "core-shorter",
          product: "core",
          ends_on: "2026-12-31",
        }),
        row({
          id: "core-longer",
          product: "core",
          ends_on: "2027-06-24",
        }),
      ],
      USER_A,
      TODAY,
    );
    assert.equal(selected?.id, "core-longer");
  });

  it("does not treat newest non-active row as effective", () => {
    const selected = selectEffectiveSubscription(
      [
        row({
          id: "newest-scheduled",
          status: "scheduled",
          created_at: "2026-08-11T23:00:00Z",
          starts_on: "2026-09-01",
        }),
        row({
          id: "older-active",
          status: "active",
          created_at: "2026-01-01T00:00:00Z",
        }),
      ],
      USER_A,
      TODAY,
    );
    assert.equal(selected?.id, "older-active");
  });
});

describe("approved feature keys", () => {
  it("accepts only the four launch keys", () => {
    assert.equal(isApprovedFeatureKey("lesson_plan"), true);
    assert.equal(isApprovedFeatureKey("worksheet"), true);
    assert.equal(isApprovedFeatureKey("quiz"), true);
    assert.equal(isApprovedFeatureKey("activity_ideas"), true);
    assert.equal(isApprovedFeatureKey("planner"), false);
    assert.equal(isApprovedFeatureKey("madrasati"), false);
    assert.equal(featureKeyForGenerationKind("quiz"), "quiz");
  });
});
