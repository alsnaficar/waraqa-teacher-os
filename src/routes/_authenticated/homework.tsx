import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { PageShell } from "@/components/layout/page-shell";
import { HomeworkPageContent } from "@/features/homework/components/homework-page-content";

const HomeworkSearchSchema = z.object({
  homeworkId: z.string().uuid().optional(),
});

export const Route = createFileRoute("/_authenticated/homework")({
  validateSearch: (search) => HomeworkSearchSchema.parse(search),
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
  const { homeworkId } = Route.useSearch();
  return (
    <PageShell>
      <HomeworkPageContent initialHomeworkId={homeworkId} />
    </PageShell>
  );
}
