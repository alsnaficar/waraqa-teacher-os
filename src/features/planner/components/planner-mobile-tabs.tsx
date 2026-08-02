import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/shared/ui/tabs";
import { addDays, formatDayDate } from "@/shared/utils/date";
import { DAYS, PERIODS, PERIOD_LABELS, PERIOD_TIMES, type DayKey, type Lesson } from "./types";
import { LessonCard } from "./lesson-card";
import type { LessonOverrideScope } from "@/features/planner/services/overrides";

interface PlannerMobileTabsProps {
  weekStart: Date;
  lessonAt: (day: DayKey, period: number) => Lesson | undefined;
  onChangeLesson: (lesson: Lesson, newTitle: string, scope: LessonOverrideScope) => void;
}

export function PlannerMobileTabs({ weekStart, lessonAt, onChangeLesson }: PlannerMobileTabsProps) {
  return (
    <div className="md:hidden">
      <Tabs defaultValue={DAYS[0].key} className="w-full" dir="rtl">
        <TabsList className="w-full flex justify-between h-auto p-0.5 bg-card border shadow-sm rounded-xl mb-1.5 overflow-hidden">
          {DAYS.map((d, i) => (
            <TabsTrigger
              key={d.key}
              value={d.key}
              className="flex flex-col items-center justify-center flex-1 py-1 px-0 min-h-0 rounded-lg data-[state=active]:bg-emerald-50 data-[state=active]:text-emerald-700 leading-none gap-0.5 min-w-0 w-0"
            >
              <span className="text-[10px] sm:text-[11px] font-bold">{d.label}</span>
              <span className="text-[8px] sm:text-[9px] text-muted-foreground">
                {formatDayDate(addDays(weekStart, i)).split(" ")[0]}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>

        {DAYS.map((d) => (
          <TabsContent key={d.key} value={d.key} className="mt-0 outline-none">
            <div className="flex flex-col gap-1">
              {PERIODS.map((p, pi) => {
                const lesson = lessonAt(d.key, p);
                if (!lesson) return null;
                return (
                  <div
                    key={p}
                    className="flex flex-col border border-border/70 rounded-xl bg-card shadow-sm overflow-hidden"
                  >
                    <div className="flex items-center justify-between bg-muted/40 px-2 py-1 border-b border-border/70">
                      <span className="text-[10px] font-bold">{PERIOD_LABELS[pi]}</span>
                      <span className="text-[8px] text-muted-foreground">{PERIOD_TIMES[pi]}</span>
                    </div>
                    <div className="p-1 min-h-[58px]">
                      <LessonCard lesson={lesson} onChangeLesson={onChangeLesson} />
                    </div>
                  </div>
                );
              })}
              {/* Empty state if no lessons for the day */}
              {!PERIODS.some((p) => lessonAt(d.key, p)) && (
                <div className="py-8 text-center text-sm text-muted-foreground bg-card border border-border/70 rounded-xl">
                  لا يوجد دروس في هذا اليوم
                </div>
              )}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
