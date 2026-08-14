import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { HomeworkSubmissionService } from "../services/homework-submission.service";
import type { HomeworkGradeInput } from "../services/homework-submission.service";
import { StudentService } from "../services/student.service";

export function homeworkSubmissionsQueryKey(homeworkId: string) {
  return ["homework-submissions", homeworkId] as const;
}

/**
 * Submissions for one homework + active students for linking.
 * Ownership stays inside services — no teacher_id argument.
 */
export function useHomeworkSubmissions(homeworkId: string | null) {
  const queryClient = useQueryClient();

  const submissionsQuery = useQuery({
    queryKey: homeworkId
      ? homeworkSubmissionsQueryKey(homeworkId)
      : ["homework-submissions", "idle"],
    enabled: Boolean(homeworkId),
    staleTime: 30_000,
    queryFn: () => HomeworkSubmissionService.listByHomework(homeworkId!),
  });

  const studentsQuery = useQuery({
    queryKey: ["students", "active-for-submissions"],
    enabled: Boolean(homeworkId),
    staleTime: 30_000,
    queryFn: () => StudentService.list({ active: true }),
  });

  const invalidate = () => {
    if (homeworkId) {
      void queryClient.invalidateQueries({ queryKey: homeworkSubmissionsQueryKey(homeworkId) });
    }
    void queryClient.invalidateQueries({ queryKey: ["students"] });
  };

  const createPending = useMutation({
    mutationFn: (studentId: string) => {
      if (!homeworkId) throw new Error("معرّف الواجب مفقود.");
      return HomeworkSubmissionService.create({
        homeworkId,
        studentId,
        status: "pending",
      });
    },
    onSuccess: invalidate,
  });

  const markSubmitted = useMutation({
    mutationFn: (submissionId: string) =>
      HomeworkSubmissionService.update(submissionId, {
        status: "submitted",
        submittedAt: new Date().toISOString(),
      }),
    onSuccess: invalidate,
  });

  const grade = useMutation({
    mutationFn: ({
      submissionId,
      input,
    }: {
      submissionId: string;
      input: HomeworkGradeInput;
    }) => HomeworkSubmissionService.grade(submissionId, input),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (submissionId: string) => HomeworkSubmissionService.delete(submissionId),
    onSuccess: invalidate,
  });

  return {
    submissions: submissionsQuery.data ?? [],
    students: studentsQuery.data ?? [],
    loading: submissionsQuery.isPending || studentsQuery.isPending,
    error: submissionsQuery.error ?? studentsQuery.error,
    refresh: invalidate,
    createPending,
    markSubmitted,
    grade,
    remove,
  };
}
