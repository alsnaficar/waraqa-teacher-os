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
 * Page text is intentionally returned only for the authenticated owner of
 * the session and only as the current inspection payload.
 */
export type MadrasatiAuthenticationInspectionResult = {
  url: string;
  title: string;
  text: string;
  authenticationState:
    | "not_authenticated"
    | "authenticated"
    | "unknown";
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

    return inspectAuthenticatedMadrasatiAuthentication(
      context.userId,
      data.sessionId,
    );
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
 * Captures the current page of the authenticated user's isolated
 * Madrasati browser session.
 */

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
