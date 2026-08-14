import {
  generateSchedule,
  type CalculatedLessonEntry,
} from "@/features/planner/services/planner-engine";

export async function getTodayLessons(): Promise<CalculatedLessonEntry[]> {
  const schedule = await generateSchedule();

  const today = new Date().toISOString().slice(0, 10);

  return schedule.filter((lesson) => lesson.suggestedDate === today);
}

export async function getCurrentLesson(): Promise<CalculatedLessonEntry | null> {
  const lessons = await getTodayLessons();

  return lessons.length ? lessons[0] : null;
}

export async function getNextLesson(): Promise<CalculatedLessonEntry | null> {
  const schedule = await generateSchedule();

  const today = new Date().toISOString().slice(0, 10);

  return schedule.find((lesson) => lesson.suggestedDate > today) ?? null;
}
