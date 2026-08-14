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
  /** Session-bound tools open via /lesson-sessions (P3 Step 2). */
  to?: "/lesson-sessions" | "/ai-enrichment";
  comingSoon?: boolean;
};

const tools: ToolCard[] = [
  {
    icon: FileText,
    title: "خطة درس",
    body: "أنشئ خطة درس متكاملة انطلاقاً من حصة درس اليوم (مرتبطة بـ Lesson Session).",
    to: "/lesson-sessions",
  },
  {
    icon: PenLine,
    title: "الواجب",
    body: "أنشئ واجبات جاهزة للطباعة من حصة درس محددة.",
    to: "/lesson-sessions",
  },
  {
    icon: ListChecks,
    title: "اختبار قصير",
    body: "ولّد اختبارات مرتبطة بحصة درس محددة.",
    to: "/lesson-sessions",
  },
  {
    icon: Sparkles,
    title: "أفكار أنشطة",
    body: "احصل على أفكار أنشطة صفية انطلاقاً من حصة درس.",
    to: "/lesson-sessions",
  },
  {
    icon: Presentation,
    title: "عرض تقديمي",
    body: "حوّل الدرس إلى شرائح عرض جاهزة.",
    comingSoon: true,
  },
  {
    icon: MessageSquare,
    title: "مساعد المعلم",
    body: "محادثة ذكية للإجابة عن أسئلتك التربوية.",
    comingSoon: true,
  },
];

function AIWorkspacePage() {
  return (
    <PageShell>
      <SectionHeader
        title="مساحة الذكاء الاصطناعي"
        description="أدوات التحضير مرتبطة بحصة درس — اختر الحصة أولاً من حصص اليوم."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {tools.map((t) => {
          const enabled = Boolean(t.to) && !t.comingSoon;
          return (
            <Card key={t.title} className="relative overflow-hidden">
              <CardContent className="p-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                    <t.icon className="h-5 w-5" />
                  </div>
                  {enabled ? (
                    <Badge>متاح عبر الحصة</Badge>
                  ) : (
                    <Badge variant="secondary">{ar.common.comingSoon}</Badge>
                  )}
                </div>
                <h3 className="mt-4 text-lg font-semibold">{t.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{t.body}</p>
                {enabled && t.to ? (
                  <Button asChild size="sm" className="mt-4">
                    <Link to={t.to}>
                      اختيار حصة
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
