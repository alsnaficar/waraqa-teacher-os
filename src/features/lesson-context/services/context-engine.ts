import { getCurrentLesson } from "@/features/lesson-engine/services/lesson-engine";

export interface LessonContext {
  lessonId: string | null;
  title: string;
  subject: string;
  grade: string;
  className: string;
  unit: string;
  suggestedDate: string;
  period: number;
}

export async function getLessonContext(): Promise<LessonContext | null> {
  const lesson = await getCurrentLesson();

  if (!lesson) {
    return null;
  }

  return {
    lessonId: lesson.lessonId,
    title: lesson.lessonTitle,
    subject: lesson.subject,
    grade: lesson.className,
    className: lesson.className,
    unit: lesson.unit,
    suggestedDate: lesson.suggestedDate,
    period: lesson.period,
  };
}

