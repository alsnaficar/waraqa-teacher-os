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
  MadrasatiApplyAuthContext,
  MadrasatiApplyOptions,
  MadrasatiApplyResult,
  MadrasatiSyncPreviewCounts,
  MadrasatiSyncResult,
  MadrasatiSyncServiceOptions,
} from "./sync/madrasati-sync.service.ts";
export {
  MADRASATI_APPLY_EMPTY_CODE,
  MADRASATI_APPLY_INCOMPLETE_CODE,
  MADRASATI_APPLY_NOT_MOCK_CODE,
  MADRASATI_MOCK_APPLY_DISCLAIMER,
  MADRASATI_APPLY_EMPTY_MESSAGE,
  MADRASATI_APPLY_INCOMPLETE_MESSAGE,
  MADRASATI_APPLY_NOT_MOCK_MESSAGE,
} from "./sync/madrasati-sync.service.ts";
export {
  mapMadrasatiTimetableToTeacherDrafts,
  type TeacherTimetableDraft,
} from "./sync/map-to-teacher-timetable.ts";
export {
  normalizeTimetableEntries,
  type NormalizedTimetableResult,
  type RejectedTimetableEntry,
  type TimetableRejectReason,
} from "./sync/normalize-timetable.ts";
