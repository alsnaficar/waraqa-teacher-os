import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../../platform/database/supabase/types.ts";
import {
  encodeMadrasatiLiveSseEvent,
  type MadrasatiLiveFrameUpdate,
} from "./madrasati-browser-live-session.ts";
import { madrasatiBrowserSessionManager } from "./madrasati-browser-session-manager.server.ts";

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

export async function resolveAuthenticatedUserIdFromRequest(
  request: Request,
): Promise<string> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error("Unauthorized: missing authenticated user");
  }

  const authHeader = request.headers.get("authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    throw new Error("Unauthorized: missing authenticated user");
  }

  const token = authHeader.slice("Bearer ".length).trim();

  if (!token || token.split(".").length !== 3) {
    throw new Error("Unauthorized: missing authenticated user");
  }

  const supabase = createClient<Database>(supabaseUrl, supabasePublishableKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supabasePublishableKey,
      },
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);

        if (
          isNewSupabaseApiKey(supabasePublishableKey) &&
          headers.get("Authorization") === `Bearer ${supabasePublishableKey}`
        ) {
          headers.delete("Authorization");
        }

        headers.set("apikey", supabasePublishableKey);
        return fetch(input, { ...init, headers });
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data, error } = await supabase.auth.getClaims(token);

  if (error || !data?.claims?.sub) {
    throw new Error("Unauthorized: missing authenticated user");
  }

  return data.claims.sub;
}

export function createOwnedMadrasatiLiveSseResponse(options: {
  userId: string;
  sessionId: string;
  signal: AbortSignal;
}): Response {
  const encoder = new TextEncoder();
  let pending: MadrasatiLiveFrameUpdate | null = null;
  let sending = false;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let closed = false;

  const flushRef: { current: (() => void) | null } = { current: null };

  const unsubscribe =
    madrasatiBrowserSessionManager.subscribeAuthenticationLiveFrame(
      options.userId,
      options.sessionId,
      (update) => {
        pending = update;
        flushRef.current?.();
      },
    );

  const cleanup = () => {
    if (closed) {
      return;
    }

    closed = true;
    clearInterval(heartbeat);
    unsubscribe();
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const enqueue = (chunk: string) => {
        controller.enqueue(encoder.encode(chunk));
      };

      flushRef.current = () => {
        if (sending || closed) {
          return;
        }

        sending = true;

        try {
          while (pending) {
            const update = pending;
            pending = null;
            enqueue(
              encodeMadrasatiLiveSseEvent("frame", {
                seq: update.seq,
                mimeType: update.frame.mimeType,
                base64: update.frame.base64,
                viewportWidth: update.frame.viewportWidth,
                viewportHeight: update.frame.viewportHeight,
              }),
            );
          }
        } finally {
          sending = false;
        }
      };

      flushRef.current();

      heartbeat = setInterval(() => {
        try {
          enqueue(encodeMadrasatiLiveSseEvent("heartbeat", { ok: true }));
        } catch {
          cleanup();
        }
      }, 15000);

      const onAbort = () => {
        cleanup();

        try {
          controller.close();
        } catch {
          // Already closed.
        }
      };

      if (options.signal.aborted) {
        onAbort();
        return;
      }

      options.signal.addEventListener("abort", onAbort, { once: true });
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
