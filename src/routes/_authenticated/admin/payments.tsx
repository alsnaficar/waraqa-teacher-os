import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  activateSubscription,
  getAdminReceiptUrl,
  listAdminSubmittedPayments,
  rejectPayment,
  type AdminSubmittedPayment,
} from "@/features/billing/billing.functions";
import { activationInputFromSubmittedPayment } from "@/features/billing/billing.operations";
import {
  billingHistoryQueryKey,
  openCheckoutQueryKey,
  subscriptionQueryKey,
} from "@/features/billing/hooks/useSubscription";
import { paymentStatusLabel } from "@/features/billing/billing.logic";
import { SectionHeader } from "@/shared/components/section-header";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Skeleton } from "@/shared/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
import { Textarea } from "@/shared/ui/textarea";

export const Route = createFileRoute("/_authenticated/admin/payments")({
  component: AdminPaymentsPage,
});

const QUEUE_QUERY_KEY = ["admin-submitted-payments"] as const;

function displayName(item: AdminSubmittedPayment): string {
  return item.subscriber.fullName.trim() || "بدون اسم";
}

function displayEmail(item: AdminSubmittedPayment): string {
  return item.subscriber.email.trim() || "بدون بريد";
}

function formatSar(amount: number, currency: string): string {
  const value = Number.isFinite(amount) ? amount : 0;
  return `${value.toLocaleString("ar-SA")} ${currency === "SAR" ? "ر.س" : currency}`;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
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

function formatPeriod(startsOn: string, endsOn: string): string {
  return `${formatDate(startsOn)} – ${formatDate(endsOn)}`;
}

function PaymentAmountDetails({
  amountSar,
  discountSar,
  netSar,
  currency,
  compact = false,
}: {
  amountSar: number;
  discountSar: number;
  netSar: number;
  currency: string;
  compact?: boolean;
}) {
  if (!(discountSar > 0)) {
    return <span className="font-semibold tabular-nums">{formatSar(netSar, currency)}</span>;
  }

  if (compact) {
    return (
      <div className="space-y-0.5 text-end">
        <p className="text-xs text-muted-foreground line-through">
          {formatSar(amountSar, currency)}
        </p>
        <p className="font-semibold tabular-nums">{formatSar(netSar, currency)}</p>
        <p className="text-xs text-emerald-700 dark:text-emerald-300">
          خصم {formatSar(discountSar, currency)}
        </p>
      </div>
    );
  }

  return (
    <dl className="grid min-w-0 gap-1 text-sm">
      <div className="flex min-w-0 justify-between gap-3">
        <dt className="text-muted-foreground">السعر الأصلي</dt>
        <dd className="tabular-nums">{formatSar(amountSar, currency)}</dd>
      </div>
      <div className="flex min-w-0 justify-between gap-3">
        <dt className="text-muted-foreground">الخصم</dt>
        <dd className="tabular-nums text-emerald-700 dark:text-emerald-300">
          {formatSar(discountSar, currency)}
        </dd>
      </div>
      <div className="flex min-w-0 justify-between gap-3">
        <dt className="text-muted-foreground">المبلغ النهائي</dt>
        <dd className="font-semibold tabular-nums">{formatSar(netSar, currency)}</dd>
      </div>
    </dl>
  );
}

function ReceiptAvailability({ hasReceipt }: { hasReceipt: boolean }) {
  if (hasReceipt) return null;
  return (
    <Badge variant="outline" className="whitespace-normal text-muted-foreground">
      بدون إيصال
    </Badge>
  );
}

function subscriptionStatusLabel(status: string): string {
  switch (status) {
    case "pending_payment":
      return "بانتظار الدفع";
    case "scheduled":
      return "مجدول";
    case "active":
      return "نشط";
    case "expired":
      return "منتهٍ";
    case "cancelled":
      return "ملغى";
    case "suspended":
      return "موقوف";
    default:
      return status || "—";
  }
}

function toAdminPaymentsErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : "";
  const upper = raw.toUpperCase();

  if (
    upper.includes("ADMIN_REQUIRED") ||
    upper.includes("NOT_AUTHENTICATED") ||
    raw.includes("غير مصرح") ||
    raw.includes("Administrators")
  ) {
    return "ليس لديك صلاحية لتنفيذ هذا الإجراء.";
  }
  if (upper.includes("EXISTING_SUBSCRIPTION") || raw.includes("مفعّل مسبقاً")) {
    return "الاشتراك مفعّل مسبقاً.";
  }
  if (upper.includes("SUBSCRIPTION_NOT_FOUND") || raw.includes("الاشتراك غير موجود")) {
    return "الاشتراك غير موجود.";
  }
  if (raw.includes("سبب الرفض")) {
    return raw;
  }
  if (raw.includes("تم رفض هذه العملية مسبقاً")) {
    return "تم رفض هذه العملية مسبقاً.";
  }
  if (upper.includes("INVALID_PAYMENT") || raw.includes("عملية الدفع") || raw.includes("رفض")) {
    return raw.includes("رفض") ? raw : "لا يمكن تفعيل هذه الدفعة.";
  }
  if (!raw.trim()) return "تعذر تنفيذ العملية. حاول مرة أخرى.";
  if (/[A-Z_]{4,}/.test(raw) && !/[\u0600-\u06FF]/.test(raw)) {
    return "تعذر تنفيذ العملية. حاول مرة أخرى.";
  }
  return raw;
}

function PaymentsTableSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="جاري تحميل الدفعات">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="flex min-w-0 items-center gap-3 rounded-xl border border-border/70 bg-background px-4 py-3"
        >
          <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-40 max-w-full" />
            <Skeleton className="h-3 w-56 max-w-full" />
          </div>
          <Skeleton className="hidden h-6 w-20 rounded-md sm:block" />
          <Skeleton className="h-10 w-28 shrink-0 rounded-lg" />
        </div>
      ))}
    </div>
  );
}

function AdminPaymentsPage() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<AdminSubmittedPayment | null>(null);
  const [rejectTarget, setRejectTarget] = useState<AdminSubmittedPayment | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: QUEUE_QUERY_KEY,
    queryFn: () => listAdminSubmittedPayments(),
    staleTime: 15_000,
  });

  const previewReceipt = useMutation({
    mutationFn: (paymentId: string) => getAdminReceiptUrl({ data: { paymentId } }),
    onSuccess: (result) => {
      window.open(result.url, "_blank", "noopener,noreferrer");
    },
    onError: (err: unknown) => {
      toast.error(toAdminPaymentsErrorMessage(err));
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (input: { paymentId: string; reason: string }) => rejectPayment({ data: input }),
    onSuccess: async () => {
      toast.success("تم رفض الدفعة.");
      setRejectTarget(null);
      setRejectReason("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: QUEUE_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: subscriptionQueryKey }),
        queryClient.invalidateQueries({ queryKey: billingHistoryQueryKey }),
        queryClient.invalidateQueries({ queryKey: openCheckoutQueryKey }),
      ]);
    },
    onError: (err: unknown) => {
      toast.error(toAdminPaymentsErrorMessage(err));
    },
  });

  const mutation = useMutation({
    mutationFn: (item: AdminSubmittedPayment) =>
      activateSubscription({ data: activationInputFromSubmittedPayment(item) }),
    onSuccess: async () => {
      toast.success("تم التحقق من الدفعة وتحديث الاشتراك.");
      setSelected(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: QUEUE_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: subscriptionQueryKey }),
        queryClient.invalidateQueries({ queryKey: billingHistoryQueryKey }),
        queryClient.invalidateQueries({ queryKey: openCheckoutQueryKey }),
      ]);
    },
    onError: (err: unknown) => {
      toast.error(toAdminPaymentsErrorMessage(err));
    },
  });

  const payments = data?.payments ?? [];

  return (
    <div className="min-w-0 max-w-full space-y-5 md:space-y-6">
      <div className="min-w-0 space-y-3">
        <nav aria-label="مسار التنقل" className="text-sm text-muted-foreground">
          <ol className="flex min-w-0 flex-wrap items-center gap-1.5">
            <li>
              <Link to="/admin" className="hover:text-foreground hover:underline">
                لوحة الإدارة
              </Link>
            </li>
            <li aria-hidden className="text-zinc-300">
              /
            </li>
            <li className="font-medium text-foreground">الدفعات</li>
          </ol>
        </nav>

        <SectionHeader
          title="الدفعات"
          description="تحويلات بنكية أرسل المعلمون رقم العملية لها وبانتظار التحقق الإداري."
          action={
            <Button
              variant="outline"
              className="h-11 min-h-[44px] w-full whitespace-normal sm:w-auto"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              {isFetching ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              تحديث
            </Button>
          }
        />
      </div>

      <Card className="min-w-0 border-zinc-200/80 shadow-sm">
        <CardContent className="min-w-0 space-y-5 p-4 md:p-5">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-zinc-50/80 px-3 py-3 dark:bg-zinc-900/40">
            <p className="text-sm text-muted-foreground">عدد الدفعات بانتظار المراجعة</p>
            <Badge variant="secondary" className="tabular-nums">
              {isLoading ? "…" : payments.length.toLocaleString("ar-SA")}
            </Badge>
          </div>

          {isLoading ? <PaymentsTableSkeleton /> : null}

          {isError ? (
            <div className="min-w-0 space-y-3 rounded-xl border border-destructive/25 bg-destructive/5 p-4">
              <p className="break-words text-sm text-destructive">تعذّر تحميل قائمة الدفعات.</p>
              <Button
                className="h-11 min-h-[44px] w-full whitespace-normal sm:w-auto"
                onClick={() => refetch()}
              >
                إعادة المحاولة
              </Button>
            </div>
          ) : null}

          {!isLoading && !isError && payments.length === 0 ? (
            <div className="flex min-h-[200px] min-w-0 flex-col items-center justify-center gap-2 px-4 py-10 text-center">
              <div className="grid h-12 w-12 place-items-center rounded-full bg-muted">
                <Banknote className="h-6 w-6 text-muted-foreground" aria-hidden />
              </div>
              <p className="text-base font-semibold text-foreground">
                لا توجد دفعات بانتظار المراجعة
              </p>
              <p className="max-w-sm break-words text-sm text-muted-foreground">
                ستظهر هنا التحويلات البنكية بعد أن يرسل المعلم رقم العملية.
              </p>
            </div>
          ) : null}

          {!isLoading && !isError && payments.length > 0 ? (
            <>
              <ul className="grid min-w-0 gap-3 lg:hidden">
                {payments.map((item) => (
                  <li key={item.paymentId} className="min-w-0">
                    <article className="min-w-0 rounded-xl border border-border bg-background p-4">
                      <div className="flex min-w-0 flex-col gap-3">
                        <div className="min-w-0">
                          <p className="break-words font-semibold leading-snug text-foreground">
                            {displayName(item)}
                          </p>
                          <p className="break-all text-sm text-muted-foreground" dir="ltr">
                            {displayEmail(item)}
                          </p>
                        </div>
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <Badge variant="secondary" className="max-w-full whitespace-normal">
                            {item.plan.name || item.plan.code || "—"}
                          </Badge>
                          <Badge variant="outline" className="max-w-full whitespace-normal">
                            {subscriptionStatusLabel(item.subscription.status)}
                          </Badge>
                          <ReceiptAvailability hasReceipt={item.hasReceipt} />
                        </div>
                        <dl className="grid min-w-0 gap-1.5 text-sm">
                          <div className="flex min-w-0 justify-between gap-3">
                            <dt className="text-muted-foreground">المبلغ</dt>
                            <dd>
                              <PaymentAmountDetails
                                amountSar={item.amountSar}
                                discountSar={item.discountSar}
                                netSar={item.netSar}
                                currency={item.currency}
                                compact
                              />
                            </dd>
                          </div>
                          <div className="flex min-w-0 justify-between gap-3">
                            <dt className="text-muted-foreground">رقم التحويل</dt>
                            <dd className="break-all font-mono" dir="ltr">
                              {item.transferReference || item.transactionNumber || "—"}
                            </dd>
                          </div>
                          <div className="flex min-w-0 justify-between gap-3">
                            <dt className="text-muted-foreground">الفترة</dt>
                            <dd className="text-end">
                              {formatPeriod(item.subscription.startsOn, item.subscription.endsOn)}
                            </dd>
                          </div>
                          <div className="flex min-w-0 justify-between gap-3">
                            <dt className="text-muted-foreground">تاريخ العملية</dt>
                            <dd>{formatDate(item.createdAt)}</dd>
                          </div>
                        </dl>
                        <div className="flex min-w-0 flex-col gap-2">
                          {item.hasReceipt ? (
                            <Button
                              type="button"
                              variant="outline"
                              className="h-11 min-h-[44px] w-full whitespace-normal"
                              disabled={previewReceipt.isPending || mutation.isPending}
                              onClick={() => previewReceipt.mutate(item.paymentId)}
                            >
                              {previewReceipt.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                              ) : null}
                              عرض الإيصال
                            </Button>
                          ) : null}
                          <Button
                            className="h-11 min-h-[44px] w-full whitespace-normal"
                            disabled={mutation.isPending || rejectMutation.isPending}
                            onClick={() => setSelected(item)}
                          >
                            تحقق من الدفع
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-11 min-h-[44px] w-full whitespace-normal"
                            disabled={mutation.isPending || rejectMutation.isPending}
                            onClick={() => {
                              setRejectReason("");
                              setRejectTarget(item);
                            }}
                          >
                            رفض الدفع
                          </Button>
                        </div>
                      </div>
                    </article>
                  </li>
                ))}
              </ul>

              <div className="hidden min-w-0 overflow-x-auto rounded-xl border border-border lg:block">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="h-12 bg-zinc-50/90 text-start font-semibold dark:bg-zinc-900/50">
                        المعلم
                      </TableHead>
                      <TableHead className="h-12 bg-zinc-50/90 text-start font-semibold dark:bg-zinc-900/50">
                        الباقة
                      </TableHead>
                      <TableHead className="h-12 bg-zinc-50/90 text-start font-semibold dark:bg-zinc-900/50">
                        المبلغ
                      </TableHead>
                      <TableHead className="h-12 bg-zinc-50/90 text-start font-semibold dark:bg-zinc-900/50">
                        رقم التحويل
                      </TableHead>
                      <TableHead className="h-12 bg-zinc-50/90 text-start font-semibold dark:bg-zinc-900/50">
                        الفترة
                      </TableHead>
                      <TableHead className="h-12 bg-zinc-50/90 text-start font-semibold dark:bg-zinc-900/50">
                        الحالة
                      </TableHead>
                      <TableHead className="h-12 bg-zinc-50/90 text-start font-semibold dark:bg-zinc-900/50">
                        الإجراءات
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.map((item) => (
                      <TableRow
                        key={item.paymentId}
                        className="hover:bg-zinc-50/80 dark:hover:bg-zinc-900/40"
                      >
                        <TableCell className="max-w-[16rem] py-3.5 align-top">
                          <p className="break-words font-medium leading-snug">
                            {displayName(item)}
                          </p>
                          <p className="break-all text-sm text-muted-foreground" dir="ltr">
                            {displayEmail(item)}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatDate(item.createdAt)}
                          </p>
                        </TableCell>
                        <TableCell className="py-3.5 align-top">
                          {item.plan.name || item.plan.code || "—"}
                        </TableCell>
                        <TableCell className="py-3.5 align-top">
                          <div className="flex min-w-0 flex-col gap-1">
                            <PaymentAmountDetails
                              amountSar={item.amountSar}
                              discountSar={item.discountSar}
                              netSar={item.netSar}
                              currency={item.currency}
                              compact
                            />
                            <ReceiptAvailability hasReceipt={item.hasReceipt} />
                          </div>
                        </TableCell>
                        <TableCell className="py-3.5 align-top">
                          <span className="break-all font-mono text-sm" dir="ltr">
                            {item.transferReference || item.transactionNumber || "—"}
                          </span>
                        </TableCell>
                        <TableCell className="py-3.5 align-top">
                          {formatPeriod(item.subscription.startsOn, item.subscription.endsOn)}
                        </TableCell>
                        <TableCell className="py-3.5 align-top">
                          <div className="flex min-w-0 flex-col gap-1">
                            <Badge variant="outline" className="w-fit max-w-full whitespace-normal">
                              {subscriptionStatusLabel(item.subscription.status)}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {paymentStatusLabel("submitted")}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="py-3.5 align-top">
                          <div className="flex min-w-0 flex-col gap-2">
                            {item.hasReceipt ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-11 min-h-[44px] whitespace-normal"
                                disabled={previewReceipt.isPending || mutation.isPending}
                                onClick={() => previewReceipt.mutate(item.paymentId)}
                              >
                                {previewReceipt.isPending ? (
                                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                                ) : null}
                                عرض الإيصال
                              </Button>
                            ) : null}
                            <Button
                              size="sm"
                              className="h-11 min-h-[44px] whitespace-normal"
                              disabled={mutation.isPending || rejectMutation.isPending}
                              onClick={() => setSelected(item)}
                              aria-label={`تحقق من دفع ${displayName(item)}`}
                            >
                              تحقق من الدفع
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-11 min-h-[44px] whitespace-normal"
                              disabled={mutation.isPending || rejectMutation.isPending}
                              onClick={() => {
                                setRejectReason("");
                                setRejectTarget(item);
                              }}
                            >
                              رفض الدفع
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      <Dialog
        open={selected != null}
        onOpenChange={(open) => {
          if (!open && !mutation.isPending) setSelected(null);
        }}
      >
        <DialogContent dir="rtl" className="min-w-0 sm:max-w-md">
          <DialogHeader className="min-w-0 space-y-1 text-right sm:text-right">
            <DialogTitle className="break-words">تأكيد التحقق من الدفع</DialogTitle>
            <DialogDescription className="break-words text-right">
              بعد التحقق سيتم اعتماد الدفعة وتفعيل/جدولة الاشتراك.
            </DialogDescription>
          </DialogHeader>

          {selected ? (
            <div className="min-w-0 space-y-3 py-1">
              <div className="min-w-0 rounded-xl border border-border bg-zinc-50/80 p-3 dark:bg-zinc-900/40">
                <p className="text-xs text-muted-foreground">المعلم</p>
                <p className="mt-0.5 break-words font-semibold leading-snug">
                  {displayName(selected)}
                </p>
                <p className="break-all text-sm text-muted-foreground" dir="ltr">
                  {displayEmail(selected)}
                </p>
              </div>
              <dl className="grid min-w-0 gap-2 text-sm">
                <div className="min-w-0">
                  <PaymentAmountDetails
                    amountSar={selected.amountSar}
                    discountSar={selected.discountSar}
                    netSar={selected.netSar}
                    currency={selected.currency}
                  />
                </div>
                <div className="flex min-w-0 justify-between gap-3">
                  <dt className="text-muted-foreground">رقم التحويل</dt>
                  <dd className="break-all font-mono" dir="ltr">
                    {selected.transferReference || selected.transactionNumber || "—"}
                  </dd>
                </div>
                <div className="flex min-w-0 justify-between gap-3">
                  <dt className="text-muted-foreground">الباقة</dt>
                  <dd className="text-end">{selected.plan.name || selected.plan.code || "—"}</dd>
                </div>
                <div className="flex min-w-0 justify-between gap-3">
                  <dt className="text-muted-foreground">الفترة</dt>
                  <dd className="text-end">
                    {formatPeriod(selected.subscription.startsOn, selected.subscription.endsOn)}
                  </dd>
                </div>
              </dl>
              {selected.hasReceipt ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 min-h-[44px] w-full whitespace-normal"
                  disabled={previewReceipt.isPending || mutation.isPending}
                  onClick={() => previewReceipt.mutate(selected.paymentId)}
                >
                  {previewReceipt.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : null}
                  عرض الإيصال
                </Button>
              ) : null}
            </div>
          ) : null}

          <DialogFooter className="flex min-w-0 flex-col-reverse gap-2 sm:flex-row sm:justify-start">
            <Button
              className="h-11 min-h-[44px] w-full whitespace-normal sm:w-auto"
              disabled={mutation.isPending || !selected}
              onClick={() => {
                if (!selected || mutation.isPending) return;
                mutation.mutate(selected);
              }}
            >
              {mutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  جارٍ التحقق...
                </>
              ) : (
                "تأكيد التحقق"
              )}
            </Button>
            <Button
              variant="outline"
              className="h-11 min-h-[44px] w-full whitespace-normal sm:w-auto"
              disabled={mutation.isPending}
              onClick={() => setSelected(null)}
            >
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={rejectTarget != null}
        onOpenChange={(open) => {
          if (!open && !rejectMutation.isPending) {
            setRejectTarget(null);
            setRejectReason("");
          }
        }}
      >
        <DialogContent dir="rtl" className="min-w-0 sm:max-w-md">
          <DialogHeader className="min-w-0 space-y-1 text-right sm:text-right">
            <DialogTitle className="break-words">رفض الدفع</DialogTitle>
            <DialogDescription className="break-words text-right">
              سيتم رفض هذه الدفعة. لن يُفعَّل الاشتراك، ويمكن للمعلم إرسال رقم تحويل جديد.
            </DialogDescription>
          </DialogHeader>

          {rejectTarget ? (
            <div className="min-w-0 space-y-3 py-1">
              <div className="min-w-0 rounded-xl border border-border bg-zinc-50/80 p-3 dark:bg-zinc-900/40">
                <p className="text-xs text-muted-foreground">المعلم</p>
                <p className="mt-0.5 break-words font-semibold leading-snug">
                  {displayName(rejectTarget)}
                </p>
                <p className="break-all text-sm text-muted-foreground" dir="ltr">
                  {displayEmail(rejectTarget)}
                </p>
              </div>
              <dl className="grid min-w-0 gap-2 text-sm">
                <div className="min-w-0">
                  <PaymentAmountDetails
                    amountSar={rejectTarget.amountSar}
                    discountSar={rejectTarget.discountSar}
                    netSar={rejectTarget.netSar}
                    currency={rejectTarget.currency}
                  />
                </div>
                <div className="flex min-w-0 justify-between gap-3">
                  <dt className="text-muted-foreground">رقم التحويل</dt>
                  <dd className="break-all font-mono" dir="ltr">
                    {rejectTarget.transferReference || rejectTarget.transactionNumber || "—"}
                  </dd>
                </div>
                <div className="flex min-w-0 justify-between gap-3">
                  <dt className="text-muted-foreground">الباقة</dt>
                  <dd className="text-end">
                    {rejectTarget.plan.name || rejectTarget.plan.code || "—"}
                  </dd>
                </div>
                <div className="flex min-w-0 justify-between gap-3">
                  <dt className="text-muted-foreground">الفترة</dt>
                  <dd className="text-end">
                    {formatPeriod(
                      rejectTarget.subscription.startsOn,
                      rejectTarget.subscription.endsOn,
                    )}
                  </dd>
                </div>
              </dl>
              {rejectTarget.hasReceipt ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 min-h-[44px] w-full whitespace-normal"
                  disabled={previewReceipt.isPending || rejectMutation.isPending}
                  onClick={() => previewReceipt.mutate(rejectTarget.paymentId)}
                >
                  {previewReceipt.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : null}
                  عرض الإيصال
                </Button>
              ) : null}
              <div className="space-y-2">
                <label htmlFor="reject-reason" className="text-sm font-medium">
                  سبب الرفض
                </label>
                <Textarea
                  id="reject-reason"
                  value={rejectReason}
                  onChange={(event) => setRejectReason(event.target.value)}
                  maxLength={500}
                  rows={4}
                  disabled={rejectMutation.isPending}
                  className="min-h-[88px]"
                  placeholder="اكتب سبب الرفض"
                />
              </div>
            </div>
          ) : null}

          <DialogFooter className="flex min-w-0 flex-col-reverse gap-2 sm:flex-row sm:justify-start">
            <Button
              className="h-11 min-h-[44px] w-full whitespace-normal sm:w-auto"
              disabled={
                rejectMutation.isPending ||
                !rejectTarget ||
                rejectReason.trim().length < 3 ||
                rejectReason.trim().length > 500
              }
              onClick={() => {
                if (!rejectTarget || rejectMutation.isPending) return;
                rejectMutation.mutate({
                  paymentId: rejectTarget.paymentId,
                  reason: rejectReason.trim(),
                });
              }}
            >
              {rejectMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  جارٍ الرفض...
                </>
              ) : (
                "رفض الدفع"
              )}
            </Button>
            <Button
              variant="outline"
              className="h-11 min-h-[44px] w-full whitespace-normal sm:w-auto"
              disabled={rejectMutation.isPending}
              onClick={() => {
                setRejectTarget(null);
                setRejectReason("");
              }}
            >
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
