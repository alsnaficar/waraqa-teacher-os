import { getLessonSessionView } from "@/platform/lesson-sessions/get-lesson-session-view.functions";
import { getCurrentLessonPreparation } from "@/platform/lesson-sessions/get-current-lesson-preparation.functions";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { useState, useEffect } from "react";
import {
  ArrowRight,
  FileText,
  RefreshCw,
  Clock,
  BookOpen,
  Layers,
  Award,
  Sparkles,
  Loader2,
  Brain,
  Heart,
  Activity,
  CheckSquare,
  Home,
  Tag,
  Download,
  Copy,
  Check,
  Edit2,
  Eye,
} from "lucide-react";

import { PageShell } from "@/components/layout/page-shell";
import { SectionHeader } from "@/shared/components/section-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import { Label } from "@/shared/ui/label";
import { Input } from "@/shared/ui/input";
import { Textarea } from "@/shared/ui/textarea";
import { AILoadingState } from "@/features/ai/components/ai-loading-state";
import { SessionBindingRequiredGate } from "@/features/ai/components/session-binding-required-gate";
import { prepareLessonSession } from "@/platform/lesson-sessions/prepare-lesson-session.functions";
import { EntitlementDeniedCta } from "@/features/billing/components/entitlement-denied-cta";
import { downloadStructuredLessonPrepDocx, copyToClipboard } from "@/platform/ai/docx";
import {
  CONFIG_ACADEMIC_CALENDAR_DATE,
  CONFIG_SCHEDULE_OVERRIDES_DATE,
} from "@/features/planner/services/planner-engine";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";

const SearchSchema = z.object({
  lessonSessionId: z.string().uuid().optional(),
  stage: z.enum(["primary", "intermediate", "secondary"]).optional(),
  grade: z.string().optional(),
  subject: z.string().optional(),
  title: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/ai-lesson-plan")({
  validateSearch: (s) => SearchSchema.parse(s),
  head: () => ({
    meta: [
      { title: "تحضير الدروس الذكي — Waraqa" },
      { name: "description", content: "أنشئ تحضير درس متكامل باللغة العربية في ثوانٍ." },
      { property: "og:title", content: "تحضير الدروس الذكي — Waraqa" },
      { property: "og:description", content: "أنشئ تحضير درس متكامل باللغة العربية في ثوانٍ." },
    ],
  }),
  component: LessonPlanPage,
});

interface BehavioralObjectives {
  cognitive: string[];
  affective: string[];
  psychomotor: string[];
}

interface StrategiesAndDigitalSkills {
  strategies: string[];
  digitalSkills: string[];
}

interface LessonScenario {
  introduction: string;
  exercises: string[];
  deliveryScript: string;
}

interface AssessmentAndHomework {
  homework: string;
  summativeAssessment: string[];
}

interface StructuredLessonPrep {
  behavioralObjectives: BehavioralObjectives;
  strategiesAndDigitalSkills: StrategiesAndDigitalSkills;
  lessonScenario: LessonScenario;
  assessmentAndHomework: AssessmentAndHomework;
}

