import { Link } from "@tanstack/react-router";
import { AlertTriangle, Clock, CreditCard } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/utils/utils";
import type { SubscriptionAccess } from "../types";

interface BannerCopy {
  title: string;
  body: string;
  cta: string;
  icon: LucideIcon;
  className: string;
}

function copyFor(access: SubscriptionAccess, daysRemaining: number | null): BannerCopy | null {
  switch (access) {
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
    case "pending":
      return {
        title: "بانتظار تأكيد الدفع",
        body: "استلمنا طلبك وسيتم تفعيل الاشتراك بعد مراجعة التحويل.",
        cta: "عرض التفاصيل",
        icon: Clock,
        className: "border-sky-500/30 bg-sky-500/10 text-sky-900 dark:text-sky-200",
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

export interface SubscriptionBannerProps {
  access: SubscriptionAccess;
  daysRemaining?: number | null;
}

/**
 * Soft gate: informs and prompts, never blocks. Renders nothing while the
 * subscription is comfortably active.
 */
export function SubscriptionBanner({ access, daysRemaining = null }: SubscriptionBannerProps) {
  const copy = copyFor(access, daysRemaining);

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
