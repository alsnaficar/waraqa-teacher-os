import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback } from "react";

import { prepareLessonSession } from "@/platform/lesson-sessions/prepare-lesson-session.functions";
import { LessonSessionService, todayIso } from "../services/lesson-session.service";
import type { LessonSessionGenerationResult } from "../types";

export const lessonSessionsQueryKey = (date: string) => ["lesson-sessions", date] as const;

/**
 * Loads the lesson sessions for a date and exposes the preparation lifecycle.
 *
 * Sessions are created on demand the first time a date is opened, so a teacher
 * never has to trigger generation manually for a normal school day.
 * Prepare is server-orchestrated (P3 Step 4): generate lesson_plan then mark prepared.
 */
export function useLessonSessions(date: string = todayIso()) {
  const queryClient = useQueryClient();
  const prepareFn = useServerFn(prepareLessonSession);

  const query = useQuery<LessonSessionGenerationResult>({
    queryKey: lessonSessionsQueryKey(date),
    staleTime: 30_000,
    queryFn: () => LessonSessionService.ensureSessionsForDate(date),
  });

  const invalidate = useCallback(() => {
    return queryClient.invalidateQueries({ queryKey: lessonSessionsQueryKey(date) });
  }, [queryClient, date]);

  /** After reset: refresh all session dates (dashboard today) + reports status aggregates. */
  const invalidateAfterReset = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["lesson-sessions"] }),
      queryClient.invalidateQueries({ queryKey: ["reports", "lesson-sessions"] }),
    ]);
  }, [queryClient]);

  const regenerate = useMutation({
    mutationFn: () => LessonSessionService.generateSessionsForDate(date),
    onSuccess: invalidate,
  });

  const prepare = useMutation({
    mutationFn: (id: string) => prepareFn({ data: { lessonSessionId: id } }),
    onSuccess: invalidate,
  });

  const resetPreparation = useMutation({
    mutationFn: (id: string) => LessonSessionService.resetPreparation(id),
    onSuccess: invalidateAfterReset,
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
