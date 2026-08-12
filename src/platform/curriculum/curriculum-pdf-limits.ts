/**
 * Curriculum PDF upload gates (Phase 5.1 Hotfix #2.1 size + #2.2 magic bytes
 * + #2.3.1 Gemini request timeout).
 *
 * Authoritative size limit is decoded binary size (10 MB). Base64 length is a
 * derived first-pass ceiling only — decoded byte length is always verified
 * on the server before Gemini.
 *
 * PDF content type is enforced by magic bytes (same convention as billing
 * receipt sniffing: leading %PDF / 25 50 44 46). Client MIME remains UX-only.
 *
 * {@link GEMINI_EXTRACTION_TIMEOUT_MS} is the maximum application-side Gemini
 * request duration for curriculum PDF extraction (server-enforced; not
 * client-controllable).
 *
 * Note: these application guards protect Gemini/API processing. They are not
 * a transport-level HTTP request-body limit unless the host framework adds one.
 *
 * This module is client-safe (constants + pure helpers).
 */

/** Authoritative maximum decoded PDF size. */
export const MAX_CURRICULUM_PDF_BYTES = 10 * 1024 * 1024;

/**
 * Maximum Base64 character length for a payload of at most
 * {@link MAX_CURRICULUM_PDF_BYTES}.
 *
 * Standard Base64 maps every 3 input bytes to 4 output characters (with
 * '=' padding). Encoded length for N bytes is therefore:
 *   4 * ceil(N / 3)
 *
 * This ceiling alone must not weaken the decoded 10 MB gate — the server
 * verifies Buffer.byteLength after decode.
 */
export const MAX_CURRICULUM_PDF_BASE64_CHARS = 4 * Math.ceil(MAX_CURRICULUM_PDF_BYTES / 3);

/** Matches billing receipt PDF sniff: "%PDF" = 0x25 0x50 0x44 0x46. */
export const CURRICULUM_PDF_MAGIC = Object.freeze([0x25, 0x50, 0x44, 0x46] as const);

/** Minimum bytes required before magic inspection (header + version dash). */
export const CURRICULUM_PDF_MIN_BYTES = 5;

export const CURRICULUM_PDF_TOO_LARGE_MESSAGE = "حجم ملف PDF يتجاوز الحد المسموح وهو 10 ميجابايت.";

export const CURRICULUM_PDF_INVALID_MESSAGE = "ملف PDF غير صالح.";

/**
 * Maximum application-side duration for curriculum PDF → Gemini
 * `generateContent` (milliseconds). Enforced via SDK `httpOptions.timeout`.
 */
export const GEMINI_EXTRACTION_TIMEOUT_MS = 90_000;

export const CURRICULUM_PDF_TIMEOUT_MESSAGE = "انتهى وقت معالجة الملف. حاول مرة أخرى.";

/**
 * Reject buffers that do not begin with the PDF magic signature used by
 * billing receipt sniffing (`%PDF` / 25 50 44 46).
 */
export function assertCurriculumPdfMagicBytes(bytes: Uint8Array): void {
  if (bytes.byteLength < CURRICULUM_PDF_MIN_BYTES) {
    throw new Error(CURRICULUM_PDF_INVALID_MESSAGE);
  }

  for (let i = 0; i < CURRICULUM_PDF_MAGIC.length; i++) {
    if (bytes[i] !== CURRICULUM_PDF_MAGIC[i]) {
      throw new Error(CURRICULUM_PDF_INVALID_MESSAGE);
    }
  }
}

/**
 * Detect @google/genai httpOptions.timeout aborts.
 *
 * The SDK aborts the underlying fetch via AbortController; Node surfaces this
 * as DOMException/Error with name "AbortError" (not ApiError). Message text
 * alone is not used — ordinary network failures must not map to timeout.
 */
export function isCurriculumGeminiTimeoutError(err: unknown): boolean {
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

  // DOMException ABORT_ERR
  if (
    typeof DOMException !== "undefined" &&
    err instanceof DOMException &&
    err.code === DOMException.ABORT_ERR
  ) {
    return true;
  }

  if (err instanceof Error && err.cause != null) {
    return isCurriculumGeminiTimeoutError(err.cause);
  }

  return false;
}
