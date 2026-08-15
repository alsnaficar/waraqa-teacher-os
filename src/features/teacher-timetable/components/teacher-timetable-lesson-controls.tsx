import { useEffect, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  BookOpen,
  CheckCircle2,
  FileCheck2,
  FlaskConical,
  Globe,
  Lightbulb,
  PlaySquare,
  Trash2,
} from "lucide-react";

import { changeLesson } from "@/platform/lesson-sessions/change-lesson.functions";
import { getLessonOptions } from "@/platform/lesson-sessions/get-lesson-options.functions";
import { cn } from "@/shared/utils/utils";

import {
  PLANNER_WEEKLY_LESSON_OPTIONS_QUERY_KEY,
  useWeeklyLessonOptions,
} from "./weekly-lesson-options-context";

/** Strip a leading "درس" prefix from curriculum titles for display only. */
function formatLessonOptionTitle(title: string) {
  return title.replace(/^درس\s+/u, "").trim() || title;
}

/** Preparation status icon — green when lessonLocked, muted otherwise. */
export function PreparationStatusIcon({
  prepared,
  className,
}: {
  prepared: boolean;
  className?: string;
}) {
  return (
    <CheckCircle2
      className={cn(
        "h-3.5 w-3.5 shrink-0",
        prepared ? "text-emerald-600" : "text-muted-foreground",
        className,
      )}
      aria-hidden
    />
  );
}

export function LessonSelector({
  lessonSessionId,
  lessonLocked,
  compact = false,
  hideLabel = false,
  className,
}: {
  lessonSessionId: string;
  lessonLocked: boolean;
  compact?: boolean;
  hideLabel?: boolean;
  className?: string;
}) {
  const getOptions = useServerFn(getLessonOptions);
  const change = useServerFn(changeLesson);
  const queryClient = useQueryClient();
  const weeklyOptions = useWeeklyLessonOptions();
  const useWeeklyBatch = weeklyOptions != null;

  const [selectedLessonId, setSelectedLessonId] = useState("");

  const optionsQuery = useQuery({
    queryKey: ["lesson-options", lessonSessionId],
    queryFn: () => getOptions({ data: { lessonSessionId } }),
    staleTime: 30_000,
    enabled: !useWeeklyBatch,
  });

  const batchedOptions = weeklyOptions?.optionsBySessionId[lessonSessionId];
  const optionsData = useWeeklyBatch ? batchedOptions : optionsQuery.data;
  const optionsLoading = useWeeklyBatch ? Boolean(weeklyOptions?.isPending) : optionsQuery.isLoading;
  const optionsError = useWeeklyBatch
    ? Boolean(weeklyOptions?.isError) || (!weeklyOptions?.isPending && batchedOptions == null)
    : optionsQuery.isError;

  useEffect(() => {
    if (optionsData?.selectedLessonId) {
      setSelectedLessonId(optionsData.selectedLessonId);
    }
  }, [optionsData?.selectedLessonId]);

  const changeMutation = useMutation({
    mutationFn: (curriculumLessonId: string) =>
      change({
        data: {
          lessonSessionId,
          curriculumLessonId,
        },
      }),
    onSuccess: (session) => {
      setSelectedLessonId(session.curriculumLessonId ?? "");

      void queryClient.invalidateQueries({
        queryKey: ["lesson-sessions"],
      });

      void queryClient.invalidateQueries({
        queryKey: ["lesson-options", lessonSessionId],
      });
      void queryClient.invalidateQueries({
        queryKey: [PLANNER_WEEKLY_LESSON_OPTIONS_QUERY_KEY],
      });
    },
    onError: (error) => {
      console.error("Failed to change lesson:", error);
      setSelectedLessonId(optionsData?.selectedLessonId ?? "");
    },
  });

  const lessons = optionsData?.lessons ?? [];

  if (optionsLoading) {
    return (
      <div
        className={cn(
          "min-w-0 truncate text-muted-foreground",
          compact ? "mt-1 text-center text-[10px]" : "text-sm",
          className,
        )}
        dir="rtl"
      >
        جاري التحديد...
      </div>
    );
  }

  if (optionsError) {
    return (
      <div
        className={cn(
          "min-w-0 truncate text-muted-foreground",
          compact ? "mt-1 text-center text-[10px]" : "text-sm",
          className,
        )}
        dir="rtl"
        title="تعذر تحميل خيارات المنهج"
      >
        —
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex w-full min-w-0 max-w-full items-center gap-0.5 overflow-hidden",
        compact ? "mt-1" : hideLabel ? "" : "mt-2",
        className,
      )}
      dir="rtl"
    >
      <select
        value={selectedLessonId}
        disabled={lessonLocked || changeMutation.isPending || lessons.length === 0}
        onChange={(event) => {
          const value = event.target.value;

          if (!value || value === selectedLessonId) {
            return;
          }

          changeMutation.mutate(value);
        }}
        className={cn(
          "box-border min-w-0 w-full max-w-full flex-1 truncate rounded border bg-background font-medium outline-none",
          compact
            ? "px-1 py-0.5 text-[10px]"
            : hideLabel
              ? "min-h-11 px-2.5 py-1.5 text-xs sm:text-sm"
              : "min-h-11 px-2 py-2 text-sm",
          lessonLocked
            ? "cursor-not-allowed border-transparent bg-muted/50 text-muted-foreground/60"
            : hideLabel || compact
              ? "border-border text-foreground hover:border-emerald-400 focus:border-emerald-500"
              : "border-border text-foreground hover:border-emerald-400 focus:border-emerald-500",
        )}
        title={lessonLocked ? "مقفل بعد إعداد التحضير" : undefined}
      >
        {lessons.length === 0 ? (
          <option value="">—</option>
        ) : (
          <>
            <option value="" disabled>
              اختر…
            </option>

            {lessons.map((lesson) => (
              <option key={lesson.id} value={lesson.id}>
                {formatLessonOptionTitle(lesson.title)}
              </option>
            ))}
          </>
        )}
      </select>

      {lessonLocked && (
        <span
          className={cn("shrink-0 text-muted-foreground/50", compact ? "text-[10px]" : "text-sm")}
          title="مقفل بعد إعداد التحضير"
          aria-label="مقفل"
        >
          🔒
        </span>
      )}
    </div>
  );
}

