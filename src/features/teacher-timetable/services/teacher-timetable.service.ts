import { resolveUserContext, type SupabaseUserContext } from "@/platform/database/supabase/context";
import type { Database } from "@/platform/database/supabase/types";
import type { TeacherTimetableEntry } from "../types";

type TimetableRow = Database["public"]["Tables"]["teacher_timetable"]["Row"];
type TimetableInsert = Database["public"]["Tables"]["teacher_timetable"]["Insert"];

function toEntry(row: TimetableRow): TeacherTimetableEntry {
  return {
    id: row.id,
    teacherId: row.teacher_id,
    dayOfWeek: row.day_of_week,
    period: row.period,
    subject: row.subject,
    grade: row.grade,
    className: row.class_name,
    classroom: row.classroom ?? undefined,
    startsAt: row.starts_at ?? undefined,
    endsAt: row.ends_at ?? undefined,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Data access for the teacher's weekly timetable.
 *
 * This is deliberately a leaf module: it only talks to Supabase. Orchestration
 * that spans timetable + lesson sessions + Madrasati lives in the callers, which
 * keeps the dependency direction Madrasati -> Timetable -> Lesson Session and
 * avoids the import cycle those services used to form.
 */
export class TeacherTimetableService {
  static async getTimetable(context?: SupabaseUserContext): Promise<TeacherTimetableEntry[]> {
    const resolved = await resolveUserContext(context);

    if (!resolved) return [];

    const { data, error } = await resolved.client
      .from("teacher_timetable")
      .select("*")
      .eq("teacher_id", resolved.userId)
      .eq("active", true)
      .order("day_of_week")
      .order("period");

    if (error) throw error;

    return (data ?? []).map(toEntry);
  }

  static async getTimetableForDay(
    dayOfWeek: number,
    context?: SupabaseUserContext,
  ): Promise<TeacherTimetableEntry[]> {
    const timetable = await this.getTimetable(context);

    return timetable.filter((entry) => entry.dayOfWeek === dayOfWeek);
  }

  /**
   * Replaces the whole timetable for the teacher.
   *
   * The weekly timetable is authored as one unit (imported from Madrasati or
   * edited wholesale), so a replace keeps it consistent with the source and
   * avoids orphan slots that a partial upsert would leave behind.
   */
  static async saveTimetable(
    entries: Array<Omit<TeacherTimetableEntry, "id" | "teacherId" | "createdAt" | "updatedAt">>,
    context?: SupabaseUserContext,
  ): Promise<void> {
    const resolved = await resolveUserContext(context);

    if (!resolved) return;

    const { error: deleteError } = await resolved.client
      .from("teacher_timetable")
      .delete()
      .eq("teacher_id", resolved.userId);

    if (deleteError) throw deleteError;

    if (entries.length === 0) return;

    const rows: TimetableInsert[] = entries.map((entry) => ({
      teacher_id: resolved.userId,
      day_of_week: entry.dayOfWeek,
      period: entry.period,
      subject: entry.subject,
      grade: entry.grade,
      class_name: entry.className,
      classroom: entry.classroom ?? null,
      starts_at: entry.startsAt ?? null,
      ends_at: entry.endsAt ?? null,
      active: entry.active,
    }));

    const { error } = await resolved.client.from("teacher_timetable").insert(rows);

    if (error) throw error;
  }

  static async hasTimetable(context?: SupabaseUserContext): Promise<boolean> {
    const timetable = await this.getTimetable(context);

    return timetable.length > 0;
  }
}
