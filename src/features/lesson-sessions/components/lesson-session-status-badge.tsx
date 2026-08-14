import { CalendarClock, CheckCircle2, Loader2, Lock, XCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Badge } from "@/shared/ui/badge";
import { cn } from "@/shared/utils/utils";
import type { LessonSessionStatus } from "../types";

const STATUS_META: Record<
  LessonSessionStatus,
  { label: string; icon: LucideIcon; className: string }
> = {
  scheduled: {
    label: "مجدولة",
    icon: CalendarClock,
    className: "bg-slate-500/10 text-slate-600 dark:text-slate-300",
  },
  preparing: {
    label: "جاري التحضير",
    icon: Loader2,
    className: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  prepared: {
    label: "محضّرة",
    icon: Lock,
    className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  completed: {
    label: "منتهية",
    icon: CheckCircle2,
    className: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  },
  cancelled: {
    label: "ملغاة",
    icon: XCircle,
    className: "bg-red-500/10 text-red-700 dark:text-red-300",
  },
};

export function LessonSessionStatusBadge({ status }: { status: LessonSessionStatus }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;

  return (
    <Badge variant="outline" className={cn("gap-1 border-transparent", meta.className)}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      <span>{meta.label}</span>
    </Badge>
  );
}
