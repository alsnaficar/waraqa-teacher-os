import { Link } from "@tanstack/react-router";
import { CalendarRange, Sparkles } from "lucide-react";

import { Button } from "@/shared/ui/button";

export const TIMETABLE_PREP_TODAY_LABEL = "تحضير اليوم";
export const TIMETABLE_PREP_WEEK_LABEL = "تحضير الأسبوع";

/**
 * Preparation entry points that belong to the timetable (/planner) experience.
 * Links to existing routes — no new destinations, no BottomNav item.
 */
export function TimetablePreparationActions() {
  return (
    <div
      className="flex w-full flex-wrap items-stretch gap-2 sm:gap-3"
      dir="rtl"
      data-testid="timetable-preparation-actions"
    >
      <Button
        asChild
        variant="outline"
        className="min-h-11 flex-1 gap-2 rounded-xl border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-800 dark:border-blue-800/30 dark:bg-blue-900/20 dark:text-blue-400 sm:flex-none sm:min-w-[10.5rem]"
      >
        <Link to="/lesson-sessions">
          <Sparkles className="h-4 w-4 shrink-0" />
          {TIMETABLE_PREP_TODAY_LABEL}
        </Link>
      </Button>
      <Button
        asChild
        variant="outline"
        className="min-h-11 flex-1 gap-2 rounded-xl border-pink-200 bg-pink-50 text-pink-700 hover:bg-pink-100 hover:text-pink-800 dark:border-pink-800/30 dark:bg-pink-900/20 dark:text-pink-400 sm:flex-none sm:min-w-[10.5rem]"
      >
        <Link to="/weekly-preparation">
          <CalendarRange className="h-4 w-4 shrink-0" />
          {TIMETABLE_PREP_WEEK_LABEL}
        </Link>
      </Button>
    </div>
  );
}
