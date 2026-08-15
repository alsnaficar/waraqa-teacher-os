import { Link } from "@tanstack/react-router";
import { CalendarDays, ChevronLeft, ChevronRight, Megaphone, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { formatHijri } from "@/shared/utils/date";

interface PlannerToolbarProps {
  weekOffset: number;
  setWeekOffset: React.Dispatch<React.SetStateAction<number>>;
  weekStart: Date;
  weekEnd: Date;
  onComingSoon: (label: string) => void;
  onPublishClick: () => void;
}

export function PlannerToolbar({
  setWeekOffset,
  weekStart,
  weekEnd,
  onComingSoon,
  onPublishClick,
}: PlannerToolbarProps) {
  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-start gap-2 sm:gap-3 bg-card p-2 md:p-3 rounded-xl border border-border/70 shadow-sm w-full">
      {/* Right side (RTL): Date Navigation - زر السابق */}
      <div className="flex justify-start">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setWeekOffset((w) => w - 1)}
          onTouchStart={() => {}}
          className="h-10 w-[72px] sm:w-24 shrink-0 px-1 sm:px-3 text-[11px] sm:text-xs bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground shadow-sm border-border/50 active:!bg-blue-600 active:!text-white active:!border-blue-600 active:shadow-[0_0_15px_rgba(59,130,246,0.6)] active:scale-[0.96] transition-all group touch-manipulation select-none"
        >
          <ChevronRight className="h-4 w-4 ml-0.5 opacity-70 group-active:text-white transition-colors" />
          السابق
        </Button>
      </div>

      {/* Middle Column (Centered Title, Date, and buttons) */}
      <div className="flex flex-col items-center justify-center text-center px-1 min-w-0 w-full">
        <div className="h-10 flex items-center justify-center">
          <span className="text-sm font-bold text-foreground whitespace-nowrap">
            الخطة الأسبوعية
          </span>
        </div>
        <div className="flex items-center justify-center gap-1 text-[10px] sm:text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800/30 px-2.5 py-0.5 rounded-md whitespace-nowrap mb-2.5">
          <CalendarDays className="h-3 w-3 opacity-70 shrink-0" />
          <span>{formatHijri(weekStart)}</span>
          <span className="opacity-50 shrink-0">-</span>
          <span>{formatHijri(weekEnd)}</span>
        </div>

        {/* Action buttons group with a fixed gap - flex-nowrap on tablet & desktop, wrapping on mobile */}
        <div className="flex flex-wrap sm:flex-nowrap items-center justify-center gap-1 sm:gap-1.5 md:gap-2 w-full">
          <Button
            asChild
            variant="outline"
            size="sm"
            className="gap-1 sm:gap-1.5 h-9 sm:h-8 px-2 sm:px-2.5 md:px-3 whitespace-nowrap text-[11px] sm:text-xs bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 hover:text-blue-800 rounded-xl dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800/30"
          >
            <Link to="/lesson-sessions">
              <Sparkles className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              تحضير اليوم
            </Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1 sm:gap-1.5 h-9 sm:h-8 px-2 sm:px-2.5 md:px-3 whitespace-nowrap text-[11px] sm:text-xs bg-red-50 text-red-700 border-red-200 hover:bg-red-100 hover:text-red-800 rounded-xl"
            onClick={() => onComingSoon("حذف اليوم")}
          >
            <Trash2 className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
            حذف
          </Button>
          <Button
            asChild
            variant="outline"
            size="sm"
            className="gap-1 sm:gap-1.5 h-9 sm:h-8 px-2 sm:px-2.5 md:px-3 whitespace-nowrap text-[11px] sm:text-xs bg-pink-50 text-pink-700 border-pink-200 hover:bg-pink-100 hover:text-pink-800 rounded-xl dark:bg-pink-900/20 dark:text-pink-400 dark:border-pink-800/30"
          >
            <Link to="/weekly-preparation">
              <Sparkles className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              تحضير الأسبوع
            </Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1 sm:gap-1.5 h-9 sm:h-8 px-2 sm:px-2.5 md:px-3 whitespace-nowrap text-[11px] sm:text-xs bg-red-50 text-red-700 border-red-200 hover:bg-red-100 hover:text-red-800 rounded-xl"
            onClick={() => onComingSoon("حذف الأسبوع")}
          >
            <Trash2 className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
            حذف
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1 sm:gap-1.5 h-9 sm:h-8 px-2 sm:px-2.5 md:px-3 whitespace-nowrap text-[11px] sm:text-xs bg-green-50 text-green-700 border-green-200 hover:bg-green-100 hover:text-green-800 rounded-xl"
            onClick={onPublishClick}
          >
            <Megaphone className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
            نشر الخطة
          </Button>
        </div>
      </div>

      {/* Left side (RTL): زر التالي */}
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setWeekOffset((w) => w + 1)}
          onTouchStart={() => {}}
          className="h-10 w-[72px] sm:w-24 shrink-0 px-1 sm:px-3 text-[11px] sm:text-xs bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground shadow-sm border-border/50 active:!bg-blue-600 active:!text-white active:!border-blue-600 active:shadow-[0_0_15px_rgba(59,130,246,0.6)] active:scale-[0.96] transition-all group touch-manipulation select-none"
        >
          التالي
          <ChevronLeft className="h-4 w-4 mr-0.5 opacity-70 group-active:text-white transition-colors" />
        </Button>
      </div>
    </div>
  );
}
