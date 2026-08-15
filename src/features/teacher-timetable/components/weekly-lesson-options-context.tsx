import { createContext, useContext, useMemo, type ReactNode } from "react";

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import type { LessonOptionsForSession } from "@/features/lesson-sessions/services/lesson-options";
import { getLessonOptionsBatch } from "@/platform/lesson-sessions/get-lesson-options.functions";

export const PLANNER_WEEKLY_LESSON_OPTIONS_QUERY_KEY = "planner-weekly-lesson-options" as const;

type WeeklyLessonOptionsContextValue = {
  optionsBySessionId: Record<string, LessonOptionsForSession>;
  isPending: boolean;
  isError: boolean;
};

const WeeklyLessonOptionsContext = createContext<WeeklyLessonOptionsContextValue | null>(null);

export function weeklyLessonOptionsQueryKey(lessonSessionIds: readonly string[]): string[] {
  return [PLANNER_WEEKLY_LESSON_OPTIONS_QUERY_KEY, ...lessonSessionIds];
}

export function WeeklyLessonOptionsProvider({
  lessonSessionIds,
  children,
}: {
  lessonSessionIds: readonly string[];
  children: ReactNode;
}) {
  const getBatch = useServerFn(getLessonOptionsBatch);
  const idsKey = [...new Set(lessonSessionIds.filter(Boolean))].sort().join(",");
  const sortedIds = useMemo(() => (idsKey ? idsKey.split(",") : []), [idsKey]);

  const query = useQuery({
    queryKey: weeklyLessonOptionsQueryKey(sortedIds),
    queryFn: () => getBatch({ data: { lessonSessionIds: sortedIds } }),
    staleTime: 30_000,
    enabled: sortedIds.length > 0,
  });

  const value = useMemo<WeeklyLessonOptionsContextValue>(
    () => ({
      optionsBySessionId: query.data ?? {},
      isPending: sortedIds.length > 0 && query.isPending,
      isError: query.isError,
    }),
    [query.data, query.isError, query.isPending, sortedIds.length],
  );

  return (
    <WeeklyLessonOptionsContext.Provider value={value}>
      {children}
    </WeeklyLessonOptionsContext.Provider>
  );
}

export function useWeeklyLessonOptions(): WeeklyLessonOptionsContextValue | null {
  return useContext(WeeklyLessonOptionsContext);
}
