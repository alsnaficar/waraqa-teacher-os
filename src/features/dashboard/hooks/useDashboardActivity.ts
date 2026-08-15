import { useQuery, useQueryClient } from "@tanstack/react-query";

import { DashboardActivityService } from "../services/dashboard-activity.service";

export function dashboardActivityQueryKey() {
  return ["dashboard", "activity"] as const;
}

/**
 * Dashboard pending tasks + recent activity.
 * Ownership stays inside DashboardActivityService — no teacher_id argument.
 */
export function useDashboardActivity() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: dashboardActivityQueryKey(),
    staleTime: 15_000,
    queryFn: () => DashboardActivityService.getSnapshot(),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["dashboard", "activity"] });
    void queryClient.invalidateQueries({ queryKey: ["corrections-inbox"] });
  };

  return {
    pending: query.data?.pending ?? [],
    activity: query.data?.activity ?? [],
    loading: query.isPending,
    error: query.error,
    refresh,
  };
}
