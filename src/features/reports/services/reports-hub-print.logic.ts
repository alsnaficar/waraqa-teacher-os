import {
  compactHomeworkMetrics,
  compactLessonMetrics,
  compactTestMetrics,
  isHomeworkHubEmpty,
  isLessonHubEmpty,
  isTestHubEmpty,
  REPORTS_HUB_HOMEWORK_TITLE,
  REPORTS_HUB_LESSONS_TITLE,
  REPORTS_HUB_TESTS_TITLE,
  type CompactReportMetric,
  type HubDomainResult,
  type ReportsHubSnapshot,
} from "./reports-hub.logic";

export const REPORTS_HUB_PRINT_ROOT_ID = "reports-hub-print";
export const REPORTS_HUB_PRINT_BUTTON_LABEL = "طباعة التقرير";
export const REPORTS_HUB_PRINT_TITLE = "تقرير ورقة — ملخص الأداء";
export const REPORTS_HUB_PRINT_DOMAIN_ERROR = "تعذر التحميل";
export const REPORTS_HUB_PRINT_DOMAIN_EMPTY = "لا توجد بيانات في هذه الفترة";

export type ReportsHubPrintDomainSection = {
  title: string;
  kind: "metrics" | "empty" | "error";
  /** Present only for kind === "metrics". */
  metrics: CompactReportMetric[];
  /** Present for empty/error messaging. */
  message: string | null;
};

export type ReportsHubPrintView = {
  title: string;
  periodLabel: string;
  printedAtLabel: string;
  domains: ReportsHubPrintDomainSection[];
};

export function formatReportsHubPrintPeriod(range: { from: string; to: string }): string {
  return `${formatPrintIsoDate(range.from)} — ${formatPrintIsoDate(range.to)}`;
}

export function formatReportsHubPrintDateTime(at: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("ar-SA", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(at);
  } catch {
    return at.toISOString();
  }
}

function formatPrintIsoDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("ar-SA", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date(`${iso}T00:00:00Z`));
  } catch {
    return iso;
  }
}

function mapDomainSection<T>(input: {
  title: string;
  domain: HubDomainResult<T>;
  metricsOf: (data: T) => CompactReportMetric[];
  isEmpty: (data: T) => boolean;
}): ReportsHubPrintDomainSection {
  if (input.domain.status === "error") {
    return {
      title: input.title,
      kind: "error",
      metrics: [],
      message: REPORTS_HUB_PRINT_DOMAIN_ERROR,
    };
  }
  if (input.isEmpty(input.domain.data)) {
    return {
      title: input.title,
      kind: "empty",
      metrics: [],
      message: REPORTS_HUB_PRINT_DOMAIN_EMPTY,
    };
  }
  return {
    title: input.title,
    kind: "metrics",
    metrics: input.metricsOf(input.domain.data),
    message: null,
  };
}

/**
 * Builds a print DTO from the already-loaded hub snapshot.
 * Does not recalculate rates and never invents zeros for errored domains.
 */
export function buildReportsHubPrintView(
  snapshot: ReportsHubSnapshot,
  printedAt: Date = new Date(),
): ReportsHubPrintView {
  return {
    title: REPORTS_HUB_PRINT_TITLE,
    periodLabel: formatReportsHubPrintPeriod(snapshot.range),
    printedAtLabel: formatReportsHubPrintDateTime(printedAt),
    domains: [
      mapDomainSection({
        title: REPORTS_HUB_LESSONS_TITLE,
        domain: snapshot.lessons,
        metricsOf: (data) => compactLessonMetrics(data.stats),
        isEmpty: isLessonHubEmpty,
      }),
      mapDomainSection({
        title: REPORTS_HUB_HOMEWORK_TITLE,
        domain: snapshot.homework,
        metricsOf: (data) => compactHomeworkMetrics(data.summary),
        isEmpty: isHomeworkHubEmpty,
      }),
      mapDomainSection({
        title: REPORTS_HUB_TESTS_TITLE,
        domain: snapshot.tests,
        metricsOf: (data) => compactTestMetrics(data.summary),
        isEmpty: isTestHubEmpty,
      }),
    ],
  };
}

export function assertNoClientTeacherId(view: object): void {
  const keys = Object.keys(view);
  if (keys.includes("teacherId") || keys.includes("teacher_id")) {
    throw new Error("Reports hub print view must not expose teacher_id");
  }
}
