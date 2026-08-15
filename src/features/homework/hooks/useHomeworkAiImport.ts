import { useMutation, useQueryClient } from "@tanstack/react-query";

import { HomeworkAiImportService } from "../services/homework-ai-import.service";

/**
 * Import an owned AI worksheet generation into a Homework draft.
 * Ownership stays inside HomeworkAiImportService — no teacher_id argument.
 */
export function useHomeworkAiImport() {
  const queryClient = useQueryClient();

  const createDraftFromWorksheetGeneration = useMutation({
    mutationFn: (generationId: string) =>
      HomeworkAiImportService.createDraftFromWorksheetGeneration(generationId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["homework"] });
    },
  });

  return {
    createDraftFromWorksheetGeneration,
  };
}
