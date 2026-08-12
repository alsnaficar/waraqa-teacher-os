import { Link } from "@tanstack/react-router";
import { AlertTriangle, CalendarClock, Clock, CreditCard } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/utils/utils";
import { deriveSubscriptionDisplayKind, type SubscriptionDisplayKind } from "../billing.logic";
import type { SubscriptionDisplayInput } from "./subscription-badge";

interface BannerCopy {
  title: string;
  body: string;
  cta: string;
  icon: LucideIcon;
  className: string;
}

function formatDisplayDate(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
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

function copyFor(
  displayKind: SubscriptionDisplayKind,
  daysRemaining: number | null,
  subscriptionStartsAt: string | null,
): BannerCopy | null {
  switch (displayKind) {
    case "expiring":
      return {
        title: "اشتراكك على وشك الانتهاء",
        body:
          typeof daysRemaining === "number"
            ? `يتبقى ${daysRemaining} يوم على انتهاء اشتراكك. جدّد الآن لتفادي الانقطاع.`
            : "اشتراكك يقترب من الانتهاء. جدّد الآن لتفادي الانقطاع.",
        cta: "تجديد الاشتراك",
        icon: AlertTriangle,
        className: "border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200",
      };
    case "expired":
      return {
        title: "انتهى اشتراكك",
        body: "ما زال بإمكانك استخدام التطبيق، لكن ننصح بالتجديد للاستمرار في تلقي التحديثات.",
        cta: "تجديد الاشتراك",
        icon: AlertTriangle,
        className: "border-red-500/30 bg-red-500/10 text-red-900 dark:text-red-200",
      };
    case "scheduled": {
      const startLabel = formatDisplayDate(subscriptionStartsAt);
      return {
        title: "تم تأكيد الدفع — اشتراك مجدول",
        body: startLabel
          ? `تم التحقق من دفعتك. سيبدأ اشتراكك رسمياً في ${startLabel}.`
          : "تم التحقق من دفعتك. سيبدأ اشتراكك في موعده الرسمي.",
        cta: "عرض التفاصيل",
        icon: CalendarClock,
        className: "border-violet-500/30 bg-violet-500/10 text-violet-900 dark:text-violet-200",
      };
    }
    case "awaiting_admin":
      return {
        title: "بانتظار مراجعة الدفع",
        body: "تم إرسال رقم التحويل. سيتم تفعيل الاشتراك بعد مراجعة الإدارة.",
        cta: "عرض التفاصيل",
        icon: Clock,
        className: "border-sky-500/30 bg-sky-500/10 text-sky-900 dark:text-sky-200",
      };
    case "awaiting_transfer":
      return {
        title: "أكمل عملية التحويل",
        body: "أكمل التحويل البنكي وأرسل رقم العملية لإتمام الاشتراك.",
        cta: "إكمال الدفع",
        icon: CreditCard,
        className: "border-orange-500/30 bg-orange-500/10 text-orange-900 dark:text-orange-200",
      };
    case "none":
      return {
        title: "لا يوجد اشتراك فعّال",
        body: "اشترك للحصول على كامل مزايا وَرَقَة.",
        cta: "عرض الباقات",
        icon: CreditCard,
        className: "border-border bg-muted/50",
      };
    default:
      return null;
  }
}

export type SubscriptionBannerProps = SubscriptionDisplayInput;

/**
 * Soft gate: informs and prompts, never blocks. Renders nothing while the
 * subscription is comfortably active.
 */
export function SubscriptionBanner({
  access,
  daysRemaining = null,
  subscriptionStartsAt = null,
  subscriptionExpiresAt = null,
  openCheckoutPaymentStatus = null,
}: SubscriptionBannerProps) {
  const displayKind = deriveSubscriptionDisplayKind({
    access,
    subscriptionStartsAt,
    subscriptionExpiresAt,
    openCheckoutPaymentStatus,
  });
  const copy = copyFor(displayKind, daysRemaining, subscriptionStartsAt);

  if (!copy) return null;

  const Icon = copy.icon;

  return (
    <div className={cn("flex flex-wrap items-start gap-3 rounded-2xl border p-3", copy.className)}>
      <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{copy.title}</p>
        <p className="mt-0.5 text-xs opacity-90">{copy.body}</p>
      </div>

      <Button asChild size="sm" variant="outline" className="h-11 w-full sm:w-auto">
        <Link to="/subscription">{copy.cta}</Link>
      </Button>
    </div>
  );
}
