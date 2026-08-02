import { getGemini, generateContent } from "@/features/ai/providers/gemini";
import { GoogleGenAI } from "@google/genai";

export const DEFAULT_AI_MODEL = "gemini-2.5-flash";

export function getGeminiClient(): GoogleGenAI {
  return getGemini();
}

export async function callDirectAi(params: {
  system: string;
  prompt: string;
  model?: string;
}): Promise<{ content: string; model: string }> {
  const model = params.model ?? DEFAULT_AI_MODEL;
  const content = await generateContent({
    systemInstruction: params.system,
    prompt: params.prompt,
    model,
  });

  return { content, model };
}
