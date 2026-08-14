import { resolveAcademicScope } from "@/features/calendar/services/academic-calendar";
import { getPlanEntriesForDate } from "@/features/planner/services/semester-plan.service";
import { TeacherTimetableService } from "@/features/teacher-timetable/services/teacher-timetable.service";
import { deserializeLessonNotes } from "@/platform/curriculum/curriculum-management.functions";
import { resolveUserContext, type SupabaseUserContext } from "@/platform/database/supabase/context";
import type { Database } from "@/platform/database/supabase/types";
import {
  assertCurriculumLessonAuthorized,
} from "./lesson-curriculum-authorization";
import {
  LessonSessionLockedError,
  LessonSessionPreparingError,
  type LessonSession,
  type LessonSessionGenerationResult,
  type LessonSessionStatus,
  type LessonSessionView,
} from "../types";

type SessionRow = Database["public"]["Tables"]["lesson_sessions"]["Row"];
type SessionInsert = Database["public"]["Tables"]["lesson_sessions"]["Insert"];
type SessionUpdate = Database["public"]["Tables"]["lesson_sessions"]["Update"];

const SESSION_STATUSES: readonly LessonSessionStatus[] = [
  "scheduled",
  "preparing",
  "prepared",
  "completed",
  "cancelled",
];

function toStatus(value: string): LessonSessionStatus {
  return (SESSION_STATUSES as readonly string[]).includes(value)
    ? (value as LessonSessionStatus)
    : "scheduled";
}

