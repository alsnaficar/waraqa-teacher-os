import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { StudentService } from "@/features/homework/services/student.service";
import { TeacherCatalogService } from "@/features/homework/services/teacher-catalog.service";

import { TestSubmissionService } from "../services/test-submission.service";

export function testSubmissionsQueryKey(testId: string) {
  return ["test-submissions", testId] as const;
}

/**
 * Submissions for one teacher-owned test + active students for assignment.
 * Mutations use assignPending only — no client teacher_id/status/score.
 */
export function useTestSubmissions(testId: string | null) {
  const queryClient = useQueryClient();

  const submissionsQuery = useQuery({
    queryKey: testId ? testSubmissionsQueryKey(testId) : ["test-submissions", "idle"],
    enabled: Boolean(testId),
    staleTime: 30_000,
    queryFn: () => TestSubmissionService.listByTest(testId!),
  });

  const studentsQuery = useQuery({
    queryKey: ["students", "active-for-test-submissions"],
    enabled: Boolean(testId),
    staleTime: 30_000,
    queryFn: () => StudentService.list({ active: true }),
  });

  const classesQuery = useQuery({
    queryKey: ["teacher-catalog", "classes", "test-submissions"],
    enabled: Boolean(testId),
    staleTime: 60_000,
    queryFn: () => TeacherCatalogService.listClasses(),
  });

  const invalidate = () => {
    if (testId) {
      void queryClient.invalidateQueries({ queryKey: testSubmissionsQueryKey(testId) });
    }
    void queryClient.invalidateQueries({ queryKey: ["students"] });
  };

  const assignPending = useMutation({
    mutationFn: (studentId: string) => {
      if (!testId) throw new Error("معرّف الاختبار مفقود.");
      return TestSubmissionService.assignPending(testId, studentId);
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (submissionId: string) => TestSubmissionService.delete(submissionId),
    onSuccess: invalidate,
  });

  return {
    submissions: submissionsQuery.data ?? [],
    students: studentsQuery.data ?? [],
    classes: classesQuery.data ?? [],
    loading: Boolean(testId) && (submissionsQuery.isPending || studentsQuery.isPending),
    error: submissionsQuery.error ?? studentsQuery.error,
    refresh: invalidate,
    assignPending,
    remove,
  };
}
