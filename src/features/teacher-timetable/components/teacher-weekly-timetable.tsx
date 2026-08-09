import { useState } from "react";

import { useQueries } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import {
  BookOpen,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileCheck2,
  Clock,
  FlaskConical,
  Globe,
  KeyRound,
  MapPin,
  PlaySquare,
  Trash2,
} from "lucide-react";

import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Skeleton } from "@/shared/ui/skeleton";

import { useTeacherTimetable } from "../hooks/useTeacherTimetable";
import { LessonSessionService } from "@/features/lesson-sessions/services/lesson-session.service";

const DAYS = [
  { value: 0, label: "الأحد" },
  { value: 1, label: "الاثنين" },
  { value: 2, label: "الثلاثاء" },
  { value: 3, label: "الأربعاء" },
  { value: 4, label: "الخميس" },
];

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

function formatTime(value?: string) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleTimeString("ar-SA", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function LessonActions({ lessonSessionId }: { lessonSessionId?: string }) {
  return (
    <div className="mt-2 flex flex-row-reverse items-center justify-center gap-1.5" dir="rtl">
      {lessonSessionId ? (
        <Link to="/ai-lesson-plan" search={{ lessonSessionId } as never} aria-label="تحضير الدرس">
          <BookOpen className="h-3.5 w-3.5 text-emerald-600" />
        </Link>
      ) : (
        <BookOpen className="h-3.5 w-3.5 text-muted-foreground/40" aria-label="تحضير" />
      )}

      <FileCheck2 className="h-3.5 w-3.5 text-cyan-600" aria-label="واجب" />

      <FlaskConical className="h-3.5 w-3.5 text-purple-500" aria-label="اختبار" />

      <ClipboardList className="h-3.5 w-3.5 text-orange-500" aria-label="ورقة عمل" />

      <Globe className="h-3.5 w-3.5 text-blue-500" aria-label="إثراء" />

      <PlaySquare className="h-3.5 w-3.5 text-indigo-500" aria-label="الوسائل" />

      <Trash2 className="h-3.5 w-3.5 text-red-500" aria-label="حذف" />
    </div>
  );
}

function PlannerLegend() {
  const items = [
    { icon: BookOpen, label: "تحضير الدرس", className: "text-emerald-600" },
    { icon: FileCheck2, label: "واجب", className: "text-cyan-600" },
    { icon: FlaskConical, label: "اختبار", className: "text-purple-500" },
    { icon: ClipboardList, label: "ورقة عمل", className: "text-orange-500" },
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
export function TeacherWeeklyTimetable() {
  const { loading, entries, error } = useTeacherTimetable();
  const [weekOffset, setWeekOffset] = useState(0);

  const weekRange = getWeekRange(weekOffset);

  const weekDates = Array.from({ length: 5 }, (_, index) => {
    const date = new Date(weekRange.sunday);
    date.setDate(weekRange.sunday.getDate() + index);
    return date.toISOString().slice(0, 10);
  });

  const sessionQueries = useQueries({
    queries: weekDates.map((date) => ({
      queryKey: ["lesson-sessions", date],
      queryFn: () => LessonSessionService.ensureSessionsForDate(date),
      staleTime: 30_000,
    })),
  });

  const sessions = sessionQueries.flatMap((query) => query.data?.sessions ?? []);

  const sessionBySlot = new Map(
    sessions.map((session) => [`${session.dayOfWeek}-${session.periodNumber}`, session]),
  );

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {DAYS.map((day) => (
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
  if (entries.length === 0) {
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
    <Card className="overflow-hidden">
      <CardHeader className="border-b bg-muted/30">
        <div className="flex items-center justify-between gap-2" dir="rtl">
          <Button
            variant="outline"
            size="sm"
            className="h-9 shrink-0 gap-1 px-2"
            onClick={() => setWeekOffset((value) => value - 1)}
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
            className="h-9 shrink-0 gap-1 px-2"
            onClick={() => setWeekOffset((value) => value + 1)}
            aria-label="الأسبوع التالي"
          >
            <span className="hidden sm:inline">التالي</span>
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-2 flex justify-center">
          <Badge variant="secondary">{entries.length} حصص</Badge>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="px-3 pt-2">
          <PlannerLegend />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] table-fixed border-collapse text-right" dir="rtl">
            <thead>
              <tr>
                <th className="w-20 border-b border-l bg-muted/70 p-2 text-center text-sm font-bold">
                  الحصة
                </th>

                {DAYS.map((day, index) => {
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

                  {DAYS.map((day) => {
                    const entry = getEntry(day.value, period);

                    return (
                      <td
                        key={day.value}
                        className="h-24 border-b border-l p-1.5 align-top last:border-l-0"
                      >
                        {entry ? (
                          <div className="flex h-full flex-col items-center justify-center rounded-lg border bg-card p-2 shadow-sm">
                            <div className="text-center text-sm font-bold leading-tight">
                              {entry.subject}
                            </div>

                            <div className="mt-1 text-[11px] text-muted-foreground">
                              الفصل: {entry.className}
                              <LessonActions
                                lessonSessionId={
                                  sessionBySlot.get(`${entry.dayOfWeek}-${entry.period}`)?.id
                                }
                              />
                            </div>
                            <LessonActions />
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
      </CardContent>
    </Card>
  );
}
