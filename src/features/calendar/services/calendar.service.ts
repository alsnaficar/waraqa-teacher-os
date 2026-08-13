import { resolveUserContext, type SupabaseUserContext } from "@/platform/database/supabase/context";

/**
 * Read model for the official academic calendar.
 *
 * Terms are read from `semesters`, which is the table `lesson_sessions.semester_id`
 * points at. The parallel `academic_terms` table from 20260806100000 is unused.
 * RLS (not a user_id filter) decides which official rows an authenticated caller
 * may SELECT.
 */
export interface CalendarAcademicYear {
  id: string;
  label: string;
  startDate: string | null;
  endDate: string | null;
  isActive: boolean;
}

export interface CalendarTerm {
  id: string;
  label: string;
  startDate: string | null;
  endDate: string | null;
  orderIndex: number;
}

export interface CalendarEvent {
  id: string;
  title: string;
  eventType: string;
  startsAt: string;
  endsAt: string;
  isTeachingDay: boolean;
  isRemote: boolean;
}

export interface CalendarHoliday {
  date: string;
  label: string;
}

export async function getActiveAcademicYear(
  context?: SupabaseUserContext,
): Promise<CalendarAcademicYear | null> {
  const resolved = await resolveUserContext(context);

  if (!resolved) return null;

  const { data, error } = await resolved.client
    .from("academic_years")
    .select("id, label, start_date, end_date, is_active")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  if (!data) return null;

  return {
    id: data.id,
    label: data.label,
    startDate: data.start_date,
    endDate: data.end_date,
    isActive: data.is_active,
  };
}

function mapSemesterRow(row: {
  id: string;
  label: string;
  start_date: string | null;
  end_date: string | null;
  order_index: number;
}): CalendarTerm {
  return {
    id: row.id,
    label: row.label,
    startDate: row.start_date,
    endDate: row.end_date,
    orderIndex: row.order_index,
  };
}

/**
 * Resolve the academic term for a calendar date.
 *
 * Priority:
 * 1. Term that covers `date` (`start_date <= date <= end_date`)
 * 2. Else nearest future term (earliest `start_date > date`)
 * 3. Else null
 *
 * A semester with a null `end_date` is not treated as covering `date`.
 * That matches the previous SQL `.gte("end_date", today)`, which excluded NULLs.
 * Upcoming fallback uses `start_date` only and does not consult `order_index`.
 */
export function pickAcademicTermForDate(terms: CalendarTerm[], date: string): CalendarTerm | null {
  const covering = terms.filter(
    (term) =>
      term.startDate != null &&
      term.endDate != null &&
      term.startDate <= date &&
      term.endDate >= date,
  );

  if (covering.length === 1) return covering[0] ?? null;

  if (covering.length > 1) {
    return (
      [...covering].sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)))[0] ??
      null
    );
  }

  const upcoming = terms
    .filter((term) => term.startDate != null && term.startDate > date)
    .sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)));

  return upcoming[0] ?? null;
}

export async function getCurrentAcademicTerm(
  context?: SupabaseUserContext,
): Promise<CalendarTerm | null> {
  const resolved = await resolveUserContext(context);

  if (!resolved) return null;

  const year = await getActiveAcademicYear(resolved);

  if (!year) return null;

  const { data, error } = await resolved.client
    .from("semesters")
    .select("id, label, start_date, end_date, order_index")
    .eq("academic_year_id", year.id)
    .order("start_date", { ascending: true });

  if (error) throw error;

  const today = new Date().toISOString().slice(0, 10);
  return pickAcademicTermForDate((data ?? []).map(mapSemesterRow), today);
}

export async function getEventsBetween(
  startsAt: string,
  endsAt: string,
  context?: SupabaseUserContext,
): Promise<CalendarEvent[]> {
  const resolved = await resolveUserContext(context);

  if (!resolved) return [];

  const { data, error } = await resolved.client
    .from("calendar_events")
    .select("id, title, event_type, starts_at, ends_at, is_teaching_day, is_remote")
    .eq("user_id", resolved.userId)
    .lte("starts_at", endsAt)
    .gte("ends_at", startsAt)
    .order("starts_at");

  if (error) throw error;

  return (data ?? []).map((event) => ({
    id: event.id,
    title: event.title,
    eventType: event.event_type,
    startsAt: event.starts_at,
    endsAt: event.ends_at,
    isTeachingDay: event.is_teaching_day,
    isRemote: event.is_remote,
  }));
}

export async function isTeachingDay(date: string, context?: SupabaseUserContext): Promise<boolean> {
  const events = await getEventsBetween(date, date, context);

  if (events.length === 0) return true;

  return events.every((event) => event.isTeachingDay);
}

export async function getHolidayDates(context?: SupabaseUserContext): Promise<CalendarHoliday[]> {
  const resolved = await resolveUserContext(context);

  if (!resolved) return [];

  const { data, error } = await resolved.client
    .from("calendar_events")
    .select("title, starts_at, ends_at")
    .eq("user_id", resolved.userId)
    .eq("is_teaching_day", false);

  if (error) throw error;

  // Expand multi-day holidays so the planner skips every day in the range.
  const holidays: CalendarHoliday[] = [];

  for (const event of data ?? []) {
    const start = new Date(`${event.starts_at}T00:00:00Z`);
    const end = new Date(`${event.ends_at || event.starts_at}T00:00:00Z`);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;

    const cursor = new Date(start);
    while (cursor <= end) {
      holidays.push({
        date: cursor.toISOString().slice(0, 10),
        label: event.title,
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }

  return holidays;
}
