import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  extractCurriculumFromPdfAuthorized,
  assertCurriculumPdfBase64WithinLimit,
  assertCurriculumPdfMagicBytes,
  isCurriculumGeminiTimeoutError,
} from "./curriculum-management.functions.ts";
import {
  acquireCurriculumPdfExtraction,
  CURRICULUM_PDF_ADMIN_BUSY_MESSAGE,
  CURRICULUM_PDF_COOLDOWN_MESSAGE,
  CURRICULUM_PDF_GLOBAL_BUSY_MESSAGE,
  getCurriculumPdfGuardSnapshotForTests,
  MAX_CONCURRENT_PDF_EXTRACTIONS_PER_ADMIN,
  MAX_GLOBAL_CONCURRENT_PDF_EXTRACTIONS,
  PDF_EXTRACTION_COOLDOWN_MS,
  resetCurriculumPdfExtractionGuardForTests,
  setCurriculumPdfGuardNowForTests,
} from "./curriculum-pdf-guard.ts";
import {
  CURRICULUM_PDF_INVALID_MESSAGE,
  CURRICULUM_PDF_MIN_BYTES,
  CURRICULUM_PDF_TIMEOUT_MESSAGE,
  CURRICULUM_PDF_TOO_LARGE_MESSAGE,
  GEMINI_EXTRACTION_TIMEOUT_MS,
  MAX_CURRICULUM_PDF_BASE64_CHARS,
  MAX_CURRICULUM_PDF_BYTES,
} from "./curriculum-pdf-limits.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const LIMITS_FILE = join(ROOT, "src/platform/curriculum/curriculum-pdf-limits.ts");
const FUNCTIONS_FILE = join(ROOT, "src/platform/curriculum/curriculum-management.functions.ts");
const PAGE_FILE = join(ROOT, "src/features/curriculum/components/curriculum-management-page.tsx");
const RECEIPT_FILE = join(ROOT, "src/features/billing/receipt.ts");
const GUARD_FILE = join(ROOT, "src/platform/curriculum/curriculum-pdf-guard.ts");

const ADMIN = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ADMIN_B = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const ADMIN_C = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const ADMIN_D = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const TEACHER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function mockRoleClient(role: "admin" | null): { client: never } {
  const terminal = {
    async maybeSingle() {
      return {
        data: role === "admin" ? { role: "admin" } : null,
        error: null,
      };
    },
  };
  const chain = {
    eq() {
      return {
        eq() {
          return terminal;
        },
        ...terminal,
      };
    },
  };
  return {
    client: {
      from() {
        return {
          select() {
            return chain;
          },
        };
      },
    } as never,
  };
}

function mockGeminiCounter(): {
  ai: { models: { generateContent: () => Promise<{ text: string }> } };
  calls: () => number;
} {
  let geminiCalls = 0;
  return {
    calls: () => geminiCalls,
    ai: {
      models: {
        async generateContent() {
          geminiCalls += 1;
          return { text: "{}" };
        },
      },
    },
  };
}

function createDeferred<T = void>(): {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function waitFor(predicate: () => boolean, label: string): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 0));
  }
  throw new Error(`timed out waiting for: ${label}`);
}

/** Minimal valid-looking base64 PDF header bytes (not a full PDF). */
function base64OfExactBytes(byteLength: number): string {
  const bytes = Buffer.alloc(byteLength, 0x41);
  // PDF magic at start — matches billing sniff convention (%PDF).
  Buffer.from("%PDF-1.4").copy(bytes, 0);
  return bytes.toString("base64");
}

