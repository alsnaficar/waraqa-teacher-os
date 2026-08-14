import { useQuery } from "@tanstack/react-query";

import { enrichReportWithLessonTitles } from "../services/enrich-report-with-lesson-titles";
import {
  ReportsService,
  type ReportsDateFilter,
} from "../services/reports.service";

export function lessonSessionReportQueryKey(filter: ReportsDateFilter) {
  if (filter.kind === "custom") {
    return ["reports", "lesson-sessions", filter.kind, filter.from, filter.to] as const;
  }
  return ["reports", "lesson-sessions", filter.kind, filter.today ?? "live"] as const;
}

/**
 * Loads the teacher lesson-session report for the selected filter.
 * Ownership stays inside ReportsService via resolveUserContext — no teacher_id arg.
 */
export function useLessonSessionReport(filter: ReportsDateFilter | null) {
  return useQuery({
    queryKey: filter ? lessonSessionReportQueryKey(filter) : ["reports", "lesson-sessions", "idle"],
    enabled: Boolean(filter),
    staleTime: 30_000,
    queryFn: async () => {
      if (!filter) {
        throw new Error("مفتاح التصفية مفقود.");
      }
      const report = await ReportsService.getLessonSessionReport(filter);
      return enrichReportWithLessonTitles(report);
    },
  });
}
