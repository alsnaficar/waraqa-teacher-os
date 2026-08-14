import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  HomeworkService,
  type HomeworkCreateInput,
  type HomeworkListFilter,
  type HomeworkUpdateInput,
} from "../services/homework.service";

export function homeworkQueryKey(filter: HomeworkListFilter = {}) {
  return ["homework", filter.status ?? "all", filter.lessonSessionId ?? "any"] as const;
}

/**
 * Teacher homework list + mutations.
 * Ownership stays inside HomeworkService — no teacher_id argument.
 */
export function useHomework(filter: HomeworkListFilter = {}) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: homeworkQueryKey(filter),
    staleTime: 30_000,
    queryFn: () => HomeworkService.list(filter),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["homework"] });

  const create = useMutation({
    mutationFn: (input: HomeworkCreateInput) => HomeworkService.create(input),
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: HomeworkUpdateInput }) =>
      HomeworkService.update(id, patch),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => HomeworkService.delete(id),
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
  };
}