function base64OfRaw(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

const okExtraction = {
  grade: "الصف الخامس",
  subject: "رياضيات",
  lessons: [{ lessonTitle: "خصائص الضرب" }],
};

describe("curriculum PDF size constants", () => {
  it("derives Base64 ceiling from MAX_CURRICULUM_PDF_BYTES via 4 * ceil(N/3)", () => {
    assert.equal(MAX_CURRICULUM_PDF_BYTES, 10 * 1024 * 1024);
    assert.equal(MAX_CURRICULUM_PDF_BASE64_CHARS, 4 * Math.ceil(MAX_CURRICULUM_PDF_BYTES / 3));
  });
});

describe("assertCurriculumPdfMagicBytes", () => {
  it("1. accepts a valid PDF header", () => {
    assert.doesNotThrow(() => assertCurriculumPdfMagicBytes(Buffer.from("%PDF-1.4 sample")));
  });

  it("2. rejects PNG bytes", () => {
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    assert.throws(
      () => assertCurriculumPdfMagicBytes(png),
      (err: unknown) => err instanceof Error && err.message === CURRICULUM_PDF_INVALID_MESSAGE,
    );
  });

  it("3. rejects plain text bytes", () => {
    assert.throws(
      () => assertCurriculumPdfMagicBytes(Buffer.from("hello world")),
      (err: unknown) => err instanceof Error && err.message === CURRICULUM_PDF_INVALID_MESSAGE,
    );
  });

  it("4. rejects ZIP bytes", () => {
    const zip = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]);
    assert.throws(
      () => assertCurriculumPdfMagicBytes(zip),
      (err: unknown) => err instanceof Error && err.message === CURRICULUM_PDF_INVALID_MESSAGE,
    );
  });

  it("5. rejects a too-short buffer", () => {
    assert.throws(
      () => assertCurriculumPdfMagicBytes(Buffer.from("%PDF")),
      (err: unknown) => err instanceof Error && err.message === CURRICULUM_PDF_INVALID_MESSAGE,
    );
    assert.equal(CURRICULUM_PDF_MIN_BYTES, 5);
    assert.equal(Buffer.from("%PDF").byteLength, 4);
  });
});

describe("assertCurriculumPdfBase64WithinLimit", () => {
  it("A. accepts Base64 below the limit", () => {
    const payload = base64OfExactBytes(1024);
    assert.doesNotThrow(() => assertCurriculumPdfBase64WithinLimit(payload));
  });

  it("B. accepts Base64 that decodes to exactly MAX_CURRICULUM_PDF_BYTES", () => {
    const payload = base64OfExactBytes(MAX_CURRICULUM_PDF_BYTES);
    assert.ok(payload.length <= MAX_CURRICULUM_PDF_BASE64_CHARS);
    assert.equal(Buffer.from(payload, "base64").byteLength, MAX_CURRICULUM_PDF_BYTES);
    assert.doesNotThrow(() => assertCurriculumPdfBase64WithinLimit(payload));
  });

  it("C. rejects Base64 that decodes above MAX_CURRICULUM_PDF_BYTES", () => {
    const payload = base64OfExactBytes(MAX_CURRICULUM_PDF_BYTES + 1);
    assert.throws(
      () => assertCurriculumPdfBase64WithinLimit(payload),
      (err: unknown) => err instanceof Error && err.message === CURRICULUM_PDF_TOO_LARGE_MESSAGE,
    );
  });

  it("rejects Base64 character length above the derived ceiling", () => {
    const oversized = "A".repeat(MAX_CURRICULUM_PDF_BASE64_CHARS + 1);
    assert.throws(
      () => assertCurriculumPdfBase64WithinLimit(oversized),
      (err: unknown) => err instanceof Error && err.message === CURRICULUM_PDF_TOO_LARGE_MESSAGE,
    );
  });

  it("rejects non-PDF Base64 after size checks with stable invalid message", () => {
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    assert.throws(
      () => assertCurriculumPdfBase64WithinLimit(base64OfRaw(png)),
      (err: unknown) => err instanceof Error && err.message === CURRICULUM_PDF_INVALID_MESSAGE,
    );
  });
});

