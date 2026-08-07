import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { CalendarRange, Printer, RefreshCw, Table2 } from "lucide-react";

import { supabase } from "@/platform/database/supabase/client";
import { PageShell } from "@/components/layout/page-shell";
import { useIsMobile } from "@/hooks/use-mobile";
import { PlannerDesktopLayout } from "@/features/planner/components/planner-desktop-layout";
import { PlannerMobileLayout } from "@/features/planner/components/planner-mobile-layout";
import { SemesterPlanTable } from "@/features/planner/components/semester-plan-table";
import { SemesterPlanPrintDocument } from "@/features/planner/components/semester-plan-print";
import { SemesterPlanPrintDialog } from "@/features/planner/components/semester-plan-print-dialog";
import { type DayKey, type Lesson } from "@/features/planner/components/types";
import {
  buildSemesterPlanMeta,
  generateSemesterPlan,
  loadOrGeneratePlan,
  moveLessonInPlan,
  shiftLessonOrder,
  type SemesterPlanMeta,
} from "@/features/planner/services/semester-plan.service";
import {
  getActiveAcademicYear,
  getCurrentAcademicTerm,
} from "@/features/calendar/services/calendar.service";
import type { LessonOverrideScope } from "@/features/planner/services/overrides";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/utils/utils";
import type { CalculatedLessonEntry } from "@/features/planner/services/planner-engine";

export const Route = createFileRoute("/_authenticated/planner")({
  component: PlannerPage,
});

type Assignment = {
  stage: string;
  grade: string;
  subject: string;
  klasses: string[];
};

type PlannerView = "week" | "semester";

const DAY_MAP: Record<number, DayKey> = {
  0: "sun",
  1: "mon",
  2: "tue",
  3: "wed",
  4: "thu",
};

