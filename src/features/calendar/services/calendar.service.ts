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

export async function getCurrentAcademicTerm(
  context?: SupabaseUserContext,
): Promise<CalendarTerm | null> {
  const resolved = await resolveUserContext(context);

  if (!resolved) return null;

  const year = await getActiveAcademicYear(resolved);

  if (!year) return null;

  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await resolved.client
    .from("semesters")
    .select("id, label, start_date, end_date, order_index")
    .eq("academic_year_id", year.id)
    .lte("start_date", today)
    .gte("end_date", today)
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  if (!data) return null;

  return {
    id: data.id,
    label: data.label,
    startDate: data.start_date,
    endDate: data.end_date,
    orderIndex: data.order_index,
  };
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
