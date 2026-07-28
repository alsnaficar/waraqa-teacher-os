/**
 * Weekly curriculum schedule — provider-agnostic types.
 *
 * A ScheduleEntry represents a single lesson slot in a teacher's weekly
 * timetable. Providers (mock today, Google Drive later) resolve entries
 * without the Planner knowing where they came from.
 */

import type { EducationStage } from "@/features/ai/components/curriculum-selector";

export type ScheduleProviderId = "mock" | "google-drive";

export type ScheduleDayKey = "sun" | "mon" | "tue" | "wed" | "thu";

export interface ScheduleEntry {
  id: string;
  /** ISO Hijri date, e.g. "1447-05-12". */
  hijriDate: string;
  /** ISO Gregorian date, e.g. "2026-07-23". */
  gregorianDate: string;
  /** Academic week number (1-based). */
  week: number;
  day: ScheduleDayKey;
  stage: EducationStage;
  grade: string;
  subject: string;
  /** Period number (1-based). */
  period: number;
  lessonTitle: string;
  /** Optional class/section label (e.g. "1", "2/أ"). */
  klass?: string;
}

export interface GetWeekOptions {
  /** Any Gregorian date within the target week (Sunday-based). */
  weekOf: Date;
}

export interface GetDayOptions {
  gregorianDate: Date;
}

export interface ScheduleProvider {
  readonly id: ScheduleProviderId;
  getWeek(options: GetWeekOptions): Promise<ScheduleEntry[]>;
  getDay(options: GetDayOptions): Promise<ScheduleEntry[]>;
}
