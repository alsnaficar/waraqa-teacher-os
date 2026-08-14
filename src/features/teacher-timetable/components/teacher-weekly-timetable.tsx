import { useState } from "react";

import { useQueries } from "@tanstack/react-query";
import {
  BookOpen,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileCheck2,
  FlaskConical,
  Globe,
  KeyRound,
  Pencil,
  Plus,
  PlaySquare,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { LessonSessionService } from "@/features/lesson-sessions/services/lesson-session.service";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Skeleton } from "@/shared/ui/skeleton";

import { useTeacherTimetable } from "../hooks/useTeacherTimetable";
import { TeacherTimetableService } from "../services/teacher-timetable.service";
import type { TeacherTimetableEntry } from "../types";
import {
  LessonActions,
  LessonSelector,
  PreparationStatusIcon,
} from "./teacher-timetable-lesson-controls";
import { TIMETABLE_DAYS } from "./teacher-timetable.constants";
import { TeacherWeeklyTimetableMobile } from "./teacher-weekly-timetable-mobile";
import {
  entryToFormState,
  TimetableSlotFormDialog,
  type TimetableSlotFormMode,
  type TimetableSlotFormState,
} from "./timetable-slot-form-dialog";

const SESSION_WARN =
  "توجد حصص مؤرخة مرتبطة بهذه الخانة (قد تكون محضّرة أو مقفلة). لن يتم حذفها أو تعديلها. سيتأثر الجدول الأسبوعي فقط، وقد تُستخدم الخانة الجديدة عند إنشاء الحصص المستقبلية.";

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

function TimetableWeekHeader({
  weekRange,
  entriesCount,
  onPreviousWeek,
  onNextWeek,
  onAddSlot,
}: {
  weekRange: ReturnType<typeof getWeekRange>;
  entriesCount: number;
  onPreviousWeek: () => void;
  onNextWeek: () => void;
  onAddSlot: () => void;
}) {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-base sm:text-lg">الجدول الأسبوعي</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" className="min-h-11 gap-1" onClick={onAddSlot}>
            <Plus className="h-4 w-4" />
            إضافة حصة
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-11 w-11"
            onClick={onPreviousWeek}
            aria-label="الأسبوع السابق"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-11 w-11"
            onClick={onNextWeek}
            aria-label="الأسبوع التالي"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <p className="mt-2 text-sm text-muted-foreground">
        {weekRange.hijriStart} — {weekRange.hijriEnd}
      </p>
      <p className="text-xs text-muted-foreground">
        {weekRange.gregorianStart} — {weekRange.gregorianEnd}
      </p>

      <div className="mt-2 flex justify-center">
        <Badge variant="secondary">{entriesCount} حصص</Badge>
      </div>
    </>
  );
}

