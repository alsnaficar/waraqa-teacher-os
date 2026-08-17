/**
 * Authenticated mock-only Madrasati timetable apply.
 *
 * Persists a complete weekly snapshot into teacher_timetable.
 * Never touches lesson_sessions. Never calls live Madrasati / browser automation.
 */

import { createMadrasatiProvider } from "../../../../features/madrasati/provider/create-madrasati-provider.server.ts";
import {
  MadrasatiSyncService,
  type MadrasatiApplyAuthContext,
  type MadrasatiApplyOptions,
  type MadrasatiApplyResult,
} from "../../../../features/madrasati/sync/madrasati-sync.service.ts";
import type { MadrasatiProvider } from "../../../../features/madrasati/provider/madrasati-provider.ts";

export {
  MADRASATI_MOCK_APPLY_DISCLAIMER,
  MADRASATI_APPLY_EMPTY_CODE,
  MADRASATI_APPLY_INCOMPLETE_CODE,
  MADRASATI_APPLY_NOT_MOCK_CODE,
  MADRASATI_APPLY_EMPTY_MESSAGE,
  MADRASATI_APPLY_INCOMPLETE_MESSAGE,
  MADRASATI_APPLY_NOT_MOCK_MESSAGE,
} from "../../../../features/madrasati/sync/madrasati-sync.service.ts";

export type { MadrasatiApplyResult };

/**
 * Applies mock normalized timetable for the authenticated Waraqa user only.
 * Owner is always auth.userId — never a client-supplied identity.
 */
export async function runAuthenticatedMadrasatiMockApply(
  auth: MadrasatiApplyAuthContext,
  options: MadrasatiApplyOptions & { provider?: MadrasatiProvider } = {},
): Promise<MadrasatiApplyResult> {
  if (!auth?.userId || typeof auth.userId !== "string" || !auth.userId.trim()) {
    throw new Error("Unauthorized: missing authenticated user");
  }
  if (!auth.client) {
    throw new Error("Unauthorized: missing authenticated Supabase client");
  }

  const provider = options.provider ?? createMadrasatiProvider({ mode: "mock" });
  const sync = new MadrasatiSyncService(provider);
  return sync.applyMockTimetable(auth.userId.trim(), auth, {
    saveTimetable: options.saveTimetable,
  });
}
