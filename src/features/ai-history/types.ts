export type GenerationType =
  | "lesson-plan"
  | "worksheet"
  | "quiz"
  | "activities";

export interface AIGenerationRecord {
  id: string;
  lessonId: string;
  type: GenerationType;

  title: string;

  content: string;

  createdAt: string;
  updatedAt: string;

  model?: string;
  prompt?: string;

  version: number;

  userId: string;
}