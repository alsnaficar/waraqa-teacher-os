import { todayIso } from "@/features/lesson-sessions/services/lesson-session.service";
import type { LessonSessionStatus } from "@/features/lesson-sessions/types";
import { resolveUserContext, type SupabaseUserContext } from "@/platform/database/supabase/context";
import type { Database } from "@/platform/database/supabase/types";

type SessionRow = Database["public"]["Tables"]["lesson_sessions"]["Row"];

const SESSION_STATUSES: readonly LessonSessionStatus[] = [
  "scheduled",
  "preparing",
  "prepared",
  "completed",
  "cancelled",
];

/** Same convention as LessonSessionService: unknown DB status → scheduled. */
export function toReportStatus(value: string): LessonSessionStatus {
  return (SESSION_STATUSES as readonly string[]).includes(value)
    ? (value as LessonSessionStatus)
    : "scheduled";
}

/** Session fields the reports UI will need later — read model only. */
export interface ReportLessonSessionRow {
  id: string;
  sessionDate: string;
  dayOfWeek: number;
  periodNumber: number;
  status: LessonSessionStatus;
  lessonLocked: boolean;
  curriculumLessonId: string;
  teacherId: string;
}

export interface LessonSessionReportStats {
  total: number;
  scheduled: number;
  preparing: number;
  prepared: number;
  completed: number;
  cancelled: number;
  /** completed / total * 100, integer; 0 when total is 0. */
  completionRate: number;
}

export interface LessonSessionReport {
  stats: LessonSessionReportStats;
  sessions: ReportLessonSessionRow[];
  range: { from: string; to: string };
}

export type ReportsDateFilter =
  | { kind: "today"; today?: string }
  | { kind: "week"; today?: string }
  | { kind: "month"; today?: string }
  | { kind: "custom"; from: string; to: string };

function isoFromUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Resolves inclusive YYYY-MM-DD bounds using the same ISO date convention as
 * `todayIso()` (UTC calendar date). Does not invent local-timezone rules.
 */
export function resolveReportsDateRange(filter: ReportsDateFilter): { from: string; to: string } {
  if (filter.kind === "custom") {
    return { from: filter.from, to: filter.to };
  }

  const today = filter.today ?? todayIso();
  const anchor = new Date(`${today}T00:00:00Z`);

  if (filter.kind === "today") {
    return { from: today, to: today };
  }

  if (filter.kind === "week") {
    const sunday = new Date(anchor);
    sunday.setUTCDate(anchor.getUTCDate() - anchor.getUTCDay());
    const saturday = new Date(sunday);
    saturday.setUTCDate(sunday.getUTCDate() + 6);
    return { from: isoFromUtcDate(sunday), to: isoFromUtcDate(saturday) };
  }

  // month
  const from = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1));
  const to = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 0));
  return { from: isoFromUtcDate(from), to: isoFromUtcDate(to) };
}

export function toReportRow(
  row: Pick<
    SessionRow,
    | "id"
    | "session_date"
    | "day_of_week"
    | "period_number"
    | "status"
    | "lesson_locked"
    | "curriculum_lesson_id"
    | "teacher_id"
  >,
): ReportLessonSessionRow {
  return {
    id: row.id,
    sessionDate: row.session_date,
    dayOfWeek: row.day_of_week,
    periodNumber: row.period_number,
    status: toReportStatus(row.status),
    lessonLocked: row.lesson_locked,
    curriculumLessonId: row.curriculum_lesson_id,
    teacherId: row.teacher_id,
  };
}

/** Deduplicate by id so aggregation never double-counts the same session. */
export function dedupeReportSessions(sessions: ReportLessonSessionRow[]): ReportLessonSessionRow[] {
  const seen = new Set<string>();
  const unique: ReportLessonSessionRow[] = [];
  for (const session of sessions) {
    if (seen.has(session.id)) continue;
    seen.add(session.id);
    unique.push(session);
  }
  return unique;
}

export function calculateLessonSessionStats(
  sessions: ReportLessonSessionRow[],
): LessonSessionReportStats {
  const unique = dedupeReportSessions(sessions);

  const stats: LessonSessionReportStats = {
    total: unique.length,
    scheduled: 0,
    preparing: 0,
    prepared: 0,
    completed: 0,
    cancelled: 0,
    completionRate: 0,
  };

  for (const session of unique) {
    stats[session.status] += 1;
  }

  stats.completionRate =
    stats.total === 0 ? 0 : Math.round((stats.completed / stats.total) * 100);

  return stats;
}

/**
 * Read-only reports domain service.
 *
 * Aggregates teacher-owned `lesson_sessions` for a date window. Does not write
 * sessions, does not introduce a reports table, and never trusts a client
 * `teacher_id`.
 */
export class ReportsService {
  static async getLessonSessionReport(
    filter: ReportsDateFilter,
    context?: SupabaseUserContext,
  ): Promise<LessonSessionReport> {
    const range = resolveReportsDateRange(filter);
    const empty: LessonSessionReport = {
      stats: calculateLessonSessionStats([]),
      sessions: [],
      range,
    };

    const resolved = await resolveUserContext(context);
    if (!resolved) return empty;

    const { data, error } = await resolved.client
      .from("lesson_sessions")
      .select(
        "id, session_date, day_of_week, period_number, status, lesson_locked, curriculum_lesson_id, teacher_id",
      )
      .eq("teacher_id", resolved.userId)
      .gte("session_date", range.from)
      .lte("session_date", range.to)
      .order("session_date")
      .order("period_number");

    if (error) throw error;

    const sessions = dedupeReportSessions((data ?? []).map(toReportRow));

    return {
      stats: calculateLessonSessionStats(sessions),
      sessions,
      range,
    };
  }
}