describe("extractCurriculumFromPdfAuthorized size + auth + magic", () => {
  beforeEach(() => {
    resetCurriculumPdfExtractionGuardForTests();
  });

  it("D. oversized input does not call Gemini", async () => {
    const { client } = mockRoleClient("admin");
    const { ai, calls } = mockGeminiCounter();

    await assert.rejects(
      () =>
        extractCurriculumFromPdfAuthorized(
          client,
          ADMIN,
          base64OfExactBytes(MAX_CURRICULUM_PDF_BYTES + 1),
          { ai },
        ),
      (err: unknown) => err instanceof Error && err.message === CURRICULUM_PDF_TOO_LARGE_MESSAGE,
    );
    assert.equal(calls(), 0);
  });

  it("E. non-admin is rejected before Gemini", async () => {
    const { client } = mockRoleClient(null);
    const { ai, calls } = mockGeminiCounter();

    await assert.rejects(
      () =>
        extractCurriculumFromPdfAuthorized(client, TEACHER, base64OfExactBytes(64), {
          ai,
        }),
      (err: unknown) => err instanceof Error && err.message.includes("Administrators"),
    );
    assert.equal(calls(), 0);
  });

  it("6. non-PDF rejection occurs before Gemini (calls = 0)", async () => {
    const { client } = mockRoleClient("admin");
    const { ai, calls } = mockGeminiCounter();
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);

    await assert.rejects(
      () => extractCurriculumFromPdfAuthorized(client, ADMIN, base64OfRaw(png), { ai }),
      (err: unknown) => err instanceof Error && err.message === CURRICULUM_PDF_INVALID_MESSAGE,
    );
    assert.equal(calls(), 0);

    const textPayload = base64OfRaw(Buffer.from("not a pdf at all!!"));
    await assert.rejects(
      () => extractCurriculumFromPdfAuthorized(client, ADMIN, textPayload, { ai }),
      (err: unknown) => err instanceof Error && err.message === CURRICULUM_PDF_INVALID_MESSAGE,
    );
    assert.equal(calls(), 0);

    const zip = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]);
    await assert.rejects(
      () => extractCurriculumFromPdfAuthorized(client, ADMIN, base64OfRaw(zip), { ai }),
      (err: unknown) => err instanceof Error && err.message === CURRICULUM_PDF_INVALID_MESSAGE,
    );
    assert.equal(calls(), 0);
    assert.equal(getCurriculumPdfGuardSnapshotForTests().globalInFlight, 0);
  });

  it("F. admin + valid size preserves extraction via mocked Gemini", async () => {
    const { client } = mockRoleClient("admin");
    let geminiCalls = 0;
    const ai = {
      models: {
        async generateContent(input: { contents: unknown; config?: unknown }) {
          geminiCalls += 1;
          const contents = input.contents as Array<Record<string, unknown>>;
          assert.ok(Array.isArray(contents));
          assert.equal(
            (contents[0] as { inlineData?: { mimeType?: string } }).inlineData?.mimeType,
            "application/pdf",
          );
          const config = input.config as {
            httpOptions?: { timeout?: number; retryOptions?: unknown };
          };
          assert.equal(config.httpOptions?.timeout, GEMINI_EXTRACTION_TIMEOUT_MS);
          assert.equal(config.httpOptions?.retryOptions, undefined);
          return { text: JSON.stringify(okExtraction) };
        },
      },
    };

    const result = await extractCurriculumFromPdfAuthorized(
      client,
      ADMIN,
      base64OfExactBytes(2048),
      { ai },
    );
    assert.equal(geminiCalls, 1);
    assert.deepEqual(result, okExtraction);
    assert.equal(getCurriculumPdfGuardSnapshotForTests().globalInFlight, 0);
  });

  it("B. ordinary Gemini error preserves existing failure wrapping", async () => {
    const { client } = mockRoleClient("admin");
    let geminiCalls = 0;
    const ai = {
      models: {
        async generateContent() {
          geminiCalls += 1;
          throw new Error("provider boom: quota xyz");
        },
      },
    };

    await assert.rejects(
      () =>
        extractCurriculumFromPdfAuthorized(client, ADMIN, base64OfExactBytes(128), {
          ai,
        }),
      (err: unknown) =>
        err instanceof Error &&
        err.message === "Failed to extract curriculum details: provider boom: quota xyz",
    );
    assert.equal(geminiCalls, 1);
    assert.equal(getCurriculumPdfGuardSnapshotForTests().globalInFlight, 0);
  });

  it("C. Gemini AbortError maps to stable timeout message (no raw details)", async () => {
    const { client } = mockRoleClient("admin");
    let geminiCalls = 0;
    const ai = {
      models: {
        async generateContent(input: { config?: unknown }) {
          geminiCalls += 1;
          const config = input.config as { httpOptions?: { timeout?: number } };
          assert.equal(config.httpOptions?.timeout, GEMINI_EXTRACTION_TIMEOUT_MS);
          throw new DOMException("This operation was aborted", "AbortError");
        },
      },
    };

    await assert.rejects(
      () =>
        extractCurriculumFromPdfAuthorized(client, ADMIN, base64OfExactBytes(128), {
          ai,
        }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.equal(err.message, CURRICULUM_PDF_TIMEOUT_MESSAGE);
        assert.doesNotMatch(err.message, /AbortError|aborted|provider|Gemini|timeout/i);
        return true;
      },
    );
    assert.equal(geminiCalls, 1);
    assert.equal(getCurriculumPdfGuardSnapshotForTests().globalInFlight, 0);
  });

  it("D/E. hanging mock still receives timeout config; abort path call count = 1", async () => {
    const { client } = mockRoleClient("admin");
    let geminiCalls = 0;
    let seenTimeout: number | undefined;
    const ai = {
      models: {
        async generateContent(input: { config?: unknown }) {
          geminiCalls += 1;
          const config = input.config as {
            httpOptions?: { timeout?: number; retryOptions?: unknown };
          };
          seenTimeout = config.httpOptions?.timeout;
          assert.equal(config.httpOptions?.retryOptions, undefined);
          // Simulate SDK timeout abort without waiting 90s or using a real network.
          throw new DOMException("This operation was aborted", "AbortError");
        },
      },
    };

    await assert.rejects(
      () =>
        extractCurriculumFromPdfAuthorized(client, ADMIN, base64OfExactBytes(256), {
          ai,
        }),
      (err: unknown) => err instanceof Error && err.message === CURRICULUM_PDF_TIMEOUT_MESSAGE,
    );
    assert.equal(seenTimeout, GEMINI_EXTRACTION_TIMEOUT_MS);
    assert.equal(geminiCalls, 1);
    assert.equal(getCurriculumPdfGuardSnapshotForTests().globalInFlight, 0);
  });
});

