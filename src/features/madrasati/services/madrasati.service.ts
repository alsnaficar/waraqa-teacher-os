import {
  LessonSessionService,
  todayIso,
} from "@/features/lesson-sessions/services/lesson-session.service";
import { parseProfileTimetable } from "@/features/planner/services/planner-engine";
import { TeacherTimetableService } from "@/features/teacher-timetable/services/teacher-timetable.service";
import type { TeacherTimetableEntry } from "@/features/teacher-timetable/types";
import { resolveUserContext, type SupabaseUserContext } from "@/platform/database/supabase/context";
import { MadrasatiOAuthService } from "../auth/oauth.service";
import type { MadrasatiTeacherProfile, MadrasatiTimetableLesson } from "../types";

type TimetableDraft = Omit<TeacherTimetableEntry, "id" | "teacherId" | "createdAt" | "updatedAt">;

/**
 * Bridges a future Madrasati import into Waraqa's own tables.
 *
 * Live Madrasati connectivity is gated by {@link MadrasatiOAuthService.isConnected}
 * (always false until browser sync is ready). Local timetable/session helpers
 * remain available for promoting already-imported Waraqa data only.
 */
export class MadrasatiService {
  static async isConnected(): Promise<boolean> {
    return MadrasatiOAuthService.isConnected();
  }

  static async getTeacherTimetable(
    context?: SupabaseUserContext,
  ): Promise<MadrasatiTimetableLesson[]> {
    const timetable = await TeacherTimetableService.getTimetable(context);

    return timetable.map((entry) => ({
      dayOfWeek: entry.dayOfWeek,
      period: entry.period,
      subject: entry.subject,
      grade: entry.grade,
      className: entry.className,
      classroom: entry.classroom,
      startsAt: entry.startsAt,
      endsAt: entry.endsAt,
    }));
  }

  static async getTeacherProfile(
    context?: SupabaseUserContext,
  ): Promise<MadrasatiTeacherProfile | null> {
    const resolved = await resolveUserContext(context);

    if (!resolved) return null;

    const { data: profile } = await resolved.client
      .from("profiles")
      .select("full_name, school, subject, grade, academic_year, semester")
      .eq("id", resolved.userId)
      .maybeSingle();

    const timetable = await TeacherTimetableService.getTimetable(resolved);

    if (!profile && timetable.length === 0) {
      return null;
    }

    return {
      teacherName: profile?.full_name ?? "",
      schoolName: profile?.school ?? "",
      schoolId: "",
      academicYear: profile?.academic_year ?? "",
      semester: profile?.semester ?? "",
      subjects: [...new Set(timetable.map((entry) => entry.subject))],
      grades: [...new Set(timetable.map((entry) => entry.grade))],
      classes: [...new Set(timetable.map((entry) => entry.className))],
    };
  }

  /**
   * Copies the imported schedule from the teacher profile into
   * `teacher_timetable`. Returns the number of slots written.
   */
  static async syncTeacherTimetable(context?: SupabaseUserContext): Promise<number> {
    const resolved = await resolveUserContext(context);

    if (!resolved) return 0;

    const existing = await TeacherTimetableService.getTimetable(resolved);

    if (existing.length > 0) {
      return existing.length;
    }

    const { data: profile } = await resolved.client
      .from("profiles")
      .select("subject, grade, classes")
      .eq("id", resolved.userId)
      .maybeSingle();

    if (!profile) return 0;

    const slots = parseProfileTimetable(profile.classes);

    if (slots.length === 0) return 0;

    const drafts: TimetableDraft[] = slots.map((slot) => ({
      dayOfWeek: slot.dayOfWeek,
      period: slot.period,
      subject: profile.subject ?? "",
      grade: profile.grade ?? "",
      className: slot.className || (profile.grade ?? ""),
      active: true,
    }));

    await TeacherTimetableService.saveTimetable(drafts, resolved);

    return drafts.length;
  }

  static async importTeacherData(context?: SupabaseUserContext): Promise<void> {
    if (!(await this.isConnected())) return;

    await this.syncTeacherTimetable(context);
  }

  /**
   * Full import: timetable first, then today's lesson sessions.
   */
  static async syncEverything(context?: SupabaseUserContext): Promise<void> {
    if (!(await this.isConnected())) return;

    await this.syncTeacherTimetable(context);

    await LessonSessionService.generateSessionsForDate(todayIso(), context);
  }
}
