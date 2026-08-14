import { useMutation, useQueryClient } from "@tanstack/react-query";

import { TestAiImportService } from "../services/test-ai-import.service";

/**
 * Import an owned AI quiz generation into a Tests draft.
 * Ownership stays inside TestAiImportService — no teacher_id argument.
 */
export function useTestAiImport() {
  const queryClient = useQueryClient();

  const createDraftFromQuizGeneration = useMutation({
    mutationFn: (generationId: string) =>
      TestAiImportService.createDraftFromQuizGeneration(generationId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tests"] });
    },
  });

  return {
    createDraftFromQuizGeneration,
  };
}
