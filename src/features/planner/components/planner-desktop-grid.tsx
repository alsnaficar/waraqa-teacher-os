import { Card, CardContent } from "@/shared/ui/card";
import { addDays, formatDayDate } from "@/shared/utils/date";
import { DAYS, PERIODS, PERIOD_LABELS, PERIOD_TIMES, type DayKey, type Lesson } from "./types";
import { HeaderCell } from "./header-cell";
import { PeriodRow } from "./period-row";
import type { LessonOverrideScope } from "@/features/planner/services/overrides";

interface PlannerDesktopGridProps {
  weekStart: Date;
  lessonAt: (day: DayKey, period: number) => Lesson | undefined;
  onChangeLesson: (lesson: Lesson, newTitle: string, scope: LessonOverrideScope) => void;
}

export function PlannerDesktopGrid({
  weekStart,
  lessonAt,
  onChangeLesson,
}: PlannerDesktopGridProps) {
  return (
    <Card className="hidden md:block overflow-hidden">
      <CardContent className="p-0">
        <div
          className="grid min-w-full"
          style={{
            gridTemplateColumns: `minmax(0, 12px) repeat(${DAYS.length}, minmax(0, 1fr))`,
          }}
        >
          {/* Header: period label column first (rightmost in RTL) then day columns */}
          <HeaderCell>
            <span
              className="text-[6px] sm:text-[7px] whitespace-nowrap"
              style={{ writingMode: "vertical-rl" }}
            >
              الحصة
            </span>
          </HeaderCell>
          {DAYS.map((d, i) => (
            <HeaderCell key={d.key}>
              <div className="flex flex-col items-center leading-none gap-0.5">
                <span className="text-[10px] font-bold sm:text-xs">{d.label}</span>
                <span className="text-[8px] font-normal text-muted-foreground sm:text-[9px]">
                  {formatDayDate(addDays(weekStart, i))}
                </span>
              </div>
            </HeaderCell>
          ))}

          {/* Rows: for each period, render the period label then 5 day cells */}
          {PERIODS.map((p, pi) => (
            <PeriodRow
              key={p}
              period={p}
              periodLabel={PERIOD_LABELS[pi]}
              periodTime={PERIOD_TIMES[pi]}
              lessonAt={lessonAt}
              onChangeLesson={onChangeLesson}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
