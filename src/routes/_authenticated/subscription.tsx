import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { BadgeCheck, Copy, Loader2, Receipt, Upload } from "lucide-react";

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
import { Label } from "@/shared/ui/label";

const RECEIPT_ACCEPT = "image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf";
const RECEIPT_ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const RECEIPT_ALLOWED_EXT = new Set(["jpg", "jpeg", "png", "webp", "pdf"]);
const RECEIPT_MAX_BYTES = 5 * 1024 * 1024;

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
  const { begin, submitReference, checkCoupon, uploadReceipt } = useCheckout();

  const [couponCode, setCouponCode] = useState("");
  const [selectedPlanCode, setSelectedPlanCode] = useState<string | null>(null);
  const [reference, setReference] = useState("");

  const selectedPlan = plans.data?.find((plan) => plan.code === selectedPlanCode) ?? null;
  const checkout = openCheckout.data ?? null;
  const manualInstruction = checkout?.instruction.kind === "manual" ? checkout.instruction : null;
  const canSubmitReference =
    checkout?.paymentStatus === "created" || checkout?.paymentStatus === "rejected";
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
          receiptPending={uploadReceipt.isPending}
          receiptError={uploadReceipt.error}
          onUploadReceipt={(payload) =>
            uploadReceipt.mutate({
              paymentId: checkout.paymentId,
              ...payload,
            })
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
                  className="h-11 min-h-[44px] w-full sm:w-auto"
                  disabled={!couponCode.trim() || !selectedPlan || checkCoupon.isPending}
                  onClick={() => {
                    if (!selectedPlan) return;
                    checkCoupon.mutate({
                      planCode: selectedPlan.code,
                      couponCode,
                    });
                  }}
                >
                  تحقق من الرمز
                </Button>
              </div>

              {!selectedPlan ? (
                <p className="text-sm text-muted-foreground">اختر باقة ثم تحقق من رمز الخصم.</p>
              ) : null}

              {checkCoupon.data ? (
                <p
                  className={
                    checkCoupon.data.valid ? "text-sm text-emerald-600" : "text-sm text-red-600"
                  }
                >
                  {checkCoupon.data.valid
                    ? `تم تطبيق خصم ${checkCoupon.data.discount} ريال على ${selectedPlan?.name ?? "الباقة المختارة"}. السعر بعد الخصم ${checkCoupon.data.finalAmount} ريال.`
                    : checkCoupon.data.reason}
                </p>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                {plans.data.map((plan) => (
                  <div
                    key={plan.id}
                    className={
                      selectedPlanCode === plan.code
                        ? "flex flex-col gap-2 rounded-2xl border border-primary bg-primary/5 p-4"
                        : "flex flex-col gap-2 rounded-2xl border border-border p-4"
                    }
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold">{plan.name}</p>
                      <BadgeCheck className="h-5 w-5 shrink-0 text-primary" />
                    </div>

                    <p className="text-2xl font-bold">
                      {plan.price} <span className="text-sm font-normal">ريال</span>
                    </p>

                    <Button
                      type="button"
                      variant={selectedPlanCode === plan.code ? "default" : "outline"}
                      className="h-11 min-h-[44px] w-full"
                      aria-pressed={selectedPlanCode === plan.code}
                      onClick={() => {
                        setSelectedPlanCode(plan.code);
                        checkCoupon.reset();
                      }}
                    >
                      {selectedPlanCode === plan.code ? "الباقة المختارة" : "اختيار هذه الباقة"}
                    </Button>

                    <Button
                      className="mt-auto h-11 min-h-[44px] w-full"
                      disabled={begin.isPending}
                      onClick={() => {
                        setSelectedPlanCode(plan.code);
                        begin.mutate({
                          planCode: plan.code,
                          couponCode: couponCode.trim() || undefined,
                        });
                      }}
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
  receiptPending,
  receiptError,
  onUploadReceipt,
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
  receiptPending: boolean;
  receiptError: unknown;
  onUploadReceipt: (payload: {
    contentBase64: string;
    mimeType?: string;
    fileName?: string;
  }) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [receiptValidationError, setReceiptValidationError] = useState<string | null>(null);
  const isRejected = checkout.paymentStatus === "rejected";
  const canUploadReceipt =
    checkout.paymentStatus === "created" || checkout.paymentStatus === "submitted" || isRejected;
  const sameRejectedReference =
    isRejected &&
    Boolean(checkout.transferReference) &&
    bankReference.trim() === checkout.transferReference?.trim();

  async function handleReceiptFile(file: File | undefined) {
    setReceiptValidationError(null);
    if (!file) return;
    try {
      const payload = await fileToReceiptPayload(file);
      onUploadReceipt(payload);
    } catch (err: unknown) {
      setReceiptValidationError(errorMessage(err));
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <Card className="border-sky-500/30 bg-sky-500/5">
      <CardContent className="space-y-3 p-4">
        <h2 className="font-semibold">{isRejected ? "تم رفض طلب الدفع" : "أكمل عملية الدفع"}</h2>
        {isRejected ? (
          <div className="space-y-1 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
            <p className="text-sm font-medium text-destructive">تم رفض طلب الدفع</p>
            <p className="text-sm text-destructive">سبب الرفض: {checkout.rejectionReason || "—"}</p>
            <p className="text-xs text-muted-foreground">
              أرسل رقم تحويل جديداً مختلفاً عن الرقم المرفوض.
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{message}</p>
        )}

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
              placeholder={isRejected ? "رقم التحويل الجديد" : "رقم العملية البنكية"}
              maxLength={128}
              className="h-11 min-w-[180px] flex-1"
            />
            <Button
              className="h-11 w-full sm:w-auto"
              disabled={
                bankReference.trim().length < 3 ||
                bankReference.trim().length > 128 ||
                submitPending ||
                Boolean(sameRejectedReference)
              }
              onClick={onSubmit}
            >
              {submitPending
                ? "جارٍ الإرسال..."
                : isRejected
                  ? "إعادة إرسال التحويل"
                  : "إرسال رقم العملية"}
            </Button>
            {sameRejectedReference ? (
              <p className="w-full text-sm text-red-600">يجب إدخال رقم تحويل مختلف عن المرفوض.</p>
            ) : null}
          </div>
        ) : (
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
            {checkout.transferReference
              ? `تم إرسال رقم العملية: ${checkout.transferReference}`
              : "تم إرسال رقم العملية. بانتظار مراجعة التحويل."}
          </p>
        )}

        {submitError ? <p className="text-sm text-red-600">{errorMessage(submitError)}</p> : null}

        {canUploadReceipt ? (
          <div className="space-y-2 rounded-xl border border-border bg-background p-3">
            <p className="text-sm font-medium">رفع إيصال التحويل</p>
            {checkout.hasReceipt ? (
              <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                تم رفع الإيصال
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                JPEG أو PNG أو WebP أو PDF، بحد أقصى 5 ميغابايت. اختياري.
              </p>
            )}
            <input
              ref={fileInputRef}
              id="receipt-file-upload"
              type="file"
              accept={RECEIPT_ACCEPT}
              className="sr-only"
              disabled={receiptPending}
              onChange={(event) => void handleReceiptFile(event.target.files?.[0])}
            />
            <Label htmlFor="receipt-file-upload" className="block">
              <span className="inline-flex h-11 min-h-[44px] w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent hover:text-accent-foreground">
                {receiptPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Upload className="h-4 w-4" aria-hidden />
                )}
                {receiptPending
                  ? "جارٍ الرفع..."
                  : checkout.hasReceipt
                    ? "استبدال الإيصال"
                    : "اختيار ملف الإيصال"}
              </span>
            </Label>
            {receiptValidationError ? (
              <p className="text-sm text-red-600">{receiptValidationError}</p>
            ) : null}
            {receiptError ? (
              <p className="text-sm text-red-600">{errorMessage(receiptError)}</p>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function fileToReceiptPayload(file: File): Promise<{
  contentBase64: string;
  mimeType?: string;
  fileName?: string;
}> {
  const ext =
    file.name
      .split(".")
      .pop()
      ?.toLowerCase()
      .replace(/[^a-z0-9]/g, "") ?? "";
  if (file.size > RECEIPT_MAX_BYTES) {
    return Promise.reject(new Error("حجم الملف يجب ألا يتجاوز 5 ميغابايت."));
  }
  if (ext && !RECEIPT_ALLOWED_EXT.has(ext)) {
    return Promise.reject(new Error("امتداد الملف غير مسموح."));
  }
  if (file.type && !RECEIPT_ALLOWED_MIME.has(file.type)) {
    return Promise.reject(new Error("نوع الملف غير مسموح. يُقبل JPEG وPNG وWebP وPDF فقط."));
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      const contentBase64 = comma >= 0 ? result.slice(comma + 1) : result;
      if (!contentBase64) {
        reject(new Error("تعذر قراءة الملف."));
        return;
      }
      resolve({
        contentBase64,
        mimeType: file.type || undefined,
        fileName: file.name || undefined,
      });
    };
    reader.onerror = () => reject(new Error("تعذر قراءة الملف."));
    reader.readAsDataURL(file);
  });
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
