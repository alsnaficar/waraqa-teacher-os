import { createFileRoute } from "@tanstack/react-router";
import { ClipboardCheck } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { EmptyState } from "@/shared/components/empty-state";

export const Route = createFileRoute("/_authenticated/grading")({
  component: GradingPage,
});

function GradingPage() {
  return (
    <PageShell>
      <EmptyState
        icon={ClipboardCheck}
        title="تصحيح الواجبات والاختبارات"
        description="ستظهر هنا قريبًا جميع الواجبات والاختبارات التي تحتاج إلى تصحيح."
      />
    </PageShell>
  );
}
