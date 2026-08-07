import { AlertTriangle, CheckCircle2, Clock, CreditCard, XCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Badge } from "@/shared/ui/badge";
import { cn } from "@/shared/utils/utils";
import type { SubscriptionAccess } from "../types";

const META: Record<SubscriptionAccess, { label: string; icon: LucideIcon; className: string }> = {
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
  pending: {
    label: "بانتظار التأكيد",
    icon: Clock,
    className: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  },
  none: {
    label: "لا يوجد اشتراك",
    icon: CreditCard,
    className: "bg-slate-500/10 text-slate-600 dark:text-slate-300",
  },
};

export interface SubscriptionBadgeProps {
  access: SubscriptionAccess;
  daysRemaining?: number | null;
}

export function SubscriptionBadge({ access, daysRemaining }: SubscriptionBadgeProps) {
  const meta = META[access];
  const Icon = meta.icon;

  const suffix =
    access === "expiring" && typeof daysRemaining === "number" && daysRemaining >= 0
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
