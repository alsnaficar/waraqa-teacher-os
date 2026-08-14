export type AcademicTerm = "first" | "second" | "third";

export type CalendarEventType =
  | "school-start"
  | "school-end"
  | "holiday"
  | "long-weekend"
  | "exam"
  | "vacation"
  | "teacher-day"
  | "national-day"
  | "custom";

export interface AcademicYear {
  id: string;

  name: string;

  startsAt: string;

  endsAt: string;

  active: boolean;
}

export interface AcademicSemester {
  id: string;

  yearId: string;

  term: AcademicTerm;

  startsAt: string;

  endsAt: string;
}

export interface CalendarEvent {
  id: string;

  title: string;

  type: CalendarEventType;

  startsAt: string;

  endsAt: string;

  allDay: boolean;

  notes?: string;
}
