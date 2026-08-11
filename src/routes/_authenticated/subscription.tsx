import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { BadgeCheck, Copy, Loader2, Receipt } from "lucide-react";

import { SubscriptionBadge } from "@/features/billing/components/subscription-badge";
import {
  useBillingHistory,
  useCheckout,
  useOpenCheckout,
  usePlans,
  useSubscription,
} from "@/features/billing/hooks/useSubscription";
import { paymentStatusLabel } from "@/features/billing/billing.logic";
import type { OpenCheckout, PublicBankDetails } from "@/features/billing/types";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";

export const Route = createFileRoute("/_authenticated/subscription")({
  component: SubscriptionPage,
});

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "حدث خطأ غير متوقع.";
}

function SubscriptionPage() {
  const { state, loading } = useSubscription();
  const plans = usePlans();
  const history = useBillingHistory();
  const openCheckout = useOpenCheckout();
  const { begin, submitReference, checkCoupon } = useCheckout();

  const [couponCode, setCouponCode] = useState("");
  const [reference, setReference] = useState("");

  const checkout = openCheckout.data ?? null;
  const manualInstruction = checkout?.instruction.kind === "manual" ? checkout.instruction : null;
  const canSubmitReference = checkout?.paymentStatus === "created";
  const scheduledConfirmed =
    !openCheckout.isPending &&
    !checkout &&
    state.access === "pending" &&
    state.subscription !== null;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">الاشتراك</h1>
        <p className="mt-1 text-sm text-muted-foreground">إدارة الباقة والاشتراك والفواتير.</p>
      </div>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">الحالة الحالية</h2>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <SubscriptionBadge access={state.access} daysRemaining={state.daysRemaining} />
            )}
          </div>

          {scheduledConfirmed ? (
            <p className="text-sm text-emerald-700 dark:text-emerald-300">
              تم تأكيد اشتراكك. سيبدأ في {state.subscription?.startsAt ?? "موعده الرسمي"}.
            </p>
          ) : null}

          <dl className="grid gap-3 sm:grid-cols-3">
            <Field label="الباقة" value={state.plan?.name ?? "—"} />
            <Field label="تاريخ الانتهاء" value={state.expiresAt ?? "—"} />
            <Field
              label="المدة المتبقية"
              value={
                typeof state.daysRemaining === "number" && state.daysRemaining >= 0
                  ? `${state.daysRemaining} يوم`
                  : "—"
              }
            />
          </dl>
        </CardContent>
      </Card>

      {checkout && manualInstruction ? (
        <CheckoutCard
          checkout={checkout}
          bank={manualInstruction.bank ?? null}
          referenceQuote={manualInstruction.reference}
          message={manualInstruction.message}
          canSubmit={canSubmitReference}
          bankReference={reference}
          onBankReferenceChange={setReference}
          submitPending={submitReference.isPending}
          submitError={submitReference.error}
          onSubmit={() =>
            submitReference.mutate(
              { paymentId: checkout.paymentId, reference },
              { onSuccess: () => setReference("") },
            )
          }
        />
      ) : null}

      <Card>
        <CardContent className="space-y-3 p-4">
          <h2 className="font-semibold">الباقات المتاحة</h2>

          {plans.isPending ? (
            <p className="text-sm text-muted-foreground">جارٍ تحميل الباقات...</p>
          ) : plans.data && plans.data.length > 0 ? (
            <>
              <div className="flex flex-wrap gap-2">
                <Input
                  value={couponCode}
                  onChange={(event) => setCouponCode(event.target.value)}
                  placeholder="رمز الخصم (اختياري)"
                  className="h-11 min-w-[160px] flex-1"
                />
                <Button
                  variant="outline"
                  className="h-11 w-full sm:w-auto"
                  disabled={!couponCode.trim() || !plans.data[0] || checkCoupon.isPending}
                  onClick={() =>
                    checkCoupon.mutate({
                      planCode: plans.data[0].code,
                      couponCode,
                    })
                  }
                >
                  تحقق من الرمز
                </Button>
              </div>

              {checkCoupon.data ? (
                <p
                  className={
                    checkCoupon.data.valid ? "text-sm text-emerald-600" : "text-sm text-red-600"
                  }
                >
                  {checkCoupon.data.valid
                    ? `تم تطبيق خصم ${checkCoupon.data.discount} ريال. السعر بعد الخصم ${checkCoupon.data.finalAmount} ريال.`
                    : checkCoupon.data.reason}
                </p>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                {plans.data.map((plan) => (
                  <div
                    key={plan.id}
                    className="flex flex-col gap-2 rounded-2xl border border-border p-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold">{plan.name}</p>
                      <BadgeCheck className="h-5 w-5 shrink-0 text-primary" />
                    </div>

                    <p className="text-2xl font-bold">
                      {plan.price} <span className="text-sm font-normal">ريال</span>
                    </p>

                    <Button
                      className="mt-auto h-11 w-full"
                      disabled={begin.isPending}
                      onClick={() =>
                        begin.mutate({
                          planCode: plan.code,
                          couponCode: couponCode.trim() || undefined,
                        })
                      }
                    >
                      {begin.isPending ? "جارٍ التجهيز..." : "اشترك الآن"}
                    </Button>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              لا توجد باقات متاحة حالياً. يرجى المحاولة لاحقاً.
            </p>
          )}

          {begin.error ? <p className="text-sm text-red-600">{errorMessage(begin.error)}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <h2 className="flex items-center gap-2 font-semibold">
            <Receipt className="h-4 w-4" />
            سجل المدفوعات
          </h2>

          {history.isPending ? (
            <p className="text-sm text-muted-foreground">جارٍ التحميل...</p>
          ) : history.data && history.data.length > 0 ? (
            <ul className="divide-y divide-border">
              {history.data.map((payment) => (
                <li key={payment.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                  <span className="font-medium">{payment.amount} ريال</span>
                  <span className="text-muted-foreground">
                    {paymentStatusLabel(payment.status)}
                  </span>
                  <span className="ms-auto text-xs text-muted-foreground">
                    {payment.paidAt?.slice(0, 10) ?? payment.createdAt?.slice(0, 10) ?? "—"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">لا توجد مدفوعات بعد.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CheckoutCard({
  checkout,
  bank,
  referenceQuote,
  message,
  canSubmit,
  bankReference,
  onBankReferenceChange,
  submitPending,
  submitError,
  onSubmit,
}: {
  checkout: OpenCheckout;
  bank: PublicBankDetails | null;
  referenceQuote: string;
  message: string;
  canSubmit: boolean;
  bankReference: string;
  onBankReferenceChange: (value: string) => void;
  submitPending: boolean;
  submitError: unknown;
  onSubmit: () => void;
}) {
  return (
    <Card className="border-sky-500/30 bg-sky-500/5">
      <CardContent className="space-y-3 p-4">
        <h2 className="font-semibold">أكمل عملية الدفع</h2>
        <p className="text-sm text-muted-foreground">{message}</p>

        <dl className="grid gap-3 sm:grid-cols-2">
          <Field label="الباقة" value={checkout.planName || "—"} />
          <Field label="حالة الدفع" value={paymentStatusLabel(checkout.paymentStatus)} />
        </dl>

        <p className="text-sm font-medium">المبلغ المستحق: {checkout.amount.toFixed(2)} ريال</p>

        {bank ? <BankDetails bank={bank} /> : null}

        <CopyRow label="الرقم المرجعي" value={referenceQuote} copyLabel="نسخ الرقم المرجعي" />

        {canSubmit ? (
          <div className="flex flex-wrap gap-2">
            <Input
              value={bankReference}
              onChange={(event) => onBankReferenceChange(event.target.value)}
              placeholder="رقم العملية البنكية"
              className="h-11 min-w-[180px] flex-1"
            />
            <Button
              className="h-11 w-full sm:w-auto"
              disabled={bankReference.trim().length < 3 || submitPending}
              onClick={onSubmit}
            >
              {submitPending ? "جارٍ الإرسال..." : "إرسال رقم العملية"}
            </Button>
          </div>
        ) : (
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
            {checkout.transferReference
              ? `تم إرسال رقم العملية: ${checkout.transferReference}`
              : "تم إرسال رقم العملية. بانتظار مراجعة التحويل."}
          </p>
        )}

        {submitError ? <p className="text-sm text-red-600">{errorMessage(submitError)}</p> : null}
      </CardContent>
    </Card>
  );
}

function BankDetails({ bank }: { bank: PublicBankDetails }) {
  return (
    <div className="space-y-2 rounded-xl border border-border bg-background p-3">
      <p className="text-xs text-muted-foreground">بيانات التحويل</p>
      <p className="text-sm">
        <span className="text-muted-foreground">البنك: </span>
        {bank.name}
      </p>
      <p className="text-sm">
        <span className="text-muted-foreground">المستفيد: </span>
        {bank.beneficiary}
      </p>
      <CopyRow label="الآيبان" value={bank.iban} copyLabel="نسخ الآيبان" ltr />
    </div>
  );
}

function CopyRow({
  label,
  value,
  copyLabel,
  ltr = false,
}: {
  label: string;
  value: string;
  copyLabel: string;
  ltr?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-background p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <code dir={ltr ? "ltr" : undefined} className="flex-1 break-all font-mono text-sm font-bold">
        {value}
      </code>
      <Button
        variant="ghost"
        size="icon"
        className="h-11 w-11 shrink-0"
        aria-label={copyLabel}
        onClick={() => void navigator.clipboard?.writeText(value)}
      >
        <Copy className="h-4 w-4" />
      </Button>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-bold">{value}</dd>
    </div>
  );
}