export function TeacherWeeklyTimetable() {
  const { loading, entries, error, refresh } = useTeacherTimetable();
  const [weekOffset, setWeekOffset] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<TimetableSlotFormMode>("add");
  const [formInitial, setFormInitial] = useState<Partial<TimetableSlotFormState>>({});
  const [editingId, setEditingId] = useState<string | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<TeacherTimetableEntry | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const weekRange = getWeekRange(weekOffset);

  const weekDates = Array.from({ length: 5 }, (_, index) => {
    const date = new Date(weekRange.sunday);
    date.setDate(weekRange.sunday.getDate() + index);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
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

  function openAdd(dayOfWeek?: number, period?: number) {
    setFormMode("add");
    setEditingId(undefined);
    setFormInitial({
      dayOfWeek: dayOfWeek ?? 0,
      period: period ?? 1,
    });
    setFormOpen(true);
  }

  function openEdit(entry: TeacherTimetableEntry) {
    const hasSessions = sessionBySlot.has(`${entry.dayOfWeek}-${entry.period}`);
    if (hasSessions) {
      toast.message("تنبيه", { description: SESSION_WARN });
    }
    setFormMode("edit");
    setEditingId(entry.id);
    setFormInitial(entryToFormState(entry));
    setFormOpen(true);
  }

  function requestDelete(entry: TeacherTimetableEntry) {
    setDeleteTarget(entry);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      const ok = await TeacherTimetableService.deleteSlot(deleteTarget.id);
      if (!ok) {
        toast.error("تعذر حذف الحصة أو أنها غير موجودة.");
      } else {
        toast.success("تم حذف الحصة من الجدول الأسبوعي.");
        await refresh();
      }
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر حذف الحصة.");
    } finally {
      setDeleteBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="min-w-0 w-full max-w-[100dvw] space-y-3">
        <div className="space-y-3 px-1 lg:hidden">
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

  const maxPeriod = 7;

  const getEntry = (day: number, period: number) =>
    entries.find((entry) => entry.dayOfWeek === day && entry.period === period);

  const deleteHasSessions = deleteTarget
    ? sessionBySlot.has(`${deleteTarget.dayOfWeek}-${deleteTarget.period}`)
    : false;

  return (
    <div className="min-w-0 w-full max-w-[100dvw]">
      <Card className="min-w-0 overflow-hidden">
        <CardHeader className="border-b bg-muted/30">
          <TimetableWeekHeader
            weekRange={weekRange}
            entriesCount={entries.length}
            onPreviousWeek={() => setWeekOffset((value) => value - 1)}
            onNextWeek={() => setWeekOffset((value) => value + 1)}
            onAddSlot={() => openAdd()}
          />
        </CardHeader>

        <CardContent className="min-w-0 p-0">
          {entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center">
              <CalendarDays className="h-10 w-10 text-muted-foreground" />
              <h3 className="font-bold">لا يوجد جدول أسبوعي</h3>
              <p className="text-sm text-muted-foreground">
                أضف حصصك يدوياً أو استوردها من مدرستي لاحقاً.
              </p>
              <Button type="button" className="min-h-11 gap-1" onClick={() => openAdd()}>
                <Plus className="h-4 w-4" />
                إضافة حصة
              </Button>
            </div>
          ) : (
            <>
              <div className="px-3 pt-2">
                <PlannerLegend />
              </div>

              <TeacherWeeklyTimetableMobile
                weekSunday={weekRange.sunday}
                maxPeriod={maxPeriod}
                getEntry={getEntry}
                sessionBySlot={sessionBySlot}
                onAddSlot={openAdd}
                onEditSlot={openEdit}
                onDeleteSlot={requestDelete}
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

                                    <div className="mt-1 flex flex-wrap justify-center gap-1">
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="ghost"
                                        className="h-9 min-h-9 px-2"
                                        onClick={() => openEdit(entry)}
                                      >
                                        <Pencil className="h-3.5 w-3.5" />
                                        <span className="sr-only ms-1 sm:not-sr-only">تعديل</span>
                                      </Button>
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="ghost"
                                        className="h-9 min-h-9 px-2 text-destructive"
                                        onClick={() => requestDelete(entry)}
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                        <span className="sr-only ms-1 sm:not-sr-only">حذف</span>
                                      </Button>
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
                                  <button
                                    type="button"
                                    className="flex h-full min-h-[44px] w-full items-center justify-center rounded-lg text-xs text-muted-foreground/50 transition hover:bg-muted/40 hover:text-primary"
                                    onClick={() => openAdd(day.value, period)}
                                  >
                                    <Plus className="me-1 h-3.5 w-3.5" />
                                    إضافة
                                  </button>
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
            </>
          )}
        </CardContent>
      </Card>

      <TimetableSlotFormDialog
        open={formOpen}
        mode={formMode}
        initial={formInitial}
        editingId={editingId}
        onOpenChange={setFormOpen}
        onSaved={refresh}
      />

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف الحصة من الجدول؟</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-right">
              <span className="block">
                سيتم حذف خانة «{deleteTarget?.subject}» من الجدول الأسبوعي فقط.
              </span>
              {deleteHasSessions ? (
                <span className="block font-medium text-foreground">{SESSION_WARN}</span>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
            <AlertDialogAction
              className="min-h-11 w-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteBusy}
              onClick={(event) => {
                event.preventDefault();
                void confirmDelete();
              }}
            >
              {deleteBusy ? "جاري الحذف…" : "تأكيد الحذف"}
            </AlertDialogAction>
            <AlertDialogCancel className="min-h-11 w-full" disabled={deleteBusy}>
              إلغاء
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
