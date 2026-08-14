export type DeliveryMode = "classroom" | "remote";

export interface Teacher {
  id: string;
  name: string;
  school: string;
  principal: string;
}

export interface Lesson {
  id: string;
  subject: string;
  grade: string;
  title: string;
  day: number;
  period: number;
  deliveryMode: DeliveryMode;
  teamsMeetingUrl?: string;
}

export interface LessonOptions {
  worksheet: boolean;
  quiz: boolean;
  activity: boolean;
}

export interface LessonPreparation {
  lesson: Lesson;
  prepared: boolean;
  options: LessonOptions;
}
