import { TodayLessonCard } from "./today-lesson-card";

interface Props {
  lessons: any[];
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

