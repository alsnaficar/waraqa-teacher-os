import { SubscriptionBanner } from "@/features/billing/components/subscription-banner";
import { useSubscription } from "@/features/billing/hooks/useSubscription";
import { getTodayLessons } from "@/features/lesson-engine/services/lesson-engine";
import { useLessonSessions } from "@/features/lesson-sessions/hooks/useLessonSessions";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { DashboardSummary } from "@/components/dashboard/dashboard-summary";
import { DashboardNotifications } from "@/components/dashboard/dashboard-notifications";
import { TodayLessonsSection } from "@/components/dashboard/today-lessons-section";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { PendingTasks } from "@/components/dashboard/pending-tasks";
import { TodayLessonCard } from "@/components/dashboard/today-lesson-card";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Sparkles,
  BookOpen,
  FileText,
  FlaskConical,
  PlaySquare,
  Lightbulb,
  CalendarDays,
  ClipboardList,
  Megaphone,
  BarChart3,
  User,
  School,
  Bot,
  ChevronLeft,
  CheckCircle2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { PageShell } from "@/components/layout/page-shell";
import { Card, CardContent } from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { getScheduleService, type ScheduleEntry } from "@/features/planner/services/service";
import { TeacherTimetableService } from "@/features/teacher-timetable/services/teacher-timetable.service";
import { supabase } from "@/platform/database/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/shared/utils/utils";
import { startOfWeekSunday, formatHijriFull } from "@/shared/utils/date";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: HomePage,
});

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

function HomePage() {
  const today = useMemo(() => new Date(), []);
  const todayKey = DAY_KEYS[today.getDay()];
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

  // Query real AI generation stats
  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes.user?.id;
      if (!userId) return { lessonPlans: 0, worksheets: 0, quizzes: 0 };

      const { data, error } = await supabase
        .from("ai_generations")
        .select("kind")
        .eq("user_id", userId);

      if (error || !data) return { lessonPlans: 0, worksheets: 0, quizzes: 0 };

      const lessonPlans = data.filter((g) => g.kind === "lesson_plan").length;
      const worksheets = data.filter((g) => g.kind === "worksheet").length;
      const quizzes = data.filter((g) => g.kind === "quiz").length;

      return { lessonPlans, worksheets, quizzes };
    },
  });

  // Query the real weekly/daily schedule
  const { data: scheduleData } = useQuery({
    queryKey: ["dashboard-schedule"],
    staleTime: 30_000,
    queryFn: async () => {
      try {
        return await getTodayLessons();
      } catch (err) {
        console.error("Failed to load lessons for dashboard:", err);
        return [];
      }
    },
  });

  // The teacher timetable is the authoritative weekly schedule.
  // Keep it visible even when no curriculum/semester plan exists.
  const { data: teacherTimetable = [] } = useQuery({
    queryKey: ["dashboard-teacher-timetable"],
    staleTime: 30_000,
    queryFn: () => TeacherTimetableService.getTimetable(),
  });

  const [mockLessons, setMockLessons] = useState<ScheduleEntry[]>([]);
  useEffect(() => {
    let cancelled = false;
    getScheduleService()
      .getWeek({ weekOf: startOfWeekSunday(today) })
      .then((entries) => {
        if (cancelled) return;
        setMockLessons(
          entries.filter((e) => e.day === todayKey).sort((a, b) => a.period - b.period),
        );
      })
      .catch(() => !cancelled && setMockLessons([]));
    return () => {
      cancelled = true;
    };
  }, [today, todayKey]);

  // Resolve today's visible schedule.
  // Priority: real planner lessons, then the teacher timetable,
  // then mock data as the final onboarding fallback.
  const todaysLessons = useMemo(() => {
    const todayISO = today.toISOString().slice(0, 10);

    const realToday = (scheduleData ?? [])
      .filter((e) => e.suggestedDate === todayISO && e.status !== "Skipped")
      .sort((a, b) => a.period - b.period);

    if (realToday.length > 0) return realToday;

    const timetableToday = teacherTimetable
      .filter((entry) => entry.dayOfWeek === today.getDay() && entry.active)
      .sort((a, b) => a.period - b.period)
      .map((entry) => ({
        id: entry.id,
        period: entry.period,
        grade: entry.grade,
        className: entry.className,
        lessonTitle: entry.subject,
        subject: entry.subject,
      }));

    if (timetableToday.length > 0) return timetableToday;

    return mockLessons;
  }, [scheduleData, teacherTimetable, mockLessons, today]);

  // Lesson sessions are the source of truth for what is actually being taught
  // today; the planner projection is only a fallback before they are generated.
  const { sessions: todaySessions } = useLessonSessions();

  const { access: subscriptionAccess, daysRemaining: subscriptionDaysRemaining } =
    useSubscription();

  const normalizedTodayLessons = useMemo(() => {
    if (todaySessions.length > 0) {
      return todaySessions.map((session) => ({
        id: session.id,
        period: session.periodNumber,
        grade: session.grade,
        klass: session.className,
        lessonTitle: session.lessonTitle,
        subject: session.subject,
        lessonSessionId: session.id,
      }));
    }

    return todaysLessons.map((l) => {
      const displayGrade = ("className" in l ? l.className : "grade" in l ? l.grade : "") || "";
      const displayKlass = ("klass" in l ? l.klass : "") || "";
      return {
        id: l.id,
        period: l.period,
        grade: displayGrade,
        klass: displayKlass,
        lessonTitle: l.lessonTitle,
        subject: l.subject,
      };
    });
  }, [todaySessions, todaysLessons]);

  // Find next upcoming lesson
  const nextLesson = useMemo(() => {
    if (!scheduleData || scheduleData.length === 0) return null;
    const todayISO = today.toISOString().slice(0, 10);
    return scheduleData.find((e) => e.suggestedDate >= todayISO && e.status !== "Skipped");
  }, [scheduleData, today]);

  const activeLesson = todaysLessons[0] || nextLesson;
  const lessonPlanSearch:
    | {
        stage?: "primary" | "intermediate" | "secondary";
        grade?: string;
        subject?: string;
        title?: string;
      }
    | undefined = useMemo(() => {
    if (!activeLesson) return undefined;
    const gradeVal =
      "className" in activeLesson
        ? activeLesson.className
        : "grade" in activeLesson
          ? (activeLesson as { grade: string }).grade
          : "";
    const isInt = String(gradeVal).includes("متوسط");
    const isSec = String(gradeVal).includes("ثانوي");
    return {
      stage: isInt ? "intermediate" : isSec ? "secondary" : "primary",
      grade: String(gradeVal),
      subject: activeLesson.subject,
      title: activeLesson.lessonTitle,
    };
  }, [activeLesson]);

  return (
    <PageShell>
      <div className="space-y-6">
        <DashboardHeader
          teacherName={profile?.name ?? "المعلم"}
          hijriDate={hijri}
          connected={false}
          subscription={subscriptionAccess}
          subscriptionDaysRemaining={subscriptionDaysRemaining}
        />

        <SubscriptionBanner access={subscriptionAccess} daysRemaining={subscriptionDaysRemaining} />

        <DashboardSummary
          todayLessons={normalizedTodayLessons.length}
          weekLessons={scheduleData?.length ?? 0}
          completedLessons={scheduleData?.filter((l) => l.status === "Completed").length ?? 0}
          remainingLessons={scheduleData?.filter((l) => l.status !== "Completed").length ?? 0}
        />

        <DashboardNotifications />

        <TodayLessonsSection lessons={normalizedTodayLessons} />

        <QuickActions />

        <PendingTasks />
      </div>
    </PageShell>
  );
}

