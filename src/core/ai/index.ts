export type AIProvider = "openai" | "claude" | "gemini";

export type AITask =
  | "lesson-plan"
  | "worksheet"
  | "quiz"
  | "activity"
  | "enrichment"
  | "strategies"
  | "teaching-aids"
  | "pdf-parser";

export interface AIRequest {
  task: AITask;
  provider?: AIProvider;
  payload: Record<string, unknown>;
}

export interface AIResponse<T = unknown> {
  success: boolean;
  provider: AIProvider;
  data: T;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
}

export interface AIProviderAdapter {
  generate(request: AIRequest): Promise<AIResponse>;
}
export class AIEngine {
  constructor(private readonly providers: Record<AIProvider, AIProviderAdapter>) {}

  async execute(request: AIRequest): Promise<AIResponse> {
    const provider = request.provider ?? this.selectProvider(request.task);

    return this.providers[provider].generate({
      ...request,
      provider,
    });
  }

  private selectProvider(task: AITask): AIProvider {
    switch (task) {
      case "pdf-parser":
        return "gemini";

      case "lesson-plan":
      case "worksheet":
      case "quiz":
      case "activity":
      case "enrichment":
      case "strategies":
      case "teaching-aids":
      default:
        return "openai";
    }
  }
}
