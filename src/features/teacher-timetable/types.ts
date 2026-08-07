export interface TeacherTimetableEntry {
  id: string;
  teacherId: string;

  dayOfWeek: number;
  period: number;

  subject: string;

  grade: string;
  className: string;

  classroom?: string;

  startsAt?: string;
  endsAt?: string;

  active: boolean;

  createdAt?: string;
  updatedAt?: string;
}
