/**
 * Madrasati connector server functions.
 *
 * Browser automation is server-only.
 * Authentication/session state is never exposed to the client.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/platform/database/supabase/auth-middleware";
import {
  MADRASATI_BROWSER_SYNC_NOT_READY_CODE,
  MADRASATI_BROWSER_SYNC_NOT_READY_MESSAGE,
} from "./madrasati-status.ts";

export {
  MADRASATI_BROWSER_SYNC_NOT_READY_CODE,
  MADRASATI_BROWSER_SYNC_NOT_READY_MESSAGE,
} from "./madrasati-status.ts";

export {
  MADRASATI_DRY_RUN_DISCLAIMER,
  type MadrasatiDryRunPreviewResult,
} from "./madrasati-preview.contract.ts";

export type SyncMadrasatiScheduleResult = {
  success: false;
  available: false;
  code: typeof MADRASATI_BROWSER_SYNC_NOT_READY_CODE;
  message: string;
  timetable: [];
};

/**
 * Result returned when starting the server-side Madrasati authentication session.
 */
export type MadrasatiAuthenticationStartResult = {
  session: {
    sessionId: string;
    createdAt: string;
    expiresAt: string;
  };
  url: string;
  authenticationState: "not_authenticated" | "authenticated";
  message: string;
};

/**
 * Result returned when inspecting the server-side authentication page.
 *
 * Page text, title, URL, cookies and Playwright objects never leave the server.
 * The client only receives the fail-closed authentication state.
 */
export type MadrasatiAuthenticationInspectionResult = {
  authenticationState:
    | "not_authenticated"
    | "authenticated"
    | "unknown";
};

export type MadrasatiAuthenticationStatusResult = {
  hasSession: boolean;
  authenticationState: "not_authenticated" | "authenticated";
};

export type MadrasatiTeacherProfileResult = {
  displayName: string;
  schoolName?: string;
  academicYear?: string;
  semester?: string;
};

export type MadrasatiClassResult = {
  grade: string;
  className: string;
  stage?: string;
};

export type MadrasatiSubjectResult = {
  name: string;
  code?: string;
};

export type MadrasatiTimetableEntryResult = {
  dayOfWeek: number;
  period: number;
  subject: string;
  grade: string;
  className: string;
  classroom?: string;
  startsAt?: string;
  endsAt?: string;
};

export type MadrasatiLiveExtractionResult<T> =
  | { success: true; data: T; empty?: boolean }
  | { success: false; code: string; message: string };

export type MadrasatiLiveVerificationResult = {
  authenticated: boolean;
  connection: "LIVE" | "MOCK";
  isMock: boolean;
  stoppedBecauseMock: boolean;
  teacher: MadrasatiLiveExtractionResult<MadrasatiTeacherProfileResult>;
  classes: MadrasatiLiveExtractionResult<readonly MadrasatiClassResult[]>;
  subjects: MadrasatiLiveExtractionResult<readonly MadrasatiSubjectResult[]>;
  timetable: MadrasatiLiveExtractionResult<readonly MadrasatiTimetableEntryResult[]>;
  timetableValidation: {
    invalidDayCount: number;
    invalidPeriodCount: number;
    missingSubjectCount: number;
    missingGradeCount: number;
    missingClassCount: number;
    duplicateCount: number;
    semesterAsClassNameCount: number;
  };
  session: {
    existedBefore: boolean;
    remainedAlive: boolean;
    remainedAuthenticated: boolean;
    secondSessionCreated: boolean;
  };
  databaseWrites: "NONE";
};

export type MadrasatiAuthenticationLiveFrameResult = {
  mimeType: "image/jpeg" | "image/png";
  base64: string;
  viewportWidth: number;
  viewportHeight: number;
};

export type MadrasatiAuthenticationLiveFrameUpdateResult = {
  seq: number;
  frame: MadrasatiAuthenticationLiveFrameResult;
};

export type MadrasatiAuthenticationFocusResult = {
  isEditable: boolean;
  inputType:
    | "text"
    | "email"
    | "search"
    | "tel"
    | "url"
    | "protected"
    | "none";
};

/**
 * @deprecated Do not call for real Madrasati sync.
 * Returns unavailable; never seeds data.
 */
export const syncMadrasatiSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<SyncMadrasatiScheduleResult> => {
    return {
      success: false,
      available: false,
      code: MADRASATI_BROWSER_SYNC_NOT_READY_CODE,
      message: MADRASATI_BROWSER_SYNC_NOT_READY_MESSAGE,
      timetable: [],
    };
  });

/**
 * Starts or reuses an isolated server-side browser session for the
 * authenticated Waraqa user.
 */
export const startMadrasatiAuthentication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MadrasatiAuthenticationStartResult> => {
    const { startAuthenticatedMadrasatiAuthentication } = await import(
      "./madrasati-auth.server.ts"
    );

    return startAuthenticatedMadrasatiAuthentication(context.userId);
  });

