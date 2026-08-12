/**
 * Authenticated Madrasati dry-run preview core.
 *
 * Uses MockMadrasatiProvider only. Performs no database writes and no live
 * Madrasati / browser automation calls.
 */

import { createMadrasatiProvider } from "../../../../features/madrasati/provider/create-madrasati-provider.ts";
import { MadrasatiSyncService } from "../../../../features/madrasati/sync/madrasati-sync.service.ts";
import type { MadrasatiSyncResult } from "../../../../features/madrasati/sync/madrasati-sync.service.ts";

export const MADRASATI_DRY_RUN_DISCLAIMER =
  "هذه معاينة تجريبية باستخدام بيانات اختبار، وليست مزامنة فعلية مع منصة مدرستي.";

export type MadrasatiDryRunPreviewResult = MadrasatiSyncResult & {
  isMockPreview: true;
  disclaimer: string;
};

/**
 * Runs a mock dry-run preview owned by the authenticated Waraqa user.
 * Callers must pass context.userId from requireSupabaseAuth — never a
 * client-supplied teacherId/userId.
 */
export async function runAuthenticatedMadrasatiDryRunPreview(
  waraqaUserId: string,
): Promise<MadrasatiDryRunPreviewResult> {
  if (!waraqaUserId || typeof waraqaUserId !== "string" || !waraqaUserId.trim()) {
    throw new Error("Unauthorized: missing authenticated user");
  }

  const provider = createMadrasatiProvider({ mode: "mock" });
  const sync = new MadrasatiSyncService(provider);
  const result = await sync.previewSync(waraqaUserId.trim());

  return {
    ...result,
    isMockPreview: true,
    disclaimer: MADRASATI_DRY_RUN_DISCLAIMER,
  };
}