function toSession(row: SessionRow): LessonSession {
  return {
    id: row.id,
    teacherId: row.teacher_id,
    academicYearId: row.academic_year_id,
    semesterId: row.semester_id,
    gradeId: row.grade_id,
    classId: row.class_id,
    curriculumLessonId: row.curriculum_lesson_id,
    sessionDate: row.session_date,
    dayOfWeek: row.day_of_week,
    periodNumber: row.period_number,
    lessonLocked: row.lesson_locked,
    status: toStatus(row.status),
    preparedAt: row.prepared_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function dayOfWeekFor(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/**
 * Owns the Lesson Session lifecycle.
 *
 * A session is created by projecting the teacher's timetable onto the
 * **canonical Semester Plan** stored in `planner_entries` for the plan's
 * current version (via `getPlanEntriesForDate`). Historical plan versions are
 * audit snapshots only and never rewrite existing sessions. Once a teacher
 * prepares a session the curriculum lesson is locked —
 * see docs/architecture/LESSON_SESSIONS_ENGINE.md.
 */
export class LessonSessionService {
  static async getSessionsByDate(
    date: string,
    context?: SupabaseUserContext,
  ): Promise<LessonSession[]> {
    const resolved = await resolveUserContext(context);

    if (!resolved) return [];

    const { data, error } = await resolved.client
      .from("lesson_sessions")
      .select("*")
      .eq("teacher_id", resolved.userId)
      .eq("session_date", date)
      .order("period_number");

    if (error) throw error;

    return (data ?? []).map(toSession);
  }

  static async getTodaySessions(context?: SupabaseUserContext): Promise<LessonSession[]> {
    return this.getSessionsByDate(todayIso(), context);
  }

  static async hasTodaySessions(context?: SupabaseUserContext): Promise<boolean> {
    const sessions = await this.getTodaySessions(context);

    return sessions.length > 0;
  }

  static async getSessionById(
    id: string,
    context?: SupabaseUserContext,
  ): Promise<LessonSession | null> {
    const resolved = await resolveUserContext(context);

    if (!resolved) return null;

    const { data, error } = await resolved.client
      .from("lesson_sessions")
      .select("*")
      .eq("id", id)
      .eq("teacher_id", resolved.userId)
      .maybeSingle();

    if (error) throw error;

    return data ? toSession(data) : null;
  }

  /**
   * Joins sessions with the curriculum lesson and timetable slot they point at,
   * so the UI can render titles and class labels without extra round trips.
   */
  static async getSessionViewsByDate(
    date: string,
    context?: SupabaseUserContext,
  ): Promise<LessonSessionView[]> {
    const resolved = await resolveUserContext(context);

    if (!resolved) return [];

    const sessions = await this.getSessionsByDate(date, resolved);

    if (sessions.length === 0) return [];

    const timetable = await TeacherTimetableService.getTimetable(resolved);

    const lessonIds = [...new Set(sessions.map((session) => session.curriculumLessonId))];

    const { data: lessons, error } = await resolved.client
      .from("curriculum_lessons")
      .select("id, title, objectives, notes")
      .in("id", lessonIds);

    if (error) throw error;

    const lessonById = new Map((lessons ?? []).map((lesson) => [lesson.id, lesson]));

    return sessions.map((session) => {
      const lesson = lessonById.get(session.curriculumLessonId);
      const slot = timetable.find(
        (entry) => entry.dayOfWeek === session.dayOfWeek && entry.period === session.periodNumber,
      );

      const unitTitle = lesson ? deserializeLessonNotes(lesson.notes).unitName || null : null;

      return {
        ...session,
        lessonTitle: lesson?.title ?? "درس غير معروف",
        lessonObjectives: lesson?.objectives ?? null,
        unitTitle,
        subject: slot?.subject ?? "",
        grade: slot?.grade ?? "",
        className: slot?.className ?? "",
        classroom: slot?.classroom ?? null,
        startsAt: slot?.startsAt ?? null,
        endsAt: slot?.endsAt ?? null,
      };
    });
  }

  static async getSessionViewById(
    id: string,
    context?: SupabaseUserContext,
  ): Promise<LessonSessionView | null> {
    const resolved = await resolveUserContext(context);

    if (!resolved) return null;

    const session = await this.getSessionById(id, resolved);

    if (!session) return null;

    const timetable = await TeacherTimetableService.getTimetable(resolved);

    const { data: lesson, error } = await resolved.client
      .from("curriculum_lessons")
      .select("id, title, objectives, notes")
      .eq("id", session.curriculumLessonId)
      .maybeSingle();

    if (error) throw error;

    const slot = timetable.find(
      (entry) => entry.dayOfWeek === session.dayOfWeek && entry.period === session.periodNumber,
    );

    const unitTitle = lesson ? deserializeLessonNotes(lesson.notes).unitName || null : null;

    return {
      ...session,
      lessonTitle: lesson?.title ?? "درس غير معروف",
      lessonObjectives: lesson?.objectives ?? null,
      unitTitle,
      subject: slot?.subject ?? "",
      grade: slot?.grade ?? "",
      className: slot?.className ?? "",
      classroom: slot?.classroom ?? null,
      startsAt: slot?.startsAt ?? null,
      endsAt: slot?.endsAt ?? null,
    };
  }

  static async getTodaySessionViews(context?: SupabaseUserContext): Promise<LessonSessionView[]> {
    return this.getSessionViewsByDate(todayIso(), context);
  }

  /**
   * Creates the missing sessions for a date.
   *
   * Existing sessions are never overwritten, so re-running this after a teacher
   * has prepared a lesson preserves their work.
   */
  static async generateSessionsForDate(
    date: string,
    context?: SupabaseUserContext,
  ): Promise<LessonSessionGenerationResult> {
    const resolved = await resolveUserContext(context);

    if (!resolved) {
      return { sessions: [], created: 0, skipped: "unauthenticated" };
    }

    const scope = await resolveAcademicScope(date, resolved);

    if (!scope) {
      return { sessions: [], created: 0, skipped: "no-academic-year" };
    }

    const dayOfWeek = dayOfWeekFor(date);
    const slots = await TeacherTimetableService.getTimetableForDay(dayOfWeek, resolved);

    if (slots.length === 0) {
      const timetable = await TeacherTimetableService.getTimetable(resolved);

      return {
        sessions: await this.getSessionViewsByDate(date, resolved),
        created: 0,
        skipped: timetable.length === 0 ? "no-timetable" : "no-slots",
      };
    }

    const schedule = await getPlanEntriesForDate(date);
    const plannedForDate = schedule.filter((entry) => entry.lessonId);

    if (plannedForDate.length === 0) {
      return {
        sessions: await this.getSessionViewsByDate(date, resolved),
        created: 0,
        skipped: "no-curriculum",
      };
    }

    const existing = await this.getSessionsByDate(date, resolved);
    const takenPeriods = new Set(existing.map((session) => session.periodNumber));

    const { gradeIdByName, classIdByName } = await this.loadGradeAndClassIds(resolved);

    const rows: SessionInsert[] = [];

    for (const slot of slots) {
      if (takenPeriods.has(slot.period)) continue;

      const planned = plannedForDate.find(
        (entry) => entry.period === slot.period && entry.dayOfWeek === dayOfWeek,
      );

      if (!planned?.lessonId) continue;

      rows.push({
        teacher_id: resolved.userId,
        academic_year_id: scope.academicYearId,
        semester_id: scope.semesterId,
        grade_id: gradeIdByName.get(slot.grade) ?? null,
        class_id: classIdByName.get(slot.className) ?? null,
        curriculum_lesson_id: planned.lessonId,
        session_date: date,
        day_of_week: dayOfWeek,
        period_number: slot.period,
        lesson_locked: false,
        status: "scheduled",
      });
    }

    if (rows.length > 0) {
      const { error } = await resolved.client.from("lesson_sessions").upsert(rows, {
        onConflict: "teacher_id,session_date,period_number",
        ignoreDuplicates: true,
      });

      if (error) throw error;
    }

    const sessions = await this.getSessionViewsByDate(date, resolved);

    return {
      sessions,
      created: rows.length,
      skipped: sessions.length === 0 ? "no-slots" : null,
    };
  }

  /**
   * Returns the sessions for a date, generating them first when none exist yet.
   */
  static async ensureSessionsForDate(
    date: string,
    context?: SupabaseUserContext,
  ): Promise<LessonSessionGenerationResult> {
    const existing = await this.getSessionViewsByDate(date, context);

    if (existing.length > 0) {
      return { sessions: existing, created: 0, skipped: null };
    }

    return this.generateSessionsForDate(date, context);
  }

  /**
   * Atomic Prepare claim: scheduled + unlocked → preparing.
   * Does NOT set lesson_locked (locked means preparation completed).
   * Returns null when zero rows match (concurrent loser / wrong state).
   */
  static async claimPrepareInProgress(
    id: string,
    context: SupabaseUserContext,
  ): Promise<LessonSession | null> {
    const { data, error } = await context.client
      .from("lesson_sessions")
      .update({ status: "preparing" })
      .eq("id", id)
      .eq("teacher_id", context.userId)
      .eq("status", "scheduled")
      .eq("lesson_locked", false)
      .select("*")
      .maybeSingle();

    if (error) throw error;

    return data ? toSession(data) : null;
  }

  /**
   * Finalize after successful lesson_plan persistence:
   * preparing → prepared + lesson_locked + prepared_at.
   */
  static async markPreparedAfterGeneration(
    id: string,
    context: SupabaseUserContext,
  ): Promise<LessonSession | null> {
    const { data, error } = await context.client
      .from("lesson_sessions")
      .update({
        status: "prepared",
        lesson_locked: true,
        prepared_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("teacher_id", context.userId)
      .eq("status", "preparing")
      .eq("lesson_locked", false)
      .select("*")
      .maybeSingle();

    if (error) throw error;

    return data ? toSession(data) : null;
  }

  /**
   * Roll claim back after AI/provider/persistence failure:
   * preparing → scheduled (still unlocked).
   */
  static async releasePrepareClaim(
    id: string,
    context: SupabaseUserContext,
  ): Promise<LessonSession | null> {
    const { data, error } = await context.client
      .from("lesson_sessions")
      .update({
        status: "scheduled",
        lesson_locked: false,
        prepared_at: null,
      })
      .eq("id", id)
      .eq("teacher_id", context.userId)
      .eq("status", "preparing")
      .eq("lesson_locked", false)
      .select("*")
      .maybeSingle();

    if (error) throw error;

    return data ? toSession(data) : null;
  }

  /**
   * Unlocks preparation flags.
   * From prepared or stuck preparing → scheduled.
   * Does NOT delete historical ai_generations (P3 Step 4).
   * preparing→scheduled must not alter completed_at (DB trigger F1/F2).
   */
  static async resetPreparation(
    id: string,
    context?: SupabaseUserContext,
  ): Promise<LessonSession | null> {
    const resolved = await resolveUserContext(context);
    if (!resolved) return null;

    const session = await this.getSessionById(id, resolved);
    if (!session) return null;

    if (session.status === "preparing") {
      return this.applyUpdate(
        id,
        {
          status: "scheduled",
          lesson_locked: false,
          prepared_at: null,
        },
        resolved,
      );
    }

    if (session.status !== "prepared") {
      return session;
    }

    return this.applyUpdate(
      id,
      {
        status: "scheduled",
        lesson_locked: false,
        prepared_at: null,
        completed_at: null,
      },
      resolved,
    );
  }

  static async completeSession(
    id: string,
    context?: SupabaseUserContext,
  ): Promise<LessonSession | null> {
    const session = await this.getSessionById(id, context);
    if (!session) return null;
    if (session.status === "preparing") {
      throw new LessonSessionPreparingError();
    }

    return this.applyUpdate(
      id,
      {
        status: "completed",
        completed_at: new Date().toISOString(),
      },
      context,
    );
  }

  static async cancelSession(
    id: string,
    context?: SupabaseUserContext,
  ): Promise<LessonSession | null> {
    const session = await this.getSessionById(id, context);
    if (!session) return null;
    if (session.status === "preparing") {
      throw new LessonSessionPreparingError();
    }

    return this.applyUpdate(id, { status: "cancelled" }, context);
  }

  static async changeLesson(
    sessionId: string,
    curriculumLessonId: string,
    context?: SupabaseUserContext,
  ): Promise<LessonSession | null> {
    const session = await this.getSessionById(sessionId, context);

    if (!session) return null;

    if (session.status === "preparing") {
      throw new LessonSessionPreparingError();
    }

    if (session.lessonLocked) {
      throw new LessonSessionLockedError();
    }

    const resolved = await resolveUserContext(context);
    if (!resolved) return null;

    const view = await this.getSessionViewById(sessionId, resolved);
    if (!view) return null;

    await assertCurriculumLessonAuthorized(resolved, {
      grade: view.grade,
      subject: view.subject,
      curriculumLessonId,
    });

    return this.applyUpdate(sessionId, { curriculum_lesson_id: curriculumLessonId }, resolved);
  }

  private static async applyUpdate(
    id: string,
    patch: SessionUpdate,
    context?: SupabaseUserContext,
  ): Promise<LessonSession | null> {
    const resolved = await resolveUserContext(context);

    if (!resolved) return null;

    const { data, error } = await resolved.client
      .from("lesson_sessions")
      .update(patch)
      .eq("id", id)
      .eq("teacher_id", resolved.userId)
      .select("*")
      .maybeSingle();

    if (error) throw error;

    return data ? toSession(data) : null;
  }

  private static async loadGradeAndClassIds(context: SupabaseUserContext): Promise<{
    gradeIdByName: Map<string, string>;
    classIdByName: Map<string, string>;
  }> {
    const [{ data: grades }, { data: classes }] = await Promise.all([
      context.client.from("grades").select("id, name").eq("user_id", context.userId),
      context.client.from("classes").select("id, name").eq("user_id", context.userId),
    ]);

    return {
      gradeIdByName: new Map((grades ?? []).map((grade) => [grade.name, grade.id])),
      classIdByName: new Map((classes ?? []).map((klass) => [klass.name, klass.id])),
    };
  }
}