/**
 * Inspects the current authentication page of a session owned by the
 * authenticated Waraqa user.
 */
export const inspectMadrasatiAuthentication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      sessionId: z.string().trim().min(1),
    }),
  )
  .handler(async ({ context, data }): Promise<MadrasatiAuthenticationInspectionResult> => {
    const { inspectAuthenticatedMadrasatiAuthentication } = await import(
      "./madrasati-auth.server.ts"
    );

    const page = await inspectAuthenticatedMadrasatiAuthentication(
      context.userId,
      data.sessionId,
    );

    return {
      authenticationState: page.authenticationState,
    };
  });

/**
 * Captures the current page of the authenticated user's isolated
 * Madrasati browser session.
 */
export const screenshotMadrasatiAuthentication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      sessionId: z.string().trim().min(1),
    }),
  )
  .handler(async ({ context, data }): Promise<string> => {
    const { getAuthenticatedMadrasatiAuthenticationScreenshot } = await import(
      "./madrasati-auth.server.ts"
    );

    return getAuthenticatedMadrasatiAuthenticationScreenshot(
      context.userId,
      data.sessionId,
    );
  });

/**
 * Status of the caller's existing Madrasati browser session, if any.
 * Never starts a browser and never returns page text, cookies, or URLs.
 */
export const getMadrasatiAuthenticationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MadrasatiAuthenticationStatusResult> => {
    const { peekAuthenticatedMadrasatiAuthentication } = await import(
      "./madrasati-auth.server.ts"
    );

    return peekAuthenticatedMadrasatiAuthentication(context.userId);
  });

/**
 * Read-only teacher profile from the authenticated user's live Madrasati session.
 * Never writes to the database. Never returns HTML, cookies, URLs, or Playwright objects.
 */
export const getMadrasatiTeacherProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MadrasatiTeacherProfileResult> => {
    const { readAuthenticatedMadrasatiTeacherProfile } = await import(
      "./madrasati-auth.server.ts"
    );

    const teacher = await readAuthenticatedMadrasatiTeacherProfile(context.userId);

    return {
      displayName: teacher.displayName,
      ...(teacher.schoolName ? { schoolName: teacher.schoolName } : {}),
      ...(teacher.academicYear ? { academicYear: teacher.academicYear } : {}),
      ...(teacher.semester ? { semester: teacher.semester } : {}),
    };
  });

/**
 * Read-only assigned classes from the authenticated user's live Madrasati session.
 * Never writes to the database. Never returns HTML, cookies, URLs, or Playwright objects.
 */
export const getMadrasatiClasses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MadrasatiClassResult[]> => {
    const { readAuthenticatedMadrasatiClasses } = await import(
      "./madrasati-auth.server.ts"
    );

    const classes = await readAuthenticatedMadrasatiClasses(context.userId);

    return classes.map((item) => ({
      grade: item.grade,
      className: item.className,
      ...(item.stage ? { stage: item.stage } : {}),
    }));
  });

/**
 * Read-only assigned subjects from the authenticated user's live Madrasati session.
 * Never writes to the database. Never returns HTML, cookies, URLs, or Playwright objects.
 */
export const getMadrasatiSubjects = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MadrasatiSubjectResult[]> => {
    const { readAuthenticatedMadrasatiSubjects } = await import(
      "./madrasati-auth.server.ts"
    );

    const subjects = await readAuthenticatedMadrasatiSubjects(context.userId);

    return subjects.map((item) => ({
      name: item.name,
      ...(item.code ? { code: item.code } : {}),
    }));
  });

/**
 * Read-only teacher timetable from the authenticated user's live Madrasati session.
 * Never writes to the database. Never returns HTML, cookies, URLs, or Playwright objects.
 */
export const getMadrasatiTimetable = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MadrasatiTimetableEntryResult[]> => {
    const { readAuthenticatedMadrasatiTimetable } = await import(
      "./madrasati-auth.server.ts"
    );

    const timetable = await readAuthenticatedMadrasatiTimetable(context.userId);

    return timetable.map((item) => ({
      dayOfWeek: item.dayOfWeek,
      period: item.period,
      subject: item.subject,
      grade: item.grade,
      className: item.className,
      ...(item.classroom ? { classroom: item.classroom } : {}),
      ...(item.startsAt ? { startsAt: item.startsAt } : {}),
      ...(item.endsAt ? { endsAt: item.endsAt } : {}),
    }));
  });

/**
 * Read-only live verification of the authenticated user's Madrasati extraction.
 * Reuses the existing owned browser session. Never writes to the database.
 * Never returns HTML, cookies, URLs, or Playwright objects.
 */
export const verifyMadrasatiLiveExtraction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MadrasatiLiveVerificationResult> => {
    const { verifyAuthenticatedMadrasatiLiveExtraction } = await import(
      "./madrasati-auth.server.ts"
    );

    return verifyAuthenticatedMadrasatiLiveExtraction(context.userId);
  });