describe("curriculum PDF extraction concurrency + cooldown guard", () => {
  beforeEach(() => {
    resetCurriculumPdfExtractionGuardForTests();
  });

  it("A. first admin request acquires successfully", () => {
    assert.equal(MAX_CONCURRENT_PDF_EXTRACTIONS_PER_ADMIN, 1);
    assert.equal(MAX_GLOBAL_CONCURRENT_PDF_EXTRACTIONS, 3);
    assert.equal(PDF_EXTRACTION_COOLDOWN_MS, 30_000);
    const acquired = acquireCurriculumPdfExtraction(ADMIN);
    assert.equal(acquired.ok, true);
    if (!acquired.ok) return;
    assert.equal(getCurriculumPdfGuardSnapshotForTests().globalInFlight, 1);
    acquired.release();
    assert.equal(getCurriculumPdfGuardSnapshotForTests().globalInFlight, 0);
  });

  it("B/L. same-admin concurrent second request is admin_busy; Gemini=0; no extra global slot", async () => {
    const { client } = mockRoleClient("admin");
    const hold = createDeferred<void>();
    let firstCalls = 0;
    let secondCalls = 0;

    const firstAi = {
      models: {
        async generateContent() {
          firstCalls += 1;
          await hold.promise;
          return { text: JSON.stringify(okExtraction) };
        },
      },
    };
    const secondAi = {
      models: {
        async generateContent() {
          secondCalls += 1;
          return { text: JSON.stringify(okExtraction) };
        },
      },
    };

    const first = extractCurriculumFromPdfAuthorized(client, ADMIN, base64OfExactBytes(64), {
      ai: firstAi,
    });
    await waitFor(() => firstCalls === 1, "first Gemini call");
    assert.equal(getCurriculumPdfGuardSnapshotForTests().globalInFlight, 1);

    await assert.rejects(
      () =>
        extractCurriculumFromPdfAuthorized(client, ADMIN, base64OfExactBytes(64), {
          ai: secondAi,
        }),
      (err: unknown) => err instanceof Error && err.message === CURRICULUM_PDF_ADMIN_BUSY_MESSAGE,
    );
    assert.equal(secondCalls, 0);
    assert.equal(getCurriculumPdfGuardSnapshotForTests().globalInFlight, 1);

    hold.resolve();
    await first;
    assert.equal(getCurriculumPdfGuardSnapshotForTests().globalInFlight, 0);
  });

  it("C/D/E/M. three admins fill global cap; fourth is global_busy; isolation works", async () => {
    const { client } = mockRoleClient("admin");
    const hold = createDeferred<void>();
    const callsByAdmin = new Map<string, number>();

    function holdingAi(adminId: string) {
      return {
        models: {
          async generateContent() {
            callsByAdmin.set(adminId, (callsByAdmin.get(adminId) ?? 0) + 1);
            await hold.promise;
            return { text: JSON.stringify(okExtraction) };
          },
        },
      };
    }

    const rejectedAi = mockGeminiCounter();

    const p1 = extractCurriculumFromPdfAuthorized(client, ADMIN, base64OfExactBytes(32), {
      ai: holdingAi(ADMIN),
    });
    const p2 = extractCurriculumFromPdfAuthorized(client, ADMIN_B, base64OfExactBytes(32), {
      ai: holdingAi(ADMIN_B),
    });
    const p3 = extractCurriculumFromPdfAuthorized(client, ADMIN_C, base64OfExactBytes(32), {
      ai: holdingAi(ADMIN_C),
    });

    await waitFor(
      () => getCurriculumPdfGuardSnapshotForTests().globalInFlight === 3,
      "global in-flight = 3",
    );

    // Admin A busy does not block admin B when capacity remains — already proven by p2.
    assert.equal(callsByAdmin.get(ADMIN_B), 1);

    await assert.rejects(
      () =>
        extractCurriculumFromPdfAuthorized(client, ADMIN_D, base64OfExactBytes(32), {
          ai: rejectedAi.ai,
        }),
      (err: unknown) => err instanceof Error && err.message === CURRICULUM_PDF_GLOBAL_BUSY_MESSAGE,
    );
    assert.equal(rejectedAi.calls(), 0);
    // Rejected global_busy must not leave ADMIN_D in-flight.
    assert.equal(getCurriculumPdfGuardSnapshotForTests().adminInFlight.includes(ADMIN_D), false);
    assert.equal(getCurriculumPdfGuardSnapshotForTests().globalInFlight, 3);

    hold.resolve();
    await Promise.all([p1, p2, p3]);
    assert.equal(getCurriculumPdfGuardSnapshotForTests().globalInFlight, 0);
  });

  it("F. release after success allows later acquire after cooldown", async () => {
    const { client } = mockRoleClient("admin");
    let now = 1_000_000;
    setCurriculumPdfGuardNowForTests(() => now);
    const { ai, calls } = mockGeminiCounter();

    await extractCurriculumFromPdfAuthorized(client, ADMIN, base64OfExactBytes(64), { ai });
    assert.equal(calls(), 1);
    assert.equal(getCurriculumPdfGuardSnapshotForTests().globalInFlight, 0);

    now += PDF_EXTRACTION_COOLDOWN_MS;
    await extractCurriculumFromPdfAuthorized(client, ADMIN, base64OfExactBytes(64), { ai });
    assert.equal(calls(), 2);
  });

  it("G. release after ordinary Gemini error", async () => {
    const { client } = mockRoleClient("admin");
    const ai = {
      models: {
        async generateContent() {
          throw new Error("ordinary failure");
        },
      },
    };
    await assert.rejects(() =>
      extractCurriculumFromPdfAuthorized(client, ADMIN, base64OfExactBytes(64), { ai }),
    );
    assert.equal(getCurriculumPdfGuardSnapshotForTests().globalInFlight, 0);
    assert.equal(getCurriculumPdfGuardSnapshotForTests().adminInFlight.includes(ADMIN), false);
  });

  it("H. release after timeout", async () => {
    const { client } = mockRoleClient("admin");
    const ai = {
      models: {
        async generateContent() {
          throw new DOMException("This operation was aborted", "AbortError");
        },
      },
    };
    await assert.rejects(
      () => extractCurriculumFromPdfAuthorized(client, ADMIN, base64OfExactBytes(64), { ai }),
      (err: unknown) => err instanceof Error && err.message === CURRICULUM_PDF_TIMEOUT_MESSAGE,
    );
    assert.equal(getCurriculumPdfGuardSnapshotForTests().globalInFlight, 0);
  });

  it("I. release after unexpected exception", async () => {
    const { client } = mockRoleClient("admin");
    const ai = {
      models: {
        async generateContent() {
          throw "string-boom";
        },
      },
    };
    await assert.rejects(() =>
      extractCurriculumFromPdfAuthorized(client, ADMIN, base64OfExactBytes(64), { ai }),
    );
    assert.equal(getCurriculumPdfGuardSnapshotForTests().globalInFlight, 0);
  });

  it("J. cooldown rejects immediate retry after release; rejected does not change lastStartAt", async () => {
    const { client } = mockRoleClient("admin");
    const now = 5_000_000;
    setCurriculumPdfGuardNowForTests(() => now);
    const { ai, calls } = mockGeminiCounter();

    await extractCurriculumFromPdfAuthorized(client, ADMIN, base64OfExactBytes(64), { ai });
    const lastAfterAccept = getCurriculumPdfGuardSnapshotForTests().lastStartAt[ADMIN];
    assert.equal(lastAfterAccept, 5_000_000);

    await assert.rejects(
      () => extractCurriculumFromPdfAuthorized(client, ADMIN, base64OfExactBytes(64), { ai }),
      (err: unknown) => err instanceof Error && err.message === CURRICULUM_PDF_COOLDOWN_MESSAGE,
    );
    assert.equal(calls(), 1);
    assert.equal(getCurriculumPdfGuardSnapshotForTests().lastStartAt[ADMIN], lastAfterAccept);
  });

  it("K. cooldown expiry allows acquire again", async () => {
    const { client } = mockRoleClient("admin");
    let now = 9_000_000;
    setCurriculumPdfGuardNowForTests(() => now);
    const { ai, calls } = mockGeminiCounter();

    await extractCurriculumFromPdfAuthorized(client, ADMIN, base64OfExactBytes(64), { ai });
    now += PDF_EXTRACTION_COOLDOWN_MS - 1;
    await assert.rejects(
      () => extractCurriculumFromPdfAuthorized(client, ADMIN, base64OfExactBytes(64), { ai }),
      (err: unknown) => err instanceof Error && err.message === CURRICULUM_PDF_COOLDOWN_MESSAGE,
    );
    now += 1;
    await extractCurriculumFromPdfAuthorized(client, ADMIN, base64OfExactBytes(64), { ai });
    assert.equal(calls(), 2);
  });

  it("R. release is idempotent (exactly-once decrement)", () => {
    const acquired = acquireCurriculumPdfExtraction(ADMIN);
    assert.ok(acquired.ok);
    if (!acquired.ok) return;
    acquired.release();
    acquired.release();
    assert.equal(getCurriculumPdfGuardSnapshotForTests().globalInFlight, 0);
  });
});

