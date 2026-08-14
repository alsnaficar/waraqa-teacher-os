import { z } from "zod";

export type AIGeneratorType = "lesson_plan" | "worksheet" | "quiz" | "activity_ideas";

export interface AIProvider {
  name: string;
  generate(params: {
    system: string;
    prompt: string;
    model?: string;
  }): Promise<{ content: string; model: string }>;
}

export interface OrchestratorOptions {
  model?: string;
  retries?: number;
  provider?: AIProvider;
  /**
   * When set with skipAutoCurriculum, inject this prefix instead of
   * free-text grade/subject/title curriculum lookup (P3 Step 3 session binding).
   */
  curriculumPrefix?: string;
  skipAutoCurriculum?: boolean;
}

export interface AIOrchestratorLog {
  timestamp: string;
  generatorType: AIGeneratorType;
  model: string;
  durationMs: number;
  success: boolean;
  promptCharCount: number;
  responseCharCount: number;
  error?: string;
}

export interface NormalizationResult {
  content: string;
  normalizedAt: string;
  metadata: {
    title?: string;
    grade?: string;
    subject?: string;
    wordCount: number;
  };
}

export interface GeneratorAdapter<TInput = unknown> {
  type: AIGeneratorType;

  // Zod validation schema for the adapter's input
  inputSchema: z.ZodSchema<TInput>;
  // Prepare system and user prompts
  getSystemInstruction(input: TInput): string;
  getUserPrompt(input: TInput, context?: string): string;

  // Normalize AI response
  normalizeResponse(rawContent: string, input: TInput): NormalizationResult;
}
