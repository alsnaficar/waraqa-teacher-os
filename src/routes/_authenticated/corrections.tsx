import { createFileRoute } from "@tanstack/react-router";

import { PageShell } from "@/components/layout/page-shell";
import { CorrectionsPageContent } from "@/features/corrections/components/corrections-page-content";

export const Route = createFileRoute("/_authenticated/corrections")({
  component: CorrectionsPage,
  head: () => ({
    meta: [
      { title: "التصحيح | ورقة" },
      {
        name: "description",
        content: "مركز تصحيح الواجبات والاختبارات المملوكة للمعلم في منصة ورقة.",
      },
    ],
  }),
});

function CorrectionsPage() {
  return (
    <PageShell>
      <CorrectionsPageContent />
    </PageShell>
  );
}
