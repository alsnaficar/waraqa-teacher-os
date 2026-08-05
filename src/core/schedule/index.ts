import type { DeliveryMode } from "../models";

export interface LessonSlot {
  id: string;
  day: number;
  period: number;
  subject: string;
  grade: string;
  lessonTitle: string;
  deliveryMode: DeliveryMode;
  teamsMeetingUrl?: string;
  prepared: boolean;
  worksheet: boolean;
  quiz: boolean;
  activity: boolean;
}

export class ScheduleEngine {
  private readonly lessons: LessonSlot[] = [];

  all(): LessonSlot[] {
    return this.lessons;
  }

  add(lesson: LessonSlot) {
    this.lessons.push(lesson);
  }

  update(id: string, lesson: Partial<LessonSlot>) {
    const current = this.lessons.find((l) => l.id === id);
    if (!current) return;
    Object.assign(current, lesson);
  }
}
