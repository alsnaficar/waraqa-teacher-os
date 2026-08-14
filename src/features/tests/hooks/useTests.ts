import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  TestService,
  type TestCreateInput,
  type TestListFilter,
  type TestUpdateInput,
} from "../services/test.service";

export function testsQueryKey(filter: TestListFilter = {}) {
  return ["tests", filter.status ?? "all", filter.lessonSessionId ?? "any"] as const;
}

/**
 * Teacher tests list + mutations.
 * Ownership stays inside TestService — no teacher_id argument.
 */
export function useTests(filter: TestListFilter = {}) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: testsQueryKey(filter),
    staleTime: 30_000,
    queryFn: () => TestService.list(filter),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["tests"] });

  const create = useMutation({
    mutationFn: (input: TestCreateInput) => TestService.create(input),
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TestUpdateInput }) =>
      TestService.update(id, patch),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => TestService.delete(id),
    onSuccess: invalidate,
  });

  const publish = useMutation({
    mutationFn: (id: string) => TestService.publish(id),
    onSuccess: invalidate,
  });

  const close = useMutation({
    mutationFn: (id: string) => TestService.close(id),
    onSuccess: invalidate,
  });

  return {
    items: query.data ?? [],
    loading: query.isPending,
    error: query.error,
    refresh: invalidate,
    create,
    update,
    remove,
    publish,
    close,
  };
}