function convertStructuredToMarkdown(
  subject: string,
  grade: string,
  lessonName: string,
  unit: string,
  data: StructuredLessonPrep,
): string {
  if (!data) return "";
  return `# تحضير درس: ${lessonName}
**المادة:** ${subject} | **الصف:** ${grade} ${unit ? `| **الوحدة الدراسية:** ${unit}` : ""}

## 1. الأهداف السلوكية للدرس
### الأهداف المعرفية:
${data.behavioralObjectives?.cognitive?.map((item: string) => `- ${item}`).join("\n") || ""}

### الأهداف الوجدانية والتربوية:
${data.behavioralObjectives?.affective?.map((item: string) => `- ${item}`).join("\n") || ""}

### الأهداف المهارية والعملية:
${data.behavioralObjectives?.psychomotor?.map((item: string) => `- ${item}`).join("\n") || ""}

## 2. إستراتيجيات التدريس والوسائل الرقمية
### إستراتيجيات التدريس المستخدمة:
${data.strategiesAndDigitalSkills?.strategies?.map((item: string) => `- ${item}`).join("\n") || ""}

### المهارات الرقمية والأدوات التقنية والمنصات:
${data.strategiesAndDigitalSkills?.digitalSkills?.map((item: string) => `- ${item}`).join("\n") || ""}

## 3. سيناريو الحصة وخطة الشرح
### التمهيد والتهيئة الحافزة:
${data.lessonScenario?.introduction || ""}

### خطوات عرض المفهوم والشرح بالتفصيل:
${data.lessonScenario?.deliveryScript || ""}

### التمارين والأنشطة الصفية المقترحة:
${data.lessonScenario?.exercises?.map((item: string) => `- ${item}`).join("\n") || ""}

## 4. التقويم الختامي والواجبات
### الواجب المنزلي المقترح:
${data.assessmentAndHomework?.homework || ""}

### أسئلة التقويم الختامي للدرس:
${data.assessmentAndHomework?.summativeAssessment?.map((item: string) => `- ${item}`).join("\n") || ""}
`;
}

