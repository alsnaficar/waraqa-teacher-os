import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CalendarRange } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { isEntitlementDeniedError } from "@/features/billing/billing.logic";

import { PageShell } from "@/components/layout/page-shell";
import {
  DeletePreparationDialog,
  DELETE_PREPARATION_SUCCESS_TOAST,
} from "@/features/lesson-sessions/components/delete-preparation-dialog";
import { LessonSessionCard } from "@/features/lesson-sessions/components/lesson-session-card";
import { LessonSessionsToolbar } from "@/features/lesson-sessions/components/lesson-sessions-toolbar";
import { useLessonSessions } from "@/features/lesson-sessions/hooks/useLessonSessions";
import { todayIso } from "@/features/lesson-sessions/services/lesson-session.service";
import {
  LESSON_SESSION_SKIP_MESSAGES,
  type LessonSessionView,
} from "@/features/lesson-sessions/types";
import { EmptyState } from "@/shared/components/empty-state";
import { SectionHeader } from "@/shared/components/section-header";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { Skeleton } from "@/shared/ui/skeleton";
import { addDays } from "@/shared/utils/date";

export const Route = createFileRoute("/_authenticated/lesson-sessions")({
  component: LessonSessionsPage,
});

export {
  DELETE_PREPARATION_CONFIRM_LABEL,
  DELETE_PREPARATION_DIALOG_DESCRIPTION,
  DELETE_PREPARATION_DIALOG_TITLE,
  DELETE_PREPARATION_SUCCESS_TOAST,
} from "@/features/lesson-sessions/components/delete-preparation-dialog";

function toIso(date: Date): string {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function LessonSessionsPage() {
  const navigate = useNavigate();
  const [dayOffset, setDayOffset] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<LessonSessionView | null>(null);

  const date = useMemo(() => toIso(addDays(new Date(), dayOffset)), [dayOffset]);

  const { sessions, skipped, loading, refresh, regenerate, prepare, resetPreparation, complete } =
    useLessonSessions(date);

  const busy =
    prepare.isPending || resetPreparation.isPending || complete.isPending || regenerate.isPending;

  const preparedCount = sessions.filter((session) => session.lessonLocked).length;

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
    const session = sessions.find((row) => row.id === id);
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

  function handleRegenerate() {
    regenerate.mutate(undefined, {
      onSuccess: (result) => {
        if (result.created > 0) {
          toast.success(`تم إنشاء ${result.created} حصة.`);
        } else if (result.skipped) {
          toast.info(LESSON_SESSION_SKIP_MESSAGES[result.skipped]);
        } else {
          toast.info("جميع حصص هذا اليوم منشأة بالفعل.");
        }
      },
      onError: () => toast.error("تعذّر إنشاء الحصص."),
    });
  }

  return (
    <PageShell>
      <div className="space-y-4">
        <SectionHeader
          title="حصصي"
          description="كل حصة هي المرجع الوحيد لتحضير الدرس وأوراق العمل والاختبارات."
        />

        <LessonSessionsToolbar
          date={date}
          isToday={date === todayIso()}
          refreshing={loading || regenerate.isPending}
          onOffsetChange={(delta) => setDayOffset((current) => current + delta)}
          onToday={() => setDayOffset(0)}
          onRefresh={() => void refresh()}
          weekLink={
            <Button variant="outline" size="sm" className="h-11 min-h-11 flex-1 sm:flex-none" asChild>
              <Link to="/weekly-preparation">تحضير الأسبوع</Link>
            </Button>
          }
        />

        {sessions.length > 0 ? (
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-2 p-3">
              <span className="text-sm text-muted-foreground">
                {sessions.length} حصة في هذا اليوم
              </span>
              <span className="text-sm font-semibold">{preparedCount} محضّرة</span>
            </CardContent>
          </Card>
        ) : null}

        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((key) => (
              <Skeleton key={key} className="h-44 w-full rounded-xl" />
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <EmptyState
            icon={CalendarRange}
            title="لا توجد حصص في هذا اليوم"
            description={
              skipped
                ? LESSON_SESSION_SKIP_MESSAGES[skipped]
                : "لم يتم إنشاء أي حصة لهذا التاريخ بعد."
            }
            action={
              <Button className="h-11 min-h-11" disabled={busy} onClick={handleRegenerate}>
                إنشاء حصص هذا اليوم
              </Button>
            }
          />
        ) : (
          <div className="space-y-3">
            {sessions.map((session) => (
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
