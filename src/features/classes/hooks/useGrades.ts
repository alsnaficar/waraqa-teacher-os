import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  GradeService,
  type GradeCreateInput,
  type GradeUpdateInput,
} from "../services/grade.service";

export function gradesQueryKey() {
  return ["grades"] as const;
}

/**
 * Teacher grades list + mutations.
 * Ownership stays inside GradeService — no teacher_id argument.
 */
export function useGrades() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: gradesQueryKey(),
    staleTime: 30_000,
    queryFn: () => GradeService.list(),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["grades"] });
    void queryClient.invalidateQueries({ queryKey: ["teacher-catalog"] });
  };

  const create = useMutation({
    mutationFn: (input: GradeCreateInput) => GradeService.create(input),
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: GradeUpdateInput }) =>
      GradeService.update(id, patch),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => GradeService.delete(id),
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
