import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { StudentService } from "@/features/homework/services/student.service";
import { TeacherCatalogService } from "@/features/homework/services/teacher-catalog.service";

import { TestAnswerService, type TestAnswerUpsertInput } from "../services/test-answer.service";
import { TestGradingService } from "../services/test-grading.service";
import { TestQuestionService } from "../services/test-question.service";
import { TestSubmissionService } from "../services/test-submission.service";
import { draftToUpsertInputs, type AnswerDraftMap } from "../services/tests-submissions-ui.logic";

export function testSubmissionsQueryKey(testId: string) {
  return ["test-submissions", testId] as const;
}

export function testSubmissionAnswersQueryKey(submissionId: string | null) {
  return ["test-submission-answers", submissionId ?? "idle"] as const;
}

/**
 * Submissions for one teacher-owned test + answer entry / submit / grade mutations.
 * No client teacher_id authority.
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

  const questionsQuery = useQuery({
    queryKey: testId ? ["test-questions", testId, "for-answer-entry"] : ["test-questions", "idle"],
    enabled: Boolean(testId),
    staleTime: 30_000,
    queryFn: () => TestQuestionService.listByTest(testId!),
  });

  const invalidate = () => {
    if (testId) {
      void queryClient.invalidateQueries({ queryKey: testSubmissionsQueryKey(testId) });
      void queryClient.invalidateQueries({ queryKey: ["test-questions", testId] });
    }
    void queryClient.invalidateQueries({ queryKey: ["students"] });
    void queryClient.invalidateQueries({ queryKey: ["test-reports"] });
    void queryClient.invalidateQueries({ queryKey: ["test-submission-answers"] });
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

  const markSubmitted = useMutation({
    mutationFn: (submissionId: string) => TestSubmissionService.markSubmitted(submissionId),
    onSuccess: invalidate,
  });

  const saveAnswers = useMutation({
    mutationFn: async (inputs: TestAnswerUpsertInput[]) => {
      const saved = [];
      for (const input of inputs) {
        const row = await TestAnswerService.upsertAnswer(input);
        if (row) saved.push(row);
      }
      return saved;
    },
    onSuccess: invalidate,
  });

  const saveAnswersAndSubmit = useMutation({
    mutationFn: async ({
      submissionId,
      draft,
    }: {
      submissionId: string;
      draft: AnswerDraftMap;
    }) => {
      const questions = questionsQuery.data ?? (await TestQuestionService.listByTest(testId!));
      const inputs = draftToUpsertInputs(submissionId, questions, draft);
      for (const input of inputs) {
        await TestAnswerService.upsertAnswer(input);
      }
      return TestSubmissionService.markSubmitted(submissionId);
    },
    onSuccess: invalidate,
  });

  const saveAnswersSubmitAndGrade = useMutation({
    mutationFn: async ({
      submissionId,
      draft,
    }: {
      submissionId: string;
      draft: AnswerDraftMap;
    }) => {
      const questions = questionsQuery.data ?? (await TestQuestionService.listByTest(testId!));
      const inputs = draftToUpsertInputs(submissionId, questions, draft);
      for (const input of inputs) {
        await TestAnswerService.upsertAnswer(input);
      }
      const submitted = await TestSubmissionService.markSubmitted(submissionId);
      if (!submitted) throw new Error("تعذر تعليم التسليم كمُسلّم.");
      return TestGradingService.gradeSubmission(submissionId);
    },
    onSuccess: invalidate,
  });

  const setFeedback = useMutation({
    mutationFn: ({
      submissionId,
      feedback,
    }: {
      submissionId: string;
      feedback: string;
    }) => TestSubmissionService.setFeedback(submissionId, feedback),
    onSuccess: invalidate,
  });

  return {
    submissions: submissionsQuery.data ?? [],
    students: studentsQuery.data ?? [],
    classes: classesQuery.data ?? [],
    questions: questionsQuery.data ?? [],
    loading: Boolean(testId) && (submissionsQuery.isPending || studentsQuery.isPending),
    questionsLoading: Boolean(testId) && questionsQuery.isPending,
    error: submissionsQuery.error ?? studentsQuery.error ?? questionsQuery.error,
    refresh: invalidate,
    assignPending,
    remove,
    gradeSubmission,
    markSubmitted,
    saveAnswers,
    saveAnswersAndSubmit,
    saveAnswersSubmitAndGrade,
    setFeedback,
  };
}

export function useTestSubmissionAnswers(submissionId: string | null) {
  return useQuery({
    queryKey: testSubmissionAnswersQueryKey(submissionId),
    enabled: Boolean(submissionId),
    staleTime: 15_000,
    queryFn: () => TestAnswerService.listBySubmission(submissionId!),
  });
}