// ---------- pieces ----------

type Tone = "violet" | "teal" | "orange" | "red" | "blue" | "green";

const TONE: Record<Tone, string> = {
  violet: "bg-violet-500/10 text-violet-600 dark:text-violet-300",
  teal: "bg-teal-500/10 text-teal-600 dark:text-teal-300",
  orange: "bg-orange-500/10 text-orange-600 dark:text-orange-300",
  red: "bg-red-500/10 text-red-600 dark:text-red-300",
  blue: "bg-blue-500/10 text-blue-600 dark:text-blue-300",
  green: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
};

function QuickAction({
  to,
  title,
  icon: Icon,
  tone,
  highlight,
  search,
}: {
  to: string;
  title: string;
  icon: LucideIcon;
  tone: Tone;
  highlight?: boolean;
  search?: {
    stage?: "primary" | "intermediate" | "secondary";
    grade?: string;
    subject?: string;
    title?: string;
  };
}) {
  return (
    <Link
      to={to}
      search={search}
      className={cn(
        "group flex flex-col items-start gap-3 rounded-2xl border bg-card p-4 transition hover:border-primary/40 hover:shadow-sm",
        highlight ? "border-primary/40" : "border-border",
      )}
    >
      <span className={cn("grid h-10 w-10 place-items-center rounded-xl", TONE[tone])}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="text-sm font-semibold leading-snug">{title}</span>
    </Link>
  );
}

function PendingCard({
  to,
  title,
  count,
  icon: Icon,
  tone,
}: {
  to: string;
  title: string;
  count: number;
  icon: LucideIcon;
  tone: Tone;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 transition hover:border-primary/40 hover:shadow-sm"
    >
      <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", TONE[tone])}>
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-muted-foreground">{title}</p>
        <p className="text-lg font-bold leading-tight">{count}</p>
      </div>
    </Link>
  );
}

function StatMini({
  label,
  value,
  icon: Icon,
  isText,
}: {
  label: string;
  value: number | string;
  icon: LucideIcon;
  isText?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-3 h-full flex flex-col justify-between">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
          <span className="truncate text-[11px]">{label}</span>
        </div>
        {isText ? (
          <p
            className="mt-1 text-xs font-semibold text-foreground truncate max-w-full"
            title={String(value)}
          >
            {value}
          </p>
        ) : (
          <p className="mt-1 text-2xl font-bold">{value}</p>
        )}
      </CardContent>
    </Card>
  );
}
