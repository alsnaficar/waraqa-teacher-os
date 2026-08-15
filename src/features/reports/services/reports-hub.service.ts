import { HomeworkReportsService } from "@/features/homework/services/homework-reports.service";
import { TestReportsService } from "@/features/tests/services/test-reports.service";
import { resolveUserContext, type SupabaseUserContext } from "@/platform/database/supabase/context";

import { enrichReportWithLessonTitles } from "./enrich-report-with-lesson-titles";
import {
  buildReportsHubSnapshot,
  type ReportsHubSnapshot,
} from "./reports-hub.logic";
import {
  ReportsService,
  resolveReportsDateRange,
  type ReportsDateFilter,
} from "./reports.service";

/**
 * TASK 25.8 — Unified teacher reports hub snapshot.
 * Composes existing period report services. Ownership stays inside each service.
 * Independent domain failures via Promise.allSettled — no invented zeros on error.
 */
export class ReportsHubService {
  static async getSnapshot(
    filter: ReportsDateFilter,
    context?: SupabaseUserContext,
  ): Promise<ReportsHubSnapshot> {
    const range = resolveReportsDateRange(filter);
    // Resolve once so callers can pass a shared context; ownership still enforced per service.
    const resolved = (await resolveUserContext(context)) ?? undefined;

    const [lessons, homework, tests] = await Promise.allSettled([
      loadLessonReport(filter, resolved),
      HomeworkReportsService.getPeriodReport(filter, resolved),
      TestReportsService.getPeriodReport(filter, resolved),
    ]);

    return buildReportsHubSnapshot({ range, lessons, homework, tests });
  }
}

async function loadLessonReport(
  filter: ReportsDateFilter,
  context?: SupabaseUserContext,
) {
  const report = await ReportsService.getLessonSessionReport(filter, context);
  return enrichReportWithLessonTitles(report, context);
}
