import type { AIGenerationRecord } from "../types";

export class HistoryService {
  async save(record: AIGenerationRecord) {
    throw new Error("Not implemented");
  }

  async load(
    lessonId: string,
    type: AIGenerationRecord["type"],
  ) {
    throw new Error("Not implemented");
  }

  async delete(id: string) {
    throw new Error("Not implemented");
  }

  async history(lessonId: string) {
    throw new Error("Not implemented");
  }
}

export const historyService = new HistoryService();