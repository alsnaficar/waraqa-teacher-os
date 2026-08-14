import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import {
  assessCouponCode,
  attachPaymentReceipt,
  getBillingHistory,
  getOpenCheckout,
  getSubscriptionState,
  listPlans,
  startCheckout,
  submitPaymentReference,
} from "../billing.functions";
import { grantsAccess } from "../billing.logic";
import type { OpenCheckout, SubscriptionState } from "../types";

export const subscriptionQueryKey = ["billing", "subscription-state"] as const;
export const plansQueryKey = ["billing", "plans"] as const;
export const billingHistoryQueryKey = ["billing", "history"] as const;
export const openCheckoutQueryKey = ["billing", "open-checkout"] as const;

const UNSUBSCRIBED: SubscriptionState = {
  access: "none",
  subscription: null,
  plan: null,
  daysRemaining: null,
  expiresAt: null,
};

/**
 * Subscription state for the current teacher.
 *
 * Used by the dashboard badge and the subscription page. Failures resolve to
 * "no subscription" rather than throwing, so a billing outage degrades the
 * badge instead of taking down the dashboard.
 */
export function useSubscription() {
  const query = useQuery<SubscriptionState>({
    queryKey: subscriptionQueryKey,
    staleTime: 60_000,
    queryFn: () => getSubscriptionState(),
  });

  const state = query.data ?? UNSUBSCRIBED;

  return {
    state,
    access: state.access,
    hasAccess: grantsAccess(state.access),
    daysRemaining: state.daysRemaining,
    loading: query.isPending,
    error: query.error,
    refresh: query.refetch,
  };
}

export function usePlans() {
  return useQuery({
    queryKey: plansQueryKey,
    staleTime: 5 * 60_000,
    queryFn: () => listPlans(),
  });
}

export function useBillingHistory() {
  return useQuery({
    queryKey: billingHistoryQueryKey,
    staleTime: 60_000,
    queryFn: () => getBillingHistory(),
  });
}

export function useOpenCheckout() {
  return useQuery<OpenCheckout | null>({
    queryKey: openCheckoutQueryKey,
    staleTime: 15_000,
    queryFn: () => getOpenCheckout(),
  });
}

/** Checkout actions, each invalidating subscription state on success. */
export function useCheckout() {
  const queryClient = useQueryClient();

  const invalidate = useCallback(() => {
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: subscriptionQueryKey }),
      queryClient.invalidateQueries({ queryKey: billingHistoryQueryKey }),
      queryClient.invalidateQueries({ queryKey: openCheckoutQueryKey }),
    ]);
  }, [queryClient]);

  const begin = useMutation({
    mutationFn: (input: { planCode: string; couponCode?: string }) =>
      startCheckout({ data: input }),
    onSuccess: invalidate,
  });

  const submitReference = useMutation({
    mutationFn: (input: { paymentId: string; reference: string }) =>
      submitPaymentReference({ data: input }),
    onSuccess: invalidate,
  });

  const checkCoupon = useMutation({
    mutationFn: (input: { planCode: string; couponCode: string }) =>
      assessCouponCode({ data: input }),
  });

  const uploadReceipt = useMutation({
    mutationFn: (input: {
      paymentId: string;
      contentBase64: string;
      mimeType?: string;
      fileName?: string;
    }) => attachPaymentReceipt({ data: input }),
    onSuccess: invalidate,
  });

  return { begin, submitReference, checkCoupon, uploadReceipt };
}
