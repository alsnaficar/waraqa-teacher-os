import { useEffect } from "react";
import { getLessonContext } from "@/features/lesson-context/services/context-engine";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { ArrowRight, ClipboardList, FileText, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { PageShell } from "@/components/layout/page-shell";
import { SectionHeader } from "@/shared/components/section-header";
import { Card, CardContent } from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import { generateWorksheet } from "@/platform/ai/functions/ai.functions";
import { EntitlementDeniedCta } from "@/features/billing/components/entitlement-denied-cta";
import { useAIGeneration, useAIClipboard, useAIExport } from "@/features/ai/components/hooks";
import { AIGenerationForm } from "@/features/ai/components/ai-generation-form";
import { AILoadingState } from "@/features/ai/components/ai-loading-state";
import { AIExportPanel } from "@/features/ai/components/ai-export-panel";
import { SessionBindingRequiredGate } from "@/features/ai/components/session-binding-required-gate";
import { useHomeworkAiImport } from "@/features/homework/hooks/useHomeworkAiImport";

const SearchSchema = z.object({
  lessonSessionId: z.string().uuid().optional(),
  stage: z.enum(["primary", "intermediate", "secondary"]).optional(),
  grade: z.string().optional(),
  subject: z.string().optional(),
  title: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/ai-worksheet")({
  validateSearch: (s) => SearchSchema.parse(s),
  head: () => ({
    meta: [
      { title: "مولّد الواجب — Waraqa" },
      { name: "description", content: "أنشئ واجباً باللغة العربية في ثوانٍ." },
      { property: "og:title", content: "مولّد الواجب — Waraqa" },
      { property: "og:description", content: "أنشئ واجباً باللغة العربية في ثوانٍ." },
    ],
  }),
  component: WorksheetPage,
});

const FormSchema = z.object({
  stage: z.enum(["primary", "intermediate", "secondary"]).optional(),
  semester: z.string().optional(),
  grade: z.string().trim().min(1, "الصف مطلوب").max(120),
  subject: z.string().trim().min(1, "المادة مطلوبة").max(120),
  title: z.string().trim().min(1, "عنوان الدرس مطلوب").max(200, "العنوان طويل جداً"),
  questionCount: z
    .number({ invalid_type_error: "عدد الأسئلة مطلوب" })
    .int("عدد الأسئلة يجب أن يكون رقماً صحيحاً")
    .min(1, "الحد الأدنى سؤال واحد")
    .max(50, "الحد الأقصى 50 سؤالاً"),
  difficulty: z.enum(["easy", "medium", "hard"], {
    errorMap: () => ({ message: "المستوى مطلوب" }),
  }),
  objectives: z.string().max(1000, "الأهداف يجب ألا تتجاوز 1000 حرف").optional().default(""),
  homeworkType: z
    .enum(["essay", "mcq", "true_false", "mixed"], {
      errorMap: () => ({ message: "نوع الواجب مطلوب" }),
    })
    .optional()
    .default("mixed"),
  estimatedTime: z
    .number({ invalid_type_error: "الوقت المقدر مطلوب" })
    .int("الوقت يجب أن يكون رقماً صحيحاً")
    .min(1, "الحد الأدنى دقيقة واحدة")
    .max(180, "الحد الأقصى 180 دقيقة")
    .optional()
    .default(30),
});

const DIFFICULTY_LABEL: Record<"easy" | "medium" | "hard", string> = {
  easy: "سهل",
  medium: "متوسط",
  hard: "صعب",
};

const HOMEWORK_TYPE_LABEL: Record<"essay" | "mcq" | "true_false" | "mixed", string> = {
  essay: "أسئلة مقالية",
  mcq: "اختيار من متعدد",
  true_false: "صواب أو خطأ",
  mixed: "مختلط (متنوعة)",
};

function WorksheetPage() {
  const generate = useServerFn(generateWorksheet);
  const search = Route.useSearch();
  const lessonSessionId = search.lessonSessionId;
  const navigate = useNavigate();
  const { createDraftFromWorksheetGeneration } = useHomeworkAiImport();

  const mutation = useMutation({
    mutationFn: (input: z.input<typeof FormSchema>) => {
      if (!lessonSessionId) {
        throw new Error("lessonSessionId مطلوب — افتح الأداة من حصة درس.");
      }
      return generate({ data: { ...input, lessonSessionId } });
    },
  });

  const {
    curriculum,
    setCurriculum,
    title,
    setTitle,
    questionCount,
    setQuestionCount,
    difficulty,
    setDifficulty,
    objectives,
    setObjectives,
    homeworkType,
    setHomeworkType,
    estimatedTime,
    setEstimatedTime,
    errors,
    editedContent,
    setEditedContent,
    activeTab,
    setActiveTab,
    validateAndGenerate,
  } = useAIGeneration({
    initialCurriculum: {
      stage: search.stage ?? "",
      grade: search.grade ?? "",
      subject: search.subject ?? "",
      semester: "",
    },
    initialTitle: search.title ?? "",
    schema: FormSchema,
    mutation,
  });

  const { copy, copied } = useAIClipboard();
  const { downloadDocx, exporting } = useAIExport();

  const generationId = mutation.data?.id as string | undefined;
  const importPending = createDraftFromWorksheetGeneration.isPending;

  async function handleCreateDraftHomework() {
    if (!generationId) {
      toast.error("لا يوجد توليد جاهز لاستيراد الواجب.");
      return;
    }
    try {
      const result = await createDraftFromWorksheetGeneration.mutateAsync(generationId);
      toast.success("تم إنشاء مسودة الواجب.");
      await navigate({
        to: "/homework",
        search: { homeworkId: result.homework.id },
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر إنشاء مسودة الواجب.");
    }
  }

  useEffect(() => {
    if (search.title) return;

    async function loadContext() {
      const context = await getLessonContext();

      if (!context) return;

      const stage = context.grade.includes("متوسط")
        ? "intermediate"
        : context.grade.includes("ثانوي")
          ? "secondary"
          : "primary";

      setCurriculum({
        stage,
        grade: context.grade,
        subject: context.subject,
        semester: "",
      });

      setTitle(context.title);
    }

    void loadContext();
  }, [search.title, setCurriculum, setTitle]);

  const handleCopy = async () => {
    await copy(editedContent);
  };

  const handleDownload = async () => {
    await downloadDocx({
      title: `الواجب المنزلي: ${title}`,
      subtitle: `${curriculum.subject} — ${curriculum.grade} — ${DIFFICULTY_LABEL[difficulty]} — ${HOMEWORK_TYPE_LABEL[homeworkType]}`,
      content: editedContent,
      filename: title || "homework",
    });
  };

  if (!lessonSessionId) {
    return <SessionBindingRequiredGate toolLabel="ورقة العمل / الواجب" />;
  }

  return (
    <PageShell>
      <div className="mb-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/ai">
            <ArrowRight className="ml-1 h-4 w-4" />
            رجوع
          </Link>
        </Button>
      </div>
      <SectionHeader
        title="مولّد الواجب"
        description="أدخل بيانات الدرس وسنولّد لك واجباً مميزاً جاهزاً بلمح البصر."
      />

      <div className="grid gap-6 lg:grid-cols-12 items-start">
        {/* Form Card */}
        <Card className="lg:col-span-5 shadow-sm border border-slate-100">
          <CardContent className="space-y-5 p-6">
            <AIGenerationForm
              curriculum={curriculum}
              onCurriculumChange={setCurriculum}
              title={title}
              onTitleChange={setTitle}
              questionCount={questionCount}
              onQuestionCountChange={setQuestionCount}
              difficulty={difficulty}
              onDifficultyChange={setDifficulty}
              objectives={objectives}
              onObjectivesChange={setObjectives}
              homeworkType={homeworkType}
              onHomeworkTypeChange={setHomeworkType}
              estimatedTime={estimatedTime}
              onEstimatedTimeChange={setEstimatedTime}
              errors={errors}
              isPending={mutation.isPending}
              hasData={!!mutation.data}
              onSubmit={validateAndGenerate}
            />
          </CardContent>
        </Card>

        {/* Output Card */}
        <Card className="lg:col-span-7 shadow-sm border border-slate-100 min-h-[500px]">
          <CardContent className="p-6">
            {mutation.isPending ? (
              <AILoadingState
                title="جارٍ توليد الواجب الذكي..."
                description="يقوم الذكاء الاصطناعي بصياغة الأسئلة، تنظيم مفتاح الإجابات وتنسيق محتوى الدرس."
              />
            ) : mutation.data ? (
              <div className="space-y-4">
                <div className="flex flex-col gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-900/40">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="default"
                      size="sm"
                      className="min-h-11 h-11"
                      disabled={!generationId || importPending}
                      onClick={() => {
                        void handleCreateDraftHomework();
                      }}
                    >
                      {importPending ? (
                        <Loader2 className="ml-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <ClipboardList className="ml-1.5 h-3.5 w-3.5" />
                      )}
                      إنشاء واجب مسودة
                    </Button>
                  </div>
                  <p className="text-xs leading-relaxed text-slate-500">
                    سيتم إنشاء واجب مسودة يمكنك مراجعته وتعديله قبل إسناده.
                  </p>
                </div>

                <AIExportPanel
                  activeTab={activeTab}
                  onTabChange={setActiveTab}
                  content={editedContent}
                  onContentChange={setEditedContent}
                  onCopy={handleCopy}
                  onDownload={handleDownload}
                  onRegenerate={() => {
                    void validateAndGenerate();
                  }}
                  isPending={mutation.isPending}
                  copied={copied}
                  exporting={exporting}
                />
              </div>
            ) : mutation.isError ? (
              <div className="flex min-h-[450px] flex-col items-center justify-center gap-4 text-center p-8">
                <div className="p-3 bg-red-50 text-red-600 rounded-full">
                  <RefreshCw className="h-8 w-8" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">
                    فشل في توليد الواجب
                  </h3>
                  <p className="text-sm text-destructive max-w-xs">
                    {(mutation.error as Error).message}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={validateAndGenerate}
                  className="gap-2 mt-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  إعادة المحاولة
                </Button>
                <EntitlementDeniedCta error={mutation.error} />
              </div>
            ) : (
              <div className="flex min-h-[450px] flex-col items-center justify-center text-center p-8 space-y-4">
                <div className="p-4 bg-indigo-50/50 dark:bg-indigo-950/20 text-indigo-500 rounded-full">
                  <FileText className="h-10 w-10" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-semibold text-slate-700 dark:text-slate-300">
                    مستعد للبدء
                  </h3>
                  <p className="text-sm text-muted-foreground max-w-xs">
                    املأ البيانات في النموذج واضغط على "توليد الواجب" لإنتاج محتوى مخصص بالكامل في
                    ثوانٍ.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
