/**
 * Calendar PDF/image upload gates. Magic-byte sniff matches billing receipts
 * (JPEG / PNG / PDF). WebP is not accepted for official calendar import.
 * Application-level size guards protect Gemini; they are not a transport limit.
 */

export const MAX_CALENDAR_IMPORT_BYTES = 10 * 1024 * 1024;
export const MAX_CALENDAR_IMPORT_BASE64_CHARS = 4 * Math.ceil(MAX_CALENDAR_IMPORT_BYTES / 3);
export const CALENDAR_IMPORT_TIMEOUT_MS = 90_000;

export const CALENDAR_IMPORT_TOO_LARGE_MESSAGE = "حجم الملف يتجاوز الحد المسموح وهو 10 ميجابايت.";
export const CALENDAR_IMPORT_INVALID_MESSAGE = "ملف التقويم غير صالح.";
export const CALENDAR_IMPORT_TYPE_MESSAGE = "نوع الملف غير مسموح. يُقبل PDF وJPG وJPEG وPNG فقط.";
export const CALENDAR_IMPORT_TIMEOUT_MESSAGE = "انتهى وقت معالجة الملف. حاول مرة أخرى.";

export const CALENDAR_IMPORT_ALLOWED_MIME = Object.freeze([
  "application/pdf",
  "image/jpeg",
  "image/png",
] as const);

export type CalendarImportMime = (typeof CALENDAR_IMPORT_ALLOWED_MIME)[number];

const DENIED_EXTENSIONS = new Set([
  "svg",
  "html",
  "htm",
  "xml",
  "js",
  "webp",
  "gif",
  "heic",
  "heif",
  "zip",
  "exe",
]);

const MIME_EXTENSIONS: Record<CalendarImportMime, readonly string[]> = {
  "application/pdf": ["pdf"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
};

export function decodeCalendarImportBase64(contentBase64: string): Uint8Array {
  const trimmed = contentBase64.trim();
  const payload =
    trimmed.startsWith("data:") && trimmed.includes(",")
      ? trimmed.slice(trimmed.indexOf(",") + 1)
      : trimmed;
  if (!payload) {
    throw new Error(CALENDAR_IMPORT_INVALID_MESSAGE);
  }
  if (payload.length > MAX_CALENDAR_IMPORT_BASE64_CHARS) {
    throw new Error(CALENDAR_IMPORT_TOO_LARGE_MESSAGE);
  }
  const buf = Buffer.from(payload, "base64");
  if (buf.byteLength === 0) {
    throw new Error(CALENDAR_IMPORT_INVALID_MESSAGE);
  }
  if (buf.byteLength > MAX_CALENDAR_IMPORT_BYTES) {
    throw new Error(CALENDAR_IMPORT_TOO_LARGE_MESSAGE);
  }
  return new Uint8Array(buf);
}

export function sniffCalendarImportMime(bytes: Uint8Array): CalendarImportMime | null {
  if (bytes.byteLength < 4) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return "application/pdf";
  }
  return null;
}

export function validateCalendarImportFile(input: {
  bytes: Uint8Array;
  declaredMime?: string;
  declaredName?: string;
}): { mime: CalendarImportMime } {
  if (input.bytes.byteLength === 0) {
    throw new Error(CALENDAR_IMPORT_INVALID_MESSAGE);
  }
  if (input.bytes.byteLength > MAX_CALENDAR_IMPORT_BYTES) {
    throw new Error(CALENDAR_IMPORT_TOO_LARGE_MESSAGE);
  }

  const sniffed = sniffCalendarImportMime(input.bytes);
  if (!sniffed) {
    throw new Error(CALENDAR_IMPORT_TYPE_MESSAGE);
  }

  if (input.declaredMime) {
    const declared = normalizeMime(input.declaredMime);
    if (declared !== sniffed) {
      throw new Error(CALENDAR_IMPORT_TYPE_MESSAGE);
    }
  }

  const ext = extensionFromName(input.declaredName);
  if (ext) {
    if (DENIED_EXTENSIONS.has(ext)) {
      throw new Error(CALENDAR_IMPORT_TYPE_MESSAGE);
    }
    if (!MIME_EXTENSIONS[sniffed].includes(ext)) {
      throw new Error(CALENDAR_IMPORT_TYPE_MESSAGE);
    }
  }

  return { mime: sniffed };
}

function normalizeMime(mime: string): string {
  const lower = mime.trim().toLowerCase().split(";")[0]?.trim() ?? "";
  if (lower === "image/jpg") return "image/jpeg";
  return lower;
}

function extensionFromName(name: string | undefined): string | null {
  if (!name) return null;
  const base = name.split(/[/\\]/).pop()?.trim() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot < 0 || dot === base.length - 1) return null;
  const ext = base
    .slice(dot + 1)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return ext || null;
}

export function isCalendarImportTimeoutError(err: unknown): boolean {
  if (err == null || typeof err !== "object") return false;
  const name =
    "name" in err && typeof (err as { name?: unknown }).name === "string"
      ? (err as { name: string }).name
      : "";
  if (name === "AbortError") return true;
  if (
    typeof DOMException !== "undefined" &&
    err instanceof DOMException &&
    err.code === DOMException.ABORT_ERR
  ) {
    return true;
  }
  if (err instanceof Error && err.cause != null) {
    return isCalendarImportTimeoutError(err.cause);
  }
  return false;
}
