import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Temporary compatibility route.
 * Old bookmarks → Admin curriculum hierarchy (still Admin-gated).
 */
export const Route = createFileRoute("/_authenticated/curriculum-management")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/curriculum-management", replace: true });
  },
});