export function LessonActions({
  lessonSessionId,
  compact = false,
  className,
}: {
  lessonSessionId?: string;
  compact?: boolean;
  className?: string;
}) {
  const iconClass = compact ? "h-3.5 w-3.5 shrink-0" : "h-4 w-4 shrink-0";
  // Mobile/tablet cards: equal flex slots so 7 actions fit one row without clipping.
  // Desktop compact: tight centered cluster that fits narrow day cells (~140px content).
  const buttonClass = compact
    ? "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm"
    : "inline-flex h-11 min-h-[44px] min-w-0 flex-1 basis-0 items-center justify-center rounded-lg border border-border/60 bg-background";

  return (
    <div
      className={cn(
        "flex min-w-0 items-center",
        compact
          ? "mx-auto mt-2 w-fit max-w-full flex-nowrap justify-center gap-0.5"
          : "mt-3 w-full flex-nowrap justify-between gap-0.5",
        className,
      )}
      dir="rtl"
    >
      {lessonSessionId ? (
        <Link
          to="/ai-lesson-plan"
          search={{ lessonSessionId } as never}
          aria-label="تحضير الدرس"
          className={cn(buttonClass, "hover:bg-emerald-50")}
        >
          <BookOpen className={`${iconClass} text-emerald-600`} />
        </Link>
      ) : (
        <span className={buttonClass} aria-label="تحضير الدرس">
          <BookOpen className={`${iconClass} text-muted-foreground/40`} />
        </span>
      )}

      <span className={buttonClass} aria-label="واجب">
        <FileCheck2 className={`${iconClass} text-cyan-600`} />
      </span>

      <span className={buttonClass} aria-label="اختبار">
        <FlaskConical className={`${iconClass} text-purple-500`} />
      </span>

      <span className={buttonClass} aria-label="النشاط">
        <Lightbulb className={`${iconClass} text-orange-500`} />
      </span>

      <span className={buttonClass} aria-label="إثراء">
        <Globe className={`${iconClass} text-blue-500`} />
      </span>

      <span className={buttonClass} aria-label="الوسائل">
        <PlaySquare className={`${iconClass} text-indigo-500`} />
      </span>

      <span className={buttonClass} aria-label="حذف">
        <Trash2 className={`${iconClass} text-red-500`} />
      </span>
    </div>
  );
}
