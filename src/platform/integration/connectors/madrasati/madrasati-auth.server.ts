import {
  madrasatiBrowserSessionManager,
  type MadrasatiBrowserAuthenticationStart,
} from "../../../../features/madrasati/browser/madrasati-browser-session-manager.server.ts";
import type { MadrasatiAuthenticationPage } from "../../../../features/madrasati/provider/madrasati-provider.ts";
import type { MadrasatiClass, MadrasatiSubject, MadrasatiTeacher, MadrasatiTimetableEntry } from "../../../../features/madrasati/provider/models.ts";
import type { MadrasatiLiveVerificationReport } from "../../../../features/madrasati/browser/madrasati-live-verification.ts";
import type {
  MadrasatiFocusedControl,
  MadrasatiLiveFrame,
  MadrasatiLiveFrameUpdate,
} from "../../../../features/madrasati/browser/madrasati-browser-live-session.ts";

function requireAuthenticatedUserId(userId: string): string {
  if (!userId || typeof userId !== "string" || !userId.trim()) {
    throw new Error("Unauthorized: missing authenticated user");
  }

  return userId.trim();
}

/**
 * Starts or reuses the authenticated user's isolated Madrasati browser session.
 *
 * The user ID must come from requireSupabaseAuth.
 * Browser/session objects and cookies never leave the server.
 */
export async function startAuthenticatedMadrasatiAuthentication(
  waraqaUserId: string,
): Promise<MadrasatiBrowserAuthenticationStart> {
  const userId = requireAuthenticatedUserId(waraqaUserId);

  return madrasatiBrowserSessionManager.startAuthentication(userId);
}

/**
 * Inspects only a session owned by the authenticated Waraqa user.
 */
export async function inspectAuthenticatedMadrasatiAuthentication(
  waraqaUserId: string,
  sessionId: string,
): Promise<MadrasatiAuthenticationPage> {
  const userId = requireAuthenticatedUserId(waraqaUserId);

  if (!sessionId || typeof sessionId !== "string" || !sessionId.trim()) {
    throw new Error("Madrasati browser session id is required.");
  }

  return madrasatiBrowserSessionManager.inspectAuthentication(
    userId,
    sessionId.trim(),
  );
}

/**
 * Status of the caller's existing Madrasati browser session, if any.
 * Never starts a browser and never returns page text, cookies, or URLs.
 */
export async function peekAuthenticatedMadrasatiAuthentication(
  waraqaUserId: string,
): Promise<{
  hasSession: boolean;
  authenticationState: "not_authenticated" | "authenticated";
}> {
  const userId = requireAuthenticatedUserId(waraqaUserId);

  return madrasatiBrowserSessionManager.peekAuthentication(userId);
}

/**
 * Read-only teacher profile from the authenticated user's live Madrasati session.
 * Never writes to the database and never returns HTML, cookies, or Playwright objects.
 */
export async function readAuthenticatedMadrasatiTeacherProfile(
  waraqaUserId: string,
): Promise<MadrasatiTeacher> {
  const userId = requireAuthenticatedUserId(waraqaUserId);

  return madrasatiBrowserSessionManager.readTeacherProfile(userId);
}

/**
 * Read-only assigned classes from the authenticated user's live Madrasati session.
 * Never writes to the database and never returns HTML, cookies, or Playwright objects.
 */
export async function readAuthenticatedMadrasatiClasses(
  waraqaUserId: string,
): Promise<MadrasatiClass[]> {
  const userId = requireAuthenticatedUserId(waraqaUserId);

  return madrasatiBrowserSessionManager.readClasses(userId);
}

/**
 * Read-only assigned subjects from the authenticated user's live Madrasati session.
 * Never writes to the database and never returns HTML, cookies, or Playwright objects.
 */
export async function readAuthenticatedMadrasatiSubjects(
  waraqaUserId: string,
): Promise<MadrasatiSubject[]> {
  const userId = requireAuthenticatedUserId(waraqaUserId);

  return madrasatiBrowserSessionManager.readSubjects(userId);
}

/**
 * Read-only teacher timetable from the authenticated user's live Madrasati session.
 * Never writes to the database and never returns HTML, cookies, or Playwright objects.
 */
export async function readAuthenticatedMadrasatiTimetable(
  waraqaUserId: string,
): Promise<MadrasatiTimetableEntry[]> {
  const userId = requireAuthenticatedUserId(waraqaUserId);

  return madrasatiBrowserSessionManager.readTimetable(userId);
}

/**
 * Read-only live verification of teacher, classes, subjects, and timetable.
 * Reuses the existing owned Madrasati browser session. Never starts a browser,
 * never writes to the database, and never returns HTML, cookies, or Playwright objects.
 */
export async function verifyAuthenticatedMadrasatiLiveExtraction(
  waraqaUserId: string,
): Promise<MadrasatiLiveVerificationReport> {
  const userId = requireAuthenticatedUserId(waraqaUserId);

  return madrasatiBrowserSessionManager.verifyLiveExtraction(userId);
}

/**
 * Closes only a session owned by the authenticated Waraqa user.
 */
