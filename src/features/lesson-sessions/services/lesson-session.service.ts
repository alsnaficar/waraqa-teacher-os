import { TeacherTimetableService } from "@/features/teacher-timetable/services/teacher-timetable.service";
import {
  generateSchedule,
  type CalculatedLessonEntry,
} from "@/features/planner/services/planner-engine";
import { supabase } from "@/platform/database/supabase/client";
import type { LessonSession } from "../types";

export class LessonSessionService {
  static async getTodaySessions(): Promise<LessonSession[]> {
    const today = new Date().toISOString().slice(0, 10);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return [];

    const { data, error } = await supabase
      .from("lesson_sessions")
      .select("*")
      .eq("teacher_id", user.id)
      .eq("session_date", today)
      .order("period_number");

    if (error) throw error;

    return (data ?? []) as LessonSession[];
  }

  static async getTodaySessions(): Promise<LessonSession[]> {
  const today = new Date().toISOString().slice(0, 10);

  return this.getSessionsByDate(today);
}

static async getSessionsByDate(
  date: string,
): Promise<LessonSession[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data, error } = await supabase
    .from("lesson_sessions")
    .select("*")
    .eq("teacher_id", user.id)
    .eq("session_date", date)
    .order("period_number");

  if (error) throw error;

  return (data ?? []) as LessonSession[];
}

static async hasTodaySessions(): Promise<boolean> {
  const sessions = await this.getTodaySessions();

  return sessions.length > 0;
}

static async generateSessionsForDate(
  date: string,
): Promise<LessonSession[]> {
  const existing = await this.getSessionsByDate(date);

  if (existing.length > 0) {
    return existing;
  }

  const planner: CalculatedLessonEntry[] = await generateSchedule();

  const targetDate = date;

  const todayPlanner = planner.filter(
    (lesson) => lesson.date === targetDate,
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return [];
  }

  const timetable = await TeacherTimetableService.getTimetable();

const rows = todayPlanner
  .filter((lesson) =>
    timetable.some(
      (t) =>
        t.dayOfWeek === lesson.dayOfWeek &&
        t.period === lesson.period,
    ),
  )
  .map((lesson) => ({
    teacher_id: user.id,
    session_date: lesson.date,
    day_of_week: lesson.dayOfWeek,
    period_number: lesson.period,
    lesson_locked: false,
    status: "scheduled",
  }));
    teacher_id: user.id,
    session_date: lesson.date,
    day_of_week: lesson.dayOfWeek,
    period_number: lesson.period,
    lesson_locked: false,
    status: "scheduled",
  }));

  if (rows.length === 0) {
    return [];
  }

  const { error } = await supabase
    .from("lesson_sessions")
    .insert(rows);

  if (error) {
    throw error;
  }

  return this.getSessionsByDate(targetDate);
}

  static async prepareSession(id: string): Promise<void> {
    throw new Error("Not implemented");
  }

  static async resetPreparation(id: string): Promise<void> {
    throw new Error("Not implemented");
  }

  static async changeLesson(
    sessionId: string,
    lessonId: string,
  ): Promise<void> {
    throw new Error("Not implemented");
  }
}
