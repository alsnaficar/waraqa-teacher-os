import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/layout/page-shell";
import { useIsMobile } from "@/hooks/use-mobile";
import { PlannerDesktopLayout } from "@/components/planner/planner-desktop-layout";
import { PlannerMobileLayout } from "@/components/planner/planner-mobile-layout";
import { type DayKey, type Lesson } from "@/components/planner/types";
import {
  generateSchedule,
  syncScheduleToDatabase,
  recalculateAndSyncPlanner,
  type CalculatedLessonEntry,
} from "@/lib/schedule/planner-engine";
import type { LessonOverrideScope } from "@/lib/schedule/overrides";

export const Route = createFileRoute("/_authenticated/planner")({
  component: PlannerPage,
});

const DAY_MAP: Record<number, DayKey> = {
  0: "sun",
  1: "mon",
  2: "tue",
  3: "wed",
  4: "thu",
};

export default function PlannerPage() {
  const isMobile = useIsMobile();
  const [weekOffset, setWeekOffset] = useState(0);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishTarget, setPublishTarget] = useState("madrasati");
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<CalculatedLessonEntry[]>([]);
  const [grade, setGrade] = useState("");
  const [subject, setSubject] = useState("");

  const { today, weekStart, weekEnd } = useMemo(() => {
    const todayDate = new Date();
    const wStart = new Date(todayDate);
    wStart.setDate(todayDate.getDate() - todayDate.getDay() + weekOffset * 7);

    const wEnd = new Date(wStart);
    wEnd.setDate(wStart.getDate() + 4);

    return { today: todayDate, weekStart: wStart, weekEnd: wEnd };
  }, [weekOffset]);

  const weekDates = useMemo(() => {
    const dates: string[] = [];
    for (let i = 0; i < 5; i++) {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      dates.push(d.toISOString().slice(0, 10));
    }
    return dates;
  }, [weekStart]);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        const { data: profile } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single();

        let activeGrade = "الأول متوسط";
        let activeSubject = "العلوم";

        if (profile) {
          if (
            Array.isArray(profile.teacher_assignments) &&
            profile.teacher_assignments.length > 0
          ) {
            const asm = profile.teacher_assignments[0] as Record<string, unknown>;
            activeGrade = (asm.grade as string) || activeGrade;
            activeSubject = (asm.subject as string) || activeSubject;
          } else if (profile.grade && profile.subject) {
            activeGrade = profile.grade as string;
            activeSubject = profile.subject as string;
          }
        }

        setGrade(activeGrade);
        setSubject(activeSubject);

        // load schedule
        const calculated = await generateSchedule(activeSubject, activeGrade);
        if (calculated.length > 0) {
          setEntries(calculated);
          await syncScheduleToDatabase(calculated, activeSubject);
        } else {
          const newSched = await recalculateAndSyncPlanner(activeSubject, activeGrade);
          setEntries(newSched);
        }
      } catch (err) {
        console.error("Error loading planner:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const lessons: Lesson[] = useMemo(() => {
    return entries
      .filter((e) => weekDates.includes(e.suggestedDate))
      .map((e) => {
        const dateObj = new Date(e.suggestedDate);
        return {
          id: e.id,
          day: DAY_MAP[dateObj.getDay()] || "sun",
          period: e.period,
          grade: grade,
          klass: e.className || "أ",
          title: e.lessonTitle || "بدون عنوان",
        };
      });
  }, [entries, weekDates, grade]);

  const lessonAt = (day: DayKey, period: number) => {
    return lessons.find((l) => l.day === day && l.period === period);
  };

  const onChangeLesson = (lesson: Lesson, newTitle: string, scope: LessonOverrideScope) => {
    toast.info("جاري حفظ التعديل...");
  };

  const onComingSoon = (feature: string) => {
    toast.info(`${feature} قريباً!`);
  };

  const props = {
    weekOffset,
    setWeekOffset,
    weekStart,
    weekEnd,
    onComingSoon,
    onPublishClick: () => setPublishOpen(true),
    lessons,
    lessonAt,
    onChangeLesson,
    publishOpen,
    setPublishOpen,
    publishTarget,
    setPublishTarget,
    onConfirmPublish: () => {
      toast.success("تم النشر بنجاح!");
      setPublishOpen(false);
    },
  };

  if (loading) {
    return (
      <PageShell className="px-3 md:px-6">
        <div className="flex flex-col items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-4"></div>
          <p className="text-muted-foreground">جاري تحميل الخطة...</p>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell className="px-3 md:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-black tracking-tight">الخطة والجدول الدراسي</h1>
        <p className="text-muted-foreground">تخطيط وعرض الحصص الدراسية بشكل مبسط</p>
      </div>

      {isMobile ? <PlannerMobileLayout {...props} /> : <PlannerDesktopLayout {...props} />}
    </PageShell>
  );
}
