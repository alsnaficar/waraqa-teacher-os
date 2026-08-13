import { resolveUserContext, type SupabaseUserContext } from "@/platform/database/supabase/context";

/**
 * The persisted academic year + semester a record belongs to.
 *
 * `lesson_sessions.academic_year_id` and `lesson_sessions.semester_id` are both
 * NOT NULL foreign keys, so callers need the real row ids rather than the
 * in-memory fallbacks that `platform/config/academic-config` serves to the UI.
 */
export interface AcademicScope {
  academicYearId: string;
  academicYearLabel: string;
  semesterId: string;
  semesterLabel: string;
}

function coversDate(date: string, startDate: string | null, endDate: string | null): boolean {
  if (startDate && date < startDate) return false;
  if (endDate && date > endDate) return false;
  return Boolean(startDate || endDate);
}

/**
 * Resolves the official academic year and semester that contain `date`.
 * Visibility is enforced by RLS (active official rows + admin/legacy owner).
 * Returns null when no visible year/semester exists.
 */
export async function resolveAcademicScope(
  date: string,
  context?: SupabaseUserContext,
): Promise<AcademicScope | null> {
  const resolved = await resolveUserContext(context);

  if (!resolved) return null;

  const { client } = resolved;

  const { data: years, error: yearsError } = await client
    .from("academic_years")
    .select("id, label, start_date, end_date, is_active")
    .order("is_active", { ascending: false })
    .order("start_date", { ascending: false });

  if (yearsError || !years || years.length === 0) {
    return null;
  }

  // Prefer the year that actually contains the date, then the active one.
  const year = years.find((y) => coversDate(date, y.start_date, y.end_date)) ?? years[0];

  const { data: semesters, error: semestersError } = await client
    .from("semesters")
    .select("id, label, start_date, end_date, order_index")
    .eq("academic_year_id", year.id)
    .order("order_index", { ascending: true });

  if (semestersError || !semesters || semesters.length === 0) {
    return null;
  }

  const semester =
    semesters.find((s) => coversDate(date, s.start_date, s.end_date)) ?? semesters[0];

  return {
    academicYearId: year.id,
    academicYearLabel: year.label,
    semesterId: semester.id,
    semesterLabel: semester.label,
  };
}
