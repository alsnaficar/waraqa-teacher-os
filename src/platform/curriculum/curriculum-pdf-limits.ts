/**
 * Curriculum PDF upload size gates (Phase 5.1 Hotfix #2.1).
 *
 * Authoritative limit is decoded binary size (10 MB). Base64 length is a
 * derived first-pass ceiling only — decoded byte length is always verified
 * on the server before Gemini.
 *
 * Note: these application guards protect Gemini/API processing. They are not
 * a transport-level HTTP request-body limit unless the host framework adds one.
 *
 * This module is client-safe (constants + messages only).
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

export const CURRICULUM_PDF_TOO_LARGE_MESSAGE = "حجم ملف PDF يتجاوز الحد المسموح وهو 10 ميجابايت.";

export const CURRICULUM_PDF_INVALID_MESSAGE = "ملف PDF غير صالح.";
