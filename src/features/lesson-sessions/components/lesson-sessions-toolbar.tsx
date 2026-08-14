import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";

import { Button } from "@/shared/ui/button";
import { formatHijriFull } from "@/shared/utils/date";

export interface LessonSessionsToolbarProps {
  date: string;
  isToday: boolean;
  refreshing: boolean;
  onOffsetChange: (delta: number) => void;
  onToday: () => void;
  onRefresh: () => void;
  /** Optional discoverability action (e.g. link to weekly preparation). */
  weekLink?: ReactNode;
}

export function LessonSessionsToolbar({
  date,
  isToday,
  refreshing,
  onOffsetChange,
  onToday,
  onRefresh,
  weekLink,
}: LessonSessionsToolbarProps) {
  const hijri = formatHijriFull(new Date(`${date}T00:00:00`));

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-2">
      {/* In RTL the chevron pointing right moves backwards in time. */}
      <Button
        variant="ghost"
        size="icon"
        className="h-11 w-11 shrink-0"
        aria-label="اليوم السابق"
        onClick={() => onOffsetChange(-1)}
      >
        <ChevronRight className="h-5 w-5" />
      </Button>

      <div className="min-w-0 flex-1 text-center">
        <p className="truncate text-sm font-semibold" title={hijri}>
          {hijri}
        </p>
        <p className="text-[11px] text-muted-foreground">{date}</p>
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="h-11 w-11 shrink-0"
        aria-label="اليوم التالي"
        onClick={() => onOffsetChange(1)}
      >
        <ChevronLeft className="h-5 w-5" />
      </Button>

      <div className="flex w-full flex-wrap gap-2 sm:w-auto">
        {!isToday ? (
          <Button
            variant="outline"
            size="sm"
            className="h-11 flex-1 sm:flex-none"
            onClick={onToday}
          >
            اليوم
          </Button>
        ) : null}

        {weekLink}

        <Button
          variant="outline"
          size="sm"
          className="h-11 flex-1 gap-1.5 sm:flex-none"
          disabled={refreshing}
          onClick={onRefresh}
        >
          <RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          <span>تحديث</span>
        </Button>
      </div>
    </div>
  );
}
