import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { PageShell } from "@/components/layout/page-shell";
import { TestsPageContent } from "@/features/tests/components/tests-page-content";

const TestsSearchSchema = z.object({
  testId: z.string().uuid().optional(),
});

export const Route = createFileRoute("/_authenticated/tests")({
  validateSearch: (search) => TestsSearchSchema.parse(search),
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
  const { testId } = Route.useSearch();
  return (
    <PageShell>
      <TestsPageContent initialTestId={testId} />
    </PageShell>
  );
}
