import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  activationStatusForPeriod,
  authoritativePlanPrice,
  checkoutIdempotencyKey,
  classifyBillingPeriod,
  computeAccess,
  duplicateSubscriptionDecision,
  matchSubscriptionForPeriod,
  normaliseStatus,
  paymentStatusLabel,
  resolveBillingPeriod,
  subscriptionBoundsForPeriod,
  validatePlan,
  type ExistingSubscriptionRef,
  type OfficialBillingSemester,
  type OfficialBillingYear,
  type PlanCatalogueRow,
} from "./billing.logic.ts";
import { BillingError } from "./types.ts";
import {
  activateSubscriptionInputSchema,
  checkoutInputSchema,
  submitPaymentInputSchema,
} from "./billing.operations.ts";

const YEAR: OfficialBillingYear = {
  id: "year-1",
  starts_on: "2026-08-16",
  ends_on: "2027-06-30",
  is_current: true,
};

const SEMESTER: OfficialBillingSemester = {
  id: "sem-1",
  academic_year_id: "year-1",
  starts_on: "2026-08-16",
  ends_on: "2026-12-31",
  is_current: true,
  sequence: 1,
};

function activePlan(overrides: Partial<PlanCatalogueRow> = {}): PlanCatalogueRow {
  return {
    id: "plan-sem",
    code: "core_standard_semester",
    name: "فصل دراسي",
    price: 40,
    price_sar: 40,
    currency: "SAR",
    product: "core",
    term_kind: "semester",
    is_active: true,
    starts_with: "semester",
    ...overrides,
  };
}

