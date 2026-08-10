import { createFileRoute } from "@tanstack/react-router";

import { GoogleSheetsIntegrationPage } from "@/features/planner/components/google-sheets-page";

export const Route = createFileRoute("/_authenticated/admin/google-sheets")({
  component: GoogleSheetsIntegrationPage,
});
