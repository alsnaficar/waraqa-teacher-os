import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Archive,
  CalendarRange,
  CheckCircle2,
  GitBranch,
  Play,
  Printer,
  RefreshCw,
  Table2,
} from "lucide-react";

import { supabase } from "@/platform/database/supabase/client";
import { PageShell } from "@/components/layout/page-shell";
import { FilledWeeklyTimetable } from "@/features/planner/components/filled-weekly-timetable";
import { SemesterPlanCalendarField } from "@/features/planner/components/semester-plan-calendar-field";
import { SemesterPlanTable } from "@/features/planner/components/semester-plan-table";
import { SemesterPlanPrintDocument } from "@/features/planner/components/semester-plan-print";
import { SemesterPlanPrintDialog } from "@/features/planner/components/semester-plan-print-dialog";
import {
  buildSemesterPlanMeta,
  generateSemesterPlan,
  loadOrGeneratePlan,
  moveLessonInPlan,
  shiftLessonOrder,
  type SemesterPlanMeta,
} from "@/features/planner/services/semester-plan.service";
import {
  approveSemesterPlan,
  archiveSemesterPlan,
  completeSemesterPlan,
  createSemesterPlanVersion,
  formatPlanVersionLabel,
  getPlanUiActions,
  SEMESTER_PLAN_STATUS_LABELS,
  startSemesterPlanExecution,
  updateSemesterPlanCalendarVariant,
  type SemesterPlanRow,
} from "@/features/planner/services/semester-plan-lifecycle";
import { listSelectableCalendarVariants } from "@/features/calendar/services/calendar-variants";
import type { SelectableCalendarVariant } from "@/features/calendar/services/calendar-variant-selection";
import {
  getActiveAcademicYear,
  getCurrentAcademicTerm,
} from "@/features/calendar/services/calendar.service";
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

export const PLANNER_NAV_ITEMS: ReadonlyArray<{ view: PlannerView; label: string }> = [
  { view: "week", label: "الجدول الأسبوعي" },
  { view: "semester", label: "خطة الفصل" },
];

function formatUpdatedAt(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("ar-SA", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value.slice(0, 16);
  }
}

