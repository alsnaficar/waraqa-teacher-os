import { useQuery, useQueryClient } from "@tanstack/react-query";

import { CorrectionsInboxService } from "../services/corrections-inbox.service";

export function correctionsInboxQueryKey() {
  return ["corrections-inbox", "needs-action"] as const;
}

/**
 * Teacher corrections inbox. Ownership stays inside CorrectionsInboxService.
 */
export function useCorrectionsInbox() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: correctionsInboxQueryKey(),
    staleTime: 15_000,
    queryFn: () => CorrectionsInboxService.listNeedsAction(),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["corrections-inbox"] });
  };

  return {
    items: query.data ?? [],
    loading: query.isPending,
    error: query.error,
    refresh,
  };
}
