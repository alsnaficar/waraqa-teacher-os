import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { getLessonContext } from "@/features/lesson-context/services/context-engine";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { toast } from "sonner";
import {
  ArrowRight,
  Copy,
  Download,
  Loader2,
  RefreshCw,
  Sparkles,
  BookOpen,
  CheckCircle2,
  HelpCircle,
  Clock,
  ClipboardList,
  GraduationCap,
  Eye,
  Check,
  FlaskConical,
} from "lucide-react";

import { PageShell } from "@/components/layout/page-shell";
import { SectionHeader } from "@/shared/components/section-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { generateQuizAndAssignment } from "@/platform/ai/functions/ai-quiz-generator.functions";
import { EntitlementDeniedCta } from "@/features/billing/components/entitlement-denied-cta";
import {
  copyToClipboard,
  downloadStructuredQuizAndAssignmentDocx,
  type StructuredQuizAndAssignmentData,
} from "@/platform/ai/docx";
import {
  CurriculumSelector,
  EMPTY_CURRICULUM,
  validateCurriculum,
  type CurriculumSelection,
  type CurriculumSelectorErrors,
} from "@/features/ai/components/curriculum-selector";
import { SessionBindingRequiredGate } from "@/features/ai/components/session-binding-required-gate";
import { useTestAiImport } from "@/features/tests/hooks/useTestAiImport";

const SearchSchema = z.object({
  lessonSessionId: z.string().uuid().optional(),
  stage: z.enum(["primary", "intermediate", "secondary"]).optional(),
  grade: z.string().optional(),
  subject: z.string().optional(),
  title: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/ai-quiz")({
  validateSearch: (s) => SearchSchema.parse(s),
  head: () => ({
    meta: [
      { title: "مولّد الاختبار والواجب التطبيقي — Waraqa" },
      {
        name: "description",
        content: "صمّم اختباراً تفاعلياً وواجبات تطبيقية متوافقة مع البيئة التعليمية السعودية.",
      },
      { property: "og:title", content: "مولّد الاختبار والواجب التطبيقي — Waraqa" },
    ],
  }),
  component: QuizPage,
});

const FormSchema = z.object({
  grade: z.string().trim().min(1, "الصف الدراسي مطلوب"),
  subject: z.string().trim().min(1, "المادة الدراسية مطلوبة"),
  title: z.string().trim().min(1, "عنوان الدرس مطلوب").max(200, "العنوان طويل جداً"),
  questionCount: z
    .number({ invalid_type_error: "عدد الأسئلة مطلوب" })
    .int("عدد الأسئلة يجب أن يكون رقماً صحيحاً")
    .min(1, "الحد الأدنى سؤال واحد")
    .max(25, "الحد الأقصى 25 سؤالاً"),
  difficulty: z.enum(["easy", "medium", "hard"], {
    errorMap: () => ({ message: "المستوى مطلوب" }),
  }),
});

type FieldErrors = Partial<Record<"title" | "questionCount" | "difficulty", string>> &
  CurriculumSelectorErrors;

const DIFFICULTY_LABEL: Record<"easy" | "medium" | "hard", string> = {
  easy: "سهل (تذكر وفهم)",
  medium: "متوسط (تطبيق وتحليل)",
  hard: "متقدم (تفكير ناقد وحل مشكلات)",
};

