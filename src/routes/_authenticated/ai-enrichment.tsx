import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Sparkles } from "lucide-react";
import { z } from "zod";

import { PageShell } from "@/components/layout/page-shell";
import { SectionHeader } from "@/shared/components/section-header";
import { Card, CardContent } from "@/shared/ui/card";

const SearchSchema = z.object({
  stage: z.enum(["primary", "intermediate", "secondary"]).optional(),
  grade: z.string().optional(),
  subject: z.string().optional(),
  title: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/ai-enrichment")({
  validateSearch: (s) => SearchSchema.parse(s),
  head: () => ({
    meta: [
      { title: "الإثراء — Waraqa" },
      { name: "description", content: "ميزة الإثراء - قريباً" },
    ],
  }),
  component: AiEnrichmentPage,
});

function AiEnrichmentPage() {
  const { title } = Route.useSearch();

  return (
    <PageShell className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <Link
          to="/planner"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowRight className="h-4 w-4" />
          <span>العودة للجدول</span>
        </Link>
      </div>

      <SectionHeader title="الإثراء" description="توليد إثراءات ومواد إضافية لتعزيز فهم الطلاب" />

      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center space-y-4">
          <div className="p-3 bg-amber-50 rounded-full text-amber-600">
            <Sparkles className="h-8 w-8 animate-pulse" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-lg font-semibold">ميزة الإثراء بالذكاء الاصطناعي</h3>
            <p className="text-sm text-muted-foreground max-w-sm">هذه الميزة ستكون متاحة قريباً.</p>
          </div>
          {title && (
            <div className="text-xs bg-muted px-2.5 py-1 rounded-full text-muted-foreground mt-2">
              الدرس المختار: {title}
            </div>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
