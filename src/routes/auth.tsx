import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

const authSearchSchema = z.object({
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/auth")({
  validateSearch: (search) => authSearchSchema.parse(search),
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/",
      search: {
        login: "true",
        redirect: search.redirect,
      },
    });
  },
  component: () => null,
});
