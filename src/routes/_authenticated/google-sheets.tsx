import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Temporary compatibility route.
 * Old bookmarks → Admin Google Sheets hierarchy (still Admin-gated).
 */
export const Route = createFileRoute("/_authenticated/google-sheets")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/google-sheets", replace: true });
  },
});
