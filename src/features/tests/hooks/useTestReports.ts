import { useQuery } from "@tanstack/react-query";

import type { ReportsDateFilter } from "@/features/reports/services/reports.service";

import { TestReportsService } from "../services/test-reports.service";

export function testPeriodReportQueryKey(filter: ReportsDateFilter) {
  if (filter.kind === "custom") {
    return ["test-reports", "period", "custom", filter.from, filter.to] as const;
  }
  return ["test-reports", "period", filter.kind, filter.today ?? "live"] as const;
}

export function testDetailReportQueryKey(testId: string | null) {
  return ["test-reports", "detail", testId ?? "idle"] as const;
}

export function useTestPeriodReport(filter: ReportsDateFilter | null) {
  return useQuery({
    queryKey: filter ? testPeriodReportQueryKey(filter) : ["test-reports", "period", "idle"],
    enabled: Boolean(filter),
    staleTime: 30_000,
    queryFn: () => TestReportsService.getPeriodReport(filter!),
  });
}

export function useTestDetailReport(testId: string | null) {
  return useQuery({
    queryKey: testDetailReportQueryKey(testId),
    enabled: Boolean(testId),
    staleTime: 30_000,
    queryFn: () => TestReportsService.getTestDetail(testId!),
  });
}
