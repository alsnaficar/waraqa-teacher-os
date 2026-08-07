import { LessonSessionService } from "@/features/lesson-sessions/services/lesson-session.service";
import { supabase } from "@/platform/database/supabase/client";
import type { TeacherTimetableEntry } from "../types";

export class TeacherTimetableService {
  static async getTimetable(): Promise<TeacherTimetableEntry[]> {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return [];

    const { data, error } = await supabase
      .from("teacher_timetable")
      .select("*")
      .eq("teacher_id", user.id)
      .eq("active", true)
      .order("day_of_week")
      .order("period");

    if (error) throw error;

    return (data ?? []).map((r) => ({
      id: r.id,
      teacherId: r.teacher_id,
      dayOfWeek: r.day_of_week,
      period: r.period,
      subject: r.subject,
      grade: r.grade,
      className: r.class_name,
      classroom: r.classroom,
      startsAt: r.starts_at,
      endsAt: r.ends_at,
      active: r.active,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  static async syncFromMadrasati(): Promise<void> {
  /*
   * المرحلة الحالية:
   * سيتم لاحقًا جلب الجدول من منصة مدرستي.
   * حاليًا نعيد إنشاء جلسات اليوم بعد أي مزامنة.
   */

  const today = new Date().toISOString().slice(0, 10);

  await this.rebuildLessonSessions(today);
}

static async rebuildLessonSessions(date: string): Promise<void> {
  await LessonSessionService.generateSessionsForDate(date);
}

  static async saveTimetable(
    entries: TeacherTimetableEntry[],
  ): Promise<void> {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    await supabase
      .from("teacher_timetable")
      .delete()
      .eq("teacher_id", user.id);

    if (entries.length === 0) return;

    const rows = entries.map((e) => ({
      teacher_id: user.id,
      day_of_week: e.dayOfWeek,
      period: e.period,
      subject: e.subject,
      grade: e.grade,
      class_name: e.className,
      classroom: e.classroom,
      starts_at: e.startsAt,
      ends_at: e.endsAt,
      active: e.active,
    }));

    const { error } = await supabase
      .from("teacher_timetable")
      .insert(rows);

    if (error) throw error;
  }
}