/**
 * Closes the authenticated user's isolated Madrasati browser session.
 */
export const closeMadrasatiAuthentication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      sessionId: z.string().trim().min(1),
    }),
  )
  .handler(async ({ context, data }): Promise<void> => {
    const { closeAuthenticatedMadrasatiAuthentication } = await import(
      "./madrasati-auth.server.ts"
    );

    await closeAuthenticatedMadrasatiAuthentication(
      context.userId,
      data.sessionId,
    );
  });

/**
 * Authenticated mock timetable apply.
 */
export const applyMockMadrasatiTimetable = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { runAuthenticatedMadrasatiMockApply } = await import(
      "./madrasati-apply.server.ts"
    );

    return runAuthenticatedMadrasatiMockApply({
      userId: context.userId,
      client: context.supabase,
    });
  });


/**
 * Click inside the authenticated user's server-side Madrasati session.
 */
export const clickMadrasatiAuthentication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      sessionId: z.string().trim().min(1),
      x: z.number().finite().min(0),
      y: z.number().finite().min(0),
    }),
  )
  .handler(async ({ context, data }): Promise<void> => {
    const { clickAuthenticatedMadrasatiAuthentication } = await import(
      "./madrasati-auth.server.ts"
    );

    await clickAuthenticatedMadrasatiAuthentication(
      context.userId,
      data.sessionId,
      data.x,
      data.y,
    );
  });

/**
 * Type into the currently focused Madrasati control.
 */
export const typeMadrasatiAuthentication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      sessionId: z.string().trim().min(1),
      text: z.string().min(1).max(4096),
    }),
  )
  .handler(async ({ context, data }): Promise<void> => {
    const { typeAuthenticatedMadrasatiAuthentication } = await import(
      "./madrasati-auth.server.ts"
    );

    await typeAuthenticatedMadrasatiAuthentication(
      context.userId,
      data.sessionId,
      data.text,
    );
  });

/**
 * Press a keyboard key in the authenticated user's Madrasati session.
 */
export const pressMadrasatiAuthenticationKey = createServerFn({
  method: "POST",
})
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      sessionId: z.string().trim().min(1),
      key: z.string().trim().min(1).max(64),
    }),
  )
  .handler(async ({ context, data }): Promise<void> => {
    const { pressAuthenticatedMadrasatiAuthenticationKey } = await import(
      "./madrasati-auth.server.ts"
    );

    await pressAuthenticatedMadrasatiAuthenticationKey(
      context.userId,
      data.sessionId,
      data.key,
    );
  });

/**
 * Latest live frame of the authenticated user's isolated Madrasati session.
 */
export const getMadrasatiAuthenticationLiveFrame = createServerFn({
  method: "POST",
})
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      sessionId: z.string().trim().min(1),
    }),
  )
  .handler(async ({ context, data }): Promise<MadrasatiAuthenticationLiveFrameResult> => {
    const { getAuthenticatedMadrasatiAuthenticationLiveFrame } = await import(
      "./madrasati-auth.server.ts"
    );

    return getAuthenticatedMadrasatiAuthenticationLiveFrame(
      context.userId,
      data.sessionId,
    );
  });

/**
 * Event-driven wait for the next CDP frame of an owned session.
 */
export const waitForMadrasatiAuthenticationLiveFrame = createServerFn({
  method: "POST",
})
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      sessionId: z.string().trim().min(1),
      sinceSeq: z.number().int().min(0).max(1_000_000_000),
    }),
  )
  .handler(async ({ context, data }): Promise<MadrasatiAuthenticationLiveFrameUpdateResult | null> => {
    const { waitForAuthenticatedMadrasatiAuthenticationLiveFrame } = await import(
      "./madrasati-auth.server.ts"
    );

    return waitForAuthenticatedMadrasatiAuthenticationLiveFrame(
      context.userId,
      data.sessionId,
      data.sinceSeq,
    );
  });

/**
 * Focus metadata for the authenticated user's Madrasati session.
 * The control value is never returned.
 */
export const inspectMadrasatiAuthenticationFocus = createServerFn({
  method: "POST",
})
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      sessionId: z.string().trim().min(1),
    }),
  )
  .handler(async ({ context, data }): Promise<MadrasatiAuthenticationFocusResult> => {
    const { inspectAuthenticatedMadrasatiAuthenticationFocus } = await import(
      "./madrasati-auth.server.ts"
    );

    return inspectAuthenticatedMadrasatiAuthenticationFocus(
      context.userId,
      data.sessionId,
    );
  });

/**
 * Authenticated mock dry-run preview.
 */
export const previewMadrasatiSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { runAuthenticatedMadrasatiDryRunPreview } = await import(
      "./madrasati-preview.server.ts"
    );

    return runAuthenticatedMadrasatiDryRunPreview(context.userId);
  });
