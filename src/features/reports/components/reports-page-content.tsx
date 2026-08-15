import { Link } from "@tanstack/react-router";
import { BarChart3, CalendarRange, Lock, Printer, Unlock } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/shared/components/empty-state";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Skeleton } from "@/shared/ui/skeleton";
import { cn } from "@/shared/utils/utils";

import { ReportsHubPrintDocument } from "./reports-hub-print";
import { useReportsHub } from "../hooks/useReportsHub";
import type { ReportSessionWithTitle } from "../services/enrich-report-with-lesson-titles";
import type { ReportsDateFilter } from "../services/reports.service";
import {
  compactHomeworkMetrics,
  compactLessonMetrics,
  compactTestMetrics,
  isHomeworkHubEmpty,
  isLessonHubEmpty,
  isTestHubEmpty,
  REPORTS_HUB_DEFAULT_FILTER,
  REPORTS_HUB_HOMEWORK_CTA,
  REPORTS_HUB_HOMEWORK_TITLE,
  REPORTS_HUB_LESSONS_TITLE,
  REPORTS_HUB_TESTS_CTA,
  REPORTS_HUB_TESTS_TITLE,
  type CompactReportMetric,
  type HubDomainResult,
  type ReportsHubSnapshot,
} from "../services/reports-hub.logic";
import {
  buildReportsHubPrintView,
  REPORTS_HUB_PRINT_BUTTON_LABEL,
} from "../services/reports-hub-print.logic";
import {
  buildReportSummaryItems,
  buildReportsDateFilter,
  REPORT_STATUS_LABELS,
  REPORTS_EMPTY_DESCRIPTION,
  REPORTS_EMPTY_TITLE,
  REPORTS_ERROR_DESCRIPTION,
  REPORTS_ERROR_TITLE,
  REPORTS_FILTER_OPTIONS,
  reportLockLabel,
  type ReportsFilterKind,
} from "../services/reports-ui.logic";

function formatDisplayDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("ar-SA", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date(`${iso}T00:00:00Z`));
  } catch {
    return iso;
  }
}