export default function PlannerPage() {
  const isMobile = useIsMobile();
  const [view, setView] = useState<PlannerView>("semester");
  const [weekOffset, setWeekOffset] = useState(0);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishTarget, setPublishTarget] = useState("madrasati");
  const [printOpen, setPrintOpen] = useState(false);
  const [includeSchoolLogo, setIncludeSchoolLogo] = useState(false);
  const [schoolLogoUrl, setSchoolLogoUrl] = useState<string | null>(null);
  const [includeQr, setIncludeQr] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [entries, setEntries] = useState<CalculatedLessonEntry[]>([]);
  const [grade, setGrade] = useState("");
  const [subject, setSubject] = useState("");
  const [metaBase, setMetaBase] = useState({
    teacherName: "",
    schoolName: "",
    educationAdministration: "",
    subject: "",
    grade: "",
    semesterLabel: "",
    academicYearLabel: "",
  });

  const meta: SemesterPlanMeta = useMemo(
    () =>
      buildSemesterPlanMeta(
        {
          ...metaBase,
          subject: subject || metaBase.subject,
          grade: grade || metaBase.grade,
        },
        entries,
      ),
    [metaBase, subject, grade, entries],
  );

  const { weekStart, weekEnd } = useMemo(() => {
    const todayDate = new Date();
    const wStart = new Date(todayDate);
    wStart.setDate(todayDate.getDate() - todayDate.getDay() + weekOffset * 7);

    const wEnd = new Date(wStart);
    wEnd.setDate(wStart.getDate() + 4);

    return { weekStart: wStart, weekEnd: wEnd };
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
        let teacherName = "";
        let schoolName = "";
        let educationAdministration = "";

        if (profile) {
          teacherName = profile.full_name || "";
          schoolName = profile.school || "";
          educationAdministration = profile.education_system || "";
          const classes = profile.classes as {
            assignments?: Assignment[];
          } | null;

          if (classes && Array.isArray(classes.assignments) && classes.assignments.length > 0) {
            const asm = classes.assignments[0];
            activeGrade = asm.grade || activeGrade;
            activeSubject = asm.subject || activeSubject;
          } else if (profile.grade && profile.subject) {
            activeGrade = profile.grade;
            activeSubject = profile.subject;
          }
        }

        const [year, term] = await Promise.all([getActiveAcademicYear(), getCurrentAcademicTerm()]);

        setGrade(activeGrade);
        setSubject(activeSubject);
        setMetaBase({
          teacherName,
          schoolName,
          educationAdministration,
          subject: activeSubject,
          grade: activeGrade,
          semesterLabel: term?.label || profile?.semester || "",
          academicYearLabel: year?.label || profile?.academic_year || "",
        });

        setEntries(await loadOrGeneratePlan(activeSubject, activeGrade));
      } catch (err) {
        console.error("Error loading planner:", err);
        toast.error("تعذر تحميل الخطة الدراسية");
      } finally {
        setLoading(false);
      }
    }
    void loadData();
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

  const onChangeLesson = (_lesson: Lesson, _newTitle: string, _scope: LessonOverrideScope) => {
    toast.info("جاري حفظ التعديل...");
  };

  const onComingSoon = (feature: string) => {
    toast.info(`${feature} قريباً!`);
  };

  const runGenerate = async () => {
    setBusy(true);
    try {
      const next = await generateSemesterPlan(subject, grade);
      setEntries(next);
      toast.success(
        next.length > 0
          ? `تم توليد خطة الفصل (${next.length} حصة)`
          : "لم يُعثر على منهج منشور أو جدول حصص لهذا الصف والمادة",
      );
    } catch (error) {
      console.error(error);
      toast.error("فشل توليد خطة الفصل");
    } finally {
      setBusy(false);
    }
  };

  const onMoveDate = async (lessonId: string, date: string, period: number) => {
    setBusy(true);
    try {
      const next = await moveLessonInPlan({
        lessonId,
        targetDate: date,
        targetPeriod: period,
        subject,
        grade,
      });
      setEntries(next);
      toast.success("تم تحديث موعد الدرس");
    } catch (error) {
      console.error(error);
      toast.error("تعذر نقل الدرس");
    } finally {
      setBusy(false);
    }
  };

  const onShiftOrder = async (lessonId: string, direction: "up" | "down") => {
    setBusy(true);
    try {
      const next = await shiftLessonOrder({
        entries,
        lessonId,
        direction,
        subject,
        grade,
      });
      setEntries(next);
      toast.success("تم تعديل ترتيب الدرس");
    } catch (error) {
      console.error(error);
      toast.error("تعذر تعديل الترتيب");
    } finally {
      setBusy(false);
    }
  };

  const weekProps = {
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
        <div className="flex min-h-[400px] flex-col items-center justify-center">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
          <p className="text-muted-foreground">جاري تحميل الخطة...</p>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell className="px-3 md:px-6">
      <div className="mb-4 space-y-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight">الخطة والجدول الدراسي</h1>
          <p className="text-muted-foreground">
            خطة الفصل هي المصدر الأساسي للتخطيط — الجدول الأسبوعي وحصص اليوم والتحضير يُشتقّون منها
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={view === "semester" ? "default" : "outline"}
            className="h-11"
            onClick={() => setView("semester")}
          >
            <CalendarRange className="ml-2 h-4 w-4" />
            خطة الفصل
          </Button>
          <Button
            type="button"
            variant={view === "week" ? "default" : "outline"}
            className="h-11"
            onClick={() => setView("week")}
          >
            <Table2 className="ml-2 h-4 w-4" />
            الجدول الأسبوعي
          </Button>
        </div>

        {view === "semester" ? (
          <div className="flex flex-wrap gap-2 rounded-2xl border border-border bg-card p-3">
            <Button
              className="h-11 min-w-[44px]"
              disabled={busy}
              onClick={() => void runGenerate()}
            >
              <RefreshCw className={cn("ml-2 h-4 w-4", busy && "animate-spin")} />
              توليد خطة الفصل
            </Button>
            <Button
              variant="outline"
              className="h-11"
              disabled={busy || entries.length === 0}
              onClick={() => setPrintOpen(true)}
            >
              <Printer className="ml-2 h-4 w-4" />
              طباعة خطة الفصل
            </Button>
            <p className="flex w-full items-center text-xs text-muted-foreground sm:w-auto sm:ms-auto">
              {meta.academicYearLabel || "—"} · {meta.semesterLabel || "—"} · {subject} · {grade}
            </p>
          </div>
        ) : null}
      </div>

      {view === "semester" ? (
        <SemesterPlanTable
          entries={entries}
          busy={busy}
          onMoveDate={(lessonId, date, period) => void onMoveDate(lessonId, date, period)}
          onShiftOrder={(lessonId, direction) => void onShiftOrder(lessonId, direction)}
        />
      ) : isMobile ? (
        <PlannerMobileLayout {...weekProps} />
      ) : (
        <PlannerDesktopLayout {...weekProps} />
      )}

      <SemesterPlanPrintDialog
        open={printOpen}
        onOpenChange={setPrintOpen}
        includeSchoolLogo={includeSchoolLogo}
        onIncludeSchoolLogoChange={setIncludeSchoolLogo}
        schoolLogoUrl={schoolLogoUrl}
        onSchoolLogoUrlChange={setSchoolLogoUrl}
        includeQr={includeQr}
        onIncludeQrChange={setIncludeQr}
        onPrint={() => {
          setPrintOpen(false);
          window.setTimeout(() => window.print(), 250);
        }}
      />

      <SemesterPlanPrintDocument
        meta={meta}
        entries={entries}
        includeSchoolLogo={includeSchoolLogo}
        schoolLogoUrl={schoolLogoUrl}
        includeQr={includeQr}
      />
    </PageShell>
  );
}
