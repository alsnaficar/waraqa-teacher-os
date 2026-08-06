import { TodayLessonCard } from "./today-lesson-card";

import type { CalculatedLessonEntry } from "@/features/planner/services/planner-engine";

interface Props {
  lessons: CalculatedLessonEntry[];
}

export function TodayLessonsSection({ lessons }: Props) {
  return (
    <div className="space-y-2">
      {lessons.map((lesson) => (
        <TodayLessonCard key={lesson.id} entry={lesson} />
      ))}
    </div>
  );
}
