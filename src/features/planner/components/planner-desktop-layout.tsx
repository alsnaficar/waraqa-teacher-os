import { PlannerToolbar } from "./planner-toolbar";
import { PlannerLegend } from "./planner-legend";
import { PlannerDesktopGrid } from "./planner-desktop-grid";
import { WeeklySummaryCard } from "./weekly-summary";
import { PublishModal } from "./publish-modal";
import { type DayKey, type Lesson } from "./types";
import type { LessonOverrideScope } from "@/features/planner/services/overrides";

interface PlannerDesktopLayoutProps {
  weekOffset: number;
  setWeekOffset: React.Dispatch<React.SetStateAction<number>>;
  weekStart: Date;
  weekEnd: Date;
  onComingSoon: (label: string) => void;
  onPublishClick: () => void;
  lessons: Lesson[];
  lessonAt: (day: DayKey, period: number) => Lesson | undefined;
  onChangeLesson: (lesson: Lesson, newTitle: string, scope: LessonOverrideScope) => void;
  publishOpen: boolean;
  setPublishOpen: (open: boolean) => void;
  publishTarget: string;
  setPublishTarget: (target: string) => void;
  onConfirmPublish: () => void;
}

export function PlannerDesktopLayout({
  weekOffset,
  setWeekOffset,
  weekStart,
  weekEnd,
  onComingSoon,
  onPublishClick,
  lessons,
  lessonAt,
  onChangeLesson,
  publishOpen,
  setPublishOpen,
  publishTarget,
  setPublishTarget,
  onConfirmPublish,
}: PlannerDesktopLayoutProps) {
  return (
    <div className="space-y-1 sm:space-y-1.5">
      <PlannerToolbar
        weekOffset={weekOffset}
        setWeekOffset={setWeekOffset}
        weekStart={weekStart}
        weekEnd={weekEnd}
        onComingSoon={onComingSoon}
        onPublishClick={onPublishClick}
      />

      <PlannerLegend />

      <PlannerDesktopGrid
        weekStart={weekStart}
        lessonAt={lessonAt}
        onChangeLesson={onChangeLesson}
      />

      <div className="grid gap-3">
        <WeeklySummaryCard lessons={lessons} />
      </div>

      <PublishModal
        open={publishOpen}
        onOpenChange={setPublishOpen}
        publishTarget={publishTarget}
        setPublishTarget={setPublishTarget}
        onConfirm={onConfirmPublish}
      />
    </div>
  );
}
