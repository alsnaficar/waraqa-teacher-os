/**
 * Family C filled weekly planner (6a8687c → 9340e56).
 * Uses teacher timetable slots + lesson sessions. Not the 5db3207 slot-CRUD UI.
 */
import { useMemo, useState } from "react";

import { useQueries, useQuery, keepPreviousData } from "@tanstack/react-query";
import {
  BookOpen,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  FileCheck2,
  FlaskConical,
  Globe,
  KeyRound,
  Lightbulb,
  PlaySquare,
  Trash2,
} from "lucide-react";

import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Skeleton } from "@/shared/ui/skeleton";

import { useTeacherTimetable } from "@/features/teacher-timetable/hooks/useTeacherTimetable";
import { LessonSessionService } from "@/features/lesson-sessions/services/lesson-session.service";
import {
  LessonActions,
  LessonSelector,
  PreparationStatusIcon,
} from "@/features/teacher-timetable/components/teacher-timetable-lesson-controls";
import { TIMETABLE_DAYS } from "@/features/teacher-timetable/components/teacher-timetable.constants";
import { TeacherWeeklyTimetableMobile } from "@/features/teacher-timetable/components/teacher-weekly-timetable-mobile";

function getWeekRange(weekOffset = 0) {
  const today = new Date();

  const sunday = new Date(today);
  sunday.setHours(0, 0, 0, 0);
  sunday.setDate(today.getDate() - today.getDay() + weekOffset * 7);

  const thursday = new Date(sunday);
  thursday.setDate(sunday.getDate() + 4);

  const hijriFormatter = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const gregorianFormatter = new Intl.DateTimeFormat("ar-SA", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return {
    sunday,
    thursday,
    hijriStart: hijriFormatter.format(sunday),
    hijriEnd: hijriFormatter.format(thursday),
    gregorianStart: gregorianFormatter.format(sunday),
    gregorianEnd: gregorianFormatter.format(thursday),
  };
}

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

function PlannerLegend() {
  const items = [
    { icon: BookOpen, label: "تحضير الدرس", className: "text-emerald-600" },
    { icon: FileCheck2, label: "واجب", className: "text-cyan-600" },
    { icon: FlaskConical, label: "اختبار", className: "text-purple-500" },
    { icon: Lightbulb, label: "النشاط", className: "text-orange-500" },
    { icon: Globe, label: "إثراء", className: "text-blue-500" },
    { icon: PlaySquare, label: "الوسائل", className: "text-indigo-500" },
    { icon: Trash2, label: "حذف", className: "text-red-500" },
  ];

  return (
    <div
      className="mb-3 flex w-full items-center justify-center rounded-lg border bg-card px-3 py-2 shadow-sm"
      dir="rtl"
    >
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-1.5 text-[11px] font-bold text-foreground">
          <KeyRound className="h-4 w-4 text-emerald-700" />
          <span>مفتاح الرموز</span>
        </div>

        <span className="hidden h-6 w-px bg-border sm:block" />

        {items.map(({ icon: Icon, label, className }) => (
          <div
            key={label}
            className="flex min-w-[52px] flex-col items-center justify-center gap-0.5"
          >
            <Icon className={`h-4 w-4 ${className}`} />
            <span className="text-[10px] font-medium text-muted-foreground whitespace-nowrap">
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TimetableWeekHeader({
  weekRange,
  entriesCount,
  switching,
  onPreviousWeek,
  onNextWeek,
}: {
  weekRange: ReturnType<typeof getWeekRange>;
  entriesCount: number;
  switching: boolean;
  onPreviousWeek: () => void;
  onNextWeek: () => void;
}) {
  return (
    <>
      <div className="flex items-center justify-between gap-2" dir="rtl">
        <Button
          variant="outline"
          size="sm"
          className="h-11 min-h-[44px] shrink-0 gap-1 px-2"
          onClick={onPreviousWeek}
          aria-label="الأسبوع السابق"
        >
          <ChevronRight className="h-4 w-4" />
          <span className="hidden sm:inline">السابق</span>
        </Button>

        <CardTitle className="flex min-w-0 flex-1 flex-col items-center text-center">
          <span className="text-base font-bold">الجدول الأسبوعي</span>
          <span className="mt-1 text-[11px] font-normal text-muted-foreground">
            من {weekRange.hijriStart} إلى {weekRange.hijriEnd} هـ
          </span>
          <span className="text-[10px] font-normal text-muted-foreground/80">
            من {weekRange.gregorianStart} إلى {weekRange.gregorianEnd} م
          </span>
        </CardTitle>

        <Button
          variant="outline"
          size="sm"
          className="h-11 min-h-[44px] shrink-0 gap-1 px-2"
          onClick={onNextWeek}
          aria-label="الأسبوع التالي"
        >
          <span className="hidden sm:inline">التالي</span>
          <ChevronLeft className="h-4 w-4" />
        </Button>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        <Badge variant="secondary">{entriesCount} حصص</Badge>
        {switching ? (
          <span
            className="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"
            aria-label="جاري تحميل الأسبوع"
            aria-live="polite"
          />
        ) : null}
      </div>
    </>
  );
}

export function FilledWeeklyTimetable() {
  const { loading, entries, error } = useTeacherTimetable();
  const [weekOffset, setWeekOffset] = useState(0);

  const weekRange = useMemo(() => getWeekRange(weekOffset), [weekOffset]);

  const weekDates = useMemo(() => {
    return Array.from({ length: 5 }, (_, index) => {
      const date = new Date(weekRange.sunday);
      date.setDate(weekRange.sunday.getDate() + index);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");

      return `${year}-${month}-${day}`;
    });
  }, [weekRange.sunday]);

  const existingSessionsQuery = useQuery({
    queryKey: ["planner-weekly-session-slots", ...weekDates],
    staleTime: 30_000,
    enabled: loading || entries.length > 0,
    placeholderData: keepPreviousData,
    queryFn: () => LessonSessionService.getSessionsByDates(weekDates),
  });

  const datesNeedingEnsure = useMemo(() => {
    if (
      loading ||
      existingSessionsQuery.isPlaceholderData ||
      existingSessionsQuery.isPending ||
      !existingSessionsQuery.data
    ) {
      return [];
    }

    const datesWithSessions = new Set(
      existingSessionsQuery.data.map((session) => session.sessionDate),
    );
    const daysWithSlots = new Set(entries.map((entry) => entry.dayOfWeek));

    return weekDates.filter((date, index) => {
      const dayOfWeek = TIMETABLE_DAYS[index]?.value;
      return (
        dayOfWeek !== undefined &&
        daysWithSlots.has(dayOfWeek) &&
        !datesWithSessions.has(date)
      );
    });
  }, [
    loading,
    existingSessionsQuery.isPlaceholderData,
    existingSessionsQuery.isPending,
    existingSessionsQuery.data,
    entries,
    weekDates,
  ]);

  const ensureQueries = useQueries({
    queries: datesNeedingEnsure.map((date) => ({
      queryKey: ["planner-weekly-session-ensure", date],
      staleTime: 30_000,
      queryFn: () => LessonSessionService.ensureSessionsForDate(date),
    })),
  });

  const sessions = [
    ...(existingSessionsQuery.data ?? []),
    ...ensureQueries.flatMap((query) => query.data?.sessions ?? []),
  ];
  const sessionsPending =
    existingSessionsQuery.isPending || ensureQueries.some((query) => query.isPending);
  const weekSwitchPending = existingSessionsQuery.isPlaceholderData;

  const sessionBySlot = new Map(
    sessions.map((session) => [`${session.dayOfWeek}-${session.periodNumber}`, session]),
  );

  const showLoading =
    loading ||
    (entries.length > 0 && sessionsPending && existingSessionsQuery.data === undefined);

  if (showLoading) {
    return (
      <div className="min-w-0 w-full max-w-[100dvw] space-y-3">
        <div className="lg:hidden space-y-3 px-1">
          <Skeleton className="h-11 w-full rounded-xl" />
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} className="h-40 w-full rounded-xl" />
          ))}
        </div>
        <div className="hidden gap-4 lg:grid lg:grid-cols-3">
          {TIMETABLE_DAYS.map((day) => (
            <Card key={day.value}>
              <CardHeader>
                <Skeleton className="h-5 w-24" />
              </CardHeader>
              <CardContent className="space-y-3">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="font-bold text-destructive">تعذر تحميل الجدول الأسبوعي</p>
          <p className="mt-2 text-sm text-muted-foreground" dir="ltr">
            {error.message}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!loading && entries.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <CalendarDays className="mb-3 h-10 w-10 text-muted-foreground" />
          <h3 className="font-bold">لا يوجد جدول أسبوعي</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            لم يتم تسجيل حصص للمعلم في الجدول التشغيلي حتى الآن.
          </p>
        </CardContent>
      </Card>
    );
  }

  const maxPeriod = 7;

  const getEntry = (day: number, period: number) =>
    entries.find((entry) => entry.dayOfWeek === day && entry.period === period);

  return (
    <div className="min-w-0 w-full max-w-[100dvw] overflow-x-hidden">
      <Card className="min-w-0 overflow-hidden">
        <CardHeader className="border-b bg-muted/30">
          <TimetableWeekHeader
            weekRange={weekRange}
            entriesCount={entries.length}
            switching={weekSwitchPending}
            onPreviousWeek={() => setWeekOffset((value) => value - 1)}
            onNextWeek={() => setWeekOffset((value) => value + 1)}
          />
        </CardHeader>

        <CardContent className="min-w-0 p-0">
          <div className="px-3 pt-2">
            <PlannerLegend />
          </div>

          <TeacherWeeklyTimetableMobile
            weekSunday={weekRange.sunday}
            maxPeriod={maxPeriod}
            getEntry={getEntry}
            sessionBySlot={sessionBySlot}
          />

          <div className="hidden min-w-0 lg:block">
            <div className="min-w-0 overflow-x-auto">
              <table
                className="w-full min-w-[920px] table-fixed border-collapse text-right"
                dir="rtl"
              >
                <thead>
                  <tr>
                    <th className="w-20 border-b border-l bg-muted/70 p-2 text-center text-sm font-bold">
                      الحصة
                    </th>

                    {TIMETABLE_DAYS.map((day, index) => {
                      const dayDate = new Date(weekRange.sunday);
                      dayDate.setDate(weekRange.sunday.getDate() + index);

                      const dayDates = formatDayDates(dayDate);

                      return (
                        <th
                          key={day.value}
                          className="border-b border-l bg-muted/70 p-2 text-center last:border-l-0"
                        >
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="text-sm font-bold">{day.label}</span>

                            <span className="text-[11px] font-medium text-foreground/80">
                              {dayDates.hijri}
                            </span>

                            <span className="text-[10px] font-normal text-muted-foreground">
                              {dayDates.gregorian}
                            </span>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>

                <tbody>
                  {Array.from({ length: maxPeriod }, (_, index) => index + 1).map((period) => (
                    <tr key={period}>
                      <td className="border-b border-l bg-muted/20 p-2 text-center align-middle">
                        <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-lg bg-primary/10 px-2 text-sm font-bold text-primary">
                          {period}
                        </span>
                      </td>

                      {TIMETABLE_DAYS.map((day) => {
                        const entry = getEntry(day.value, period);
                        const lessonSession = entry
                          ? sessionBySlot.get(`${entry.dayOfWeek}-${entry.period}`)
                          : undefined;

                        return (
                          <td
                            key={day.value}
                            className="h-24 border-b border-l p-1.5 align-top last:border-l-0"
                          >
                            {entry ? (
                              <div className="flex h-full min-w-0 max-w-full flex-col items-stretch justify-center overflow-hidden rounded-lg border bg-card p-2 shadow-sm">
                                <div className="flex min-w-0 items-center justify-center gap-1.5">
                                  <PreparationStatusIcon
                                    prepared={Boolean(lessonSession?.lessonLocked)}
                                  />
                                  <div className="min-w-0 truncate text-center text-sm font-bold leading-tight">
                                    {entry.subject}
                                  </div>
                                </div>

                                {lessonSession ? (
                                  <div className="mt-1 w-full min-w-0 max-w-full">
                                    <LessonSelector
                                      lessonSessionId={lessonSession.id}
                                      lessonLocked={lessonSession.lessonLocked}
                                      compact
                                      hideLabel
                                      className="mt-1 w-full min-w-0 max-w-full"
                                    />

                                    <LessonActions
                                      lessonSessionId={lessonSession.id}
                                      compact
                                      className="mt-1.5"
                                    />
                                  </div>
                                ) : null}
                              </div>
                            ) : (
                              <div className="flex h-full items-center justify-center text-xs text-muted-foreground/40">
                                —
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
