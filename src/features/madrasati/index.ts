export * from "./types";
export * from "./hooks/useMadrasati";
export * from "./services/madrasati.service";
export * from "./auth/oauth.service";

export type {
  MadrasatiClass,
  MadrasatiConnectionState,
  MadrasatiConnectionStatus,
  MadrasatiSubject,
  MadrasatiTeacher,
  MadrasatiTimetableEntry,
  MadrasatiTimetableEntryInput,
} from "./provider/models.ts";

export type { MadrasatiProvider } from "./provider/madrasati-provider.ts";
export {
  MadrasatiBrowserNotReadyError,
  MadrasatiNotConnectedError,
  MadrasatiProviderError,
} from "./provider/madrasati-provider.ts";
export {
  createMadrasatiProvider,
  type CreateMadrasatiProviderOptions,
  type MadrasatiProviderMode,
} from "./provider/create-madrasati-provider.ts";

export {
  UnavailableBrowserAutomation,
  BrowserAutomationUnavailableError,
  type BrowserAutomation,
  type BrowserAutomationKind,
  type BrowserSessionHandle,
} from "./browser/browser-automation.ts";
export { MadrasatiBrowserAdapter } from "./browser/madrasati-browser-adapter.ts";

export { MockMadrasatiProvider } from "./mock/mock-madrasati-provider.ts";
export {
  MOCK_MADRASATI_CLASSES,
  MOCK_MADRASATI_SUBJECTS,
  MOCK_MADRASATI_TEACHER,
  MOCK_MADRASATI_TIMETABLE,
  MOCK_MADRASATI_TIMETABLE_WITH_ISSUES,
} from "./mock/fixtures.ts";

export { MadrasatiSyncService } from "./sync/madrasati-sync.service.ts";
export type {
  MadrasatiSyncPreviewCounts,
  MadrasatiSyncResult,
  MadrasatiSyncServiceOptions,
} from "./sync/madrasati-sync.service.ts";
export {
  normalizeTimetableEntries,
  type NormalizedTimetableResult,
  type RejectedTimetableEntry,
  type TimetableRejectReason,
} from "./sync/normalize-timetable.ts";
