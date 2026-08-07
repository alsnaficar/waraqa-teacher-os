import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { LessonSessionService, todayIso } from "../services/lesson-session.service";
import type { LessonSessionGenerationResult } from "../types";

export const lessonSessionsQueryKey = (date: string) => ["lesson-sessions", date] as const;

/**
 * Loads the lesson sessions for a date and exposes the preparation lifecycle.
 *
 * Sessions are created on demand the first time a date is opened, so a teacher
 * never has to trigger generation manually for a normal school day.
 */
export function useLessonSessions(date: string = todayIso()) {
  const queryClient = useQueryClient();

  const query = useQuery<LessonSessionGenerationResult>({
    queryKey: lessonSessionsQueryKey(date),
    staleTime: 30_000,
    queryFn: () => LessonSessionService.ensureSessionsForDate(date),
  });

  const invalidate = useCallback(() => {
    return queryClient.invalidateQueries({ queryKey: lessonSessionsQueryKey(date) });
  }, [queryClient, date]);

  const regenerate = useMutation({
    mutationFn: () => LessonSessionService.generateSessionsForDate(date),
    onSuccess: invalidate,
  });

  const prepare = useMutation({
    mutationFn: (id: string) => LessonSessionService.prepareSession(id),
    onSuccess: invalidate,
  });

  const resetPreparation = useMutation({
    mutationFn: (id: string) => LessonSessionService.resetPreparation(id),
    onSuccess: invalidate,
  });

  const complete = useMutation({
    mutationFn: (id: string) => LessonSessionService.completeSession(id),
    onSuccess: invalidate,
  });

  return {
    date,
    sessions: query.data?.sessions ?? [],
    skipped: query.data?.skipped ?? null,
    loading: query.isPending,
    error: query.error,
    refresh: invalidate,
    regenerate,
    prepare,
    resetPreparation,
    complete,
  };
}
