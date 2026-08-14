import { createFileRoute } from "@tanstack/react-router";

import { PageShell } from "@/components/layout/page-shell";
import { HomeworkPageContent } from "@/features/homework/components/homework-page-content";

export const Route = createFileRoute("/_authenticated/homework")({
  component: HomeworkPage,
  head: () => ({
    meta: [
      { title: "الواجبات | ورقة" },
      {
        name: "description",
        content: "إدارة واجبات المعلم في منصة ورقة.",
      },
    ],
  }),
});

function HomeworkPage() {
  return (
    <PageShell>
      <HomeworkPageContent />
    </PageShell>
  );
}
