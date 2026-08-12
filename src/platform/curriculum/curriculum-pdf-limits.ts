/**
 * Curriculum PDF upload gates (Phase 5.1 Hotfix #2.1 size + #2.2 magic bytes).
 *
 * Authoritative size limit is decoded binary size (10 MB). Base64 length is a
 * derived first-pass ceiling only — decoded byte length is always verified
 * on the server before Gemini.
 *
 * PDF content type is enforced by magic bytes (same convention as billing
 * receipt sniffing: leading %PDF / 25 50 44 46). Client MIME remains UX-only.
 *
 * Note: these application guards protect Gemini/API processing. They are not
 * a transport-level HTTP request-body limit unless the host framework adds one.
 *
 * This module is client-safe (constants + pure magic-byte helper).
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
