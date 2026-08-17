/**
 * Core Madrasati façade.
 *
 * The canonical provider contract and sync foundation live under
 * `@/features/madrasati`. This module re-exports them so older
 * `@/core/madrasati` imports stay aligned with the foundation.
 */

export type {
  MadrasatiClass,
  MadrasatiConnectionState,
  MadrasatiConnectionStatus,
  MadrasatiSubject,
  MadrasatiTeacher,
  MadrasatiTimetableEntry,
  MadrasatiTimetableEntryInput,
} from "@/features/madrasati/provider/models.ts";

export type { MadrasatiProvider } from "@/features/madrasati/provider/madrasati-provider.ts";
export {
  MadrasatiBrowserNotReadyError,
  MadrasatiNotConnectedError,
  MadrasatiProviderError,
} from "@/features/madrasati/provider/madrasati-provider.ts";

export { MadrasatiSyncService } from "@/features/madrasati/sync/madrasati-sync.service.ts";
export type {
  MadrasatiSyncPreviewCounts,
  MadrasatiSyncResult,
  MadrasatiSyncServiceOptions,
} from "@/features/madrasati/sync/madrasati-sync.service.ts";
