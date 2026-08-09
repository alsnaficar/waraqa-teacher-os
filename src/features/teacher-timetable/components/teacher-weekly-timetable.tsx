import { BookOpen, CalendarDays, Clock, MapPin } from "lucide-react";

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

function formatTime(value?: string) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleTimeString("ar-SA", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function TeacherWeeklyTimetable() {
  const { loading, entries, error } = useTeacherTimetable();

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

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {DAYS.map((day) => {
        const dayEntries = entries
          .filter((entry) => entry.dayOfWeek === day.value)
          .sort((a, b) => a.period - b.period);

        return (
          <Card key={day.value} className="overflow-hidden">
            <CardHeader className="border-b bg-muted/30">
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarDays className="h-4 w-4" />
                {day.label}
                <Badge variant="secondary" className="mr-auto">
                  {dayEntries.length} حصص
                </Badge>
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-3 p-3">
              {dayEntries.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">لا توجد حصص</div>
              ) : (
                dayEntries.map((entry) => {
                  const startsAt = formatTime(entry.startsAt);
                  const endsAt = formatTime(entry.endsAt);

                  return (
                    <div key={entry.id} className="rounded-xl border bg-background p-3 shadow-sm">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <Badge className="font-bold">الحصة {entry.period}</Badge>

                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <BookOpen className="h-3.5 w-3.5" />
                          <span>{entry.subject}</span>
                        </div>
                      </div>

                      <div className="space-y-1.5 text-sm">
                        <div className="font-bold">{entry.grade}</div>

                        <div className="text-muted-foreground">الفصل: {entry.className}</div>

                        {(startsAt || endsAt) && (
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Clock className="h-3.5 w-3.5" />
                            <span>
                              {startsAt ?? "--"} {endsAt ? `- ${endsAt}` : ""}
                            </span>
                          </div>
                        )}

                        {entry.classroom && (
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <MapPin className="h-3.5 w-3.5" />
                            <span>{entry.classroom}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
