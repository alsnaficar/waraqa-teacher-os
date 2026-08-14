import {
  AIGeneratorType,
  GeneratorAdapter,
  OrchestratorOptions,
  NormalizationResult,
  AIProvider,
  AIOrchestratorLog,
} from "./types";
import { LessonPlanAdapter, HomeworkAdapter, QuizAdapter, ActivitiesAdapter } from "./adapters";
import { buildCurriculumContext } from "@/features/ai/services/curriculum-context.server";
import { callDirectAi } from "@/features/ai/services/direct.server";

export class GeminiProvider implements AIProvider {
  name = "gemini-direct";
  async generate(params: { system: string; prompt: string; model?: string }) {
    return callDirectAi(params);
  }
}

export class AIOrchestrator {
  private adapters: Map<AIGeneratorType, GeneratorAdapter> = new Map();
  private defaultProvider: AIProvider;

  constructor(defaultProvider?: AIProvider) {
    this.defaultProvider = defaultProvider || new GeminiProvider();

    // Register the standard generator adapters
    this.registerAdapter(new LessonPlanAdapter());
    this.registerAdapter(new HomeworkAdapter());
    this.registerAdapter(new QuizAdapter());
    this.registerAdapter(new ActivitiesAdapter());
  }

  /**
   * Registers a custom generator adapter. This makes the orchestrator
   * scalable for dozens of generators with zero modifications to the core service.
   */
  public registerAdapter(adapter: GeneratorAdapter) {
    this.adapters.set(adapter.type, adapter);
    console.log(`[AIOrchestrator] Registered adapter for generator type: ${adapter.type}`);
  }

  /**
   * Retrieves an adapter by its generator type.
   */
  public getAdapter(type: AIGeneratorType): GeneratorAdapter {
    const adapter = this.adapters.get(type);
    if (!adapter) {
      throw new Error(
        `Ù„Ù… ÙŠØªÙ… Ø§Ù„Ø¹Ø«ÙˆØ± Ø¹Ù„Ù‰ Ù…Ø­ÙˆÙ„ Ù„Ù„Ù…ÙˆÙ„Ø¯ Ù…Ù† Ø§Ù„Ù†ÙˆØ¹: ${type}`,
      );
    }
    return adapter;
  }

  /**
   * Main orchestration method. Selects generator, prepares prompts, injects context,
   * handles retries/providers, normalizes and logs everything centrally.
   */
  public async generate(
    type: AIGeneratorType,
    rawInput: unknown,
    options: OrchestratorOptions = {},
  ): Promise<{
    content: string;
    model: string;
    curriculumContextUsed: boolean;
    normalized: NormalizationResult;
  }> {
    const startTime = Date.now();
    const adapter = this.getAdapter(type);

    // 1. Centralized Input Validation
    const parsedInput = adapter.inputSchema.safeParse(rawInput);
    if (!parsedInput.success) {
      const errorMsg = parsedInput.error.errors
        .map((e) => `${e.path.join(".")}: ${e.message}`)
        .join(", ");
      console.error(`[AIOrchestrator] Input validation failed for ${type}:`, errorMsg);
      throw new Error(`Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ù…Ø¯Ø®Ù„Ø§Øª ØºÙŠØ± ØµØ§Ù„Ø­Ø© Ù„Ù€ ${type}: ${errorMsg}`);
    }
    const validatedInput = parsedInput.data;

    // 2. Injecting curriculum & lesson context
    let curriculumPrefix = "";
    let curriculumContextUsed = false;

    if (options.skipAutoCurriculum) {
      curriculumPrefix = options.curriculumPrefix || "";
      curriculumContextUsed = Boolean(curriculumPrefix);
    } else {
      // Safely attempt to build curriculum context if fields are present
      const inputObj = validatedInput as {
        stage?: "primary" | "intermediate" | "secondary";
        semester?: string;
        grade: string;
        subject: string;
        title: string;
      };

      if (inputObj.grade && inputObj.subject && inputObj.title) {
        try {
          const { promptPrefix, used } = await buildCurriculumContext({
            stage: inputObj.stage,
            semester: inputObj.semester,
            grade: inputObj.grade,
            subject: inputObj.subject,
            lessonTitle: inputObj.title,
          });
          curriculumPrefix = promptPrefix || "";
          curriculumContextUsed = used;
        } catch (err) {
          console.warn(`[AIOrchestrator] Failed to fetch curriculum context for ${type}:`, err);
        }
      }
    }

    // 3. Preparing Prompts
    const system = adapter.getSystemInstruction(validatedInput);
    const prompt = adapter.getUserPrompt(validatedInput, curriculumPrefix);

    // 4. Provider configuration (Dynamic fallback)
    const provider = options.provider || this.defaultProvider;
    const model = options.model;
    const maxRetries = options.retries !== undefined ? options.retries : 2;

    let attempts = 0;
    let lastError: Error | null = null;
    let response: { content: string; model: string } | null = null;

    // 5. Handling Retries
    while (attempts <= maxRetries) {
      try {
        attempts++;
        response = await provider.generate({ system, prompt, model });
        break; // Success
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        console.warn(
          `[AIOrchestrator] Attempt ${attempts}/${maxRetries + 1} failed for ${type}:`,
          lastError.message,
        );
        if (attempts <= maxRetries) {
          const waitTime = attempts * 1000;
          await new Promise((resolve) => setTimeout(resolve, waitTime));
        }
      }
    }

    const durationMs = Date.now() - startTime;

    // Handle complete failure
    if (!response) {
      const finalError =
        lastError ||
        new Error(
          "ÙØ´Ù„Øª Ø¹Ù…Ù„ÙŠØ© ØªÙˆÙ„ÙŠØ¯ Ø§Ù„Ù…Ø­ØªÙˆÙ‰ Ø¨Ø§Ù„Ø°ÙƒØ§Ø¡ Ø§Ù„Ø§ØµØ·Ù†Ø§Ø¹ÙŠ.",
        );

      // 6. Centralized Logging (Failure case)
      this.log({
        timestamp: new Date().toISOString(),
        generatorType: type,
        model: model || "unknown",
        durationMs,
        success: false,
        promptCharCount: prompt.length,
        responseCharCount: 0,
        error: finalError.message,
      });

      throw finalError;
    }

    // 7. Normalizing AI Response
    const normalized = adapter.normalizeResponse(response.content, validatedInput);

    // 6. Centralized Logging (Success case)
    this.log({
      timestamp: new Date().toISOString(),
      generatorType: type,
      model: response.model,
      durationMs,
      success: true,
      promptCharCount: prompt.length,
      responseCharCount: normalized.content.length,
    });

    return {
      content: normalized.content,
      model: response.model,
      curriculumContextUsed,
      normalized,
    };
  }

  /**
   * Centralized Logging handler
   */
  private log(entry: AIOrchestratorLog) {
    const statusText = entry.success ? "SUCCESS" : "FAILURE";
    const errorSuffix = entry.error ? ` | Error: ${entry.error}` : "";
    console.log(
      `[AIOrchestrator] [${statusText}] [${entry.timestamp}] Type: ${entry.generatorType} ` +
        `| Model: ${entry.model} | Duration: ${entry.durationMs}ms | Prompt Chars: ${entry.promptCharCount} ` +
        `| Response Chars: ${entry.responseCharCount}${errorSuffix}`,
    );
  }
}

// Export single shared instance of the orchestrator
export const aiOrchestrator = new AIOrchestrator();
