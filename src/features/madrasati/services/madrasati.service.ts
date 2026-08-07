import { TeacherTimetableService } from "@/features/teacher-timetable/services/teacher-timetable.service";
import { TeacherTimetableService } from "@/features/teacher-timetable/services/teacher-timetable.service";
import type {
  MadrasatiTeacherProfile,
  MadrasatiTimetableLesson,
} from "../types";

export class MadrasatiService {
  static async importTeacherData(): Promise<void> {
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
    return null;
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
  const timetable = await TeacherTimetableService.getTimetable();

  return timetable.length > 0;
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
