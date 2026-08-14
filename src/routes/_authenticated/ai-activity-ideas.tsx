import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { getLessonContext } from "@/features/lesson-context/services/context-engine";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { ArrowRight, Copy, Download, Loader2, RefreshCw, Sparkles } from "lucide-react";

import { PageShell } from "@/components/layout/page-shell";
import { SectionHeader } from "@/shared/components/section-header";
import { Card, CardContent } from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { generateActivityIdeas } from "@/platform/ai/functions/ai.functions";
import { EntitlementDeniedCta } from "@/features/billing/components/entitlement-denied-cta";
import { copyToClipboard, downloadArabicDocx } from "@/platform/ai/docx";
import {
  CurriculumSelector,
  EMPTY_CURRICULUM,
  validateCurriculum,
  type CurriculumSelection,
  type CurriculumSelectorErrors,
} from "@/features/ai/components/curriculum-selector";
import { SessionBindingRequiredGate } from "@/features/ai/components/session-binding-required-gate";

const SearchSchema = z.object({
  lessonSessionId: z.string().uuid().optional(),
  stage: z.enum(["primary", "intermediate", "secondary"]).optional(),
  grade: z.string().optional(),
  subject: z.string().optional(),
  title: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/ai-activity-ideas")({
  validateSearch: (s) => SearchSchema.parse(s),
  head: () => ({
    meta: [
      { title: "مولّد أفكار الأنشطة — Waraqa" },
      { name: "description", content: "اقتراحات أنشطة صفية إبداعية بالعربية." },
      { property: "og:title", content: "مولّد أفكار الأنشطة — Waraqa" },
      { property: "og:description", content: "اقتراحات أنشطة صفية إبداعية بالعربية." },
    ],
  }),
  component: ActivityIdeasPage,
});

const FormSchema = z.object({
  grade: z.string().trim().min(1).max(120),
  subject: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1, "عنوان الدرس مطلوب").max(200, "العنوان طويل جداً"),
  count: z
    .number({ invalid_type_error: "عدد الأفكار مطلوب" })
    .int("يجب أن يكون رقماً صحيحاً")
    .min(1, "الحد الأدنى فكرة واحدة")
    .max(20, "الحد الأقصى 20 فكرة"),
  duration: z.enum(["short", "medium", "long"], {
    errorMap: () => ({ message: "المدة مطلوبة" }),
  }),
  groupType: z.enum(["individual", "pairs", "group", "whole_class"], {
    errorMap: () => ({ message: "نمط العمل مطلوب" }),
  }),
});

type FieldErrors = Partial<Record<"title" | "count" | "duration" | "groupType", string>> &
  CurriculumSelectorErrors;

const DURATION_LABEL: Record<"short" | "medium" | "long", string> = {
  short: "قصير (5-10 دقائق)",
  medium: "متوسط (15-25 دقيقة)",
  long: "طويل (30+ دقيقة)",
};

const GROUP_LABEL: Record<"individual" | "pairs" | "group" | "whole_class", string> = {
  individual: "فردي",
  pairs: "ثنائي",
  group: "مجموعات صغيرة",
  whole_class: "الصف كاملاً",
};