function QuizPage() {
  const generate = useServerFn(generateQuizAndAssignment);
  const search = Route.useSearch();
  const lessonSessionId = search.lessonSessionId;
  const navigate = useNavigate();
  const { createDraftFromQuizGeneration } = useTestAiImport();

  const [curriculum, setCurriculum] = useState<CurriculumSelection>({
    stage: search.stage ?? "",
    grade: search.grade ?? "",
    subject: search.subject ?? "",
    semester: "",
  });
  const [title, setTitle] = useState(search.title ?? "");
  const [questionCount, setQuestionCount] = useState("5");
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [activeTab, setActiveTab] = useState<"student" | "teacher">("student");

  const grade = curriculum.grade;
  const subject = curriculum.subject;

  const mutation = useMutation({
    mutationFn: (input: z.infer<typeof FormSchema>) => {
      if (!lessonSessionId) {
        throw new Error("lessonSessionId مطلوب — افتح الأداة من حصة درس.");
      }
      return generate({ data: { ...input, lessonSessionId } });
    },
  });

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
  }, [search.title]);

  function validateAndRun() {
    const curriculumErrors = validateCurriculum(curriculum) ?? {};
    const parsed = FormSchema.safeParse({
      grade,
      subject,
      title,
      questionCount: Number(questionCount),
      difficulty,
    });
    const fe: FieldErrors = { ...curriculumErrors };
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FieldErrors;
        if (key && !fe[key]) fe[key] = issue.message;
      }
    }
    if (Object.keys(fe).length) {
      setErrors(fe);
      return;
    }
    setErrors({});
    mutation.mutate(parsed.data!);
  }

  // Format the structured JSON into readable text for copy
  function handleCopy() {
    if (!mutation.data?.content) return;
    const data = mutation.data.content as StructuredQuizAndAssignmentData;
    let text = `=== ${data.title} ===\n\n`;

    text += `--- الجزء الأول: نسخة الطالب (للطباعة) ---\n\n`;
    if (data.mcqs?.length) {
      text += `أولاً: أسئلة الاختيار من متعدد\n`;
      data.mcqs.forEach((q, i) => {
        text += `س ${i + 1}: ${q.question}\n`;
        q.options.forEach((opt, oIdx) => {
          const letter = ["أ", "ب", "ج", "د"][oIdx];
          text += `  ${letter}) ${opt}\n`;
        });
        text += `\n`;
      });
    }

    if (data.trueFalse?.length) {
      text += `ثانياً: أسئلة صواب أم خطأ\n`;
      data.trueFalse.forEach((q, i) => {
        text += `س ${i + 1}: ${q.question} ( صواب / خطأ )\n`;
      });
      text += `\n`;
    }

    if (data.shortAnswer?.length) {
      text += `ثالثاً: الأسئلة المقالية القصيرة\n`;
      data.shortAnswer.forEach((q, i) => {
        text += `س ${i + 1}: ${q.question}\n`;
        text += `الإجابة: _________________________________\n\n`;
      });
    }

    if (data.homeworkAssignment) {
      text += `رابعاً: الواجب المنزلي التطبيقي (${data.homeworkAssignment.title})\n`;
      text += `${data.homeworkAssignment.description}\n`;
      text += `الزمن المتوقع للإنجاز: ${data.homeworkAssignment.estimatedTime}\n\n`;
    }

    text += `\n=========================================\n`;
    text += `--- الجزء الثاني: دليل تصحيح المعلم ---\n\n`;

    if (data.mcqs?.length) {
      text += `أولاً: إجابات الاختيار من متعدد\n`;
      data.mcqs.forEach((q, i) => {
        text += `س ${i + 1}: ${q.question}\n`;
        text += `الإجابة الصحيحة: ${q.correctAnswer}\n`;
        text += `التفسير العلمي: ${q.explanation}\n\n`;
      });
    }

    if (data.trueFalse?.length) {
      text += `ثانياً: إجابات صواب أم خطأ\n`;
      data.trueFalse.forEach((q, i) => {
        text += `س ${i + 1}: ${q.question}\n`;
        text += `الإجابة الصحيحة: ${q.correctAnswer ? "صواب" : "خطأ"}\n`;
        text += `التصحيح: ${q.correction}\n\n`;
      });
    }

    if (data.shortAnswer?.length) {
      text += `ثالثاً: نموذج إجابات الأسئلة المقالية\n`;
      data.shortAnswer.forEach((q, i) => {
        text += `س ${i + 1}: ${q.question}\n`;
        text += `نموذج الإجابة: ${q.sampleAnswer}\n\n`;
      });
    }

    if (data.homeworkAssignment) {
      text += `رابعاً: معايير تقييم الواجب التطبيقي\n`;
      text += `الواجب: ${data.homeworkAssignment.title}\n`;
      text += `وصف الواجب: ${data.homeworkAssignment.description}\n`;
      text += `معايير التقييم: ${data.homeworkAssignment.evaluationCriteria}\n`;
    }

    copyToClipboard(text);
  }

  async function handleDownload() {
    if (!mutation.data?.content) return;
    await downloadStructuredQuizAndAssignmentDocx({
      title: title,
      subject: subject,
      grade: grade,
      difficulty: DIFFICULTY_LABEL[difficulty],
      data: mutation.data.content as StructuredQuizAndAssignmentData,
      filename: title || "quiz_and_assignment",
    });
  }

  const generatedData = mutation.data?.content as StructuredQuizAndAssignmentData | undefined;
  const generationId = mutation.data?.id as string | undefined;
  const importPending = createDraftFromQuizGeneration.isPending;

  async function handleCreateDraftTest() {
    if (!generationId) {
      toast.error("لا يوجد توليد جاهز لاستيراد الاختبار.");
      return;
    }
    try {
      const result = await createDraftFromQuizGeneration.mutateAsync(generationId);
      if (result.reusedExisting) {
        toast.success("تم فتح المسودة المستوردة مسبقاً من هذا التوليد.");
      } else {
        const skippedNote =
          result.skippedShortAnswerCount > 0
            ? ` (تم تخطي ${result.skippedShortAnswerCount} سؤال مقالي قصير)`
            : "";
        toast.success(`تم إنشاء مسودة الاختبار${skippedNote}.`);
      }
      await navigate({
        to: "/tests",
        search: { testId: result.test.id },
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر إنشاء مسودة الاختبار.");
    }
  }

  if (!lessonSessionId) {
    return <SessionBindingRequiredGate toolLabel="الاختبار والواجب" />;
  }

  return (
    <PageShell>
      <div className="mb-2">
        <Button asChild variant="ghost" size="sm" id="btn-back-ai">
          <Link to="/ai">
            <ArrowRight className="ml-1 h-4 w-4" />
            رجوع إلى الأدوات
          </Link>
        </Button>
      </div>

      <SectionHeader
        title="حزمة التقييم والواجب التطبيقي"
        description="أنشئ اختباراً متكاملاً (متعدد الخيارات، صواب وخطأ، مقالي) بالإضافة إلى واجب منزلي تطبيقي يربط المفاهيم بالحياة الواقعية."
      />

      <div className="grid gap-6 lg:grid-cols-12 items-start">
        {/* Form Panel */}
        <div className="lg:col-span-5 space-y-6">
          <Card id="quiz-form-card" className="border-slate-200/80 shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-bold text-slate-800">
                بيانات الدرس والتقويم
              </CardTitle>
              <CardDescription>حدد المنهج ومستوى الأسئلة لإنشاء الاختبار</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <CurriculumSelector value={curriculum} onChange={setCurriculum} errors={errors} />

              <div className="space-y-2">
                <Label htmlFor="title" className="text-sm font-semibold">
                  عنوان الدرس المستهدف
                </Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="مثال: الضوء ومصادره، أو جمع الطرح"
                  aria-invalid={!!errors.title}
                  className="bg-white"
                />
                {errors.title ? <p className="text-xs text-destructive">{errors.title}</p> : null}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="questionCount" className="text-sm font-semibold">
                    إجمالي عدد الأسئلة
                  </Label>
                  <Input
                    id="questionCount"
                    type="number"
                    min={3}
                    max={25}
                    value={questionCount}
                    onChange={(e) => setQuestionCount(e.target.value)}
                    aria-invalid={!!errors.questionCount}
                    className="bg-white"
                  />
                  {errors.questionCount ? (
                    <p className="text-xs text-destructive">{errors.questionCount}</p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="difficulty" className="text-sm font-semibold">
                    مستوى الصعوبة
                  </Label>
                  <Select
                    value={difficulty}
                    onValueChange={(v) => setDifficulty(v as "easy" | "medium" | "hard")}
                  >
                    <SelectTrigger
                      id="difficulty"
                      aria-invalid={!!errors.difficulty}
                      className="bg-white"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="easy">سهل (تذكر وفهم)</SelectItem>
                      <SelectItem value="medium">متوسط (تطبيق وتحليل)</SelectItem>
                      <SelectItem value="hard">متقدم (تفكير ناقد)</SelectItem>
                    </SelectContent>
                  </Select>
                  {errors.difficulty ? (
                    <p className="text-xs text-destructive">{errors.difficulty}</p>
                  ) : null}
                </div>
              </div>

              <Button
                id="btn-generate-quiz"
                className="w-full mt-4 bg-primary hover:bg-primary/95 text-white shadow-sm font-bold h-11"
                disabled={mutation.isPending}
                onClick={validateAndRun}
              >
                {mutation.isPending ? (
                  <>
                    <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                    جاري صياغة الأسئلة تربوياً...
                  </>
                ) : mutation.data ? (
                  <>
                    <RefreshCw className="ml-2 h-4 w-4" />
                    إعادة توليد الحزمة
                  </>
                ) : (
                  <>
                    <Sparkles className="ml-2 h-4 w-4" />
                    توليد الاختبار والواجب التطبيقي
                  </>
                )}
              </Button>

              {mutation.isError ? (
                <div className="space-y-3">
                  <div className="p-3 bg-red-50 border border-red-100 rounded-lg text-xs text-red-600 leading-normal">
                    {(mutation.error as Error).message}
                  </div>
                  <EntitlementDeniedCta error={mutation.error} />
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>

        {/* Results Panel */}
        <div className="lg:col-span-7">
          <Card
            id="quiz-result-card"
            className="border-slate-200/80 shadow-sm min-h-[500px] flex flex-col"
          >
            {mutation.isPending ? (
              <div className="flex-1 flex flex-col items-center justify-center p-12 text-center space-y-4">
                <div className="relative">
                  <Loader2 className="h-12 w-12 text-primary animate-spin" />
                  <Sparkles className="h-5 w-5 text-amber-500 absolute -top-1 -right-1 animate-pulse" />
                </div>
                <div className="space-y-2 max-w-sm">
                  <h3 className="font-bold text-slate-800 text-base">
                    جاري إنشاء الأسئلة والتقويم
                  </h3>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    نقوم بصياغة الأسئلة وتوليد التفسيرات العلمية ونموذج الإجابة الرسمي للمعلم،
                    بالإضافة لتصميم مشروع واجب منزلي تطبيقي...
                  </p>
                </div>
              </div>
            ) : generatedData ? (
              <>
                <CardHeader className="border-b border-slate-100 pb-4 bg-slate-50/50">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                      <CardTitle className="text-base font-bold text-primary flex items-center gap-2">
                        <BookOpen className="h-5 w-5" />
                        {generatedData.title}
                      </CardTitle>
                      <p className="text-xs text-slate-500 mt-1">
                        مادة {subject} • {grade} • صعوبة: {DIFFICULTY_LABEL[difficulty]}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => void handleCreateDraftTest()}
                        disabled={!generationId || importPending}
                        className="min-h-11 h-11 bg-emerald-700 hover:bg-emerald-700/95 text-white"
                      >
                        {importPending ? (
                          <Loader2 className="ml-1.5 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <FlaskConical className="ml-1.5 h-3.5 w-3.5" />
                        )}
                        إنشاء اختبار مسودة
                      </Button>
                      <Button variant="outline" size="sm" onClick={handleCopy} className="min-h-11 h-11">
                        <Copy className="ml-1.5 h-3.5 w-3.5" />
                        نسخ النص
                      </Button>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={handleDownload}
                        className="min-h-11 h-11 bg-primary hover:bg-primary/95 text-white"
                      >
                        <Download className="ml-1.5 h-3.5 w-3.5" />
                        تصدير Word (نسختين)
                      </Button>
                    </div>
                  </div>

                  <p className="mt-3 text-xs text-slate-500 leading-relaxed">
                    الاستيراد ينشئ مسودة قابلة للتعديل في صفحة الاختبارات من أسئلة الاختيار من
                    متعدد والصواب/خطأ فقط. الأسئلة المقالية القصيرة لا تُستورد في الإصدار الحالي.
                  </p>

                  {/* High Craft Tab Selector */}
                  <div className="flex mt-4 p-1 bg-slate-100 rounded-lg max-w-md">
                    <button
                      onClick={() => setActiveTab("student")}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-bold rounded-md transition-all ${
                        activeTab === "student"
                          ? "bg-white text-primary shadow-sm"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      <Eye className="h-3.5 w-3.5" />
                      نسخة الطالب (جاهزة للطباعة)
                    </button>
                    <button
                      onClick={() => setActiveTab("teacher")}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-bold rounded-md transition-all ${
                        activeTab === "teacher"
                          ? "bg-white text-red-600 shadow-sm"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      <GraduationCap className="h-3.5 w-3.5" />
                      دليل المعلم (مع الإجابات والتفسير)
                    </button>
                  </div>
                </CardHeader>

                <CardContent className="flex-1 p-6 space-y-6 overflow-y-auto max-h-[650px] scrollbar-thin">
                  {activeTab === "student" ? (
                    /* STUDENT COPY PREVIEW */
                    <div className="space-y-6 select-none">
                      <div className="text-center border-b border-dashed border-slate-200 pb-4 mb-4">
                        <h4 className="font-bold text-slate-700 text-sm">
                          جمهورية المعرفة والتعلم
                        </h4>
                        <p className="text-xs text-slate-400 mt-1">
                          اختبار قصير لمادة: {subject} • الدرس: {title}
                        </p>
                        <div className="flex justify-center gap-6 mt-3 text-xs text-slate-500">
                          <span>
                            اسم الطالب: ............................................................
                          </span>
                          <span>الصف: .............</span>
                        </div>
                      </div>

                      {/* MCQs Student */}
                      {generatedData.mcqs && generatedData.mcqs.length > 0 && (
                        <div className="space-y-4">
                          <h4 className="font-bold text-slate-800 text-sm border-r-4 border-primary pr-2">
                            السؤال الأول: اختر الإجابة الصحيحة من بين الخيارات التالية
                          </h4>
                          <div className="space-y-4 mr-2">
                            {generatedData.mcqs.map((mcq, idx) => (
                              <div
                                key={idx}
                                className="bg-slate-50/50 p-3 rounded-lg border border-slate-100"
                              >
                                <p className="text-xs font-bold text-slate-800 mb-2">
                                  {idx + 1}. {mcq.question}
                                </p>
                                <div className="grid gap-2 sm:grid-cols-2">
                                  {mcq.options.map((opt, oIdx) => (
                                    <div
                                      key={oIdx}
                                      className="flex items-center gap-2 text-xs text-slate-700 p-2 border border-slate-200/60 rounded-md bg-white hover:bg-slate-50"
                                    >
                                      <span className="font-bold text-slate-400">
                                        {["أ", "ب", "ج", "د"][oIdx]})
                                      </span>
                                      <span>{opt}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* True / False Student */}
                      {generatedData.trueFalse && generatedData.trueFalse.length > 0 && (
                        <div className="space-y-4 pt-2">
                          <h4 className="font-bold text-slate-800 text-sm border-r-4 border-primary pr-2">
                            السؤال الثاني: ضع علامة (✓) أمام العبارة الصحيحة وعلامة (✗) أمام العبارة
                            الخاطئة
                          </h4>
                          <div className="space-y-2 mr-2">
                            {generatedData.trueFalse.map((tf, idx) => (
                              <div
                                key={idx}
                                className="flex justify-between items-center bg-slate-50/50 p-3 rounded-lg border border-slate-100 gap-4"
                              >
                                <p className="text-xs text-slate-800">
                                  {idx + 1}. {tf.question}
                                </p>
                                <div className="flex gap-2 text-xs shrink-0 font-bold">
                                  <span className="px-2 py-1 border border-slate-200 rounded bg-white text-slate-400">
                                    صواب
                                  </span>
                                  <span className="px-2 py-1 border border-slate-200 rounded bg-white text-slate-400">
                                    خطأ
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Short Answer Student */}
                      {generatedData.shortAnswer && generatedData.shortAnswer.length > 0 && (
                        <div className="space-y-4 pt-2">
                          <h4 className="font-bold text-slate-800 text-sm border-r-4 border-primary pr-2">
                            السؤال الثالث: أجب عن الأسئلة المقالية التالية باختصار
                          </h4>
                          <div className="space-y-4 mr-2">
                            {generatedData.shortAnswer.map((sa, idx) => (
                              <div
                                key={idx}
                                className="bg-slate-50/50 p-3 rounded-lg border border-slate-100"
                              >
                                <p className="text-xs font-bold text-slate-800 mb-2">
                                  {idx + 1}. {sa.question}
                                </p>
                                <div className="h-10 border-b border-dashed border-slate-300 mt-2"></div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Homework Student */}
                      {generatedData.homeworkAssignment && (
                        <div className="pt-4 border-t border-dashed border-slate-200">
                          <div className="bg-amber-50/50 border border-amber-200/60 rounded-xl p-4 space-y-2">
                            <div className="flex items-center gap-2 text-amber-800">
                              <ClipboardList className="h-5 w-5 text-amber-600" />
                              <h4 className="font-bold text-xs">
                                الواجب التطبيقي المنزلي: {generatedData.homeworkAssignment.title}
                              </h4>
                            </div>
                            <p className="text-xs text-slate-700 leading-relaxed">
                              {generatedData.homeworkAssignment.description}
                            </p>
                            <div className="flex items-center gap-1.5 text-xs text-amber-700 font-medium pt-1">
                              <Clock className="h-3.5 w-3.5" />
                              <span>
                                الزمن التقديري الموصى به:{" "}
                                {generatedData.homeworkAssignment.estimatedTime}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* TEACHER GUIDE PREVIEW */
                    <div className="space-y-6">
                      {/* MCQs Teacher */}
                      {generatedData.mcqs && generatedData.mcqs.length > 0 && (
                        <div className="space-y-4">
                          <h4 className="font-bold text-red-800 text-sm border-r-4 border-red-500 pr-2">
                            أولاً: إجابات أسئلة الاختيار من متعدد والتوجيه العلمي
                          </h4>
                          <div className="space-y-4 mr-2">
                            {generatedData.mcqs.map((mcq, idx) => (
                              <div
                                key={idx}
                                className="bg-red-50/10 p-3 rounded-lg border border-red-100/50"
                              >
                                <p className="text-xs font-bold text-slate-800 mb-2">
                                  {idx + 1}. {mcq.question}
                                </p>
                                <div className="grid gap-2 sm:grid-cols-2 mb-3">
                                  {mcq.options.map((opt, oIdx) => {
                                    const isCorrect = opt === mcq.correctAnswer;
                                    return (
                                      <div
                                        key={oIdx}
                                        className={`flex items-center justify-between text-xs p-2 border rounded-md font-medium ${
                                          isCorrect
                                            ? "border-green-300 bg-green-50/50 text-green-800"
                                            : "border-slate-200 bg-white text-slate-500"
                                        }`}
                                      >
                                        <div className="flex items-center gap-2">
                                          <span
                                            className={
                                              isCorrect
                                                ? "text-green-600 font-bold"
                                                : "text-slate-400 font-bold"
                                            }
                                          >
                                            {["أ", "ب", "ج", "د"][oIdx]})
                                          </span>
                                          <span>{opt}</span>
                                        </div>
                                        {isCorrect && <Check className="h-4 w-4 text-green-600" />}
                                      </div>
                                    );
                                  })}
                                </div>
                                <div className="p-2.5 bg-blue-50/50 border border-blue-100 rounded text-xs text-blue-900 leading-normal flex items-start gap-1.5">
                                  <HelpCircle className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                                  <span>
                                    <strong className="font-bold">التفسير التربوي:</strong>{" "}
                                    {mcq.explanation}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* True / False Teacher */}
                      {generatedData.trueFalse && generatedData.trueFalse.length > 0 && (
                        <div className="space-y-4 pt-2">
                          <h4 className="font-bold text-red-800 text-sm border-r-4 border-red-500 pr-2">
                            ثانياً: إجابات صواب أم خطأ ومعايير التصحيح
                          </h4>
                          <div className="space-y-3 mr-2">
                            {generatedData.trueFalse.map((tf, idx) => (
                              <div
                                key={idx}
                                className="bg-red-50/10 p-3 rounded-lg border border-red-100/50 space-y-2"
                              >
                                <div className="flex justify-between items-start gap-4">
                                  <p className="text-xs text-slate-800">
                                    {idx + 1}. {tf.question}
                                  </p>
                                  <span
                                    className={`text-xs font-bold px-2.5 py-1 rounded-full shrink-0 ${
                                      tf.correctAnswer
                                        ? "bg-green-100 text-green-800"
                                        : "bg-red-100 text-red-800"
                                    }`}
                                  >
                                    الإجابة: {tf.correctAnswer ? "صواب" : "خطأ"}
                                  </span>
                                </div>
                                <div className="p-2 bg-slate-50 border border-slate-200/50 rounded text-xs text-slate-600 leading-normal">
                                  <strong className="font-bold text-slate-700">
                                    التوجيه الإضافي:
                                  </strong>{" "}
                                  {tf.correction}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Short Answer Teacher */}
                      {generatedData.shortAnswer && generatedData.shortAnswer.length > 0 && (
                        <div className="space-y-4 pt-2">
                          <h4 className="font-bold text-red-800 text-sm border-r-4 border-red-500 pr-2">
                            ثالثاً: نموذج الإجابة للأسئلة المقالية القصيرة
                          </h4>
                          <div className="space-y-3 mr-2">
                            {generatedData.shortAnswer.map((sa, idx) => (
                              <div
                                key={idx}
                                className="bg-red-50/10 p-3 rounded-lg border border-red-100/50 space-y-2"
                              >
                                <p className="text-xs font-bold text-slate-800">
                                  {idx + 1}. {sa.question}
                                </p>
                                <div className="p-2.5 bg-green-50/30 border border-green-100/50 rounded text-xs text-green-900 leading-normal">
                                  <strong className="font-bold text-green-800">
                                    نموذج الإجابة المقترح:
                                  </strong>{" "}
                                  {sa.sampleAnswer}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Homework Teacher */}
                      {generatedData.homeworkAssignment && (
                        <div className="pt-4 border-t border-slate-200">
                          <div className="bg-amber-50/30 border border-amber-200/50 rounded-xl p-4 space-y-3">
                            <div className="flex items-center gap-2 text-amber-900">
                              <ClipboardList className="h-5 w-5 text-amber-700" />
                              <h4 className="font-bold text-xs">
                                تقييم الواجب التطبيقي: {generatedData.homeworkAssignment.title}
                              </h4>
                            </div>
                            <p className="text-xs text-slate-700 leading-relaxed">
                              {generatedData.homeworkAssignment.description}
                            </p>
                            <div className="p-3 bg-white border border-amber-200/60 rounded-lg text-xs leading-normal">
                              <strong className="font-bold text-amber-800 block mb-1">
                                معايير التقييم المقترحة للمعلم:
                              </strong>
                              <span className="text-slate-600">
                                {generatedData.homeworkAssignment.evaluationCriteria}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </>
            ) : mutation.isError ? (
              <div className="flex-1 flex flex-col items-center justify-center p-12 text-center space-y-3">
                <p className="text-sm text-destructive font-medium">
                  عذراً، فشل توليد الحزمة الذكية.
                </p>
                <p className="text-xs text-slate-500">{(mutation.error as Error).message}</p>
                <Button variant="outline" size="sm" onClick={validateAndRun} className="mt-2">
                  <RefreshCw className="ml-1.5 h-3.5 w-3.5" />
                  إعادة المحاولة
                </Button>
                <EntitlementDeniedCta error={mutation.error} />
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-slate-400 space-y-4">
                <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl">
                  <BookOpen className="h-10 w-10 text-slate-300" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-bold text-slate-600">في انتظار مدخلاتك</p>
                  <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
                    املاً النموذج الجانبي واضغط على زر "توليد" لتصميم حزمة اختبار قصيرة مخصصة ومبنية
                    تربوياً مع نموذج الإجابة.
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
