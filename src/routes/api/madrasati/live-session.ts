import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

export const Route = createFileRoute("/api/madrasati/live-session")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { createOwnedMadrasatiLiveSseResponse, resolveAuthenticatedUserIdFromRequest } =
          await import(
            "../../../features/madrasati/browser/madrasati-live-stream.server.ts"
          );

        try {
          const userId = await resolveAuthenticatedUserIdFromRequest(request);
          const sessionId = new URL(request.url).searchParams.get("sessionId");

          if (!sessionId?.trim()) {
            return new Response("Madrasati browser session id is required.", {
              status: 400,
            });
          }

          return createOwnedMadrasatiLiveSseResponse({
            userId,
            sessionId: sessionId.trim(),
            signal: request.signal,
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Unauthorized";
          const status = /Unauthorized|does not belong|not found|expired/i.test(
            message,
          )
            ? 401
            : 500;

          return new Response(message, { status });
        }
      },
    },
  },
});
