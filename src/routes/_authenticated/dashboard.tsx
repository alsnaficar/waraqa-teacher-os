import { SubscriptionBanner } from "@/features/billing/components/subscription-banner";
import { useOpenCheckout, useSubscription } from "@/features/billing/hooks/useSubscription";
import { useDashboardActivity } from "@/features/dashboard/hooks/useDashboardActivity";
import { useLessonSessions } from "@/features/lesson-sessions/hooks/useLessonSessions";
import { todayIso } from "@/features/lesson-sessions/services/lesson-session.service";
import { resolveTodayLessonDisplay } from "@/features/lesson-sessions/services/today-lessons-display";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { DashboardSummary } from "@/components/dashboard/dashboard-summary";
import { DashboardNotifications } from "@/components/dashboard/dashboard-notifications";
import { TodayLessonsSection } from "@/components/dashboard/today-lessons-section";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { PendingTasks } from "@/components/dashboard/pending-tasks";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";

import { PageShell } from "@/components/layout/page-shell";
import { TeacherTimetableService } from "@/features/teacher-timetable/services/teacher-timetable.service";
import { supabase } from "@/platform/database/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { formatHijriFull } from "@/shared/utils/date";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: HomePage,
});

function HomePage() {
  const today = useMemo(() => new Date(), []);
  const todayDate = useMemo(() => todayIso(), []);
  const hijri = useMemo(() => formatHijriFull(today), [today]);

  const { data: profile } = useQuery({
    queryKey: ["home-profile"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const u = userRes.user;
      const { data } = await supabase
        .from("profiles")
        .select("full_name, avatar_url")
        .eq("id", u?.id ?? "")
        .maybeSingle();
      return {
        name: data?.full_name?.trim() || u?.email?.split("@")[0] || "معلم",
      };
    },
  });

  // Weekly timetable remains the authority for weekly slot display / week count.
  const { data: teacherTimetable = [] } = useQuery({
    queryKey: ["dashboard-teacher-timetable"],
    staleTime: 30_000,
    queryFn: () => TeacherTimetableService.getTimetable(),
  });

  // Ensure + load lesson_sessions for today (includes P2 refresh on existing rows).
  const { sessions: todaySessions } = useLessonSessions(todayDate);

  const {
    pending,
    activity,
    loading: activityLoading,
    error: activityError,
    refresh: refreshActivity,
  } = useDashboardActivity();

  const {
    state: subscriptionState,
    access: subscriptionAccess,
    daysRemaining: subscriptionDaysRemaining,
  } = useSubscription();
  const openCheckout = useOpenCheckout();

  const subscriptionDisplay = {
    access: subscriptionAccess,
    daysRemaining: subscriptionDaysRemaining,
    subscriptionStartsAt: subscriptionState.subscription?.startsAt ?? null,
    subscriptionExpiresAt: subscriptionState.expiresAt,
    openCheckoutPaymentStatus: openCheckout.data?.paymentStatus ?? null,
  };

  const normalizedTodayLessons = useMemo(
    () =>
      resolveTodayLessonDisplay({
        sessions: todaySessions,
        timetableSlots: teacherTimetable,
        todayDayOfWeek: today.getDay(),
      }),
    [todaySessions, teacherTimetable, today],
  );

  const preparedToday = todaySessions.filter(
    (s) => s.status === "prepared" || s.status === "completed" || s.lessonLocked,
  ).length;
  const remainingToday = Math.max(todaySessions.length - preparedToday, 0);
  const weekSlotCount = teacherTimetable.filter((e) => e.active).length;

  return (
    <PageShell>
      <div className="space-y-6">
        <DashboardHeader
          teacherName={profile?.name ?? "المعلم"}
          hijriDate={hijri}
          connected={false}
          subscriptionDisplay={subscriptionDisplay}
        />

        <SubscriptionBanner {...subscriptionDisplay} />

        <DashboardSummary
          todayLessons={normalizedTodayLessons.length}
          weekLessons={weekSlotCount}
          completedLessons={preparedToday}
          remainingLessons={remainingToday}
        />

        <DashboardNotifications
          items={activity}
          loading={activityLoading}
          error={activityError instanceof Error ? activityError : null}
          onRetry={refreshActivity}
        />

        <TodayLessonsSection lessons={normalizedTodayLessons} />

        <QuickActions />

        <PendingTasks
          tasks={pending}
          loading={activityLoading}
          error={activityError instanceof Error ? activityError : null}
          onRetry={refreshActivity}
        />
      </div>
    </PageShell>
  );
}
