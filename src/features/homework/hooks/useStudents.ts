import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  StudentService,
  type StudentCreateInput,
  type StudentListFilter,
  type StudentUpdateInput,
} from "../services/student.service";
import { TeacherCatalogService } from "../services/teacher-catalog.service";

export function studentsQueryKey(filter: StudentListFilter = {}) {
  return [
    "students",
    filter.classId ?? "all",
    filter.gradeId ?? "any",
    String(filter.active ?? "any"),
  ] as const;
}

export function useStudents(filter: StudentListFilter = {}) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: studentsQueryKey(filter),
    staleTime: 30_000,
    queryFn: () => StudentService.list(filter),
  });

  const catalogs = useQuery({
    queryKey: ["teacher-catalog", "classes-grades"],
    staleTime: 60_000,
    queryFn: async () => {
      const [classes, grades] = await Promise.all([
        TeacherCatalogService.listClasses(),
        TeacherCatalogService.listGrades(),
      ]);
      return { classes, grades };
    },
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["students"] });
  };

  const create = useMutation({
    mutationFn: (input: StudentCreateInput) => StudentService.create(input),
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: StudentUpdateInput }) =>
      StudentService.update(id, patch),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => StudentService.delete(id),
    onSuccess: invalidate,
  });

  const bulkCreate = useMutation({
    mutationFn: (input: {
      classId: string;
      gradeId?: string | null;
      rows: Array<{ fullName: string; studentCode?: string | null }>;
    }) => StudentService.bulkCreate(input),
    onSuccess: invalidate,
  });

  return {
    items: query.data ?? [],
    loading: query.isPending,
    error: query.error,
    refresh: invalidate,
    classes: catalogs.data?.classes ?? [],
    grades: catalogs.data?.grades ?? [],
    catalogsLoading: catalogs.isPending,
    create,
    update,
    remove,
    bulkCreate,
  };
}