export default function PlannerPage() {
  const [view, setView] = useState<PlannerView>("week");
  const [printOpen, setPrintOpen] = useState(false);
  const [includeSchoolLogo, setIncludeSchoolLogo] = useState(false);
  const [schoolLogoUrl, setSchoolLogoUrl] = useState<string | null>(null);
  const [includeQr, setIncludeQr] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [entries, setEntries] = useState<CalculatedLessonEntry[]>([]);
  const [plan, setPlan] = useState<SemesterPlanRow | null>(null);
  const [calendarVariants, setCalendarVariants] = useState<SelectableCalendarVariant[]>([]);
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

  const actions = getPlanUiActions(plan?.status ?? "draft");

  const meta: SemesterPlanMeta = useMemo(
    () =>
      buildSemesterPlanMeta(
        {
          ...metaBase,
          subject: subject || metaBase.subject,
          grade: grade || metaBase.grade,
          statusLabel: plan ? SEMESTER_PLAN_STATUS_LABELS[plan.status] : undefined,
          versionLabel: plan ? formatPlanVersionLabel(plan.current_version) : undefined,
          approvedAt: plan?.approved_at,
          updatedAt: plan?.updated_at,
        },
        entries,
      ),
    [metaBase, subject, grade, entries, plan],
  );

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

        const [year, term, variants] = await Promise.all([
          getActiveAcademicYear(),
          getCurrentAcademicTerm(),
          listSelectableCalendarVariants(),
        ]);
        setCalendarVariants(variants);

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

        const loaded = await loadOrGeneratePlan(activeSubject, activeGrade);
        setPlan(loaded.plan);
        setEntries(loaded.entries);
      } catch (err) {
        console.error("Error loading planner:", err);
        toast.error("تعذر تحميل الخطة الدراسية");
      } finally {
        setLoading(false);
      }
    }
    void loadData();
  }, []);

  const runGenerate = async () => {
    if (!actions.canGenerate) {
      toast.error("التوليد متاح للمسودة فقط — أنشئ إصداراً جديداً أولاً");
      return;
    }
    setBusy(true);
    try {
      const next = await generateSemesterPlan(subject, grade, {
        calendarVariantId: plan?.calendar_variant_id,
      });
      setPlan(next.plan);
      setEntries(next.entries);
      toast.success(
        next.entries.length > 0
          ? `تم توليد خطة الفصل (${next.entries.length} حصة)`
          : "لم يُعثر على منهج منشور أو جدول حصص لهذا الصف والمادة",
      );
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "فشل توليد خطة الفصل");
    } finally {
      setBusy(false);
    }
  };

  const onMoveDate = async (lessonId: string, date: string, period: number) => {
    if (!actions.canEdit) return;
    setBusy(true);
    try {
      const next = await moveLessonInPlan({
        lessonId,
        targetDate: date,
        targetPeriod: period,
        subject,
        grade,
      });
      setPlan(next.plan);
      setEntries(next.entries);
      toast.success("تم تحديث موعد الدرس");
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "تعذر نقل الدرس");
    } finally {
      setBusy(false);
    }
  };

  const onShiftOrder = async (lessonId: string, direction: "up" | "down") => {
    if (!actions.canEdit) return;
    setBusy(true);
    try {
      const next = await shiftLessonOrder({
        entries,
        lessonId,
        direction,
        subject,
        grade,
      });
      setPlan(next.plan);
      setEntries(next.entries);
      toast.success("تم تعديل ترتيب الدرس");
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "تعذر تعديل الترتيب");
    } finally {
      setBusy(false);
    }
  };

  const runLifecycle = async (
    action: () => Promise<{ plan: SemesterPlanRow }>,
    successMessage: string,
  ) => {
    setBusy(true);
    try {
      const next = await action();
      setPlan(next.plan);
      toast.success(successMessage);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "تعذر تحديث حالة الخطة");
    } finally {
      setBusy(false);
    }
  };

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
          {PLANNER_NAV_ITEMS.map((item) => (
            <Button
              key={item.view}
              type="button"
              variant={view === item.view ? "default" : "outline"}
              className="h-11"
              onClick={() => setView(item.view)}
            >
              {item.view === "semester" ? (
                <CalendarRange className="ml-2 h-4 w-4" />
              ) : (
                <Table2 className="ml-2 h-4 w-4" />
              )}
              {item.label}
            </Button>
          ))}
        </div>

        {view === "semester" ? (
          <div className="space-y-3 rounded-2xl border border-border bg-card p-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="inline-flex h-11 items-center rounded-xl bg-muted px-3 font-semibold">
                {plan ? SEMESTER_PLAN_STATUS_LABELS[plan.status] : "مسودة"}
              </span>
              <span className="inline-flex h-11 items-center rounded-xl border border-border px-3">
                {plan ? formatPlanVersionLabel(plan.current_version) : "الإصدار 1"}
              </span>
              <span className="text-muted-foreground">
                آخر تحديث: {formatUpdatedAt(plan?.updated_at)}
              </span>
              {plan?.approved_at ? (
                <span className="text-muted-foreground">
                  الاعتماد: {plan.approved_at.slice(0, 10)}
                </span>
              ) : null}
              <p className="w-full text-xs text-muted-foreground sm:ms-auto sm:w-auto">
                {meta.academicYearLabel || "—"} · {meta.semesterLabel || "—"} · {subject} · {grade}
              </p>
            </div>

            <SemesterPlanCalendarField
              variants={calendarVariants}
              calendarVariantId={plan?.calendar_variant_id}
              editable={actions.canEdit}
              disabled={busy}
              onSelect={(variantId) => {
                if (!plan) return;
                void (async () => {
                  setBusy(true);
                  try {
                    const updated = await updateSemesterPlanCalendarVariant(plan.id, variantId);
                    setPlan(updated);
                    toast.success("تم حفظ التقويم الدراسي للخطة");
                  } catch (error) {
                    console.error(error);
                    toast.error(
                      error instanceof Error ? error.message : "تعذر حفظ التقويم الدراسي",
                    );
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
            />

            <div className="flex flex-wrap gap-2">
              {actions.canGenerate ? (
                <Button
                  className="h-11 min-w-[44px]"
                  disabled={busy}
                  onClick={() => void runGenerate()}
                >
                  <RefreshCw className={cn("ml-2 h-4 w-4", busy && "animate-spin")} />
                  {entries.length > 0 ? "إعادة توليد" : "توليد خطة الفصل"}
                </Button>
              ) : null}

              {actions.canApprove ? (
                <Button
                  className="h-11"
                  disabled={busy || entries.length === 0 || !plan}
                  variant="default"
                  onClick={() =>
                    plan &&
                    void runLifecycle(
                      () => approveSemesterPlan(plan.id),
                      "تم اعتماد الخطة — أصبحت غير قابلة للتعديل المباشر",
                    )
                  }
                >
                  <CheckCircle2 className="ml-2 h-4 w-4" />
                  اعتماد الخطة
                </Button>
              ) : null}

              {actions.canStartExecution ? (
                <Button
                  className="h-11"
                  disabled={busy || !plan}
                  onClick={() =>
                    plan &&
                    void runLifecycle(() => startSemesterPlanExecution(plan.id), "بدأ تنفيذ الخطة")
                  }
                >
                  <Play className="ml-2 h-4 w-4" />
                  بدء التنفيذ
                </Button>
              ) : null}

              {actions.canCreateVersion ? (
                <Button
                  className="h-11"
                  disabled={busy || !plan}
                  variant="outline"
                  onClick={() =>
                    plan &&
                    void runLifecycle(
                      () => createSemesterPlanVersion(plan.id),
                      "تم إنشاء إصدار جديد كمسودة — الإصدار السابق محفوظ للمراجعة",
                    )
                  }
                >
                  <GitBranch className="ml-2 h-4 w-4" />
                  إنشاء إصدار جديد
                </Button>
              ) : null}

              {actions.canComplete ? (
                <Button
                  className="h-11"
                  disabled={busy || !plan}
                  variant="outline"
                  onClick={() =>
                    plan && void runLifecycle(() => completeSemesterPlan(plan.id), "تم إكمال الخطة")
                  }
                >
                  <CheckCircle2 className="ml-2 h-4 w-4" />
                  إكمال الخطة
                </Button>
              ) : null}

              {actions.canArchive ? (
                <Button
                  className="h-11"
                  disabled={busy || !plan}
                  variant="outline"
                  onClick={() =>
                    plan &&
                    void runLifecycle(
                      () => archiveSemesterPlan(plan.id),
                      "تم أرشفة الخطة — للقراءة والطباعة فقط",
                    )
                  }
                >
                  <Archive className="ml-2 h-4 w-4" />
                  أرشفة
                </Button>
              ) : null}

              {actions.canPrint ? (
                <Button
                  variant="outline"
                  className="h-11"
                  disabled={busy || entries.length === 0}
                  onClick={() => setPrintOpen(true)}
                >
                  <Printer className="ml-2 h-4 w-4" />
                  طباعة خطة الفصل
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {view === "semester" ? (
        loading ? (
          <div className="flex min-h-[400px] flex-col items-center justify-center">
            <div className="mb-4 h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
            <p className="text-muted-foreground">جاري تحميل الخطة...</p>
          </div>
        ) : (
          <SemesterPlanTable
            entries={entries}
            busy={busy}
            readOnly={actions.isReadOnly}
            onMoveDate={(lessonId, date, period) => void onMoveDate(lessonId, date, period)}
            onShiftOrder={(lessonId, direction) => void onShiftOrder(lessonId, direction)}
          />
        )
      ) : (
        <FilledWeeklyTimetable />
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