function LessonPlanPage() {
  const prepare = useServerFn(prepareLessonSession);
  const search = Route.useSearch();
  const lessonSessionId = search.lessonSessionId;

  const getSessionView = useServerFn(getLessonSessionView);
  const getCurrentPreparation = useServerFn(getCurrentLessonPreparation);
  const [sessionView, setSessionView] = useState<Awaited<ReturnType<typeof getSessionView>> | null>(
    null,
  );

  const [currentPreparation, setCurrentPreparation] = useState<Awaited<
    ReturnType<typeof getCurrentLessonPreparation>
  > | null>(null);

  const curriculum = {
    stage: sessionView?.grade?.includes("متوسط")
      ? "intermediate"
      : sessionView?.grade?.includes("ثانوي")
        ? "secondary"
        : "primary",
    grade: sessionView?.grade ?? "",
    subject: sessionView?.subject ?? "",
    semester: "",
  } as const;

  const [lessonName, setLessonName] = useState(search.title ?? "");
  const [objectives, setObjectives] = useState("");
  const [unit, setUnit] = useState("");
  const [duration, setDuration] = useState("45 دقيقة");
  const [lessonId, setLessonId] = useState<string | null>(null);
  const [suggestedDate, setSuggestedDate] = useState("");
  const [viewMode, setViewMode] = useState<"interactive" | "markdown">("interactive");
  const [editedMarkdown, setEditedMarkdown] = useState("");
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!lessonSessionId) return;

    let cancelled = false;

    async function loadSessionView() {
      try {
        const view = await getSessionView({
          data: { lessonSessionId },
        });

        if (cancelled) return;

        setSessionView(view);

        const preparation = await getCurrentPreparation({
          data: { lessonSessionId },
        });

        if (cancelled) return;

        setCurrentPreparation(preparation);

        if (preparation?.content) {
          setEditedMarkdown(
            convertStructuredToMarkdown(
              view.subject,
              view.grade,
              view.lessonTitle,
              view.unitTitle ?? "",
              preparation.content as StructuredLessonPrep,
            ),
          );
        }

        setLessonName(view.lessonTitle);
        setLessonId(view.curriculumLessonId);
        setObjectives(view.lessonObjectives ?? "");
        setUnit(view.unitTitle ?? "");
        setSuggestedDate(view.sessionDate);

        toast.success(
          preparation
            ? `تم تحميل الحصة والتحضير المحفوظ: ${view.lessonTitle}`
            : `تم تحميل الحصة: ${view.lessonTitle}`,
        );
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to load lesson session:", err);
          toast.error(err instanceof Error ? err.message : "تعذر تحميل بيانات الحصة.");
        }
      }
    }

    loadSessionView();

    return () => {
      cancelled = true;
    };
  }, [lessonSessionId, getSessionView, getCurrentPreparation]);

  const mutation = useMutation({
    mutationFn: async (input: { lessonSessionId: string }) => {
      return prepare({ data: input });
    },
    onSuccess: async () => {
      // The Prepare pipeline persists the generation and marks the session prepared.
      // Reload the authoritative session/preparation state from the server.
      if (!lessonSessionId) return;

      try {
        const [view, preparation] = await Promise.all([
          getSessionView({ data: { lessonSessionId } }),
          getCurrentPreparation({ data: { lessonSessionId } }),
        ]);

        setSessionView(view);
        setCurrentPreparation(preparation);

        if (preparation?.content) {
          setEditedMarkdown(
            convertStructuredToMarkdown(
              view.subject,
              view.grade,
              view.lessonTitle,
              view.unitTitle ?? "",
              preparation.content as StructuredLessonPrep,
            ),
          );
        }

        setLessonName(view.lessonTitle);
        setLessonId(view.curriculumLessonId);
        setObjectives(view.lessonObjectives ?? "");
        setUnit(view.unitTitle ?? "");
        setSuggestedDate(view.sessionDate);

        toast.success("تم توليد تحضير الدرس وحفظه بنجاح!");
      } catch (error) {
        console.error("Failed to reload prepared lesson:", error);
        toast.error("تم التوليد، لكن تعذر تحديث شاشة التحضير.");
      }
    },
    onError: (error) => {
      console.error(error);
      toast.error(error.message || "فشل في توليد تحضير الدرس.");
    },
  });

  const resetMutation = mutation.reset;

  useEffect(() => {
    resetMutation();
    setEditedMarkdown("");
    setCurrentPreparation(null);
  }, [lessonSessionId, resetMutation]);

  const handleGenerate = () => {
    const errors: Record<string, string> = {};
    if (!curriculum.subject) errors.subject = "المادة الدراسية مطلوبة";
    if (!curriculum.grade) errors.grade = "الصف الدراسي مطلوب";
    if (!lessonName.trim()) errors.lessonName = "اسم الدرس مطلوب";

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      toast.error("يرجى ملء الحقول المطلوبة أولاً.");
      return;
    }

    setValidationErrors({});
    mutation.mutate({
      lessonSessionId: lessonSessionId!,
    });
  };
  const handleCopy = async () => {
    const contentToCopy =
      viewMode === "markdown"
        ? editedMarkdown
        : lessonData
          ? convertStructuredToMarkdown(
              curriculum.subject,
              curriculum.grade,
              lessonName,
              unit,
              lessonData,
            )
          : "";

    if (!contentToCopy) return;
    const success = await copyToClipboard(contentToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = async () => {
    if (!lessonData) return;
    setExporting(true);
    try {
      await downloadStructuredLessonPrepDocx({
        title: lessonName,
        subject: curriculum.subject,
        grade: curriculum.grade,
        duration,
        unit: unit || "غير محدد",
        data: lessonData,
        filename: lessonName || "تحضير_درس",
      });
    } finally {
      setExporting(false);
    }
  };

  const isPending = mutation.isPending;
  const lessonData = currentPreparation?.content as StructuredLessonPrep | undefined;

  if (!lessonSessionId) {
    return <SessionBindingRequiredGate toolLabel="تحضير الدرس" />;
  }

  return (
    <PageShell>
      <div className="mb-4">
        <Button
          asChild
          variant="ghost"
          size="sm"
          id="btn-back"
          className="h-10 text-slate-600 hover:text-slate-900"
        >
          <Link to="/ai">
            <ArrowRight className="ml-2 h-4 w-4" />
            العودة إلى الأدوات
          </Link>
        </Button>
      </div>

      <SectionHeader
        title="التحضير الذكي للدروس (منصة مدرستي)"
        description="صمم تحضيراً دراسياً نموذجياً متكاملاً متوافقاً مع معايير وزارة التعليم السعودية ومنصة مدرستي بالذكاء الاصطناعي."
      />

      <div className="grid gap-6 lg:grid-cols-12 items-start mt-4">
        {/* Input Form Column */}
        <div className="lg:col-span-5 space-y-6">
          <Card className="shadow-md border border-slate-100/80 bg-white" id="card-generator-form">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-indigo-600" />
                بيانات الدرس الأساسية
              </CardTitle>
              <CardDescription>أدخل تفاصيل الدرس للحصول على تحضير تفصيلي متناسق.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label
                  htmlFor="lessonName"
                  className="font-semibold text-slate-700 dark:text-slate-300"
                >
                  اسم أو عنوان الدرس <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="lessonName"
                  value={lessonName}
                  onChange={(e) => setLessonName(e.target.value)}
                  placeholder="مثال: الكسور المتكافئة أو أركان الصلاة"
                  className={`h-11 ${validationErrors.lessonName ? "border-red-500" : ""}`}
                />
                {validationErrors.lessonName && (
                  <p className="text-xs text-red-500">{validationErrors.lessonName}</p>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label
                    htmlFor="unit"
                    className="font-semibold text-slate-700 dark:text-slate-300"
                  >
                    الوحدة الدراسية (اختياري)
                  </Label>
                  <div className="relative">
                    <Input
                      id="unit"
                      value={unit}
                      onChange={(e) => setUnit(e.target.value)}
                      placeholder="مثال: الوحدة الثالثة"
                      className="h-11 pl-9"
                    />
                    <Tag className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label
                    htmlFor="duration"
                    className="font-semibold text-slate-700 dark:text-slate-300"
                  >
                    زمن الدرس
                  </Label>
                  <div className="relative">
                    <Input
                      id="duration"
                      value={duration}
                      onChange={(e) => setDuration(e.target.value)}
                      placeholder="45 دقيقة"
                      className="h-11 pl-9"
                    />
                    <Clock className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="objectives"
                  className="font-semibold text-slate-700 dark:text-slate-300"
                >
                  التركيز أو الأهداف الإضافية (اختياري)
                </Label>
                <Textarea
                  id="objectives"
                  value={objectives}
                  onChange={(e) => setObjectives(e.target.value)}
                  placeholder="مثال: التركيز على القيم الإسلامية، أو توجيهات خاصة للفروق الفردية..."
                  className="min-h-[100px] resize-none text-right"
                  maxLength={1000}
                />
              </div>

              <Button
                id="btn-submit"
                onClick={handleGenerate}
                className="w-full h-12 text-base font-semibold mt-4 transition-all duration-200"
                disabled={isPending}
              >
                {isPending ? (
                  <>
                    <Loader2 className="ml-2 h-5 w-5 animate-spin" />
                    جاري صياغة الخطة والتحضير...
                  </>
                ) : lessonData ? (
                  <>
                    <RefreshCw className="ml-2 h-5 w-5" />
                    إعادة توليد التحضير
                  </>
                ) : (
                  <>
                    <Sparkles className="ml-2 h-5 w-5" />
                    توليد تحضير الدرس الذكي
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Output/Preview Column */}
        <div className="lg:col-span-7">
          <Card
            className="shadow-md border border-slate-100 min-h-[600px] bg-slate-50/50"
            id="card-generator-output"
          >
            {isPending ? (
              <CardContent className="p-8">
                <AILoadingState
                  title="يقوم الذكاء الاصطناعي بإعداد خطة الدرس حالياً..."
                  description="يتم توليد الأهداف السلوكية (المعرفية والوجدانية والمهارية)، واقتراح استراتيجيات التدريس الحديثة، المهارات الرقمية، التمهيد المشوق، سيناريو الشرح بالتفصيل، وتجهيز أسئلة التقويم والواجبات."
                />
              </CardContent>
            ) : lessonData ? (
              <div className="p-6 space-y-6">
                {/* Actions Toolbar */}
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
                  {/* View Modes */}
                  <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                    <button
                      onClick={() => setViewMode("interactive")}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                        viewMode === "interactive"
                          ? "bg-white text-indigo-700 shadow-sm"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      <Eye className="h-4 w-4" />
                      عرض تفاعلي
                    </button>
                    <button
                      onClick={() => setViewMode("markdown")}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                        viewMode === "markdown"
                          ? "bg-white text-indigo-700 shadow-sm"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      <Edit2 className="h-4 w-4" />
                      تعديل النص (Markdown)
                    </button>
                  </div>

                  {/* Actions buttons */}
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCopy}
                      className="h-10 px-3 flex items-center gap-1.5 border-slate-200"
                    >
                      {copied ? (
                        <>
                          <Check className="h-4 w-4 text-green-600" />
                          تم النسخ
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4" />
                          نسخ التحضير
                        </>
                      )}
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={handleDownload}
                      disabled={exporting}
                      className="h-10 px-3 flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700"
                    >
                      {exporting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4" />
                      )}
                      تصدير Word (DOCX)
                    </Button>
                  </div>
                </div>

                {/* Content rendering based on viewMode */}
                {viewMode === "interactive" ? (
                  <div className="space-y-6 text-right" dir="rtl">
                    {/* Lesson Header Badge */}
                    <div className="bg-indigo-50/70 border border-indigo-100 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <h3 className="font-bold text-indigo-950 text-base">{lessonName}</h3>
                        <p className="text-xs text-indigo-700 mt-1">
                          {curriculum.subject} • {curriculum.grade} {unit && `• ${unit}`}
                        </p>
                      </div>
                      <div className="bg-white/80 border border-indigo-100 px-3 py-1.5 rounded-lg text-xs font-semibold text-indigo-800 flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-indigo-600" />
                        {duration}
                      </div>
                    </div>

                    {/* Section 1: Objectives */}
                    <Card className="border border-slate-100 shadow-sm bg-white overflow-hidden">
                      <div className="bg-slate-50 border-b border-slate-100 px-5 py-3.5 flex items-center gap-2.5">
                        <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-md">
                          <Brain className="h-4 w-4" />
                        </div>
                        <h4 className="font-bold text-slate-800 text-sm">
                          الأهداف السلوكية (معايير منصة مدرستي)
                        </h4>
                      </div>
                      <CardContent className="p-5 space-y-4">
                        <div className="grid gap-4 sm:grid-cols-3">
                          {/* Cognitive */}
                          <div className="bg-blue-50/30 border border-blue-50 rounded-xl p-4">
                            <h5 className="font-bold text-blue-900 text-xs flex items-center gap-1.5 mb-2.5">
                              <Brain className="h-4 w-4 text-blue-600" />
                              الأهداف المعرفية
                            </h5>
                            <ul className="space-y-2 text-xs text-slate-700">
                              {lessonData.behavioralObjectives?.cognitive?.map((obj, i) => (
                                <li key={i} className="flex items-start gap-1.5">
                                  <span className="text-blue-500 font-semibold">•</span>
                                  <span>{obj}</span>
                                </li>
                              ))}
                            </ul>
                          </div>

                          {/* Affective */}
                          <div className="bg-rose-50/30 border border-rose-50 rounded-xl p-4">
                            <h5 className="font-bold text-rose-900 text-xs flex items-center gap-1.5 mb-2.5">
                              <Heart className="h-4 w-4 text-rose-600" />
                              الوجدانية والتربوية
                            </h5>
                            <ul className="space-y-2 text-xs text-slate-700">
                              {lessonData.behavioralObjectives?.affective?.map((obj, i) => (
                                <li key={i} className="flex items-start gap-1.5">
                                  <span className="text-rose-500 font-semibold">•</span>
                                  <span>{obj}</span>
                                </li>
                              ))}
                            </ul>
                          </div>

                          {/* Psychomotor */}
                          <div className="bg-emerald-50/30 border border-emerald-50 rounded-xl p-4">
                            <h5 className="font-bold text-emerald-900 text-xs flex items-center gap-1.5 mb-2.5">
                              <Activity className="h-4 w-4 text-emerald-600" />
                              المهارية والعملية
                            </h5>
                            <ul className="space-y-2 text-xs text-slate-700">
                              {lessonData.behavioralObjectives?.psychomotor?.map((obj, i) => (
                                <li key={i} className="flex items-start gap-1.5">
                                  <span className="text-emerald-500 font-semibold">•</span>
                                  <span>{obj}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Section 2: Strategies & Tools */}
                    <Card className="border border-slate-100 shadow-sm bg-white overflow-hidden">
                      <div className="bg-slate-50 border-b border-slate-100 px-5 py-3.5 flex items-center gap-2.5">
                        <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-md">
                          <Layers className="h-4 w-4" />
                        </div>
                        <h4 className="font-bold text-slate-800 text-sm">
                          استراتيجيات التدريس والوسائل التقنية
                        </h4>
                      </div>
                      <CardContent className="p-5 grid gap-4 sm:grid-cols-2">
                        {/* Strategies */}
                        <div className="space-y-2.5">
                          <Label className="text-slate-800 font-bold text-xs flex items-center gap-1.5">
                            <Layers className="h-4 w-4 text-indigo-500" />
                            استراتيجيات التدريس النشط
                          </Label>
                          <div className="flex flex-wrap gap-1.5">
                            {lessonData.strategiesAndDigitalSkills?.strategies?.map((strat, i) => (
                              <span
                                key={i}
                                className="bg-slate-100 text-slate-800 border border-slate-200/60 px-3 py-1.5 rounded-lg text-xs"
                              >
                                {strat}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Digital Skills */}
                        <div className="space-y-2.5">
                          <Label className="text-slate-800 font-bold text-xs flex items-center gap-1.5">
                            <Sparkles className="h-4 w-4 text-indigo-500" />
                            المهارات والأدوات الرقمية والمنصات
                          </Label>
                          <div className="flex flex-wrap gap-1.5">
                            {lessonData.strategiesAndDigitalSkills?.digitalSkills?.map(
                              (skill, i) => (
                                <span
                                  key={i}
                                  className="bg-indigo-50/50 text-indigo-900 border border-indigo-100/50 px-3 py-1.5 rounded-lg text-xs"
                                >
                                  {skill}
                                </span>
                              ),
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Section 3: Scenario */}
                    <Card className="border border-slate-100 shadow-sm bg-white overflow-hidden">
                      <div className="bg-slate-50 border-b border-slate-100 px-5 py-3.5 flex items-center gap-2.5">
                        <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-md">
                          <BookOpen className="h-4 w-4" />
                        </div>
                        <h4 className="font-bold text-slate-800 text-sm">
                          سيناريو الحصة وخطة الشرح
                        </h4>
                      </div>
                      <CardContent className="p-5 space-y-5">
                        {/* Intro */}
                        <div className="bg-indigo-50/20 border border-indigo-50/60 p-4 rounded-xl space-y-2">
                          <h5 className="font-bold text-indigo-950 text-xs flex items-center gap-1.5">
                            <BookOpen className="h-4 w-4 text-indigo-600" />
                            التمهيد والتهيئة الحافزة
                          </h5>
                          <p className="text-xs text-slate-700 leading-relaxed">
                            {lessonData.lessonScenario?.introduction}
                          </p>
                        </div>

                        {/* Script */}
                        <div className="space-y-2">
                          <h5 className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                            <Sparkles className="h-4 w-4 text-indigo-500" />
                            سيناريو وخطوات الشرح بالتفصيل
                          </h5>
                          <p className="text-xs text-slate-700 leading-relaxed bg-slate-50/50 border border-slate-100 p-4 rounded-xl whitespace-pre-line">
                            {lessonData.lessonScenario?.deliveryScript}
                          </p>
                        </div>

                        {/* Exercises */}
                        <div className="space-y-2.5">
                          <h5 className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                            <Award className="h-4 w-4 text-indigo-500" />
                            التمارين والتطبيقات الصفية الموصى بها
                          </h5>
                          <ul className="grid gap-2 sm:grid-cols-2 text-xs text-slate-700">
                            {lessonData.lessonScenario?.exercises?.map((ex, i) => (
                              <li
                                key={i}
                                className="bg-slate-50/80 border border-slate-100/80 rounded-xl p-3 flex items-start gap-2"
                              >
                                <span className="bg-indigo-100 text-indigo-700 h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                                  {i + 1}
                                </span>
                                <span>{ex}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Section 4: Assessment & Homework */}
                    <Card className="border border-slate-100 shadow-sm bg-white overflow-hidden">
                      <div className="bg-slate-50 border-b border-slate-100 px-5 py-3.5 flex items-center gap-2.5">
                        <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-md">
                          <CheckSquare className="h-4 w-4" />
                        </div>
                        <h4 className="font-bold text-slate-800 text-sm">
                          التقويم والواجبات المنزلية
                        </h4>
                      </div>
                      <CardContent className="p-5 grid gap-4 sm:grid-cols-2">
                        {/* Homework */}
                        <div className="bg-amber-50/20 border border-amber-50 rounded-xl p-4 space-y-2">
                          <h5 className="font-bold text-amber-900 text-xs flex items-center gap-1.5">
                            <Home className="h-4 w-4 text-amber-600" />
                            الواجب المنزلي المقترح
                          </h5>
                          <p className="text-xs text-slate-700 leading-relaxed">
                            {lessonData.assessmentAndHomework?.homework}
                          </p>
                        </div>

                        {/* Summative Assessment */}
                        <div className="space-y-2.5">
                          <h5 className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                            <CheckSquare className="h-4 w-4 text-indigo-500" />
                            أسئلة التقويم الختامي
                          </h5>
                          <ul className="space-y-2 text-xs text-slate-700">
                            {lessonData.assessmentAndHomework?.summativeAssessment?.map(
                              (quest, i) => (
                                <li key={i} className="flex items-start gap-1.5">
                                  <span className="text-indigo-600 font-semibold">•</span>
                                  <span>{quest}</span>
                                </li>
                              ),
                            )}
                          </ul>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <Label className="text-xs text-slate-500 block">
                      يمكنك نسخ وتعديل نص تحضير الدرس بصيغة Markdown مباشرة:
                    </Label>
                    <Textarea
                      dir="rtl"
                      value={editedMarkdown}
                      onChange={(e) => setEditedMarkdown(e.target.value)}
                      className="min-h-[500px] text-xs font-mono p-4 text-right bg-white"
                    />
                  </div>
                )}
              </div>
            ) : mutation.isError ? (
              <div
                className="flex min-h-[550px] flex-col items-center justify-center gap-4 text-center p-8 bg-white rounded-lg border border-red-100"
                id="error-container"
              >
                <div className="p-3 bg-red-50 text-red-600 rounded-full">
                  <RefreshCw className="h-8 w-8 animate-spin" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">
                    فشل في توليد تحضير الدرس
                  </h3>
                  <p className="text-xs text-red-600 max-w-xs leading-relaxed">
                    {(mutation.error as Error).message}
                  </p>
                </div>
                <Button
                  id="btn-retry"
                  variant="secondary"
                  size="sm"
                  onClick={handleGenerate}
                  className="gap-2 mt-2 h-11 px-4 font-semibold"
                >
                  <RefreshCw className="h-4 w-4" />
                  إعادة المحاولة
                </Button>
                <EntitlementDeniedCta error={mutation.error} />
              </div>
            ) : (
              <div
                className="flex min-h-[550px] flex-col items-center justify-center text-center p-8 space-y-4 bg-white rounded-lg border border-dashed border-slate-200"
                id="empty-container"
              >
                <div className="p-4 bg-indigo-50/50 dark:bg-indigo-950/20 text-indigo-500 rounded-full">
                  <FileText className="h-10 w-10" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-slate-700 dark:text-slate-300">
                    بانتظار إدخال البيانات
                  </h3>
                  <p className="text-xs text-slate-500 max-w-xs leading-relaxed">
                    اختر المادة والصف وعنوان الدرس، ثم اضغط على "توليد تحضير الدرس الذكي" للحصول على
                    مخرجات ممتازة متوافقة مع منصة مدرستي والأنشطة الرقمية في ثوانٍ.
                  </p>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </PageShell>
  );
}