export async function closeAuthenticatedMadrasatiAuthentication(
  waraqaUserId: string,
  sessionId: string,
): Promise<void> {
  const userId = requireAuthenticatedUserId(waraqaUserId);

  if (!sessionId || typeof sessionId !== "string" || !sessionId.trim()) {
    throw new Error("Madrasati browser session id is required.");
  }

  await madrasatiBrowserSessionManager.closeSession(
    userId,
    sessionId.trim(),
  );
}

/**
 * Captures only the current page of an authenticated user's server-side
 * Madrasati browser session.
 *
 * The browser context, cookies and Playwright page never leave the server.
 */
export async function getAuthenticatedMadrasatiAuthenticationScreenshot(
  waraqaUserId: string,
  sessionId: string,
): Promise<string> {
  const userId = requireAuthenticatedUserId(waraqaUserId);

  if (!sessionId || typeof sessionId !== "string" || !sessionId.trim()) {
    throw new Error("Madrasati browser session id is required.");
  }

  const bytes =
    await madrasatiBrowserSessionManager.getAuthenticationScreenshot(
      userId,
      sessionId.trim(),
    );

  return Buffer.from(bytes).toString("base64");
}

/**
 * Click inside the authenticated user's server-side Madrasati page.
 */
export async function clickAuthenticatedMadrasatiAuthentication(
  waraqaUserId: string,
  sessionId: string,
  x: number,
  y: number,
): Promise<void> {
  const userId = requireAuthenticatedUserId(waraqaUserId);

  if (!sessionId || typeof sessionId !== "string" || !sessionId.trim()) {
    throw new Error("Madrasati browser session id is required.");
  }

  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0) {
    throw new Error("Invalid browser click coordinates.");
  }

  await madrasatiBrowserSessionManager.clickAuthentication(
    userId,
    sessionId.trim(),
    x,
    y,
  );
}

/**
 * Type into the currently focused Madrasati control.
 */
export async function typeAuthenticatedMadrasatiAuthentication(
  waraqaUserId: string,
  sessionId: string,
  text: string,
): Promise<void> {
  const userId = requireAuthenticatedUserId(waraqaUserId);

  if (!sessionId || typeof sessionId !== "string" || !sessionId.trim()) {
    throw new Error("Madrasati browser session id is required.");
  }

  if (typeof text !== "string" || !text) {
    throw new Error("Authentication text is required.");
  }

  await madrasatiBrowserSessionManager.typeAuthentication(
    userId,
    sessionId.trim(),
    text,
  );
}

/**
 * Press a keyboard key in the currently focused Madrasati control.
 */
export async function pressAuthenticatedMadrasatiAuthenticationKey(
  waraqaUserId: string,
  sessionId: string,
  key: string,
): Promise<void> {
  const userId = requireAuthenticatedUserId(waraqaUserId);

  if (!sessionId || typeof sessionId !== "string" || !sessionId.trim()) {
    throw new Error("Madrasati browser session id is required.");
  }

  const normalizedKey = key?.trim();

  const allowedKeys = new Set([
    "Enter",
    "Tab",
    "Backspace",
    "Delete",
    "Escape",
    "ArrowLeft",
    "ArrowRight",
    "ArrowUp",
    "ArrowDown",
  ]);

  if (!normalizedKey || !allowedKeys.has(normalizedKey)) {
    throw new Error("Unsupported Madrasati browser key.");
  }

  await madrasatiBrowserSessionManager.pressAuthenticationKey(
    userId,
    sessionId.trim(),
    normalizedKey,
  );
}

/**
 * Latest live JPEG/PNG frame of a session owned by the authenticated user.
 * Cookies, credentials and Playwright objects never leave the server.
 */
export async function getAuthenticatedMadrasatiAuthenticationLiveFrame(
  waraqaUserId: string,
  sessionId: string,
): Promise<MadrasatiLiveFrame> {
  const userId = requireAuthenticatedUserId(waraqaUserId);

  if (!sessionId || typeof sessionId !== "string" || !sessionId.trim()) {
    throw new Error("Madrasati browser session id is required.");
  }

  return madrasatiBrowserSessionManager.getAuthenticationLiveFrame(
    userId,
    sessionId.trim(),
  );
}

/**
 * Focus metadata only. Never includes the control value.
 */
export async function inspectAuthenticatedMadrasatiAuthenticationFocus(
  waraqaUserId: string,
  sessionId: string,
): Promise<MadrasatiFocusedControl> {
  const userId = requireAuthenticatedUserId(waraqaUserId);

  if (!sessionId || typeof sessionId !== "string" || !sessionId.trim()) {
    throw new Error("Madrasati browser session id is required.");
  }

  return madrasatiBrowserSessionManager.inspectAuthenticationFocus(
    userId,
    sessionId.trim(),
  );
}

/**
 * Waits for the next CDP live frame of an owned session.
 * This is event-driven, not a screenshot poll.
 */
export async function waitForAuthenticatedMadrasatiAuthenticationLiveFrame(
  waraqaUserId: string,
  sessionId: string,
  sinceSeq: number,
): Promise<MadrasatiLiveFrameUpdate | null> {
  const userId = requireAuthenticatedUserId(waraqaUserId);

  if (!sessionId || typeof sessionId !== "string" || !sessionId.trim()) {
    throw new Error("Madrasati browser session id is required.");
  }

  return madrasatiBrowserSessionManager.waitForAuthenticationLiveFrame(
    userId,
    sessionId.trim(),
    sinceSeq,
  );
}
