import { TodayLessonCard, type TodayLessonCardProps } from "./today-lesson-card";

interface Props {
  lessons: Array<TodayLessonCardProps["entry"]>;
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
