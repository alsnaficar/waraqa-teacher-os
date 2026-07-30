import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/platform/database/supabase/client";
import { PageShell } from "@/components/layout/page-shell";
import { useIsMobile } from "@/hooks/use-mobile";
import { PlannerDesktopLayout } from "@/features/planner/components/planner-desktop-layout";
import { PlannerMobileLayout } from "@/features/planner/components/planner-mobile-layout";
import { type DayKey, type Lesson } from "@/features/planner/components/types";
import {
  generateSchedule,
  syncScheduleToDatabase,
  recalculateAndSyncPlanner,
  type CalculatedLessonEntry,
} from "@/features/planner/services/planner-engine";
import type { LessonOverrideScope } from "@/features/planner/services/overrides";

export const Route = createFileRoute("/_authenticated/planner")({
  component: PlannerPage,
});

type Assignment = {
  stage: string;
  grade: string;
  subject: string;
  klasses: string[];
};

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
         const classes = profile.classes as
  | {
      assignments?: Assignment[];
    }
  | null;

if (
  classes &&
  Array.isArray(classes.assignments) &&
  classes.assignments.length > 0
) {
  const asm = classes.assignments[0];
  activeGrade = asm.grade || activeGrade;
  activeSubject = asm.subject || activeSubject;
} else if (profile.grade && profile.subject) {
  activeGrade = profile.grade;
  activeSubject = profile.subject;
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

