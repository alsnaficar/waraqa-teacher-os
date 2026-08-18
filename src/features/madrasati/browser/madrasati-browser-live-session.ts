/**
 * Interactive transport for an isolated server-side Madrasati browser session.
 *
 * Architecture (why this exists):
 * - Screenshot + a disconnected helper <input> is not a real mobile login:
 *   an <img> cannot open the OS keyboard, frames go stale, and the helper
 *   is a second field rather than the Microsoft/Madrasati control.
 * - iframe embedding is rejected. Microsoft login frame-busts when
 *   `window.self !== window.top` unless `allowFrame` is set, and we do not
 *   bypass X-Frame-Options / CSP / frame-ancestors. Fail closed: never embed.
 * - WebRTC / noVNC would add a new remote-desktop stack. Playwright already
 *   exposes Chromium CDP (`Page.startScreencast`), so live JPEG frames stay
 *   inside the existing isolated BrowserContext.
 * - Transport is push-based: Chromium CDP publishes JPEG frames into an
 *   in-memory per-session hub. Waraqa streams them over SSE
 *   (`text/event-stream` via TanStack Start route handlers + fetch).
 *   No socket.io / WebSocket library is added. Event-driven wait is the
 *   fallback when SSE is unavailable. Playwright Page, cookies and
 *   credentials never leave the server. The client only sees an opaque
 *   session id plus pixels.
 * - Mobile OS keyboards still require a real HTML input. After a remote click,
 *   Waraqa focuses a transit-only native field that forwards keystrokes.
 *   Waraqa does not collect or persist a password form.
 */

export const MADRASATI_REMOTE_INPUT_TYPES = [
  "text",
  "email",
  "search",
  "tel",
  "url",
  "protected",
  "none",
] as const;

export type MadrasatiRemoteInputType =
  (typeof MADRASATI_REMOTE_INPUT_TYPES)[number];

export type MadrasatiFocusedControl = {
  readonly isEditable: boolean;
  readonly inputType: MadrasatiRemoteInputType;
};

export type MadrasatiLiveFrame = {
  readonly mimeType: "image/jpeg" | "image/png";
  readonly base64: string;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
};

export type MadrasatiLiveFrameUpdate = {
  readonly seq: number;
  readonly frame: MadrasatiLiveFrame;
};

const MAX_LIVE_SUBSCRIBERS_PER_SESSION = 2;

type LiveFrameListener = (update: MadrasatiLiveFrameUpdate) => void;

export type MadrasatiLoginEmbedHeaders = {
  readonly xFrameOptions?: string | null;
  readonly contentSecurityPolicy?: string | null;
};

const REMOTE_INPUT_TYPE_SET = new Set<string>(MADRASATI_REMOTE_INPUT_TYPES);

const FORBIDDEN_FOCUS_KEYS = [
  "value",
  "cookies",
  "cookie",
  "credential",
  "credentials",
  "password",
  "html",
  "innerHTML",
  "outerHTML",
  "text",
  "innerText",
] as const;

export function canEmbedThirdPartyLogin(
  headers: MadrasatiLoginEmbedHeaders = {},
): boolean {
  const xFrame = headers.xFrameOptions?.trim().toLowerCase() ?? "";

  if (xFrame === "deny" || xFrame === "sameorigin") {
    return false;
  }

  const csp = headers.contentSecurityPolicy?.toLowerCase() ?? "";

  if (csp.includes("frame-ancestors")) {
    return false;
  }

  // Fail closed: unknown or missing framing headers must not be treated as
  // permission to iframe Microsoft/Madrasati login.
  return false;
}

export function sanitizeFocusedControl(
  raw: unknown,
): MadrasatiFocusedControl {
  if (!raw || typeof raw !== "object") {
    return { isEditable: false, inputType: "none" };
  }

  const record = raw as Record<string, unknown>;

  for (const key of FORBIDDEN_FOCUS_KEYS) {
    if (key in record) {
      // Drop any accidental leakage before the object leaves the server.
      delete record[key];
    }
  }

  const inputType = REMOTE_INPUT_TYPE_SET.has(String(record.inputType))
    ? (record.inputType as MadrasatiRemoteInputType)
    : "none";

  return {
    isEditable: record.isEditable === true && inputType !== "none",
    inputType,
  };
}

