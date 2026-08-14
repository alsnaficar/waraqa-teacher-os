export interface MadrasatiTeacherProfile {
  teacherName: string;
  schoolName: string;
  schoolId: string;

  academicYear: string;
  semester: string;

  subjects: string[];

  grades: string[];

  classes: string[];
}

export interface MadrasatiTimetableLesson {
  dayOfWeek: number;
  period: number;

  subject: string;

  grade: string;

  className: string;

  classroom?: string;

  startsAt?: string;

  endsAt?: string;
}
