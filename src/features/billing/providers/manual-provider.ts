import {
  registerPaymentProvider,
  type CheckoutRequest,
  type ConfirmRequest,
  type PaymentConfirmation,
  type PaymentProvider,
} from "./payment-provider";
import { readPublicBankDetails } from "../public-bank";
import type { CheckoutInstruction, PublicBankDetails } from "../types";

/**
 * Bank transfer settled outside the system.
 *
 * The teacher transfers the amount, quotes the reference below, and submits the
 * bank's transaction number. Nothing here can prove the money arrived, so
 * `confirmPayment` always reports unsettled and an admin activates the
 * subscription after checking the account.
 */
export const manualPaymentProvider: PaymentProvider = {
  id: "manual",
  label: "تحويل بنكي",

  async createCheckout(request: CheckoutRequest): Promise<CheckoutInstruction> {
    return buildManualCheckoutInstruction(request.paymentId);
  },

  async confirmPayment(request: ConfirmRequest): Promise<PaymentConfirmation> {
    // An offline transfer cannot be verified from here; an admin confirms it.
    return { settled: false, reference: request.reference };
  },
};

/** Short, human-quotable reference derived from the payment id. */
export function buildManualReference(paymentId: string): string {
  return `WRQ-${paymentId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

export function buildManualCheckoutInstruction(
  paymentId: string,
  env: Record<string, string | undefined> = process.env,
): Extract<CheckoutInstruction, { kind: "manual" }> {
  const bank: PublicBankDetails | null = readPublicBankDetails(env);
  return {
    kind: "manual",
    reference: buildManualReference(paymentId),
    message:
      "حوّل قيمة الاشتراك إلى الحساب أدناه ثم أدخل رقم العملية البنكية. سيتم تفعيل اشتراكك بعد مراجعة التحويل.",
    bank,
  };
}

registerPaymentProvider(manualPaymentProvider);