describe("Phase 2 billing logic", () => {
  it("rejects nonexistent and inactive plans", () => {
    assert.throws(
      () => validatePlan(null),
      (err: unknown) => {
        return err instanceof BillingError && err.code === "INVALID_PLAN";
      },
    );
    assert.throws(
      () => validatePlan(activePlan({ is_active: false })),
      (err: unknown) => {
        return err instanceof BillingError && err.code === "INVALID_PLAN";
      },
    );
  });

  it("rejects client-shaped extras: checkout schema forbids amount and dates", () => {
    assert.throws(() =>
      checkoutInputSchema.parse({
        planCode: "core_standard_semester",
        amount: 1,
        price: 1,
        startsOn: "1999-01-01",
        endsOn: "1999-01-02",
      }),
    );
    const parsed = checkoutInputSchema.parse({ planCode: "core_standard_semester" });
    assert.equal("amount" in parsed, false);
    assert.equal("startsOn" in parsed, false);
    assert.throws(() =>
      checkoutInputSchema.parse({
        planCode: "core_standard_semester",
        userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      }),
    );
    assert.throws(() =>
      submitPaymentInputSchema.parse({
        paymentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        reference: "BANK-REF-001",
        userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      }),
    );
  });

  it("uses DB price_sar when price matches; rejects mismatched prices", () => {
    const plan = validatePlan(activePlan());
    assert.equal(authoritativePlanPrice(plan), 40);

    assert.throws(
      () => validatePlan(activePlan({ price: 40, price_sar: 1 })),
      (err: unknown) => {
        return err instanceof BillingError && err.code === "INVALID_AMOUNT";
      },
    );
  });

  it("empty official calendar is a controlled error", () => {
    assert.throws(
      () => resolveBillingPeriod("semester", [], [], "2026-09-01"),
      (err: unknown) => err instanceof BillingError && err.code === "CALENDAR_UNAVAILABLE",
    );
    assert.throws(
      () => resolveBillingPeriod("academic_year", [], [], "2026-09-01"),
      (err: unknown) => err instanceof BillingError && err.code === "CALENDAR_UNAVAILABLE",
    );
  });

  it("ended-only calendar is INVALID_PERIOD, not a fabricated date", () => {
    assert.throws(
      () =>
        resolveBillingPeriod(
          "academic_year",
          [{ id: "old", starts_on: "2024-01-01", ends_on: "2024-12-31", is_current: true }],
          [],
          "2026-09-01",
        ),
      (err: unknown) => err instanceof BillingError && err.code === "INVALID_PERIOD",
    );
  });

  it("semester dates come from official billing_semesters", () => {
    const period = resolveBillingPeriod("semester", [YEAR], [SEMESTER], "2026-09-01");
    assert.equal(period.billingSemesterId, "sem-1");
    assert.equal(period.billingAcademicYearId, "year-1");
    assert.equal(period.startsOn, "2026-08-16");
    assert.equal(period.endsOn, "2026-12-31");
    assert.equal(period.window, "current");
  });

  it("academic-year dates come from official billing_academic_years", () => {
    const period = resolveBillingPeriod("academic_year", [YEAR], [SEMESTER], "2026-09-01");
    assert.equal(period.billingSemesterId, null);
    assert.equal(period.startsOn, "2026-08-16");
    assert.equal(period.endsOn, "2027-06-30");
    assert.equal(period.window, "current");
  });

  it("future official period classifies as future and activates as scheduled", () => {
    const period = resolveBillingPeriod("semester", [YEAR], [SEMESTER], "2026-08-01");
    assert.equal(period.window, "future");
    assert.equal(activationStatusForPeriod(period.window), "scheduled");
  });

  it("current official period activates as active", () => {
    assert.equal(classifyBillingPeriod("2026-08-16", "2026-12-31", "2026-09-01"), "current");
    assert.equal(activationStatusForPeriod("current"), "active");
  });

  it("does not activate an ended period", () => {
    assert.throws(
      () => activationStatusForPeriod("ended"),
      (err: unknown) => err instanceof BillingError && err.code === "PERIOD_ENDED",
    );
  });

  it("blocks a second active/scheduled subscription for the same official period", () => {
    const period = resolveBillingPeriod("semester", [YEAR], [SEMESTER], "2026-09-01");
    const rows: ExistingSubscriptionRef[] = [
      {
        id: "sub-1",
        user_id: "user-a",
        plan_id: "plan-sem",
        status: "active",
        billing_academic_year_id: "year-1",
        billing_semester_id: "sem-1",
      },
    ];
    const match = matchSubscriptionForPeriod(rows, "user-a", "plan-sem", period);
    assert.equal(duplicateSubscriptionDecision(match), "block");
  });

  it("reuses pending_payment checkout for the same period", () => {
    const period = resolveBillingPeriod("semester", [YEAR], [SEMESTER], "2026-09-01");
    const match = matchSubscriptionForPeriod(
      [
        {
          id: "sub-pending",
          user_id: "user-a",
          plan_id: "plan-sem",
          status: "pending_payment",
          billing_academic_year_id: "year-1",
          billing_semester_id: "sem-1",
        },
      ],
      "user-a",
      "plan-sem",
      period,
    );
    assert.equal(duplicateSubscriptionDecision(match), "reuse_checkout");
  });

  it("idempotency key is server-derived from user, plan, and official period", () => {
    assert.equal(
      checkoutIdempotencyKey("user-a", "plan-sem", "year-1", "sem-1"),
      "checkout:user-a:plan-sem:year-1:sem-1",
    );
    assert.equal(
      checkoutIdempotencyKey("user-a", "plan-year", "year-1", null),
      "checkout:user-a:plan-year:year-1:year",
    );
  });

  it("normaliseStatus maps new lifecycle values without a UI redesign", () => {
    assert.equal(normaliseStatus("pending_payment"), "pending");
    assert.equal(normaliseStatus("scheduled"), "pending");
    assert.equal(normaliseStatus("active"), "active");
  });

  it("paymentStatusLabel maps payment rows without changing stored status", () => {
    assert.equal(paymentStatusLabel("created"), "بانتظار التحويل");
    assert.equal(paymentStatusLabel("submitted"), "تم إرسال رقم العملية");
    assert.equal(paymentStatusLabel("verified"), "تم التحقق");
  });

  it("computeAccess still treats pending as unpaid checkout", () => {
    assert.equal(computeAccess("pending", "2026-12-31", "2026-09-01"), "pending");
    assert.equal(computeAccess("active", "2026-12-31", "2026-09-01"), "active");
  });

  it("current-period access starts on activation date, not official start", () => {
    const period = resolveBillingPeriod("semester", [YEAR], [SEMESTER], "2026-09-01");
    const bounds = subscriptionBoundsForPeriod(period, "2026-10-15");
    assert.equal(bounds.startsOn, "2026-10-15");
    assert.equal(bounds.endsOn, period.endsOn);
    assert.notEqual(bounds.startsOn, period.startsOn);
  });

  it("future-period access keeps official start and end", () => {
    const period = resolveBillingPeriod("semester", [YEAR], [SEMESTER], "2026-08-01");
    const bounds = subscriptionBoundsForPeriod(period, "2026-08-01");
    assert.equal(bounds.startsOn, period.startsOn);
    assert.equal(bounds.endsOn, period.endsOn);
  });

  it("ended period bounds throw PERIOD_ENDED", () => {
    assert.throws(
      () =>
        subscriptionBoundsForPeriod(
          { startsOn: "2024-01-01", endsOn: "2024-12-31", window: "ended" },
          "2026-10-15",
        ),
      (err: unknown) => err instanceof BillingError && err.code === "PERIOD_ENDED",
    );
  });

  it("activation schema rejects client-supplied dates", () => {
    assert.throws(() =>
      activateSubscriptionInputSchema.parse({
        subscriptionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        startsOn: "1999-01-01",
        activationDate: "1999-01-01",
        today: "1999-01-01",
      }),
    );
  });
});
