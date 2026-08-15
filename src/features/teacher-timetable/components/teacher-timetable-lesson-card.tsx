import { Pencil, Plus, Trash2 } from "lucide-react";

import { PERIOD_TIMES } from "@/features/planner/components/types";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/utils/utils";

import type { TeacherTimetableEntry } from "../types";
import {
  LessonActions,
  LessonSelector,
  PreparationStatusIcon,
} from "./teacher-timetable-lesson-controls";

function formatTime(value?: string) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleTimeString("ar-SA", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatPeriodTime(entry: TeacherTimetableEntry | undefined, period: number): string {
  const fallback = PERIOD_TIMES[period - 1] ?? "";

  if (!entry?.startsAt) {
    return fallback;
  }

  const start = formatTime(entry.startsAt);
  if (!start) {
    return fallback;
  }

  const end = entry.endsAt ? formatTime(entry.endsAt) : null;
  return end ? `${start}–${end}` : start;
}

/** Display grade/class without the redundant leading "الصف" label. */
function formatGradeClassLabel(entry: TeacherTimetableEntry): string {
  const raw = (entry.className || entry.grade || "").trim();
  return raw.replace(/^الصف\s+/u, "").trim();
}

export interface TeacherTimetableLessonCardProps {
  period: number;
  entry?: TeacherTimetableEntry;
  lessonSession?: {
    id: string;
    lessonLocked: boolean;
  };
  onAdd?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

export function TeacherTimetableLessonCard({
  period,
  entry,
  lessonSession,
  onAdd,
  onEdit,
  onDelete,
}: TeacherTimetableLessonCardProps) {
  const periodTime = formatPeriodTime(entry, period);
  const isEmpty = !entry;
  const gradeClass = entry ? formatGradeClassLabel(entry) : "";
  const isPrepared = Boolean(lessonSession?.lessonLocked);

  return (
    <article
      className={cn(
        "min-w-0 overflow-hidden rounded-xl border bg-card shadow-sm",
        isEmpty ? "border-dashed border-border/70 bg-muted/20" : "border-border/70",
      )}
      dir="rtl"
    >
      {/* السطر الأول: الحصة · المادة + حالة التحضير · الوقت */}
      <div className="flex min-w-0 items-center gap-2 border-b border-border/60 px-3 py-2">
        <span className="shrink-0 text-xs font-medium text-foreground">الحصة {period}</span>

        {!isEmpty ? (
          <span className="flex min-w-0 flex-1 items-center justify-center gap-1.5">
            <PreparationStatusIcon prepared={isPrepared} />
            <span className="min-w-0 truncate text-center text-xs font-semibold text-foreground">
              {entry.subject}
            </span>
          </span>
        ) : (
          <span className="min-w-0 flex-1" aria-hidden />
        )}

        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground" dir="ltr">
          {periodTime}
        </span>
      </div>

      {isEmpty ? (
        <div className="flex flex-col items-center gap-2 px-3 py-2.5">
          <p className="text-center text-sm text-muted-foreground">لا توجد حصة</p>
          {onAdd ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-11 w-full gap-1"
              onClick={onAdd}
            >
              <Plus className="h-4 w-4" />
              إضافة حصة
            </Button>
          ) : null}
        </div>
      ) : (
        <>
          {/* السطر الثاني: الصف/الفصل · قائمة الدرس */}
          <div className="flex min-w-0 items-center gap-2 px-3 py-2">
            {gradeClass ? (
              <span className="max-w-[40%] shrink-0 truncate text-xs text-muted-foreground">
                {gradeClass}
              </span>
            ) : null}

            {lessonSession ? (
              <LessonSelector
                lessonSessionId={lessonSession.id}
                lessonLocked={lessonSession.lessonLocked}
                hideLabel
                className="min-w-0 flex-1"
              />
            ) : null}
          </div>

          {onEdit || onDelete ? (
            <div className="flex flex-wrap gap-2 border-t border-border/50 px-3 py-2">
              {onEdit ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-11 flex-1 gap-1"
                  onClick={onEdit}
                >
                  <Pencil className="h-4 w-4" />
                  تعديل
                </Button>
              ) : null}
              {onDelete ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-11 flex-1 gap-1 text-destructive"
                  onClick={onDelete}
                >
                  <Trash2 className="h-4 w-4" />
                  حذف
                </Button>
              ) : null}
            </div>
          ) : null}

          {/* السطر الثالث: أيقونات الإضافات — صف واحد داخل حدود البطاقة */}
          {lessonSession ? (
            <div className="min-w-0 border-t border-border/50 px-1 pb-2 pt-1">
              <LessonActions
                lessonSessionId={lessonSession.id}
                className="mt-0 w-full min-w-0 flex-nowrap gap-0.5"
              />
            </div>
          ) : null}
        </>
      )}
    </article>
  );
}
