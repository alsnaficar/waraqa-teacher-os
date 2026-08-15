import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  ClassService,
  type ClassCreateInput,
  type ClassListFilter,
  type ClassUpdateInput,
} from "../services/class.service";

export function classesQueryKey(filter: ClassListFilter = {}) {
  return ["classes", filter.gradeId ?? "all"] as const;
}

/**
 * Teacher classes list + mutations.
 * Ownership stays inside ClassService — no teacher_id argument.
 */
export function useClasses(filter: ClassListFilter = {}) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: classesQueryKey(filter),
    staleTime: 30_000,
    queryFn: () => ClassService.list(filter),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["classes"] });
    void queryClient.invalidateQueries({ queryKey: ["teacher-catalog"] });
  };

  const create = useMutation({
    mutationFn: (input: ClassCreateInput) => ClassService.create(input),
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ClassUpdateInput }) =>
      ClassService.update(id, patch),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => ClassService.delete(id),
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
