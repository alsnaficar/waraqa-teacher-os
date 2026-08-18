import { supabase } from "@/platform/database/supabase/client";
import {
  parseMadrasatiLiveSseBlock,
  type MadrasatiLiveFrame,
} from "@/features/madrasati/browser/madrasati-browser-live-session.ts";
import type { MadrasatiAuthenticationLiveFrameUpdateResult } from "./madrasati.functions";

export const MADRASATI_LIVE_SESSION_PATH = "/api/madrasati/live-session";

function toFrame(data: unknown): { seq: number; frame: MadrasatiLiveFrame } | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  const record = data as Record<string, unknown>;

  if (record.frame && typeof record.frame === "object") {
    const nested = record.frame as Record<string, unknown>;
    if (
      typeof record.seq === "number" &&
      (nested.mimeType === "image/jpeg" || nested.mimeType === "image/png") &&
      typeof nested.base64 === "string"
    ) {
      return {
        seq: record.seq,
        frame: {
          mimeType: nested.mimeType,
          base64: nested.base64,
          viewportWidth: Number(nested.viewportWidth),
          viewportHeight: Number(nested.viewportHeight),
        },
      };
    }
  }

  if (
    typeof record.seq === "number" &&
    (record.mimeType === "image/jpeg" || record.mimeType === "image/png") &&
    typeof record.base64 === "string"
  ) {
    return {
      seq: record.seq,
      frame: {
        mimeType: record.mimeType,
        base64: record.base64,
        viewportWidth: Number(record.viewportWidth),
        viewportHeight: Number(record.viewportHeight),
      },
    };
  }

  return null;
}

async function openSseLiveStream(
  sessionId: string,
  onFrame: (update: { seq: number; frame: MadrasatiLiveFrame }) => void,
  signal: AbortSignal,
): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  if (!token) {
    throw new Error("Unauthorized: missing authenticated user");
  }

  const response = await fetch(
    `${MADRASATI_LIVE_SESSION_PATH}?sessionId=${encodeURIComponent(sessionId)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "text/event-stream",
      },
      signal,
    },
  );

  if (!response.ok || !response.body) {
    throw new Error("Madrasati live stream is unavailable.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (!signal.aborted) {
    const { value, done } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";

    for (const block of blocks) {
      const parsed = parseMadrasatiLiveSseBlock(block);

      if (!parsed || parsed.event !== "frame") {
        continue;
      }

      const update = toFrame(parsed.data);

      if (update) {
        onFrame(update);
      }
    }
  }
}

export async function consumeMadrasatiLiveFrames(options: {
  sessionId: string;
  signal: AbortSignal;
  onFrame: (update: { seq: number; frame: MadrasatiLiveFrame }) => void;
  waitForFrame: (input: {
    sessionId: string;
    sinceSeq: number;
  }) => Promise<MadrasatiAuthenticationLiveFrameUpdateResult | null>;
}): Promise<void> {
  try {
    await openSseLiveStream(options.sessionId, options.onFrame, options.signal);
    return;
  } catch {
    // Fall through to event-driven wait. This is not screenshot polling.
  }

  let sinceSeq = 0;

  while (!options.signal.aborted) {
    const update = await options.waitForFrame({
      sessionId: options.sessionId,
      sinceSeq,
    });

    if (!update) {
      continue;
    }

    sinceSeq = update.seq;
    options.onFrame(update);
  }
}
