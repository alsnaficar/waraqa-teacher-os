import { DAYS, type DayKey, type Lesson } from "./types";
import { LessonCard } from "./lesson-card";
import type { LessonOverrideScope } from "@/features/planner/services/overrides";

interface PeriodRowProps {
  period: number;
  periodLabel: string;
  periodTime: string;
  lessonAt: (day: DayKey, period: number) => Lesson | undefined;
  onChangeLesson: (lesson: Lesson, newTitle: string, scope: LessonOverrideScope) => void;
}

export function PeriodRow({
  period,
  periodLabel,
  periodTime,
  lessonAt,
  onChangeLesson,
}: PeriodRowProps) {
  return (
    <>
      <div className="flex h-full min-h-[58px] flex-col items-center justify-center gap-0.5 border-b border-l border-border/70 bg-muted/40 p-0 text-center sm:min-h-[70px] min-w-0 overflow-hidden">
        <span
          className="text-[7.5px] font-bold text-foreground sm:text-[8.5px] leading-none whitespace-nowrap"
          style={{ writingMode: "vertical-rl" }}
        >
          {periodLabel}
        </span>
        <span
          className="text-[6px] text-muted-foreground sm:text-[7px] leading-none whitespace-nowrap"
          style={{ writingMode: "vertical-rl" }}
        >
          {periodTime}
        </span>
      </div>
      {DAYS.map((day) => {
        const lesson = lessonAt(day.key, period);
        return (
          <div
            key={`${day.key}-${period}`}
            className="h-[58px] border-b border-l border-border/70 p-0 sm:h-[70px] sm:p-0.5"
          >
            {lesson ? <LessonCard lesson={lesson} onChangeLesson={onChangeLesson} /> : null}
          </div>
        );
      })}
    </>
  );
}
