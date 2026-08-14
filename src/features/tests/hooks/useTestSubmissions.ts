import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { StudentService } from "@/features/homework/services/student.service";
import { TeacherCatalogService } from "@/features/homework/services/teacher-catalog.service";

import { TestGradingService } from "../services/test-grading.service";
import { TestSubmissionService } from "../services/test-submission.service";

export function testSubmissionsQueryKey(testId: string) {
  return ["test-submissions", testId] as const;
}

/**
 * Submissions for one teacher-owned test + active students for assignment.
 * Mutations use assignPending / gradeSubmission — no client teacher_id authority.
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
    void queryClient.invalidateQueries({ queryKey: ["test-reports"] });
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

  const gradeSubmission = useMutation({
    mutationFn: (submissionId: string) => TestGradingService.gradeSubmission(submissionId),
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
    gradeSubmission,
  };
}
