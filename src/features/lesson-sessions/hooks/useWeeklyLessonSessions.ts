import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useMemo } from "react";

import { prepareLessonSession } from "@/platform/lesson-sessions/prepare-lesson-session.functions";
import { lessonSessionsQueryKey } from "./useLessonSessions";
import { LessonSessionService } from "../services/lesson-session.service";
import { schoolWeekDatesFromSunday } from "../services/weekly-preparation.logic";
import type { LessonSessionGenerationResult, LessonSessionSkipReason, LessonSessionView } from "../types";

export type WeeklyLessonDayState = {
  date: string;
  sessions: LessonSessionView[];
  skipped: LessonSessionSkipReason | null;
  loading: boolean;
  error: Error | null;
};

/**
 * Loads Sun–Thu lesson sessions via the existing per-date query keys.
 * Mutations reuse the same service/server functions as the daily hook.
 */
export function useWeeklyLessonSessions(weekStartIso: string) {
  const queryClient = useQueryClient();
  const prepareFn = useServerFn(prepareLessonSession);

  const dates = useMemo(() => schoolWeekDatesFromSunday(weekStartIso), [weekStartIso]);

  const queries = useQueries({
    queries: dates.map((date) => ({
      queryKey: lessonSessionsQueryKey(date),
      staleTime: 30_000,
      queryFn: (): Promise<LessonSessionGenerationResult> =>
        LessonSessionService.ensureSessionsForDate(date),
    })),
  });

  const days: WeeklyLessonDayState[] = dates.map((date, index) => {
    const query = queries[index];
    return {
      date,
      sessions: query?.data?.sessions ?? [],
      skipped: query?.data?.skipped ?? null,
      loading: query?.isPending ?? true,
      error: (query?.error as Error | null) ?? null,
    };
  });

  const isLoading = queries.some((query) => query.isPending);
  const isFetching = queries.some((query) => query.isFetching);

  const refreshWeek = useCallback(() => {
    return Promise.all(
      dates.map((date) =>
        queryClient.invalidateQueries({ queryKey: lessonSessionsQueryKey(date) }),
      ),
    );
  }, [dates, queryClient]);

  const invalidateAfterReset = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["lesson-sessions"] }),
      queryClient.invalidateQueries({ queryKey: ["reports", "lesson-sessions"] }),
    ]);
  }, [queryClient]);

  const prepare = useMutation({
    mutationFn: (id: string) => prepareFn({ data: { lessonSessionId: id } }),
    onSuccess: refreshWeek,
  });

  const resetPreparation = useMutation({
    mutationFn: (id: string) => LessonSessionService.resetPreparation(id),
    onSuccess: invalidateAfterReset,
  });

  const complete = useMutation({
    mutationFn: (id: string) => LessonSessionService.completeSession(id),
    onSuccess: refreshWeek,
  });

  // Match daily hook: disable actions only while a mutation is in flight,
  // not during background refetch (avoids locking the whole week UI).
  const busy =
    prepare.isPending || resetPreparation.isPending || complete.isPending;

  return {
    weekStartIso,
    dates,
    days,
    isLoading,
    isFetching,
    prepare,
    resetPreparation,
    complete,
    refreshWeek,
    busy,
  };
}
