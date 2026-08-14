import { useQuery } from "@tanstack/react-query";

import type { ReportsDateFilter } from "@/features/reports/services/reports.service";

import { HomeworkReportsService } from "../services/homework-reports.service";

export function homeworkPeriodReportQueryKey(filter: ReportsDateFilter) {
  if (filter.kind === "custom") {
    return ["homework-reports", "period", "custom", filter.from, filter.to] as const;
  }
  return ["homework-reports", "period", filter.kind, filter.today ?? "live"] as const;
}

export function homeworkDetailReportQueryKey(homeworkId: string | null) {
  return ["homework-reports", "detail", homeworkId ?? "idle"] as const;
}

export function useHomeworkPeriodReport(filter: ReportsDateFilter | null) {
  return useQuery({
    queryKey: filter ? homeworkPeriodReportQueryKey(filter) : ["homework-reports", "period", "idle"],
    enabled: Boolean(filter),
    staleTime: 30_000,
    queryFn: () => HomeworkReportsService.getPeriodReport(filter!),
  });
}

export function useHomeworkDetailReport(homeworkId: string | null) {
  return useQuery({
    queryKey: homeworkDetailReportQueryKey(homeworkId),
    enabled: Boolean(homeworkId),
    staleTime: 30_000,
    queryFn: () => HomeworkReportsService.getHomeworkDetail(homeworkId!),
  });
}
