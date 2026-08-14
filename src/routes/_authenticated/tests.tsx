import { createFileRoute } from "@tanstack/react-router";

import { PageShell } from "@/components/layout/page-shell";
import { TestsPageContent } from "@/features/tests/components/tests-page-content";

export const Route = createFileRoute("/_authenticated/tests")({
  component: TestsPage,
  head: () => ({
    meta: [
      { title: "الاختبارات | ورقة" },
      {
        name: "description",
        content: "إدارة اختبارات المعلم في منصة ورقة.",
      },
    ],
  }),
});

function TestsPage() {
  return (
    <PageShell>
      <TestsPageContent />
    </PageShell>
  );
}
