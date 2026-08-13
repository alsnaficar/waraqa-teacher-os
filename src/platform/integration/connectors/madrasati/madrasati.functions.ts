/**
 * Madrasati connector server functions.
 *
 * - syncMadrasatiSchedule: legacy unavailable guard (no seed / no credentials)
 * - previewMadrasatiSync: authenticated mock dry-run preview (no DB writes)
 * - applyMockMadrasatiTimetable: authenticated mock full weekly replace (teacher_timetable only)
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/platform/database/supabase/auth-middleware";
import {
  MADRASATI_BROWSER_SYNC_NOT_READY_CODE,
  MADRASATI_BROWSER_SYNC_NOT_READY_MESSAGE,
} from "./madrasati-status.ts";
import {
  runAuthenticatedMadrasatiDryRunPreview,
  type MadrasatiDryRunPreviewResult,
} from "./madrasati-preview.server.ts";
import {
  runAuthenticatedMadrasatiMockApply,
  type MadrasatiApplyResult,
} from "./madrasati-apply.server.ts";

export {
  MADRASATI_BROWSER_SYNC_NOT_READY_CODE,
  MADRASATI_BROWSER_SYNC_NOT_READY_MESSAGE,
} from "./madrasati-status.ts";

export {
  MADRASATI_DRY_RUN_DISCLAIMER,
  runAuthenticatedMadrasatiDryRunPreview,
  type MadrasatiDryRunPreviewResult,
} from "./madrasati-preview.server.ts";

export {
  MADRASATI_MOCK_APPLY_DISCLAIMER,
  MADRASATI_APPLY_EMPTY_CODE,
  MADRASATI_APPLY_INCOMPLETE_CODE,
  MADRASATI_APPLY_NOT_MOCK_CODE,
  runAuthenticatedMadrasatiMockApply,
  type MadrasatiApplyResult,
} from "./madrasati-apply.server.ts";

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
 * Owner identity is always context.userId from JWT — no client ownership fields.
 */
export const previewMadrasatiSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MadrasatiDryRunPreviewResult> => {
    return runAuthenticatedMadrasatiDryRunPreview(context.userId);
  });

/**
 * Authenticated mock timetable apply (full weekly replace into teacher_timetable).
 * Owner identity is always context.userId from JWT — no client ownership fields.
 * Does not modify lesson_sessions.
 */
export const applyMockMadrasatiTimetable = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MadrasatiApplyResult> => {
    return runAuthenticatedMadrasatiMockApply({
      userId: context.userId,
      client: context.supabase,
    });
  });
