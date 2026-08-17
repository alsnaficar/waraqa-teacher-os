/**
 * Madrasati connector server functions.
 *
 * Server-only Madrasati implementation is loaded dynamically inside handlers
 * so Playwright can never enter the browser/client dependency graph.
 *
 * - syncMadrasatiSchedule: legacy unavailable guard
 * - previewMadrasatiSync: authenticated mock dry-run preview
 * - applyMockMadrasatiTimetable: authenticated mock full weekly replace
 */

import { createServerFn } from "@tanstack/react-start";
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
  /** Always empty — legacy seed data is no longer returned. */
  timetable: [];
};

/**
 * @deprecated Do not call for real Madrasati sync. Returns unavailable; never seeds data.
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
 * Authenticated mock dry-run preview.
 *
 * IMPORTANT:
 * The implementation is dynamically imported so the client build never
 * traverses the Madrasati browser/Playwright dependency graph.
 */
export const previewMadrasatiSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { runAuthenticatedMadrasatiDryRunPreview } = await import(
      "./madrasati-preview.server.ts"
    );

    return runAuthenticatedMadrasatiDryRunPreview(context.userId);
  });

/**
 * Authenticated mock timetable apply.
 *
 * IMPORTANT:
 * The implementation is dynamically imported so the client build never
 * traverses the Madrasati browser/Playwright dependency graph.
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
