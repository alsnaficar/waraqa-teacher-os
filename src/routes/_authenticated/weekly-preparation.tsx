import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CalendarRange, ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { isEntitlementDeniedError } from "@/features/billing/billing.logic";
import { PageShell } from "@/components/layout/page-shell";
import {
  DeletePreparationDialog,
  DELETE_PREPARATION_SUCCESS_TOAST,
} from "@/features/lesson-sessions/components/delete-preparation-dialog";
import { LessonSessionCard } from "@/features/lesson-sessions/components/lesson-session-card";
import { useWeeklyLessonSessions } from "@/features/lesson-sessions/hooks/useWeeklyLessonSessions";
import { todayIso } from "@/features/lesson-sessions/services/lesson-session.service";
import {
  resolveSchoolWeekStart,
  SCHOOL_WEEK_DAY_LABELS,
  shiftSchoolWeek,
} from "@/features/lesson-sessions/services/weekly-preparation.logic";
import {
  LESSON_SESSION_SKIP_MESSAGES,
  type LessonSessionView,
} from "@/features/lesson-sessions/types";
import { EmptyState } from "@/shared/components/empty-state";
import { SectionHeader } from "@/shared/components/section-header";
import { Button } from "@/shared/ui/button";
import { Skeleton } from "@/shared/ui/skeleton";
import { formatHijriFull } from "@/shared/utils/date";

export const Route = createFileRoute("/_authenticated/weekly-preparation")({
  component: WeeklyPreparationPage,
});

function WeeklyPreparationPage() {
  const navigate = useNavigate();
  const [weekStartIso, setWeekStartIso] = useState(() => resolveSchoolWeekStart(todayIso()));
  const [deleteTarget, setDeleteTarget] = useState<LessonSessionView | null>(null);

  const { days, prepare, resetPreparation, complete, refreshWeek, busy } =
    useWeeklyLessonSessions(weekStartIso);

  const weekRangeLabel = useMemo(() => {
    const first = days[0]?.date;
    const last = days[4]?.date;
    if (!first || !last) return weekStartIso;
    return `${first} → ${last}`;
  }, [days, weekStartIso]);

  const currentWeekStart = resolveSchoolWeekStart(todayIso());
  const isCurrentWeek = weekStartIso === currentWeekStart;

  function handlePrepare(id: string) {
    prepare.mutate(id, {
      onSuccess: () => toast.success("تم توليد تحضير الدرس وقفله."),
      onError: (error) => {
        const message = error instanceof Error ? error.message : "تعذّر تحضير الحصة.";
        if (isEntitlementDeniedError(error)) {
          toast.error(message, {
            action: {
              label: "الاشتراك",
              onClick: () => navigate({ to: "/subscription" }),
            },
          });
          return;
        }
        toast.error(message);
      },
    });
  }

  function handleResetRequest(id: string) {
    const session = days.flatMap((day) => day.sessions).find((row) => row.id === id);
    if (!session) return;

    if (session.status === "prepared") {
      setDeleteTarget(session);
      return;
    }

    if (session.status === "preparing") {
      resetPreparation.mutate(id, {
        onSuccess: () => toast.success("تم إلغاء التحضير الجاري."),
        onError: () => toast.error("تعذّر إلغاء التحضير."),
      });
    }
  }

  function handleConfirmDelete() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    resetPreparation.mutate(id, {
      onSuccess: () => {
        toast.success(DELETE_PREPARATION_SUCCESS_TOAST);
        setDeleteTarget(null);
      },
      onError: () => toast.error("تعذّر حذف التحضير."),
    });
  }

  function handleComplete(id: string) {
    complete.mutate(id, {
      onSuccess: () => toast.success("تم إنهاء الحصة."),
      onError: () => toast.error("تعذّر إنهاء الحصة."),
    });
  }

  return (
    <PageShell>
      <div className="space-y-4" dir="rtl">
        <SectionHeader
          title="تحضير الأسبوع"
          description="عرض حصص الأحد–الخميس وحالة التحضير لكل حصة."
        />

        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11 shrink-0"
            aria-label="الأسبوع السابق"
            onClick={() => setWeekStartIso((current) => shiftSchoolWeek(current, -1))}
          >
            <ChevronRight className="h-5 w-5" />
          </Button>

          <div className="min-w-0 flex-1 text-center">
            <p className="truncate text-sm font-semibold">الأسبوع الدراسي</p>
            <p className="text-[11px] text-muted-foreground">{weekRangeLabel}</p>
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11 shrink-0"
            aria-label="الأسبوع التالي"
            onClick={() => setWeekStartIso((current) => shiftSchoolWeek(current, 1))}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>

          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            {!isCurrentWeek ? (
              <Button
                variant="outline"
                size="sm"
                className="h-11 min-h-11 flex-1 sm:flex-none"
                onClick={() => setWeekStartIso(resolveSchoolWeekStart(todayIso()))}
              >
                هذا الأسبوع
              </Button>
            ) : null}

            <Button variant="outline" size="sm" className="h-11 min-h-11 flex-1 sm:flex-none" asChild>
              <Link to="/lesson-sessions">حصص اليوم</Link>
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="h-11 min-h-11 flex-1 sm:flex-none"
              disabled={busy}
              onClick={() => void refreshWeek()}
            >
              تحديث
            </Button>
          </div>
        </div>

        <div className="space-y-5">
          {days.map((day, index) => (
            <section key={day.date} className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2">
                <h2 className="text-base font-semibold">
                  {SCHOOL_WEEK_DAY_LABELS[index] ?? day.date}
                </h2>
                <p
                  className="min-w-0 max-w-full break-words text-xs text-muted-foreground"
                  title={formatHijriFull(new Date(`${day.date}T00:00:00`))}
                >
                  {formatHijriFull(new Date(`${day.date}T00:00:00`))} · {day.date}
                </p>
              </div>

              {day.loading ? (
                <Skeleton className="h-36 w-full rounded-xl" />
              ) : day.error ? (
                <EmptyState
                  icon={CalendarRange}
                  title="تعذّر تحميل حصص هذا اليوم"
                  description={day.error.message}
                />
              ) : day.sessions.length === 0 ? (
                <EmptyState
                  icon={CalendarRange}
                  title="لا توجد حصص في هذا اليوم"
                  description={
                    day.skipped
                      ? LESSON_SESSION_SKIP_MESSAGES[day.skipped]
                      : "لا توجد حصص مجدولة لهذا اليوم."
                  }
                />
              ) : (
                <div className="space-y-3">
                  {day.sessions.map((session) => (
                    <LessonSessionCard
                      key={session.id}
                      session={session}
                      busy={busy}
                      onPrepare={handlePrepare}
                      onResetPreparation={handleResetRequest}
                      onComplete={handleComplete}
                    />
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      </div>

      <DeletePreparationDialog
        open={Boolean(deleteTarget)}
        pending={resetPreparation.isPending}
        onOpenChange={(open) => {
          if (!open && !resetPreparation.isPending) setDeleteTarget(null);
        }}
        onConfirm={handleConfirmDelete}
      />
    </PageShell>
  );
}
