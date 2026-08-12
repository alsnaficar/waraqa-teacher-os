import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { BadgeCheck, Copy, Loader2, Receipt, Upload } from "lucide-react";
import { toast } from "sonner";

import { SubscriptionBadge } from "@/features/billing/components/subscription-badge";
import {
  deriveSubscriptionDisplayKind,
  grantsAccess,
  paymentStatusLabel,
  type SubscriptionDisplayKind,
} from "@/features/billing/billing.logic";
import {
  useBillingHistory,
  useCheckout,
  useOpenCheckout,
  usePlans,
  useSubscription,
} from "@/features/billing/hooks/useSubscription";
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

function formatDisplayDate(value: string | null | undefined): string {
  if (!value?.trim()) return "—";
  try {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? new Date(`${value}T00:00:00`)
      : new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium" }).format(date);
  } catch {
    return value;
  }
}

function nextActionForDisplayKind(displayKind: SubscriptionDisplayKind): string {
  switch (displayKind) {
    case "none":
      return "اختر باقة وأكمل الاشتراك.";
    case "awaiting_transfer":
      return "حوّل المبلغ ثم أرسل رقم العملية البنكية.";
    case "awaiting_admin":
      return "بانتظار مراجعة الإدارة — لا يلزم إجراء إضافي الآن.";
    case "scheduled":
      return "تم تأكيد الدفع. سيبدأ الاشتراك في تاريخ البداية الرسمي.";
    case "expiring":
      return "جدّد اشتراكك قبل انتهاء المدة.";
    case "expired":
      return "جدّد اشتراكك للاستمرار في المزايا المدفوعة.";
    case "active":
      return "اشتراكك فعّال — لا يلزم إجراء.";
    default:
      return "—";
  }
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

  const subscriptionDisplay = {
    access: state.access,
    daysRemaining: state.daysRemaining,
    subscriptionStartsAt: state.subscription?.startsAt ?? null,
    subscriptionExpiresAt: state.expiresAt,
    openCheckoutPaymentStatus: checkout?.paymentStatus ?? null,
  };

  const displayKind = deriveSubscriptionDisplayKind({
    access: state.access,
    subscriptionStartsAt: state.subscription?.startsAt ?? null,
    subscriptionExpiresAt: state.expiresAt,
    openCheckoutPaymentStatus: checkout?.paymentStatus ?? null,
  });

  const showPlansSection =
    !checkout &&
    (displayKind === "none" || displayKind === "expired" || displayKind === "expiring");

  const couponEntered = couponCode.trim().length > 0;
  const couponVerifiedInvalid = couponEntered && checkCoupon.data?.valid === false;
  const couponVerifiedValid = couponEntered && checkCoupon.data?.valid === true;

  function canCheckoutPlan(planCode: string): boolean {
    if (begin.isPending) return false;
    if (couponVerifiedInvalid) return false;
    if (couponVerifiedValid && selectedPlanCode !== planCode) return false;
    return true;
  }

  function handleCouponChange(value: string) {
    setCouponCode(value);
    if (!value.trim()) {
      checkCoupon.reset();
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 overflow-x-hidden p-4 sm:p-6">
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
              <SubscriptionBadge {...subscriptionDisplay} />
            )}
          </div>

          <div aria-live="polite" aria-atomic="true" className="space-y-2">
            {displayKind === "scheduled" ? (
              <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                تم تأكيد الدفع. سيبدأ اشتراكك في{" "}
                {formatDisplayDate(state.subscription?.startsAt ?? null)}.
              </p>
            ) : null}

            {displayKind === "awaiting_admin" ? (
              <p className="text-sm text-sky-800 dark:text-sky-200">
                تم إرسال رقم التحويل. بانتظار مراجعة الإدارة.
              </p>
            ) : null}

            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">الإجراء التالي: </span>
              {nextActionForDisplayKind(displayKind)}
            </p>
          </div>

          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="الباقة" value={state.plan?.name ?? checkout?.planName ?? "—"} />
            <Field
              label="تاريخ البداية"
              value={formatDisplayDate(state.subscription?.startsAt ?? null)}
            />
            <Field label="تاريخ الانتهاء" value={formatDisplayDate(state.expiresAt)} />
            {checkout ? (
              <Field label="حالة الدفع" value={paymentStatusLabel(checkout.paymentStatus)} />
            ) : displayKind === "scheduled" ? (
              <Field label="حالة الدفع" value="تم التحقق" />
            ) : null}
            {!checkout && displayKind !== "scheduled" ? (
              <Field
                label="المدة المتبقية"
                value={
                  typeof state.daysRemaining === "number" && state.daysRemaining >= 0
                    ? `${state.daysRemaining} يوم`
                    : "—"
                }
              />
            ) : null}
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
              {
                onSuccess: () => {
                  setReference("");
                  toast.success("تم إرسال رقم العملية بنجاح.");
                },
              },
            )
          }
          receiptPending={uploadReceipt.isPending}
          receiptError={uploadReceipt.error}
          onUploadReceipt={(payload, replacing) =>
            uploadReceipt.mutate(
              {
                paymentId: checkout.paymentId,
                ...payload,
              },
              {
                onSuccess: () => {
                  toast.success(
                    replacing ? "تم استبدال إيصال التحويل بنجاح." : "تم رفع إيصال التحويل بنجاح.",
                  );
                },
              },
            )
          }
        />
      ) : null}

      {showPlansSection ? (
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
                    onChange={(event) => handleCouponChange(event.target.value)}
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
                    role="alert"
                  >
                    {checkCoupon.data.valid
                      ? `تم تطبيق خصم ${checkCoupon.data.discount} ريال على ${selectedPlan?.name ?? "الباقة المختارة"}. السعر بعد الخصم ${checkCoupon.data.finalAmount} ريال.`
                      : checkCoupon.data.reason}
                  </p>
                ) : null}

                {couponVerifiedInvalid ? (
                  <p className="text-sm text-red-600" role="alert">
                    لا يمكن إتمام الاشتراك برمز خصم غير صالح. امسح الرمز أو صحّحه ثم أعد التحقق.
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
                        disabled={!canCheckoutPlan(plan.code)}
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

            {begin.error ? (
              <p className="text-sm text-red-600">{errorMessage(begin.error)}</p>
            ) : null}
          </CardContent>
        </Card>
      ) : grantsAccess(state.access) || displayKind === "scheduled" || checkout ? (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">
              {displayKind === "scheduled"
                ? "اشتراكك مجدول وتم تأكيد الدفع. يمكنك مراجعة التفاصيل أعلاه وسجل المدفوعات أدناه."
                : checkout
                  ? "أكمل خطوات الدفع في البطاقة أعلاه. لن تظهر باقات جديدة حتى تنتهي هذه العملية."
                  : "اشتراكك الحالي فعّال. لعرض سجل المدفوعات راجع القسم أدناه."}
            </p>
          </CardContent>
        </Card>
      ) : null}

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
                <li
                  key={payment.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm"
                >
                  <span className="font-medium">{payment.amount} ريال</span>
                  <span className="text-xs text-muted-foreground">(سعر الباقة)</span>
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
  onUploadReceipt: (
    payload: {
      contentBase64: string;
      mimeType?: string;
      fileName?: string;
    },
    replacing: boolean,
  ) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [receiptValidationError, setReceiptValidationError] = useState<string | null>(null);
  const isRejected = checkout.paymentStatus === "rejected";
  const isSubmitted = checkout.paymentStatus === "submitted";
  const canUploadReceipt =
    checkout.paymentStatus === "created" || checkout.paymentStatus === "submitted" || isRejected;
  const sameRejectedReference =
    isRejected &&
    Boolean(checkout.transferReference) &&
    bankReference.trim() === checkout.transferReference?.trim();

  async function handleReceiptFile(file: File | undefined) {
    setReceiptValidationError(null);
    if (!file) return;
    const replacing = checkout.hasReceipt;
    try {
      const payload = await fileToReceiptPayload(file);
      onUploadReceipt(payload, replacing);
    } catch (err: unknown) {
      setReceiptValidationError(errorMessage(err));
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <Card className="border-sky-500/30 bg-sky-500/5">
      <CardContent className="space-y-3 p-4">
        <h2 className="font-semibold">
          {isRejected
            ? "تم رفض طلب الدفع"
            : isSubmitted
              ? "بانتظار مراجعة الدفع"
              : "أكمل عملية الدفع"}
        </h2>

        <div aria-live="polite" aria-atomic="true" className="space-y-2">
          {isRejected ? (
            <div className="space-y-1 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
              <p className="text-sm font-medium text-destructive">تم رفض طلب الدفع</p>
              <p className="text-sm text-destructive">
                سبب الرفض: {checkout.rejectionReason || "—"}
              </p>
              <p className="text-xs text-muted-foreground">
                أرسل رقم تحويل جديداً مختلفاً عن الرقم المرفوض. يمكنك أيضاً استبدال الإيصال.
              </p>
            </div>
          ) : isSubmitted ? (
            <p className="text-sm text-sky-800 dark:text-sky-200">
              تم إرسال طلب الدفع. سيتم مراجعته من الإدارة.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">{message}</p>
          )}
        </div>

        <dl className="grid gap-3 sm:grid-cols-2">
          <Field label="الباقة" value={checkout.planName || "—"} />
          <Field label="حالة الدفع" value={paymentStatusLabel(checkout.paymentStatus)} />
        </dl>

        <p className="text-sm font-medium">المبلغ المستحق: {checkout.amount.toFixed(2)} ريال</p>

        {bank && !isSubmitted ? <BankDetails bank={bank} /> : null}

        <CopyRow label="الرقم المرجعي" value={referenceQuote} copyLabel="نسخ الرقم المرجعي" />

        {canSubmit ? (
          <div className="flex flex-wrap gap-2">
            <Input
              value={bankReference}
              onChange={(event) => onBankReferenceChange(event.target.value)}
              placeholder={isRejected ? "رقم التحويل الجديد" : "رقم العملية البنكية"}
              maxLength={128}
              className="h-11 min-w-[180px] flex-1"
              dir="ltr"
            />
            <Button
              className="h-11 min-h-[44px] w-full sm:w-auto"
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
        onClick={() => {
          void navigator.clipboard?.writeText(value).then(() => {
            toast.success("تم النسخ.");
          });
        }}
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
