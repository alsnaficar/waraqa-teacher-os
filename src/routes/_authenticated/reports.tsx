import { createFileRoute } from "@tanstack/react-router";

import { PageShell } from "@/components/layout/page-shell";
import { ReportsPageContent } from "@/features/reports/components/reports-page-content";

export const Route = createFileRoute("/_authenticated/reports")({
  component: ReportsPage,
  head: () => ({
    meta: [
      { title: "التقارير | ورقة" },
      {
        name: "description",
        content: "مركز التقارير الموحّد للحصص والواجبات والاختبارات في منصة ورقة.",
      },
    ],
  }),
});

function ReportsPage() {
  return (
    <PageShell>
      <ReportsPageContent />
    </PageShell>
  );
}
