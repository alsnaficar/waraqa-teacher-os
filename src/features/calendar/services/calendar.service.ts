import { resolveUserContext, type SupabaseUserContext } from "@/platform/database/supabase/context";

/**
 * Read model for the teacher's academic calendar.
 *
 * Terms are read from `semesters`, which is the table `lesson_sessions.semester_id`
 * points at. The parallel `academic_terms` table from 20260806100000 is shared
 * across teachers and unused, so treating `semesters` as canonical keeps one
 * per-teacher calendar model instead of two competing ones.
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
    .eq("user_id", resolved.userId)
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
    .eq("user_id", resolved.userId)
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
    .select("title, starts_at")
    .eq("user_id", resolved.userId)
    .eq("is_teaching_day", false);

  if (error) throw error;

  return (data ?? []).map((event) => ({
    date: event.starts_at,
    label: event.title,
  }));
}
