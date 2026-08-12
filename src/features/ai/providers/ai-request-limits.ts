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
