import { createFileRoute } from "@tanstack/react-router";

import { CurriculumManagementPage } from "@/features/curriculum/components/curriculum-management-page";

export const Route = createFileRoute("/_authenticated/admin/curriculum-management")({
  component: CurriculumManagementPage,
});
