import { supabase } from "@/platform/database/supabase/client";

export async function getActiveAcademicYear() {
  const { data, error } = await supabase
    .from("academic_years")
    .select("*")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export async function getCurrentAcademicTerm() {
  const year = await getActiveAcademicYear();

  if (!year) {
    return null;
  }

  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("academic_terms")
    .select("*")
    .eq("academic_year_id", year.id)
    .lte("starts_at", today)
    .gte("ends_at", today)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export async function getEventsBetween(startsAt: string, endsAt: string) {
  const year = await getActiveAcademicYear();

  if (!year) {
    return [];
  }

  const { data, error } = await supabase
    .from("calendar_events")
    .select("*")
    .eq("academic_year_id", year.id)
    .lte("starts_at", endsAt)
    .gte("ends_at", startsAt)
    .order("starts_at");

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function isTeachingDay(date: string) {
  const events = await getEventsBetween(date, date);

  if (events.length === 0) {
    return true;
  }

  return events.every((event) => event.is_teaching_day);
}

export async function getHolidayDates() {
  const year = await getActiveAcademicYear();

  if (!year) {
    return [];
  }

  const { data, error } = await supabase
    .from("calendar_events")
    .select("starts_at,title")
    .eq("academic_year_id", year.id)
    .eq("is_teaching_day", false);

  if (error) {
    throw error;
  }

  return data ?? [];
}
