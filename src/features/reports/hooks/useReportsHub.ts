import { useQuery } from "@tanstack/react-query";

import {
  REPORTS_HUB_DEFAULT_FILTER,
} from "../services/reports-hub.logic";
import { ReportsHubService } from "../services/reports-hub.service";
import type { ReportsDateFilter } from "../services/reports.service";

export function reportsHubQueryKey(filter: ReportsDateFilter) {
  if (filter.kind === "custom") {
    return ["reports", "hub", filter.kind, filter.from, filter.to] as const;
  }
  return ["reports", "hub", filter.kind, filter.today ?? "live"] as const;
}

/**
 * Shared Reports Hub snapshot for Dashboard + /reports.
 * Ownership stays inside ReportsHubService — no teacher_id argument.
 */
export function useReportsHub(filter: ReportsDateFilter = REPORTS_HUB_DEFAULT_FILTER) {
  return useQuery({
    queryKey: reportsHubQueryKey(filter),
    staleTime: 30_000,
    queryFn: () => ReportsHubService.getSnapshot(filter),
  });
}

export { REPORTS_HUB_DEFAULT_FILTER };
