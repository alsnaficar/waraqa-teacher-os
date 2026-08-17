/**
 * Authenticated Madrasati dry-run preview core.
 *
 * Uses MockMadrasatiProvider only. Performs no database writes and no live
 * Madrasati / browser automation calls.
 */

import { createMadrasatiProvider } from "../../../../features/madrasati/provider/create-madrasati-provider.server.ts";
import { MadrasatiSyncService } from "../../../../features/madrasati/sync/madrasati-sync.service.ts";
import type { MadrasatiDryRunPreviewResult } from "./madrasati-preview.contract.ts";
import { MADRASATI_DRY_RUN_DISCLAIMER } from "./madrasati-preview.contract.ts";

export { MADRASATI_DRY_RUN_DISCLAIMER } from "./madrasati-preview.contract.ts";
export type { MadrasatiDryRunPreviewResult } from "./madrasati-preview.contract.ts";

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
