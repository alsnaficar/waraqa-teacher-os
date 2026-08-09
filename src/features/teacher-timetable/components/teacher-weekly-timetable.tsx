import {
  BookOpen,
  CalendarDays,
  ClipboardList,
  Clock,
  FlaskConical,
  Globe,
  KeyRound,
  MapPin,
  PlaySquare,
  Target,
  Trash2,
} from "lucide-react";

import { Badge } from "@/shared/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Skeleton } from "@/shared/ui/skeleton";

import { useTeacherTimetable } from "../hooks/useTeacherTimetable";

const DAYS = [
  { value: 0, label: "الأحد" },
  { value: 1, label: "الاثنين" },
  { value: 2, label: "الثلاثاء" },
  { value: 3, label: "الأربعاء" },
  { value: 4, label: "الخميس" },
];

function getWeekRange() {
  const today = new Date();

  const sunday = new Date(today);
  sunday.setDate(today.getDate() - today.getDay());

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
    hijriStart: hijriFormatter.format(sunday),
    hijriEnd: hijriFormatter.format(thursday),
    gregorianStart: gregorianFormatter.format(sunday),
    gregorianEnd: gregorianFormatter.format(thursday),
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

function LessonActions() {
  return (
    <div className="mt-2 flex items-center justify-center gap-1.5" dir="ltr">
      <BookOpen className="h-3.5 w-3.5 text-emerald-600" />
      <FlaskConical className="h-3.5 w-3.5 text-purple-500" />
      <ClipboardList className="h-3.5 w-3.5 text-orange-500" />
      <Globe className="h-3.5 w-3.5 text-blue-500" />
      <PlaySquare className="h-3.5 w-3.5 text-indigo-500" />
      <Target className="h-3.5 w-3.5 text-red-500" />
      <Trash2 className="h-3.5 w-3.5 text-red-500" />
    </div>
  );
}

function PlannerLegend() {
  return (
    <div
      className="mb-2 flex w-fit items-center gap-2 rounded-lg border bg-card px-2 py-1 shadow-sm"
      dir="rtl"
    >
      <KeyRound className="h-3.5 w-3.5 text-emerald-700" />
      <span className="text-[10px] font-medium">مفتاح الرموز</span>
      <span className="h-4 w-px bg-border" />
      <BookOpen className="h-3.5 w-3.5 text-emerald-600" />
      <FlaskConical className="h-3.5 w-3.5 text-purple-500" />
      <ClipboardList className="h-3.5 w-3.5 text-orange-500" />
      <Globe className="h-3.5 w-3.5 text-blue-500" />
      <PlaySquare className="h-3.5 w-3.5 text-indigo-500" />
      <Target className="h-3.5 w-3.5 text-red-500" />
      <Trash2 className="h-3.5 w-3.5 text-red-500" />
    </div>
  );
}

export function TeacherWeeklyTimetable() {
  const { loading, entries, error } = useTeacherTimetable();
  const weekRange = getWeekRange();

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
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarDays className="h-4 w-4" />
          <div className="flex flex-col">
            <span>الجدول الأسبوعي</span>
            <span className="mt-0.5 text-[11px] font-normal text-muted-foreground">
              من {weekRange.hijriStart} إلى {weekRange.hijriEnd} هـ
            </span>
            <span className="text-[10px] font-normal text-muted-foreground/80">
              من {weekRange.gregorianStart} إلى {weekRange.gregorianEnd} م
            </span>
          </div>
          <Badge variant="secondary" className="mr-auto">
            {entries.length} حصص
          </Badge>
        </CardTitle>
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

                {DAYS.map((day) => (
                  <th
                    key={day.value}
                    className="border-b border-l bg-muted/70 p-2 text-center text-sm font-bold last:border-l-0"
                  >
                    {day.label}
                  </th>
                ))}
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
