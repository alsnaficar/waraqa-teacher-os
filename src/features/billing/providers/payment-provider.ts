import type { CheckoutInstruction } from "../types";

/**
 * Seam between the billing engine and whatever actually moves money.
 *
 * The engine owns subscription state, coupons and the audit trail; a provider
 * only knows how to start a payment and whether one settled. Adding Moyasar or
 * Tap later means implementing this interface and registering it -- no changes
 * to the server functions.
 */
export interface PaymentProvider {
  /** Matches `payment_methods.provider` in the database. */
  readonly id: string;

  /** Human label, shown in Arabic on the checkout screen. */
  readonly label: string;

  createCheckout(request: CheckoutRequest): Promise<CheckoutInstruction>;

  /**
   * Whether the provider considers this payment settled.
   *
   * Gateways answer from their API or a webhook. Offline methods cannot know,
   * so they return false and wait for an admin to confirm.
   */
  confirmPayment(request: ConfirmRequest): Promise<PaymentConfirmation>;
}

export interface CheckoutRequest {
  subscriptionId: string;
  paymentId: string;
  planName: string;
  amount: number;
}

export interface ConfirmRequest {
  paymentId: string;
  reference: string | null;
}

export interface PaymentConfirmation {
  settled: boolean;
  /** Provider-side identifier stored on `payments.transaction_number`. */
  reference: string | null;
}

const registry = new Map<string, PaymentProvider>();

export function registerPaymentProvider(provider: PaymentProvider): void {
  registry.set(provider.id, provider);
}

export function getPaymentProvider(id: string): PaymentProvider | undefined {
  return registry.get(id);
}

export function listPaymentProviders(): PaymentProvider[] {
  return [...registry.values()];
}
