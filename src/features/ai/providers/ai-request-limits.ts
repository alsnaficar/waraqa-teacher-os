/**
 * Non-PDF Gemini request limits (Phase 5.1 Hotfix #2.4).
 *
 * PDF extraction uses curriculum-pdf-limits.ts separately and must not be changed here.
 */

/** Maximum application-side duration for a single non-PDF Gemini generateContent call. */
export const GEMINI_REQUEST_TIMEOUT_MS = 90_000;

export const AI_REQUEST_TIMEOUT_MESSAGE = "انتهى وقت معالجة الطلب. حاول مرة أخرى.";

/** Prompt-field bounds aligned with existing worksheet/activity Zod conventions. */
export const AI_PROMPT_SUBJECT_MAX = 120;
export const AI_PROMPT_GRADE_MAX = 120;
export const AI_PROMPT_TITLE_MAX = 200;
export const AI_PROMPT_LESSON_NAME_MAX = 200;
export const AI_PROMPT_UNIT_MAX = 200;
export const AI_PROMPT_SEMESTER_MAX = 120;
/** Matches legacy lesson-plan / worksheet-style objectives ceiling. */
export const AI_PROMPT_OBJECTIVES_MAX = 4000;
/** Client suggestedDate (YYYY-MM-DD); Hotfix #2.7 prompt-amplification bound. */
export const AI_PROMPT_SUGGESTED_DATE_MAX = 32;

/**
 * Read-side curriculum prompt ceilings (Hotfix #2.7).
 * Applied only when constructing AI prompts — never mutates DB rows.
 */
export const AI_PROMPT_CURRICULUM_TITLE_MAX = AI_PROMPT_TITLE_MAX;
export const AI_PROMPT_CURRICULUM_OBJECTIVES_MAX = AI_PROMPT_OBJECTIVES_MAX;
export const AI_PROMPT_CURRICULUM_NOTES_MAX = 4000;

/** Appended when a DB curriculum field is truncated for an AI prompt. */
export const AI_PROMPT_TRUNCATION_MARKER = "[تم اختصار النص]";

/**
 * Clamp text for AI prompt construction only.
 * Preserves the start of the field and appends a deterministic marker when truncated.
 */
export function clampAiPromptText(value: string, maxChars: number): string {
  if (maxChars <= 0) return AI_PROMPT_TRUNCATION_MARKER;
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}${AI_PROMPT_TRUNCATION_MARKER}`;
}

/**
 * Detect @google/genai httpOptions.timeout aborts (AbortError / DOMException.ABORT_ERR).
 * Ordinary provider failures must not map to timeout.
 */
export function isAiGeminiTimeoutError(err: unknown): boolean {
  if (err == null || typeof err !== "object") {
    return false;
  }

  const name =
    "name" in err && typeof (err as { name?: unknown }).name === "string"
      ? (err as { name: string }).name
      : "";
  if (name === "AbortError") {
    return true;
  }

  if (
    typeof DOMException !== "undefined" &&
    err instanceof DOMException &&
    err.code === DOMException.ABORT_ERR
  ) {
    return true;
  }

  if (err instanceof Error && err.cause != null) {
    return isAiGeminiTimeoutError(err.cause);
  }

  return false;
}
