/**
 * Domain model for subscriptions and payments.
 *
 * The database stores raw rows; these types are the shape the UI consumes.
 * `SubscriptionAccess` is derived rather than stored, because "expiring soon"
 * is a function of today's date and cannot live in a column.
 */

export type SubscriptionStatus = "pending" | "active" | "expired" | "cancelled";

/** How the app should treat the teacher right now. */
export type SubscriptionAccess =
  | "active"
  | "expiring" // active, but close enough to expiry to warn about
  | "expired"
  | "pending" // checkout started, payment not confirmed
  | "none"; // never subscribed

export interface Plan {
  id: string;
  code: string;
  name: string;
  price: number;
  startsWith: string;
  isActive: boolean;
}

export interface Subscription {
  id: string;
  planId: string;
  status: SubscriptionStatus;
  startsAt: string;
  expiresAt: string;
  academicYearId: string | null;
  semesterId: string | null;
  createdAt: string | null;
}

export interface PaymentRecord {
  id: string;
  amount: number;
  status: string;
  transactionNumber: string | null;
  paidAt: string | null;
  createdAt: string | null;
}

/** Everything the dashboard and subscription page need in one round trip. */
export interface SubscriptionState {
  access: SubscriptionAccess;
  subscription: Subscription | null;
  plan: Plan | null;
  /** Null when there is no subscription at all. Negative once expired. */
  daysRemaining: number | null;
  expiresAt: string | null;
}

export interface CouponAssessment {
  valid: boolean;
  /** Arabic message explaining why a coupon was rejected. */
  reason: string | null;
  code: string;
  discount: number;
  finalAmount: number;
}

export interface CheckoutResult {
  subscriptionId: string;
  paymentId: string;
  amount: number;
  instruction: CheckoutInstruction;
}

/** Public destination only. Never includes payment_methods.settings. */
export interface PublicBankDetails {
  name: string;
  beneficiary: string;
  iban: string;
}

/**
 * What the teacher must do next to complete payment. Manual transfer returns a
 * reference to quote; a hosted gateway returns a URL to redirect to.
 */
export type CheckoutInstruction =
  | {
      kind: "manual";
      reference: string;
      message: string;
      bank?: PublicBankDetails | null;
    }
  | { kind: "redirect"; url: string };

/**
 * Reconstructable unpaid checkout for the authenticated teacher.
 * `paymentId` is required to submit a reference; IDs are not shown in the UI.
 */
export interface OpenCheckout extends CheckoutResult {
  paymentStatus: string;
  planName: string;
  transferReference: string | null;
  /** True when the server stored a receipt for this payment. Never includes the path. */
  hasReceipt: boolean;
  /** Present when the admin rejected this open payment. Never includes storage paths. */
  rejectionReason: string | null;
}

/** Raised when a teacher tries to act on a subscription that is not theirs. */
export class BillingAccessError extends Error {
  constructor(message = "لا تملك صلاحية الوصول إلى هذا الاشتراك.") {
    super(message);
    this.name = "BillingAccessError";
  }
}

export type BillingErrorCode =
  | "CALENDAR_UNAVAILABLE"
  | "INVALID_PLAN"
  | "UNSUPPORTED_TERM"
  | "INVALID_PERIOD"
  | "DUPLICATE_CHECKOUT"
  | "EXISTING_SUBSCRIPTION"
  | "INVALID_AMOUNT"
  | "INVALID_PAYMENT"
  | "SUBSCRIPTION_NOT_FOUND"
  | "PERIOD_ENDED"
  | "FORBIDDEN"
  | "FEATURE_ENTITLEMENT_REQUIRED"
  | "PAYMENT_REFERENCE_LOCKED"
  | "INVALID_RECEIPT";

/** Controlled billing failure. Message is safe to show in the UI. */
export class BillingError extends Error {
  readonly code: BillingErrorCode;

  constructor(code: BillingErrorCode, message: string) {
    super(message);
    this.name = "BillingError";
    this.code = code;
  }
}