export function ReportsPageContent() {
  const [kind, setKind] = useState<ReportsFilterKind>(
    REPORTS_HUB_DEFAULT_FILTER.kind === "custom" ? "custom" : REPORTS_HUB_DEFAULT_FILTER.kind,
  );
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [appliedFilter, setAppliedFilter] = useState<ReportsDateFilter>(REPORTS_HUB_DEFAULT_FILTER);

  const query = useReportsHub(appliedFilter);
  const snapshot = query.data;
  const [printStamp, setPrintStamp] = useState(() => new Date());

  const printView = useMemo(
    () => (snapshot ? buildReportsHubPrintView(snapshot, printStamp) : null),
    [snapshot, printStamp],
  );

  function handlePrint() {
    if (!snapshot) {
      toast.error("لا يوجد تقرير جاهز للطباعة.");
      return;
    }
    setPrintStamp(new Date());
    window.setTimeout(() => window.print(), 250);
  }

  function applyPreset(nextKind: ReportsFilterKind) {
    setKind(nextKind);
    if (nextKind === "custom") return;

    try {
      setAppliedFilter(buildReportsDateFilter(nextKind));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تطبيق التصفية.");
    }
  }

  function applyCustomRange() {
    try {
      const filter = buildReportsDateFilter("custom", { from: customFrom, to: customTo });
      setKind("custom");
      setAppliedFilter(filter);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تطبيق الفترة المخصصة.");
    }
  }

  const rangeLabel = snapshot
    ? `${formatDisplayDate(snapshot.range.from)} — ${formatDisplayDate(snapshot.range.to)}`
    : null;

  return (
    <div className="min-w-0 space-y-4" dir="rtl">
      <Card>
        <CardContent className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/15 text-primary">
                <BarChart3 className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl font-bold">التقارير</h1>
                <p className="mt-1 text-xs text-muted-foreground">
                  ملخص موحّد لحصصك وواجباتك واختباراتك حسب الفترة.
                </p>
                {rangeLabel ? (
                  <p className="mt-1 text-[11px] text-muted-foreground">{rangeLabel}</p>
                ) : null}
              </div>
            </div>
            <Button
              type="button"
              className="min-h-11 gap-2"
              disabled={!snapshot || query.isPending || query.isError}
              onClick={handlePrint}
            >
              <Printer className="h-4 w-4" />
              {REPORTS_HUB_PRINT_BUTTON_LABEL}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">الفترة</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {REPORTS_FILTER_OPTIONS.map((option) => (
              <Button
                key={option.kind}
                type="button"
                variant={kind === option.kind ? "default" : "outline"}
                className="min-h-11 flex-1 basis-[calc(50%-0.25rem)] sm:flex-none sm:basis-auto"
                onClick={() => applyPreset(option.kind)}
              >
                {option.label}
              </Button>
            ))}
          </div>

          {kind === "custom" ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto]">
              <div className="space-y-1.5">
                <Label htmlFor="reports-from">من</Label>
                <Input
                  id="reports-from"
                  type="date"
                  className="min-h-11"
                  value={customFrom}
                  onChange={(event) => setCustomFrom(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reports-to">إلى</Label>
                <Input
                  id="reports-to"
                  type="date"
                  className="min-h-11"
                  value={customTo}
                  onChange={(event) => setCustomTo(event.target.value)}
                />
              </div>
              <div className="flex items-end">
                <Button type="button" className="min-h-11 w-full sm:w-auto" onClick={applyCustomRange}>
                  تطبيق
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {query.isPending ? (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className="h-36 w-full rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      ) : query.isError ? (
        <EmptyState
          icon={BarChart3}
          title={REPORTS_ERROR_TITLE}
          description={
            query.error instanceof Error ? query.error.message : REPORTS_ERROR_DESCRIPTION
          }
          action={
            <Button className="min-h-11" onClick={() => void query.refetch()}>
              إعادة المحاولة
            </Button>
          }
        />
      ) : snapshot ? (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <HubDomainCard
              title={REPORTS_HUB_LESSONS_TITLE}
              domain={snapshot.lessons}
              metricsOf={(data) => compactLessonMetrics(data.stats)}
              isEmpty={isLessonHubEmpty}
            />
            <HubDomainCard
              title={REPORTS_HUB_HOMEWORK_TITLE}
              domain={snapshot.homework}
              metricsOf={(data) => compactHomeworkMetrics(data.summary)}
              isEmpty={isHomeworkHubEmpty}
              action={
                <Button asChild variant="outline" size="sm" className="min-h-11 w-full">
                  <Link to="/homework">{REPORTS_HUB_HOMEWORK_CTA}</Link>
                </Button>
              }
            />
            <HubDomainCard
              title={REPORTS_HUB_TESTS_TITLE}
              domain={snapshot.tests}
              metricsOf={(data) => compactTestMetrics(data.summary)}
              isEmpty={isTestHubEmpty}
              action={
                <Button asChild variant="outline" size="sm" className="min-h-11 w-full">
                  <Link to="/tests">{REPORTS_HUB_TESTS_CTA}</Link>
                </Button>
              }
            />
          </div>

          <LessonSessionsHubSection snapshot={snapshot} onRetry={() => void query.refetch()} />
        </>
      ) : null}

      <ReportsHubPrintDocument view={printView} />
    </div>
  );
}

