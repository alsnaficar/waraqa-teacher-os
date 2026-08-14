import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  TestQuestionService,
  type TestQuestionCreateInput,
} from "../services/test-question.service";

export function testQuestionsQueryKey(testId: string) {
  return ["test-questions", testId] as const;
}

/**
 * Questions for one teacher-owned test.
 * Writes go through TestQuestionService only.
 */
export function useTestQuestions(testId: string | null) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: testId ? testQuestionsQueryKey(testId) : ["test-questions", "idle"],
    enabled: Boolean(testId),
    staleTime: 15_000,
    queryFn: () => TestQuestionService.listByTest(testId!),
  });

  const invalidate = () => {
    if (!testId) return Promise.resolve();
    return queryClient.invalidateQueries({ queryKey: testQuestionsQueryKey(testId) });
  };

  const replaceAll = useMutation({
    mutationFn: (questions: Array<Omit<TestQuestionCreateInput, "testId">>) => {
      if (!testId) throw new Error("معرّف الاختبار مفقود.");
      return TestQuestionService.replaceQuestions(testId, questions);
    },
    onSuccess: invalidate,
  });

  return {
    items: query.data ?? [],
    loading: Boolean(testId) && query.isPending,
    error: query.error,
    refresh: invalidate,
    replaceAll,
  };
}
