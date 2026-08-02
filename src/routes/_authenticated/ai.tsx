import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  FileText,
  ListChecks,
  MessageSquare,
  PenLine,
  Presentation,
  Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { PageShell } from "@/components/layout/page-shell";
import { SectionHeader } from "@/shared/components/section-header";
import { Card, CardContent } from "@/shared/ui/card";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { ar } from "@/i18n/ar";

export const Route = createFileRoute("/_authenticated/ai")({
  head: () => ({
    meta: [
      { title: "مساحة الذكاء الاصطناعي — Waraqa" },
      {
        name: "description",
        content: "أدوات الذكاء الاصطناعي لإنشاء المحتوى التعليمي بسرعة.",
      },
      { property: "og:title", content: "مساحة الذكاء الاصطناعي — Waraqa" },
      {
        property: "og:description",
        content: "أدوات الذكاء الاصطناعي لإنشاء المحتوى التعليمي بسرعة.",
      },
    ],
  }),
  component: AIWorkspacePage,
});

type ToolCard = {
  icon: LucideIcon;
  title: string;
  body: string;
  to?: "/ai-lesson-plan" | "/ai-worksheet" | "/ai-quiz" | "/ai-activity-ideas";
};

const tools: ToolCard[] = [
  {
    icon: FileText,
    title: "خطة درس",
    body: "أنشئ خطة درس متكاملة انطلاقاً من موضوع أو هدف تعليمي.",
    to: "/ai-lesson-plan",
  },
  {
    icon: PenLine,
    title: "الواجب",
    body: "أنشئ واجبات جاهزة للطباعة بأسلوب متدرج.",
    to: "/ai-worksheet",
  },
  {
    icon: ListChecks,
    title: "اختبار قصير",
    body: "ولّد اختبارات متعددة الاختيار أو أسئلة مفتوحة تلقائياً.",
    to: "/ai-quiz",
  },
  {
    icon: Sparkles,
    title: "أفكار أنشطة",
    body: "احصل على أفكار أنشطة صفية إبداعية.",
    to: "/ai-activity-ideas",
  },
  {
    icon: Presentation,
    title: "عرض تقديمي",
    body: "حوّل الدرس إلى شرائح عرض جاهزة.",
  },
  {
    icon: MessageSquare,
    title: "مساعد المعلم",
    body: "محادثة ذكية للإجابة عن أسئلتك التربوية.",
  },
];

function AIWorkspacePage() {
  return (
    <PageShell>
      <SectionHeader
        title="مساحة الذكاء الاصطناعي"
        description="أدوات ذكية لإنشاء المحتوى التعليمي بسرعة."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {tools.map((t) => {
          const enabled = Boolean(t.to);
          return (
            <Card key={t.title} className="relative overflow-hidden">
              <CardContent className="p-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                    <t.icon className="h-5 w-5" />
                  </div>
                  {enabled ? (
                    <Badge>متاح</Badge>
                  ) : (
                    <Badge variant="secondary">{ar.common.comingSoon}</Badge>
                  )}
                </div>
                <h3 className="mt-4 text-lg font-semibold">{t.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{t.body}</p>
                {enabled && t.to ? (
                  <Button asChild size="sm" className="mt-4">
                    <Link to={t.to}>
                      فتح الأداة
                      <ArrowLeft className="mr-1 h-4 w-4" />
                    </Link>
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </PageShell>
  );
}
