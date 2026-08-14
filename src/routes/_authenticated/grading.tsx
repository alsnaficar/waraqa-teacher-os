import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/grading")({
  beforeLoad: () => {
    throw redirect({ to: "/corrections", replace: true });
  },
  component: () => null,
});
