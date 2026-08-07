export type LessonSessionStatus = "scheduled" | "prepared" | "completed" | "cancelled";

export interface LessonSession {
  id: string;

  teacherId: string;

  academicYearId: string;

  semesterId: string;

  gradeId: string;

  classId: string;

  curriculumLessonId: string;

  sessionDate: string;

  dayOfWeek: number;

  periodNumber: number;

  lessonLocked: boolean;

  status: LessonSessionStatus;

  preparedAt: string | null;

  completedAt: string | null;

  createdAt: string;

  updatedAt: string;
}