describe("isCurriculumGeminiTimeoutError", () => {
  it("detects AbortError / DOMException ABORT_ERR and ignores ordinary errors", () => {
    assert.equal(isCurriculumGeminiTimeoutError(new DOMException("aborted", "AbortError")), true);
    const named = new Error("This operation was aborted");
    named.name = "AbortError";
    assert.equal(isCurriculumGeminiTimeoutError(named), true);
    assert.equal(isCurriculumGeminiTimeoutError(new Error("network down")), false);
    assert.equal(isCurriculumGeminiTimeoutError(new Error("Request timeout from edge")), false);
    assert.equal(GEMINI_EXTRACTION_TIMEOUT_MS, 90_000);
  });
});

describe("curriculum PDF size source contracts", () => {
  it("server validates size + magic before getGemini and keeps assertAdmin", () => {
    const src = readFileSync(FUNCTIONS_FILE, "utf8");
    assert.match(src, /assertCurriculumPdfBase64WithinLimit/);
    assert.match(src, /assertCurriculumPdfMagicBytes/);
    assert.match(src, /MAX_CURRICULUM_PDF_BASE64_CHARS/);
    assert.match(src, /GEMINI_EXTRACTION_TIMEOUT_MS/);
    assert.match(src, /httpOptions:\s*\{\s*timeout:\s*GEMINI_EXTRACTION_TIMEOUT_MS/);
    assert.match(src, /acquireCurriculumPdfExtraction/);
    assert.doesNotMatch(src, /retryOptions/);
    assert.match(src, /await assertAdmin/);

    const authorized = src.slice(
      src.indexOf("export async function extractCurriculumFromPdfAuthorized"),
      src.indexOf("export const extractCurriculumFromPdf"),
    );
    const adminIdx = authorized.indexOf("await assertAdmin");
    const sizeIdx = authorized.indexOf("assertCurriculumPdfBase64WithinLimit");
    const guardIdx = authorized.indexOf("acquireCurriculumPdfExtraction");
    const geminiIdx = authorized.indexOf("getGemini");
    const generateIdx = authorized.indexOf("generateContent");
    const timeoutIdx = authorized.indexOf("GEMINI_EXTRACTION_TIMEOUT_MS");
    const finallyIdx = authorized.indexOf("finally");
    assert.ok(adminIdx >= 0 && sizeIdx > adminIdx);
    assert.ok(guardIdx > sizeIdx);
    assert.ok(guardIdx < generateIdx);
    assert.ok(sizeIdx < generateIdx);
    assert.ok(timeoutIdx > generateIdx || timeoutIdx > sizeIdx);
    assert.ok(finallyIdx > generateIdx);
    assert.ok(geminiIdx < 0 || sizeIdx < geminiIdx || generateIdx > sizeIdx);

    const assertFn = src.slice(
      src.indexOf("export function assertCurriculumPdfBase64WithinLimit"),
      src.indexOf("// Schema for curriculum save inputs"),
    );
    const decodeSizeIdx = assertFn.indexOf("bytes.byteLength > MAX_CURRICULUM_PDF_BYTES");
    const magicIdx = assertFn.indexOf("assertCurriculumPdfMagicBytes");
    assert.ok(decodeSizeIdx >= 0 && magicIdx > decodeSizeIdx);

    const guardSrc = readFileSync(GUARD_FILE, "utf8");
    assert.match(guardSrc, /MAX_CONCURRENT_PDF_EXTRACTIONS_PER_ADMIN = 1/);
    assert.match(guardSrc, /MAX_GLOBAL_CONCURRENT_PDF_EXTRACTIONS = 3/);
    assert.match(guardSrc, /PDF_EXTRACTION_COOLDOWN_MS = 30_000/);
  });

  it("magic bytes match billing receipt PDF sniff convention", () => {
    const limits = readFileSync(LIMITS_FILE, "utf8");
    const receipt = readFileSync(RECEIPT_FILE, "utf8");
    assert.match(limits, /0x25,\s*0x50,\s*0x44,\s*0x46/);
    assert.match(limits, /GEMINI_EXTRACTION_TIMEOUT_MS = 90_000/);
    assert.match(
      receipt,
      /0x25 && bytes\[1\] === 0x50 && bytes\[2\] === 0x44 && bytes\[3\] === 0x46/,
    );
  });

  it("G/H. client rejects oversized files before FileReader and extract call", () => {
    const src = readFileSync(PAGE_FILE, "utf8");
    assert.match(src, /MAX_CURRICULUM_PDF_BYTES/);
    assert.match(src, /CURRICULUM_PDF_TOO_LARGE_MESSAGE/);
    assert.match(src, /file\.size > MAX_CURRICULUM_PDF_BYTES/);

    const handler = src.slice(
      src.indexOf("const handlePdfUpload"),
      src.indexOf("const updateLessonField"),
    );
    const sizeIdx = handler.indexOf("file.size > MAX_CURRICULUM_PDF_BYTES");
    const readerIdx = handler.indexOf("new FileReader");
    const readIdx = handler.indexOf("readAsDataURL");
    const mutateIdx = handler.indexOf("extractMutation.mutate");
    const earlyReturnIdx = handler.indexOf("return;", sizeIdx);
    assert.ok(sizeIdx >= 0 && readerIdx > sizeIdx && readIdx > sizeIdx);
    assert.ok(earlyReturnIdx > sizeIdx && earlyReturnIdx < readerIdx);
    // mutate is only registered inside onload after the size gate.
    assert.ok(mutateIdx > sizeIdx && mutateIdx > readerIdx);
  });

  it("I. UI copy states 10 MB and no longer claims 20 MB for this upload", () => {
    const src = readFileSync(PAGE_FILE, "utf8");
    assert.match(src, /بحد أقصى 10 ميجابايت/);
    assert.doesNotMatch(src, /بحد أقصى 20 ميغابايت/);
    const limits = readFileSync(LIMITS_FILE, "utf8");
    assert.match(limits, /MAX_CURRICULUM_PDF_BYTES = 10 \* 1024 \* 1024/);
  });
});