function HubDomainCard<T>({
  title,
  domain,
  metricsOf,
  isEmpty,
  action,
}: {
  title: string;
  domain: HubDomainResult<T>;
  metricsOf: (data: T) => CompactReportMetric[];
  isEmpty: (data: T) => boolean;
  action?: ReactNode;
}) {
  return (
    <Card className="min-w-0">
      <CardContent className="space-y-3 p-4">
        <p className="text-sm font-semibold">{title}</p>
        {domain.status === "error" ? (
          <p className="text-xs text-destructive">{domain.message}</p>
        ) : isEmpty(domain.data) ? (
          <p className="text-xs text-muted-foreground">لا توجد بيانات في هذه الفترة</p>
        ) : (
          <ul className="space-y-1.5">
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
        {action}
      </CardContent>
    </Card>
  );
}

function LessonSessionsHubSection({
  snapshot,
  onRetry,
}: {
  snapshot: ReportsHubSnapshot;
  onRetry: () => void;
}) {
  const lessons = snapshot.lessons;
  const summaryItems =
    lessons.status === "ok" ? buildReportSummaryItems(lessons.data.stats) : [];

  if (lessons.status === "error") {
    return (
      <EmptyState
        icon={BarChart3}
        title={REPORTS_ERROR_TITLE}
        description={lessons.message}
        action={
          <Button className="min-h-11" onClick={onRetry}>
            إعادة المحاولة
          </Button>
        }
      />
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {summaryItems.map((item) => (
          <Card key={item.key}>
            <CardContent className="p-3">
              <p className="truncate text-[11px] text-muted-foreground">{item.label}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{item.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {isLessonHubEmpty(lessons.data) ? (
        <EmptyState
          icon={CalendarRange}
          title={REPORTS_EMPTY_TITLE}
          description={REPORTS_EMPTY_DESCRIPTION}
        />
      ) : (
        <ReportsSessionsDetail sessions={lessons.data.sessions} />
      )}
    </>
  );
}

function ReportsSessionsDetail({ sessions }: { sessions: ReportSessionWithTitle[] }) {
  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader className="border-b bg-muted/30 pb-3">
        <CardTitle className="text-base">تفاصيل الحصص</CardTitle>
      </CardHeader>
      <CardContent className="min-w-0 p-0">
        <div className="space-y-2 p-3 lg:hidden">
          {sessions.map((session) => (
            <article
              key={session.id}
              className="min-w-0 rounded-xl border bg-card p-3 shadow-sm"
              dir="rtl"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-bold">{formatDisplayDate(session.sessionDate)}</span>
                <Badge variant="secondary" className="tabular-nums">
                  الحصة {session.periodNumber}
                </Badge>
              </div>
              <p className="mt-2 truncate text-sm font-medium">{session.lessonTitle}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge variant="outline">{REPORT_STATUS_LABELS[session.status]}</Badge>
                <Badge
                  variant="outline"
                  className={cn(
                    "gap-1",
                    session.lessonLocked
                      ? "border-emerald-200 text-emerald-700"
                      : "text-muted-foreground",
                  )}
                >
                  {session.lessonLocked ? (
                    <Lock className="h-3 w-3" />
                  ) : (
                    <Unlock className="h-3 w-3" />
                  )}
                  {reportLockLabel(session.lessonLocked)}
                </Badge>
              </div>
            </article>
          ))}
        </div>

        <div className="hidden min-w-0 overflow-x-auto lg:block">
          <table className="w-full min-w-[720px] border-collapse text-right" dir="rtl">
            <thead>
              <tr className="border-b bg-muted/50 text-sm">
                <th className="p-3 font-bold">التاريخ</th>
                <th className="p-3 font-bold">رقم الحصة</th>
                <th className="p-3 font-bold">الحالة</th>
                <th className="p-3 font-bold">الدرس</th>
                <th className="p-3 font-bold">حالة القفل</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => (
                <tr key={session.id} className="border-b last:border-b-0">
                  <td className="p-3 text-sm">{formatDisplayDate(session.sessionDate)}</td>
                  <td className="p-3 text-sm tabular-nums">{session.periodNumber}</td>
                  <td className="p-3 text-sm">
                    <Badge variant="outline">{REPORT_STATUS_LABELS[session.status]}</Badge>
                  </td>
                  <td className="max-w-[18rem] truncate p-3 text-sm font-medium">
                    {session.lessonTitle}
                  </td>
                  <td className="p-3 text-sm">
                    <span className="inline-flex items-center gap-1">
                      {session.lessonLocked ? (
                        <Lock className="h-3.5 w-3.5 text-emerald-700" />
                      ) : (
                        <Unlock className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                      {reportLockLabel(session.lessonLocked)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
