import { CurriculumSelection } from "./curriculum-selector";

export type AIDifficulty = "easy" | "medium" | "hard";

export type AIHomeworkType = "essay" | "mcq" | "true_false" | "mixed";

export interface AIGeneratorConfig {
  stage?: "primary" | "intermediate" | "secondary";
  semester?: string;
  grade: string;
  subject: string;
  title: string;
  questionCount: number;
  difficulty: AIDifficulty;
  objectives?: string;
  homeworkType?: AIHomeworkType;
  estimatedTime?: number;
}

export type FieldErrors = Partial<
  Record<
    | "title"
    | "questionCount"
    | "difficulty"
    | "objectives"
    | "homeworkType"
    | "estimatedTime"
    | "stage"
    | "grade"
    | "subject"
    | "semester",
    string
  >
>;
