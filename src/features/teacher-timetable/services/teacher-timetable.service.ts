import { resolveUserContext, type SupabaseUserContext } from "@/platform/database/supabase/context";
import type { Database } from "@/platform/database/supabase/types";
import type { TeacherTimetableEntry } from "../types";

type TimetableRow = Database["public"]["Tables"]["teacher_timetable"]["Row"];
type TimetableInsert = Database["public"]["Tables"]["teacher_timetable"]["Insert"];
type TimetableUpdate = Database["public"]["Tables"]["teacher_timetable"]["Update"];

export type TeacherTimetableSlotInput = Omit<
  TeacherTimetableEntry,
  "id" | "teacherId" | "createdAt" | "updatedAt"
>;

export type TeacherTimetableSlotPatch = Partial<TeacherTimetableSlotInput>;

/** Raised when (teacher_id, day_of_week, period) already exists. */
export class TimetableSlotConflictError extends Error {
  constructor(message = "يوجد حصة أخرى في نفس اليوم ونفس رقم الحصة.") {
    super(message);
    this.name = "TimetableSlotConflictError";
  }
}

export function isTimetableUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  if (code === "23505") return true;
  const message = "message" in error ? String((error as { message?: unknown }).message ?? "") : "";
  return /unique|duplicate|idx_teacher_timetable_unique_slot/i.test(message);
}

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

function toInsertRow(
  teacherId: string,
  entry: TeacherTimetableSlotInput,
): TimetableInsert {
  return {
    teacher_id: teacherId,
    day_of_week: entry.dayOfWeek,
    period: entry.period,
    subject: entry.subject.trim(),
    grade: entry.grade.trim(),
    class_name: entry.className.trim(),
    classroom: entry.classroom?.trim() ? entry.classroom.trim() : null,
    starts_at: entry.startsAt ?? null,
    ends_at: entry.endsAt ?? null,
    active: entry.active,
  };
}

function toUpdatePatch(patch: TeacherTimetableSlotPatch): TimetableUpdate {
  const row: TimetableUpdate = {};
  if (patch.dayOfWeek !== undefined) row.day_of_week = patch.dayOfWeek;
  if (patch.period !== undefined) row.period = patch.period;
  if (patch.subject !== undefined) row.subject = patch.subject.trim();
  if (patch.grade !== undefined) row.grade = patch.grade.trim();
  if (patch.className !== undefined) row.class_name = patch.className.trim();
  if (patch.classroom !== undefined) {
    row.classroom = patch.classroom.trim() ? patch.classroom.trim() : null;
  }
  if (patch.startsAt !== undefined) row.starts_at = patch.startsAt ?? null;
  if (patch.endsAt !== undefined) row.ends_at = patch.endsAt ?? null;
  if (patch.active !== undefined) row.active = patch.active;
  return row;
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

    const rows: TimetableInsert[] = entries.map((entry) => toInsertRow(resolved.userId, entry));

    const { error } = await resolved.client.from("teacher_timetable").insert(rows);

    if (error) throw error;
  }

  /**
   * Inserts one slot for the authenticated teacher.
   * Does not mutate lesson_sessions.
   */
  static async addSlot(
    entry: TeacherTimetableSlotInput,
    context?: SupabaseUserContext,
  ): Promise<TeacherTimetableEntry | null> {
    const resolved = await resolveUserContext(context);
    if (!resolved) return null;

    const { data, error } = await resolved.client
      .from("teacher_timetable")
      .insert(toInsertRow(resolved.userId, entry))
      .select("*")
      .maybeSingle();

    if (error) {
      if (isTimetableUniqueViolation(error)) throw new TimetableSlotConflictError();
      throw error;
    }

    return data ? toEntry(data) : null;
  }

  /**
   * Updates one owned slot by id + teacher_id.
   * Does not mutate lesson_sessions.
   */
  static async updateSlot(
    id: string,
    patch: TeacherTimetableSlotPatch,
    context?: SupabaseUserContext,
  ): Promise<TeacherTimetableEntry | null> {
    const resolved = await resolveUserContext(context);
    if (!resolved) return null;

    const row = toUpdatePatch(patch);
    if (Object.keys(row).length === 0) {
      const existing = await this.getSlotById(id, resolved);
      return existing;
    }

    const { data, error } = await resolved.client
      .from("teacher_timetable")
      .update(row)
      .eq("id", id)
      .eq("teacher_id", resolved.userId)
      .select("*")
      .maybeSingle();

    if (error) {
      if (isTimetableUniqueViolation(error)) throw new TimetableSlotConflictError();
      throw error;
    }

    return data ? toEntry(data) : null;
  }

  /**
   * Deletes one owned slot by id + teacher_id.
   * Does not mutate lesson_sessions.
   */
  static async deleteSlot(id: string, context?: SupabaseUserContext): Promise<boolean> {
    const resolved = await resolveUserContext(context);
    if (!resolved) return false;

    const { data, error } = await resolved.client
      .from("teacher_timetable")
      .delete()
      .eq("id", id)
      .eq("teacher_id", resolved.userId)
      .select("id")
      .maybeSingle();

    if (error) throw error;

    return Boolean(data);
  }

  static async getSlotById(
    id: string,
    context?: SupabaseUserContext,
  ): Promise<TeacherTimetableEntry | null> {
    const resolved = await resolveUserContext(context);
    if (!resolved) return null;

    const { data, error } = await resolved.client
      .from("teacher_timetable")
      .select("*")
      .eq("id", id)
      .eq("teacher_id", resolved.userId)
      .maybeSingle();

    if (error) throw error;

    return data ? toEntry(data) : null;
  }

  static async hasTimetable(context?: SupabaseUserContext): Promise<boolean> {
    const timetable = await this.getTimetable(context);

    return timetable.length > 0;
  }
}
