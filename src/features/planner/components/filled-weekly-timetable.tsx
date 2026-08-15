/**
 * Family C filled weekly planner (6a8687c → 9340e56).
 * Uses teacher timetable slots + lesson sessions. Not the 5db3207 slot-CRUD UI.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { useQueries, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
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
  School,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { RadioGroup, RadioGroupItem } from "@/shared/ui/radio-group";
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
import { WeeklyLessonOptionsProvider } from "@/features/teacher-timetable/components/weekly-lesson-options-context";

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

function getWeekDatesForOffset(weekOffset: number): string[] {
  const { sunday } = getWeekRange(weekOffset);

  return Array.from({ length: 5 }, (_, index) => {
    const date = new Date(sunday);
    date.setDate(sunday.getDate() + index);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  });
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
      className="mb-3 min-w-0 w-full max-w-full overflow-x-auto rounded-lg border bg-card px-3 py-2 shadow-sm md:overflow-visible [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      dir="rtl"
    >
      <div className="flex w-max min-w-full flex-nowrap items-center justify-center gap-x-4 md:w-full md:flex-wrap md:gap-y-2">
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

const weekHeaderActionBtnClass =
  "h-11 min-h-[44px] w-full min-w-0 gap-1 rounded-xl px-1.5 text-[11px] leading-tight whitespace-normal sm:px-2 sm:text-xs";

function WeekHeaderPrepGroup({
  children,
  onDelete,
}: {
  children: ReactNode;
  onDelete: () => void;
}) {
  return (
    <div className="flex min-w-0 w-full flex-col items-stretch gap-1.5 md:w-44">
      {children}
      <Button
        variant="outline"
        size="sm"
        className={`${weekHeaderActionBtnClass} border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-800`}
        onClick={onDelete}
      >
        <Trash2 className="h-3.5 w-3.5 shrink-0" />
        حذف
      </Button>
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
  const onComingSoon = (label: string) => toast(`${label} — قريباً`);
  const [attendanceMode, setAttendanceMode] = useState<"in_person" | "remote">("in_person");

  return (
    <div
      className="flex min-w-0 w-full max-w-full flex-col gap-2 overflow-x-hidden md:grid md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-center md:gap-4"
      dir="rtl"
    >
      <div className="order-1 flex min-w-0 w-full flex-col items-center md:order-2">
        <div className="flex w-full min-w-0 items-center justify-between gap-1 sm:gap-2 md:justify-center">
          <Button
            variant="outline"
            size="sm"
            className="h-11 min-h-[44px] min-w-[44px] w-11 shrink-0 px-0 lg:w-auto lg:gap-1 lg:px-2"
            onClick={onPreviousWeek}
            aria-label="الأسبوع السابق"
          >
            <ChevronRight className="h-4 w-4" />
            <span className="hidden lg:inline">السابق</span>
          </Button>

          <CardTitle className="flex min-w-0 flex-1 flex-col items-center px-1 text-center">
            <span className="flex min-w-0 max-w-full flex-wrap items-center justify-center gap-1.5">
              <span className="text-sm font-bold sm:text-base">الجدول الأسبوعي</span>
              <Badge variant="secondary">{entriesCount} حصص</Badge>
              {switching ? (
                <span
                  className="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"
                  aria-label="جاري تحميل الأسبوع"
                  aria-live="polite"
                />
              ) : null}
            </span>
            <span className="mt-1 text-[11px] font-normal leading-snug text-muted-foreground">
              من {weekRange.hijriStart} إلى {weekRange.hijriEnd} هـ
            </span>
            <span className="text-[10px] font-normal leading-snug text-muted-foreground/80">
              من {weekRange.gregorianStart} إلى {weekRange.gregorianEnd} م
            </span>
          </CardTitle>

          <Button
            variant="outline"
            size="sm"
            className="h-11 min-h-[44px] min-w-[44px] w-11 shrink-0 px-0 lg:w-auto lg:gap-1 lg:px-2"
            onClick={onNextWeek}
            aria-label="الأسبوع التالي"
          >
            <span className="hidden lg:inline">التالي</span>
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-2 flex w-full min-w-0 max-w-full flex-col items-center md:mt-3">
          <div className="flex w-full min-w-0 max-w-[21rem] flex-col items-center">
            <span className="text-xs font-semibold text-foreground">نشر الخطة</span>
            <div className="mt-1 w-full min-w-0 overflow-hidden rounded-xl border border-border/70 md:mt-1.5">
              <div className="grid min-w-0 w-full grid-cols-2 items-stretch">
                <Button
                  variant="outline"
                  size="sm"
                  className={`${weekHeaderActionBtnClass} rounded-none border-0 shadow-none bg-emerald-50 text-emerald-800 hover:bg-emerald-100 hover:text-emerald-900 dark:bg-emerald-900/20 dark:text-emerald-400`}
                  onClick={() => onComingSoon("منصة مدرستي")}
                >
                  <School className="h-3.5 w-3.5 shrink-0" />
                  منصة مدرستي
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className={`${weekHeaderActionBtnClass} rounded-none border-0 shadow-none border-s border-border/70 bg-teal-50 text-teal-800 hover:bg-teal-100 hover:text-teal-900 dark:bg-teal-900/20 dark:text-teal-400`}
                  onClick={() => onComingSoon("المدير وولي الأمر")}
                >
                  <Users className="h-3.5 w-3.5 shrink-0" />
                  المدير وولي الأمر
                </Button>
              </div>

              <RadioGroup
                dir="rtl"
                value={attendanceMode}
                onValueChange={(value) =>
                  setAttendanceMode(value === "remote" ? "remote" : "in_person")
                }
                className="grid min-w-0 w-full grid-cols-2 items-stretch gap-0 border-t border-border/70"
                aria-label="نمط الحضور"
              >
                <label
                  htmlFor="weekly-attendance-in-person"
                  dir="ltr"
                  className="inline-flex min-h-[44px] min-w-0 items-center justify-center gap-2 px-1.5"
                >
                  <RadioGroupItem
                    id="weekly-attendance-in-person"
                    value="in_person"
                    className="border-teal-600 text-teal-700"
                  />
                  <span className="text-sm leading-tight whitespace-normal">حضوري</span>
                </label>
                <label
                  htmlFor="weekly-attendance-remote"
                  dir="ltr"
                  className="inline-flex min-h-[44px] min-w-0 items-center justify-center gap-2 border-s border-border/70 px-1.5"
                >
                  <RadioGroupItem
                    id="weekly-attendance-remote"
                    value="remote"
                    className="border-teal-600 text-teal-700"
                  />
                  <span className="text-sm leading-tight whitespace-normal">عن بعد</span>
                </label>
              </RadioGroup>
            </div>
          </div>
        </div>
      </div>

      <div className="order-2 grid min-w-0 w-full grid-cols-2 gap-3 md:contents">
        <div className="min-w-0 md:order-1 md:justify-self-start">
          <WeekHeaderPrepGroup onDelete={() => onComingSoon("حذف اليوم")}>
            <Button
              asChild
              variant="outline"
              size="sm"
              className={`${weekHeaderActionBtnClass} border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-800 dark:border-blue-800/30 dark:bg-blue-900/20 dark:text-blue-400`}
            >
              <Link to="/lesson-sessions">
                <Sparkles className="h-3.5 w-3.5 shrink-0" />
                تحضير اليوم
              </Link>
            </Button>
          </WeekHeaderPrepGroup>
        </div>

        <div className="min-w-0 md:order-3 md:justify-self-end">
          <WeekHeaderPrepGroup onDelete={() => onComingSoon("حذف الأسبوع")}>
            <Button
              asChild
              variant="outline"
              size="sm"
              className={`${weekHeaderActionBtnClass} border-pink-200 bg-pink-50 text-pink-700 hover:bg-pink-100 hover:text-pink-800 dark:border-pink-800/30 dark:bg-pink-900/20 dark:text-pink-400`}
            >
              <Link to="/weekly-preparation">
                <Sparkles className="h-3.5 w-3.5 shrink-0" />
                تحضير الأسبوع
              </Link>
            </Button>
          </WeekHeaderPrepGroup>
        </div>
      </div>
    </div>
  );
}

export function FilledWeeklyTimetable() {
  const queryClient = useQueryClient();
  const { loading, entries, error } = useTeacherTimetable();
  const [weekOffset, setWeekOffset] = useState(0);

  const weekRange = useMemo(() => getWeekRange(weekOffset), [weekOffset]);
  const weekDates = useMemo(() => getWeekDatesForOffset(weekOffset), [weekOffset]);

  const existingSessionsQuery = useQuery({
    queryKey: ["planner-weekly-session-slots", ...weekDates],
    staleTime: 30_000,
    enabled: loading || entries.length > 0,
    placeholderData: keepPreviousData,
    queryFn: () => LessonSessionService.getSessionsByDates(weekDates),
  });

  useEffect(() => {
    if (!existingSessionsQuery.isSuccess || existingSessionsQuery.isPlaceholderData) {
      return;
    }

    for (const adjacentOffset of [weekOffset - 1, weekOffset + 1]) {
      const adjacentWeekDates = getWeekDatesForOffset(adjacentOffset);

      void queryClient.prefetchQuery({
        queryKey: ["planner-weekly-session-slots", ...adjacentWeekDates],
        staleTime: 30_000,
        queryFn: () => LessonSessionService.getSessionsByDates(adjacentWeekDates),
      });
    }
  }, [
    queryClient,
    weekOffset,
    existingSessionsQuery.isSuccess,
    existingSessionsQuery.isPlaceholderData,
  ]);

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
  const weeklyLessonSessionIds = [
    ...new Set(sessions.map((session) => session.id).filter(Boolean)),
  ].sort();

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
    <WeeklyLessonOptionsProvider lessonSessionIds={weeklyLessonSessionIds}>
      <div className="min-w-0 w-full max-w-[100dvw] overflow-x-hidden">
      <Card className="min-w-0 overflow-hidden">
        <CardHeader className="min-w-0 overflow-x-hidden border-b bg-muted/30 px-3 py-2 sm:px-4 md:p-6">
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
    </WeeklyLessonOptionsProvider>
  );
}