function ActivityIdeasPage() {
  const generate = useServerFn(generateActivityIdeas);
  const search = Route.useSearch();
  const lessonSessionId = search.lessonSessionId;

  const [curriculum, setCurriculum] = useState<CurriculumSelection>({
    stage: search.stage ?? "",
    grade: search.grade ?? "",
    subject: search.subject ?? "",
    semester: "",
  });
  const [title, setTitle] = useState(search.title ?? "");
  const [count, setCount] = useState("5");
  const [duration, setDuration] = useState<"short" | "medium" | "long">("medium");
  const [groupType, setGroupType] = useState<"individual" | "pairs" | "group" | "whole_class">(
    "group",
  );
  const [errors, setErrors] = useState<FieldErrors>({});

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
      count: Number(count),
      duration,
      groupType,
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

  async function handleCopy() {
    if (!mutation.data) return;
    await copyToClipboard(mutation.data.content);
  }

  async function handleDownload() {
    if (!mutation.data) return;
    await downloadArabicDocx({
      title: `أفكار أنشطة: ${title}`,
      subtitle: `${subject} — ${grade} — ${GROUP_LABEL[groupType]}`,
      content: mutation.data.content,
      filename: title || "activities",
    });
  }

  const canSubmit = !mutation.isPending;

  const generated = mutation.data?.content;

  if (!lessonSessionId) {
    return <SessionBindingRequiredGate toolLabel="أفكار الأنشطة" />;
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
        title="مولّد أفكار الأنشطة"
        description="اقتراحات أنشطة صفية إبداعية جاهزة للتنفيذ."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-4 p-6">
            <CurriculumSelector value={curriculum} onChange={setCurriculum} errors={errors} />
            <div className="space-y-2">
              <Label htmlFor="title">عنوان الدرس</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="مثال: الكسور المتكافئة"
                aria-invalid={!!errors.title}
              />
              {errors.title ? <p className="text-xs text-destructive">{errors.title}</p> : null}
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="count">عدد الأفكار</Label>
                <Input
                  id="count"
                  type="number"
                  min={1}
                  max={20}
                  value={count}
                  onChange={(e) => setCount(e.target.value)}
                  aria-invalid={!!errors.count}
                />
                {errors.count ? <p className="text-xs text-destructive">{errors.count}</p> : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="duration">المدة</Label>
                <Select
                  value={duration}
                  onValueChange={(v) => setDuration(v as "short" | "medium" | "long")}
                >
                  <SelectTrigger id="duration" aria-invalid={!!errors.duration}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="short">{DURATION_LABEL.short}</SelectItem>
                    <SelectItem value="medium">{DURATION_LABEL.medium}</SelectItem>
                    <SelectItem value="long">{DURATION_LABEL.long}</SelectItem>
                  </SelectContent>
                </Select>
                {errors.duration ? (
                  <p className="text-xs text-destructive">{errors.duration}</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="groupType">نمط العمل</Label>
                <Select
                  value={groupType}
                  onValueChange={(v) =>
                    setGroupType(v as "individual" | "pairs" | "group" | "whole_class")
                  }
                >
                  <SelectTrigger id="groupType" aria-invalid={!!errors.groupType}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="individual">{GROUP_LABEL.individual}</SelectItem>
                    <SelectItem value="pairs">{GROUP_LABEL.pairs}</SelectItem>
                    <SelectItem value="group">{GROUP_LABEL.group}</SelectItem>
                    <SelectItem value="whole_class">{GROUP_LABEL.whole_class}</SelectItem>
                  </SelectContent>
                </Select>
                {errors.groupType ? (
                  <p className="text-xs text-destructive">{errors.groupType}</p>
                ) : null}
              </div>
            </div>

            <Button className="w-full" disabled={!canSubmit} onClick={validateAndRun}>
              {mutation.isPending ? (
                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
              ) : mutation.data ? (
                <RefreshCw className="ml-2 h-4 w-4" />
              ) : (
                <Sparkles className="ml-2 h-4 w-4" />
              )}
              {mutation.data ? "إعادة التوليد" : "توليد الأفكار"}
            </Button>

            {mutation.isError ? (
              <div className="space-y-3">
                <p className="text-sm text-destructive">{(mutation.error as Error).message}</p>
                <EntitlementDeniedCta error={mutation.error} />
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 p-6">
            {mutation.isPending ? (
              <div className="flex h-64 items-center justify-center text-muted-foreground">
                <Loader2 className="ml-2 h-5 w-5 animate-spin" />
                جارٍ التوليد...
              </div>
            ) : mutation.data ? (
              <>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" size="sm" onClick={handleCopy}>
                    <Copy className="ml-2 h-4 w-4" />
                    نسخ
                  </Button>
                  <Button variant="secondary" size="sm" onClick={handleDownload}>
                    <Download className="ml-2 h-4 w-4" />
                    تنزيل DOCX
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={validateAndRun}
                    disabled={mutation.isPending}
                  >
                    <RefreshCw className="ml-2 h-4 w-4" />
                    إعادة التوليد
                  </Button>
                </div>
                <article className="prose prose-sm max-w-none whitespace-pre-wrap text-right leading-relaxed dark:prose-invert">
                  {mutation.data.content}
                </article>
              </>
            ) : mutation.isError ? (
              <div className="flex h-64 flex-col items-center justify-center gap-3 text-center">
                <p className="text-sm text-destructive">{(mutation.error as Error).message}</p>
                <EntitlementDeniedCta error={mutation.error} />
                <Button variant="secondary" size="sm" onClick={validateAndRun}>
                  <RefreshCw className="ml-2 h-4 w-4" />
                  إعادة المحاولة
                </Button>
              </div>
            ) : (
              <div className="flex h-64 items-center justify-center text-center text-sm text-muted-foreground">
                ستظهر الأفكار هنا.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
