/**
 * Normalized Madrasati import models.
 *
 * These are adapter-facing shapes for data discovered from Madrasati (or mocks).
 * They intentionally do not mirror Waraqa DB rows (`teacher_timetable`, `profiles`, etc.).
 */

export type MadrasatiConnectionState =
  "disconnected" | "connected" | "unavailable" | "not_implemented";

export type MadrasatiAuthenticationState = "not_authenticated" | "authenticated";

export interface MadrasatiConnectionStatus {
  state: MadrasatiConnectionState;
  authenticationState: MadrasatiAuthenticationState;
  /** Human-readable Arabic/English status for UI / dry-run reports. */
  message: string;
  /** True only when a mock/dev provider is active — never claim live Madrasati. */
  isMock: boolean;
  /** True when a real browser backend could theoretically run (package present). */
  browserAutomationAvailable: boolean;
}

export interface MadrasatiTeacher {
  displayName: string;
  /** Optional external identifier when Madrasati exposes one later. */
  externalId?: string;
  schoolName?: string;
  academicYear?: string;
  semester?: string;
}

export interface MadrasatiSubject {
  name: string;
  code?: string;
}

export interface MadrasatiClass {
  grade: string;
  className: string;
  stage?: string;
}

export interface MadrasatiTimetableEntry {
  dayOfWeek: number;
  period: number;
  subject: string;
  grade: string;
  className: string;
  classroom?: string;
  startsAt?: string;
  endsAt?: string;
}

/** Raw / untrusted timetable payload before normalization. */
export type MadrasatiTimetableEntryInput = Partial<MadrasatiTimetableEntry> & {
  dayOfWeek?: number | string | null;
  period?: number | string | null;
};
