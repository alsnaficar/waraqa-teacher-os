import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";

import type { TeacherTimetableEntry } from "../types";
import { getDefaultTimetableDay, TIMETABLE_DAYS } from "./teacher-timetable.constants";
import { TeacherTimetableLessonCard } from "./teacher-timetable-lesson-card";

function formatDayDates(date: Date) {
  const hijri = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const gregorian = new Intl.DateTimeFormat("ar-SA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return {
    hijri: hijri.format(date),
    gregorian: gregorian.format(date),
  };
}

interface TeacherWeeklyTimetableMobileProps {
  weekSunday: Date;
  maxPeriod: number;
  getEntry: (day: number, period: number) => TeacherTimetableEntry | undefined;
  sessionBySlot: Map<string, { id: string; lessonLocked: boolean }>;
  onAddSlot?: (dayOfWeek: number, period: number) => void;
  onEditSlot?: (entry: TeacherTimetableEntry) => void;
  onDeleteSlot?: (entry: TeacherTimetableEntry) => void;
}

export function TeacherWeeklyTimetableMobile({
  weekSunday,
  maxPeriod,
  getEntry,
  sessionBySlot,
  onAddSlot,
  onEditSlot,
  onDeleteSlot,
}: TeacherWeeklyTimetableMobileProps) {
  const defaultDay = String(getDefaultTimetableDay());

  return (
    <div className="min-w-0 lg:hidden">
      <Tabs defaultValue={defaultDay} className="w-full min-w-0" dir="rtl">
        <div className="min-w-0 overflow-x-auto px-3 pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <TabsList className="inline-flex h-auto min-h-11 w-max min-w-full justify-stretch gap-1 rounded-xl border bg-card p-1 shadow-sm">
            {TIMETABLE_DAYS.map((day, index) => {
              const dayDate = new Date(weekSunday);
              dayDate.setDate(weekSunday.getDate() + index);
              const dayDates = formatDayDates(dayDate);

              return (
                <TabsTrigger
                  key={day.value}
                  value={String(day.value)}
                  className="flex min-h-11 min-w-[4.5rem] flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-2 leading-none data-[state=active]:bg-emerald-50 data-[state=active]:text-emerald-700"
                >
                  <span className="text-xs font-bold sm:text-sm">{day.label}</span>
                  <span className="text-[10px] text-muted-foreground">{dayDates.hijri}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        {TIMETABLE_DAYS.map((day) => (
          <TabsContent
            key={day.value}
            value={String(day.value)}
            className="mt-0 px-3 pb-3 outline-none"
          >
            <div className="grid min-w-0 grid-cols-1 items-start gap-2.5">
              {Array.from({ length: maxPeriod }, (_, index) => index + 1).map((period) => {
                const entry = getEntry(day.value, period);
                const lessonSession = entry
                  ? sessionBySlot.get(`${entry.dayOfWeek}-${entry.period}`)
                  : undefined;

                return (
                  <TeacherTimetableLessonCard
                    key={period}
                    period={period}
                    entry={entry}
                    lessonSession={lessonSession}
                    onAdd={onAddSlot ? () => onAddSlot(day.value, period) : undefined}
                    onEdit={entry && onEditSlot ? () => onEditSlot(entry) : undefined}
                    onDelete={entry && onDeleteSlot ? () => onDeleteSlot(entry) : undefined}
                  />
                );
              })}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
