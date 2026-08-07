import { MadrasatiOAuthService } from "../auth/oauth.service";
import { TeacherTimetableService } from "@/features/teacher-timetable/services/teacher-timetable.service";
import { TeacherTimetableService } from "@/features/teacher-timetable/services/teacher-timetable.service";
import type {
  MadrasatiTeacherProfile,
  MadrasatiTimetableLesson,
} from "../types";

export class MadrasatiService {
  static async syncEverything(): Promise<void> {
  if (!(await this.isConnected())) {
    return;
  }

  await this.importTeacherData();

  await TeacherTimetableService.syncFromMadrasatiIfAvailable();

  const today = new Date().toISOString().slice(0, 10);

  await TeacherTimetableService.rebuildLessonSessions(today);
}
  static async importTeacherData(): Promise<void> {
  if (!(await this.isConnected())) {
    return;
  }

  const profile = await this.getTeacherProfile();

  if (!profile) {
    return;
  }

  await this.syncTeacherTimetable();

  const today = new Date().toISOString().slice(0, 10);

  await TeacherTimetableService.rebuildLessonSessions(today);
}
  if (!(await this.isConnected())) {
    return;
  }

  await this.syncTeacherTimetable();

  const timetable = await TeacherTimetableService.getTimetable();

  if (timetable.length === 0) {
    return;
  }

  const today = new Date().toISOString().slice(0, 10);

  await TeacherTimetableService.rebuildLessonSessions(today);
}
  static async getTeacherProfile(): Promise<MadrasatiTeacherProfile | null> {
  const timetable = await TeacherTimetableService.getTimetable();

  if (timetable.length === 0) {
    return null;
  }

  return {
    teacherName: "",
    schoolName: "",
    schoolId: "",
    academicYear: "",
    semester: "",
    subjects: [...new Set(timetable.map((t) => t.subject))],
    grades: [...new Set(timetable.map((t) => t.grade))],
    classes: [...new Set(timetable.map((t) => t.className))],
  };
}

  static async getTeacherTimetable(): Promise<
    MadrasatiTimetableLesson[]
  > {
    const timetable = await TeacherTimetableService.getTimetable();

    return timetable.map((t) => ({
      dayOfWeek: t.dayOfWeek,
      period: t.period,
      subject: t.subject,
      grade: t.grade,
      className: t.className,
      classroom: t.classroom,
      startsAt: t.startsAt,
      endsAt: t.endsAt,
    }));
  }

  static async isConnected(): Promise<boolean> {
  return MadrasatiOAuthService.isAuthenticated();
}

static async syncTeacherTimetable(): Promise<void> {
  const timetable = await this.getTeacherTimetable();

  if (timetable.length === 0) {
    return;
  }

  await TeacherTimetableService.saveTimetable(
    timetable.map((t) => ({
      id: crypto.randomUUID(),
      teacherId: "",
      dayOfWeek: t.dayOfWeek,
      period: t.period,
      subject: t.subject,
      grade: t.grade,
      className: t.className,
      classroom: t.classroom,
      startsAt: t.startsAt,
      endsAt: t.endsAt,
      active: true,
    })),
  );
}
