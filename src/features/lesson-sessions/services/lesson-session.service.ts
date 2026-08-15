import { resolveAcademicScope } from "@/features/calendar/services/academic-calendar";
import { getPlanEntriesForDate } from "@/features/planner/services/semester-plan.service";
import type { CalculatedLessonEntry } from "@/features/planner/services/planner-engine";
import { TeacherTimetableService } from "@/features/teacher-timetable/services/teacher-timetable.service";
import { deserializeLessonNotes } from "@/platform/curriculum/curriculum-management.functions";
import { resolveUserContext, type SupabaseUserContext } from "@/platform/database/supabase/context";
import type { Database } from "@/platform/database/supabase/types";
import {
  assertCurriculumLessonAuthorized,
  LessonCurriculumAuthorizationError,
} from "./lesson-curriculum-authorization";
import { buildSessionInsertsForTimetableSlots } from "./session-generation.logic";
import { collectUnlockedSessionCurriculumRefreshMatches } from "./session-curriculum-refresh.logic";
import {
  assertGradeClassRelationship,
  resolveOwnedGradeClassIds,
  type CatalogClass,
  type CatalogGrade,
} from "./resolve-grade-class.logic";
import {
  LessonSessionLockedError,
  LessonSessionPreparingError,
  toCurriculumLessonSource,
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
    curriculumLessonSource: toCurriculumLessonSource(row.curriculum_lesson_source),
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

  /**
   * Loads sessions for several local YYYY-MM-DD dates in one round trip.
   * Used by the weekly planner so Sun–Thu does not need five sequential reads.
   */
  static async getSessionsByDates(
    dates: string[],
    context?: SupabaseUserContext,
  ): Promise<LessonSession[]> {
    const uniqueDates = [...new Set(dates.filter(Boolean))];
    if (uniqueDates.length === 0) return [];

    const resolved = await resolveUserContext(context);

    if (!resolved) return [];

    const { data, error } = await resolved.client
      .from("lesson_sessions")
      .select("*")
      .eq("teacher_id", resolved.userId)
      .in("session_date", uniqueDates)
      .order("session_date")
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

  /**
   * Loads the authenticated teacher's sessions by id in one round trip.
   * Unknown or other-teacher ids are omitted (existence is not leaked).
   */
  static async getOwnedSessionsByIds(
    ids: readonly string[],
    context?: SupabaseUserContext,
  ): Promise<LessonSession[]> {
    const uniqueIds = [...new Set(ids.filter(Boolean))];
    if (uniqueIds.length === 0) return [];

    const resolved = await resolveUserContext(context);

    if (!resolved) return [];

    const { data, error } = await resolved.client
      .from("lesson_sessions")
      .select("*")
      .eq("teacher_id", resolved.userId)
      .in("id", uniqueIds);

    if (error) throw error;

    return (data ?? []).map(toSession);
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
    testOptions?: { planEntries?: CalculatedLessonEntry[] },
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

    const schedule =
      process.env.NODE_ENV === "test" && testOptions?.planEntries
        ? testOptions.planEntries
        : await getPlanEntriesForDate(date);
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

    const catalog = await this.loadOwnedGradeClassCatalog(resolved);

    const rows = buildSessionInsertsForTimetableSlots({
      slots,
      plannedForDate,
      dayOfWeek,
      sessionDate: date,
      teacherId: resolved.userId,
      academicYearId: scope.academicYearId,
      semesterId: scope.semesterId,
      takenPeriods,
      grades: catalog.grades,
      classes: catalog.classes,
    });

    if (rows.length > 0) {
      const { error } = await resolved.client.from("lesson_sessions").upsert(rows, {
        onConflict: "teacher_id,session_date,period_number",
        ignoreDuplicates: true,
      });

      if (error) throw error;
    }

    await this.refreshUnlockedSessionCurriculum(
      date,
      dayOfWeek,
      slots,
      plannedForDate,
      resolved,
    );

    const sessions = await this.getSessionViewsByDate(date, resolved);

    return {
      sessions,
      created: rows.length,
      skipped: sessions.length === 0 ? "no-slots" : null,
    };
  }

  /**
   * Returns the sessions for a date, generating them first when none exist yet.
   * When sessions already exist, runs P2 stale-plan refresh before returning so
   * unlocked plan-sourced sessions track the current canonical plan. Missing
   * periods are not created on that path (generation only when none exist).
   */
  static async ensureSessionsForDate(
    date: string,
    context?: SupabaseUserContext,
    testOptions?: { planEntries?: CalculatedLessonEntry[] },
  ): Promise<LessonSessionGenerationResult> {
    const existing = await this.getSessionViewsByDate(date, context);

    if (existing.length > 0) {
      await this.refreshUnlockedSessionsForDate(date, context, testOptions);
      const sessions = await this.getSessionViewsByDate(date, context);
      return { sessions, created: 0, skipped: null };
    }

    return this.generateSessionsForDate(date, context, testOptions);
  }

  /**
   * Loads timetable + plan context and runs P2 refresh when possible.
   * No-op when unauthenticated, no slots, or no curriculum plan entries.
   * Reuses refreshUnlockedSessionCurriculum (no duplicate matching).
   */
  private static async refreshUnlockedSessionsForDate(
    date: string,
    context?: SupabaseUserContext,
    testOptions?: { planEntries?: CalculatedLessonEntry[] },
  ): Promise<void> {
    const resolved = await resolveUserContext(context);
    if (!resolved) return;

    const dayOfWeek = dayOfWeekFor(date);
    const slots = await TeacherTimetableService.getTimetableForDay(dayOfWeek, resolved);
    if (slots.length === 0) return;

    const schedule =
      process.env.NODE_ENV === "test" && testOptions?.planEntries
        ? testOptions.planEntries
        : await getPlanEntriesForDate(date);
    const plannedForDate = schedule.filter((entry) => entry.lessonId);
    if (plannedForDate.length === 0) return;

    await this.refreshUnlockedSessionCurriculum(
      date,
      dayOfWeek,
      slots,
      plannedForDate,
      resolved,
    );
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

    return this.applyUpdate(
      sessionId,
      {
        curriculum_lesson_id: curriculumLessonId,
        curriculum_lesson_source: "manual",
      },
      resolved,
    );
  }

  /**
   * P2 stale-plan refresh: update curriculum_lesson_id for scheduled/unlocked
   * sessions whose source is still `plan`. Manual overrides are never overwritten.
   * Zero/ambiguous DI-02 matches and SEC-02 denials leave the session unchanged.
   */
  private static async refreshUnlockedSessionCurriculum(
    date: string,
    dayOfWeek: number,
    slots: Awaited<ReturnType<typeof TeacherTimetableService.getTimetableForDay>>,
    plannedForDate: CalculatedLessonEntry[],
    context: SupabaseUserContext,
  ): Promise<void> {
    const existing = await this.getSessionsByDate(date, context);
    const matches = collectUnlockedSessionCurriculumRefreshMatches({
      sessions: existing,
      slots,
      plannedForDate,
      dayOfWeek,
    });

    for (const match of matches) {
      try {
        await assertCurriculumLessonAuthorized(context, {
          grade: match.grade,
          subject: match.subject,
          curriculumLessonId: match.curriculumLessonId,
        });
      } catch (error) {
        if (error instanceof LessonCurriculumAuthorizationError) continue;
        throw error;
      }

      await this.applyUpdate(
        match.sessionId,
        {
          curriculum_lesson_id: match.curriculumLessonId,
          curriculum_lesson_source: "plan",
        },
        context,
      );
    }
  }

  /**
   * Attach or change grade/class on an owned lesson session.
   * Ownership + class↔grade relationship enforced server-side.
   * Does not accept teacher_id from the client.
   */
  static async updateGradeAndClass(
    sessionId: string,
    input: { gradeId?: string | null; classId?: string | null },
    context?: SupabaseUserContext,
  ): Promise<LessonSession | null> {
    const resolved = await resolveUserContext(context);
    if (!resolved) return null;

    if (!sessionId?.trim()) {
      throw new Error("معرّف الحصة مطلوب.");
    }

    const existing = await this.getSessionById(sessionId.trim(), resolved);
    if (!existing) {
      throw new Error("الحصة غير موجودة أو لا تملك صلاحية الوصول إليها.");
    }

    const catalog = await this.loadOwnedGradeClassCatalog(resolved);

    let nextGradeId =
      input.gradeId !== undefined ? input.gradeId : existing.gradeId;
    let nextClassId =
      input.classId !== undefined ? input.classId : existing.classId;

    if (nextGradeId?.trim()) {
      const grade = catalog.grades.find((item) => item.id === nextGradeId!.trim());
      if (!grade) {
        throw new Error("الصف غير موجود أو لا تملك صلاحية الوصول إليه.");
      }
      nextGradeId = grade.id;
    } else {
      nextGradeId = null;
    }

    if (nextClassId?.trim()) {
      const klass = catalog.classes.find((item) => item.id === nextClassId!.trim());
      if (!klass) {
        throw new Error("الفصل غير موجود أو لا تملك صلاحية الوصول إليه.");
      }
      nextClassId = klass.id;

      // Class drives grade when it has a binding — prevents stale mismatched pairs.
      if (klass.gradeId) {
        if (
          input.gradeId !== undefined &&
          input.gradeId?.trim() &&
          input.gradeId.trim() !== klass.gradeId
        ) {
          throw new Error("الفصل لا ينتمي إلى الصف المحدد.");
        }
        nextGradeId = klass.gradeId;
      } else if (nextGradeId) {
        assertGradeClassRelationship(nextGradeId, nextClassId, catalog.classes);
      }
    } else {
      nextClassId = null;
    }

    if (nextGradeId && nextClassId) {
      assertGradeClassRelationship(nextGradeId, nextClassId, catalog.classes);
    }

    const mapped = resolveOwnedGradeClassIds({
      gradeId: nextGradeId,
      classId: nextClassId,
      grades: catalog.grades,
      classes: catalog.classes,
    });

    if (mapped.status === "foreign") {
      throw new Error("الصف أو الفصل غير موجود أو لا تملك صلاحية الوصول إليه.");
    }
    if (mapped.status === "mismatch") {
      throw new Error("الفصل لا ينتمي إلى الصف المحدد.");
    }
    if (mapped.status === "ambiguous") {
      throw new Error("تعذر تحديد الصف/الفصل بشكل فريد.");
    }

    return this.applyUpdate(
      sessionId.trim(),
      {
        grade_id: mapped.gradeId,
        class_id: mapped.classId,
      },
      resolved,
    );
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

  private static async loadOwnedGradeClassCatalog(context: SupabaseUserContext): Promise<{
    grades: CatalogGrade[];
    classes: CatalogClass[];
  }> {
    const [{ data: grades }, { data: classes }] = await Promise.all([
      context.client.from("grades").select("id, name").eq("user_id", context.userId),
      context.client
        .from("classes")
        .select("id, name, grade_id")
        .eq("user_id", context.userId),
    ]);

    return {
      grades: (grades ?? []).map((grade) => ({ id: grade.id, name: grade.name })),
      classes: (classes ?? []).map((klass) => ({
        id: klass.id,
        name: klass.name,
        gradeId: klass.grade_id,
      })),
    };
  }
}