export function sanitizeLiveFrame(raw: unknown): MadrasatiLiveFrame {
  if (!raw || typeof raw !== "object") {
    throw new Error("Madrasati live frame is unavailable.");
  }

  const record = raw as Record<string, unknown>;
  const mimeType =
    record.mimeType === "image/jpeg" || record.mimeType === "image/png"
      ? record.mimeType
      : null;
  const base64 = typeof record.base64 === "string" ? record.base64.trim() : "";
  const viewportWidth = Number(record.viewportWidth);
  const viewportHeight = Number(record.viewportHeight);

  if (!mimeType || !base64) {
    throw new Error("Madrasati live frame is unavailable.");
  }

  if (
    !Number.isFinite(viewportWidth) ||
    !Number.isFinite(viewportHeight) ||
    viewportWidth <= 0 ||
    viewportHeight <= 0
  ) {
    throw new Error("Madrasati live frame viewport is invalid.");
  }

  return {
    mimeType,
    base64,
    viewportWidth,
    viewportHeight,
  };
}

export function encodeMadrasatiLiveSseEvent(
  event: "frame" | "heartbeat" | "end",
  data: unknown,
): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function parseMadrasatiLiveSseBlock(
  block: string,
): { event: string; data: unknown } | null {
  const lines = block.split("\n");
  let event = "message";
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trim());
    }
  }

  if (dataLines.length === 0) {
    return null;
  }

  try {
    return {
      event,
      data: JSON.parse(dataLines.join("\n")),
    };
  } catch {
    return null;
  }
}

export class MadrasatiLiveFrameHub {
  private readonly listeners = new Map<string, Set<LiveFrameListener>>();

  private readonly latest = new Map<string, MadrasatiLiveFrameUpdate>();

  publish(sessionId: string, frame: MadrasatiLiveFrame): MadrasatiLiveFrameUpdate {
    const normalizedSessionId = sessionId.trim();
    const sanitized = sanitizeLiveFrame(frame);
    const seq = (this.latest.get(normalizedSessionId)?.seq ?? 0) + 1;
    const update: MadrasatiLiveFrameUpdate = {
      seq,
      frame: sanitized,
    };

    this.latest.set(normalizedSessionId, update);

    for (const listener of this.listeners.get(normalizedSessionId) ?? []) {
      listener(update);
    }

    return update;
  }

  getLatest(sessionId: string): MadrasatiLiveFrameUpdate | null {
    return this.latest.get(sessionId.trim()) ?? null;
  }

  subscribe(
    sessionId: string,
    listener: LiveFrameListener,
    options: { replayLatest?: boolean } = {},
  ): () => void {
    const normalizedSessionId = sessionId.trim();
    let set = this.listeners.get(normalizedSessionId);

    if (!set) {
      set = new Set();
      this.listeners.set(normalizedSessionId, set);
    }

    if (set.size >= MAX_LIVE_SUBSCRIBERS_PER_SESSION) {
      const oldest = set.values().next().value;

      if (oldest) {
        set.delete(oldest);
      }
    }

    set.add(listener);

    if (options.replayLatest !== false) {
      const latest = this.latest.get(normalizedSessionId);

      if (latest) {
        listener(latest);
      }
    }

    return () => {
      set.delete(listener);

      if (set.size === 0) {
        this.listeners.delete(normalizedSessionId);
      }
    };
  }

  waitForFrame(
    sessionId: string,
    sinceSeq: number,
    timeoutMs: number,
  ): Promise<MadrasatiLiveFrameUpdate | null> {
    const normalizedSessionId = sessionId.trim();
    const latest = this.latest.get(normalizedSessionId);

    if (latest && latest.seq > sinceSeq) {
      return Promise.resolve(latest);
    }

    return new Promise((resolve) => {
      let settled = false;

      const finish = (update: MadrasatiLiveFrameUpdate | null) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timer);
        unsubscribe();
        resolve(update);
      };

      const unsubscribe = this.subscribe(
        normalizedSessionId,
        (update) => {
          if (update.seq > sinceSeq) {
            finish(update);
          }
        },
        { replayLatest: true },
      );

      const timer = setTimeout(() => {
        const current = this.latest.get(normalizedSessionId);
        finish(current && current.seq > sinceSeq ? current : null);
      }, timeoutMs);
    });
  }

  close(sessionId: string): void {
    const normalizedSessionId = sessionId.trim();
    this.listeners.delete(normalizedSessionId);
    this.latest.delete(normalizedSessionId);
  }

  subscriberCount(sessionId: string): number {
    return this.listeners.get(sessionId.trim())?.size ?? 0;
  }
}

export const madrasatiLiveFrameHub = new MadrasatiLiveFrameHub();

export function mapRemoteDomInputType(domType: string): MadrasatiRemoteInputType {
  const normalized = domType.trim().toLowerCase();

  if (normalized === "password") {
    return "protected";
  }

  if (
    normalized === "email" ||
    normalized === "search" ||
    normalized === "tel" ||
    normalized === "url"
  ) {
    return normalized;
  }

  if (
    normalized === "text" ||
    normalized === "number" ||
    normalized === "" ||
    normalized === "searchbox"
  ) {
    return "text";
  }

  return "none";
}
