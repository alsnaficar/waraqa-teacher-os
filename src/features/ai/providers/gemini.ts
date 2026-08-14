import { GoogleGenAI } from "@google/genai";
import {
  AI_REQUEST_TIMEOUT_MESSAGE,
  GEMINI_REQUEST_TIMEOUT_MS,
  isAiGeminiTimeoutError,
} from "./ai-request-limits.ts";

let geminiClient: GoogleGenAI | null = null;

export function getGemini(): GoogleGenAI {
  if (!geminiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "Missing GEMINI_API_KEY environment variable. Please configure it in your Settings > Secrets.",
      );
    }
    geminiClient = new GoogleGenAI({ apiKey });
  }
  return geminiClient;
}

export async function generateContent(
  params: {
    systemInstruction?: string;
    prompt: string;
    model?: string;
  },
  /** Optional inject for tests; production callers omit this. */
  aiClient: GoogleGenAI = getGemini(),
): Promise<string> {
  const model = params.model || "gemini-2.5-flash";
  try {
    console.log(`[Gemini API Request] Sending request to model: ${model}`);
    const response = await aiClient.models.generateContent({
      model,
      contents: params.prompt,
      config: {
        systemInstruction: params.systemInstruction,
        httpOptions: {
          timeout: GEMINI_REQUEST_TIMEOUT_MS,
        },
      },
    });
    return response.text?.trim() ?? "";
  } catch (error: unknown) {
    if (isAiGeminiTimeoutError(error)) {
      throw new Error(AI_REQUEST_TIMEOUT_MESSAGE);
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Gemini API Error] Model: ${model}`, message);
    throw error;
  }
}
