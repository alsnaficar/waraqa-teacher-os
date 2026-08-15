import { Link } from "@tanstack/react-router";
import { BarChart3, Loader2 } from "lucide-react";

import {
  REPORTS_HUB_HOMEWORK_TITLE,
  REPORTS_HUB_LESSONS_TITLE,
  REPORTS_HUB_SECTION_TITLE,
  REPORTS_HUB_TESTS_TITLE,
  REPORTS_HUB_VIEW_ALL_CTA,
  compactHomeworkMetrics,
  compactLessonMetrics,
  compactTestMetrics,
  isHomeworkHubEmpty,
  isLessonHubEmpty,
  isTestHubEmpty,
  type CompactReportMetric,
  type HubDomainResult,
  type ReportsHubSnapshot,
} from "@/features/reports/services/reports-hub.logic";
import type { HomeworkPeriodReport } from "@/features/homework/services/homework-reports.service";
import type { TestPeriodReport } from "@/features/tests/services/test-reports.service";
import type { LessonSessionReportView } from "@/features/reports/services/enrich-report-with-lesson-titles";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";

export function DashboardReports({
  snapshot,
  loading,
  error,
  onRetry,
}: {
  snapshot: ReportsHubSnapshot | undefined;
  loading?: boolean;
  error?: Error | null;
  onRetry?: () => void;
}) {
  return (
    <Card>
      <CardContent className="space-y-4 p-4" dir="rtl">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
              <BarChart3 className="h-5 w-5" />
            </div>
            <h2 className="font-bold">{REPORTS_HUB_SECTION_TITLE}</h2>
          </div>
          <Button asChild variant="default" size="sm" className="min-h-11">
            <Link to="/reports">{REPORTS_HUB_VIEW_ALL_CTA}</Link>
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            جاري تحميل التقارير…
          </div>
        ) : error ? (
          <div className="space-y-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <p className="font-medium text-destructive">تعذر تحميل ملخص التقارير</p>
            <p className="text-muted-foreground">{error.message}</p>
            {onRetry ? (
              <Button type="button" className="min-h-11" onClick={onRetry}>
                إعادة المحاولة
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <DomainSummaryCard
              title={REPORTS_HUB_LESSONS_TITLE}
              domain={snapshot?.lessons}
              metricsOf={(data) => compactLessonMetrics(data.stats)}
              isEmpty={isLessonHubEmpty}
            />
            <DomainSummaryCard
              title={REPORTS_HUB_HOMEWORK_TITLE}
              domain={snapshot?.homework}
              metricsOf={(data) => compactHomeworkMetrics(data.summary)}
              isEmpty={isHomeworkHubEmpty}
            />
            <DomainSummaryCard
              title={REPORTS_HUB_TESTS_TITLE}
              domain={snapshot?.tests}
              metricsOf={(data) => compactTestMetrics(data.summary)}
              isEmpty={isTestHubEmpty}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DomainSummaryCard<T>({
  title,
  domain,
  metricsOf,
  isEmpty,
}: {
  title: string;
  domain: HubDomainResult<T> | undefined;
  metricsOf: (data: T) => CompactReportMetric[];
  isEmpty: (data: T) => boolean;
}) {
  return (
    <div className="min-w-0 rounded-xl border bg-muted/20 p-3">
      <p className="text-sm font-semibold">{title}</p>
      {!domain ? (
        <p className="mt-2 text-xs text-muted-foreground">لا توجد بيانات</p>
      ) : domain.status === "error" ? (
        <p className="mt-2 text-xs text-destructive">{domain.message}</p>
      ) : isEmpty(domain.data) ? (
        <p className="mt-2 text-xs text-muted-foreground">لا توجد بيانات في هذه الفترة</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {metricsOf(domain.data).map((metric) => (
            <li
              key={metric.label}
              className="flex min-h-[28px] items-center justify-between gap-2 text-xs"
            >
              <span className="truncate text-muted-foreground">{metric.label}</span>
              <span className="font-semibold tabular-nums">{metric.value}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Type anchors so the dashboard card stays summary-only for the three domains. */
export type DashboardReportsLessonDomain = HubDomainResult<LessonSessionReportView>;
export type DashboardReportsHomeworkDomain = HubDomainResult<HomeworkPeriodReport>;
export type DashboardReportsTestsDomain = HubDomainResult<TestPeriodReport>;
