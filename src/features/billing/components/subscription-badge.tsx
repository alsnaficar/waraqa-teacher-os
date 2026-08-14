import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock,
  CreditCard,
  XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Badge } from "@/shared/ui/badge";
import { cn } from "@/shared/utils/utils";
import { deriveSubscriptionDisplayKind, type SubscriptionDisplayKind } from "../billing.logic";
import type { SubscriptionAccess } from "../types";

export interface SubscriptionDisplayInput {
  access: SubscriptionAccess;
  daysRemaining?: number | null;
  subscriptionStartsAt?: string | null;
  subscriptionExpiresAt?: string | null;
  openCheckoutPaymentStatus?: string | null;
}

const META: Record<
  SubscriptionDisplayKind,
  { label: string; icon: LucideIcon; className: string }
> = {
  active: {
    label: "الاشتراك فعال",
    icon: CheckCircle2,
    className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  expiring: {
    label: "ينتهي قريباً",
    icon: AlertTriangle,
    className: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  expired: {
    label: "الاشتراك منتهي",
    icon: XCircle,
    className: "bg-red-500/10 text-red-700 dark:text-red-300",
  },
  scheduled: {
    label: "اشتراك مجدول",
    icon: CalendarClock,
    className: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  },
  awaiting_admin: {
    label: "بانتظار مراجعة الدفع",
    icon: Clock,
    className: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  },
  awaiting_transfer: {
    label: "بانتظار التحويل",
    icon: CreditCard,
    className: "bg-orange-500/10 text-orange-700 dark:text-orange-300",
  },
  none: {
    label: "لا يوجد اشتراك",
    icon: CreditCard,
    className: "bg-slate-500/10 text-slate-600 dark:text-slate-300",
  },
};

export type SubscriptionBadgeProps = SubscriptionDisplayInput;

export function SubscriptionBadge({
  access,
  daysRemaining = null,
  subscriptionStartsAt = null,
  subscriptionExpiresAt = null,
  openCheckoutPaymentStatus = null,
}: SubscriptionBadgeProps) {
  const displayKind = deriveSubscriptionDisplayKind({
    access,
    subscriptionStartsAt,
    subscriptionExpiresAt,
    openCheckoutPaymentStatus,
  });
  const meta = META[displayKind];
  const Icon = meta.icon;

  const suffix =
    displayKind === "expiring" && typeof daysRemaining === "number" && daysRemaining >= 0
      ? ` • ${daysRemaining} يوم`
      : "";

  return (
    <Badge variant="outline" className={cn("gap-1 border-transparent", meta.className)}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      <span>
        {meta.label}
        {suffix}
      </span>
    </Badge>
  );
}
