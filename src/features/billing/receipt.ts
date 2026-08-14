import { BillingError } from "./types";

export const RECEIPT_BUCKET = "billing-receipts";
export const RECEIPT_MAX_BYTES = 5 * 1024 * 1024;
export const RECEIPT_SIGNED_URL_TTL_SECONDS = 90;
/** Base64 ceiling slightly above 5 MB so decoded size remains the real gate. */
export const RECEIPT_MAX_BASE64_CHARS = 7_340_032;

const MIME_EXTENSIONS: Record<string, readonly string[]> = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
  "application/pdf": ["pdf"],
};

const CANONICAL_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

const DENIED_EXTENSIONS = new Set([
  "svg",
  "html",
  "htm",
  "xml",
  "js",
  "mjs",
  "exe",
  "dll",
  "so",
  "zip",
  "gz",
  "heic",
  "heif",
  "bin",
  "sh",
  "bat",
  "cmd",
  "com",
]);

export type ReceiptStorage = {
  upload(path: string, body: Uint8Array, contentType: string): Promise<void>;
  remove(path: string): Promise<void>;
  createSignedUrl(path: string, expiresIn: number): Promise<string>;
};

type StorageClient = {
  storage: {
    from: (bucket: string) => {
      upload: (
        path: string,
        body: Uint8Array,
        options?: { contentType?: string; upsert?: boolean },
      ) => Promise<{ error: { message: string } | null }>;
      remove: (paths: string[]) => Promise<{ error: { message: string } | null }>;
      createSignedUrl: (
        path: string,
        expiresIn: number,
      ) => Promise<{ data: { signedUrl?: string } | null; error: { message: string } | null }>;
    };
  };
};

export function createSupabaseReceiptStorage(client: StorageClient): ReceiptStorage {
  const bucket = client.storage.from(RECEIPT_BUCKET);
  return {
    async upload(path, body, contentType) {
      const { error } = await bucket.upload(path, body, {
        contentType,
        upsert: false,
      });
      if (error) {
        throw new BillingError("INVALID_RECEIPT", "تعذر رفع الإيصال. حاول مرة أخرى.");
      }
    },
    async remove(path) {
      const { error } = await bucket.remove([path]);
      if (error) throw new Error(error.message);
    },
    async createSignedUrl(path, expiresIn) {
      const { data, error } = await bucket.createSignedUrl(path, expiresIn);
      if (error || !data?.signedUrl) {
        throw new BillingError("INVALID_PAYMENT", "تعذر عرض الإيصال.");
      }
      return data.signedUrl;
    },
  };
}

export function decodeReceiptBase64(contentBase64: string): Uint8Array {
  const trimmed = contentBase64.trim();
  const payload =
    trimmed.startsWith("data:") && trimmed.includes(",")
      ? trimmed.slice(trimmed.indexOf(",") + 1)
      : trimmed;
  if (!payload || payload.length > RECEIPT_MAX_BASE64_CHARS) {
    throw new BillingError("INVALID_RECEIPT", "حجم الملف يجب ألا يتجاوز 5 ميغابايت.");
  }
  const buf = Buffer.from(payload, "base64");
  if (buf.byteLength === 0) {
    throw new BillingError("INVALID_RECEIPT", "تعذر قراءة الملف.");
  }
  return new Uint8Array(buf);
}

export function generateReceiptObjectPath(userId: string, paymentId: string, ext: string): string {
  return `${userId}/${paymentId}/${crypto.randomUUID()}.${ext}`;
}

export function isOwnedReceiptPath(userId: string, path: string): boolean {
  const trimmed = path.trim();
  if (!trimmed || trimmed.includes("..") || trimmed.startsWith("/") || trimmed.includes("\\")) {
    return false;
  }
  return trimmed.startsWith(`${userId}/`);
}

export function validateReceiptFile(input: {
  bytes: Uint8Array;
  declaredMime?: string;
  declaredName?: string;
}): { mime: string; ext: string } {
  if (input.bytes.byteLength === 0) {
    throw new BillingError("INVALID_RECEIPT", "الملف فارغ.");
  }
  if (input.bytes.byteLength > RECEIPT_MAX_BYTES) {
    throw new BillingError("INVALID_RECEIPT", "حجم الملف يجب ألا يتجاوز 5 ميغابايت.");
  }

  const sniffed = sniffReceiptMime(input.bytes);
  if (!sniffed) {
    throw new BillingError(
      "INVALID_RECEIPT",
      "نوع الملف غير مسموح. يُقبل JPEG وPNG وWebP وPDF فقط.",
    );
  }

  if (input.declaredMime) {
    const declared = normalizeMime(input.declaredMime);
    if (declared !== sniffed) {
      throw new BillingError("INVALID_RECEIPT", "نوع الملف لا يطابق محتواه.");
    }
  }

  const extFromName = extensionFromName(input.declaredName);
  if (extFromName) {
    if (DENIED_EXTENSIONS.has(extFromName)) {
      throw new BillingError("INVALID_RECEIPT", "امتداد الملف غير مسموح.");
    }
    const allowed = MIME_EXTENSIONS[sniffed];
    if (!allowed?.includes(extFromName)) {
      throw new BillingError("INVALID_RECEIPT", "امتداد الملف لا يطابق نوعه.");
    }
    return { mime: sniffed, ext: extFromName === "jpeg" ? "jpg" : extFromName };
  }

  return { mime: sniffed, ext: CANONICAL_EXT[sniffed] ?? "bin" };
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

function sniffReceiptMime(bytes: Uint8Array): string | null {
  if (bytes.byteLength < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return "application/pdf";
  }
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}
