import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  extractCurriculumFromPdfAuthorized,
  assertCurriculumPdfBase64WithinLimit,
} from "./curriculum-management.functions.ts";
import {
  CURRICULUM_PDF_TOO_LARGE_MESSAGE,
  MAX_CURRICULUM_PDF_BASE64_CHARS,
  MAX_CURRICULUM_PDF_BYTES,
} from "./curriculum-pdf-limits.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const LIMITS_FILE = join(ROOT, "src/platform/curriculum/curriculum-pdf-limits.ts");
const FUNCTIONS_FILE = join(ROOT, "src/platform/curriculum/curriculum-management.functions.ts");
const PAGE_FILE = join(ROOT, "src/features/curriculum/components/curriculum-management-page.tsx");

const ADMIN = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
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

/** Minimal valid-looking base64 PDF header bytes (not a full PDF). */
function base64OfExactBytes(byteLength: number): string {
  const bytes = Buffer.alloc(byteLength, 0x41);
  // PDF-ish magic at start so payload is non-empty meaningful binary.
  Buffer.from("%PDF-1.4").copy(bytes, 0);
  return bytes.toString("base64");
}

describe("curriculum PDF size constants", () => {
  it("derives Base64 ceiling from MAX_CURRICULUM_PDF_BYTES via 4 * ceil(N/3)", () => {
    assert.equal(MAX_CURRICULUM_PDF_BYTES, 10 * 1024 * 1024);
    assert.equal(MAX_CURRICULUM_PDF_BASE64_CHARS, 4 * Math.ceil(MAX_CURRICULUM_PDF_BYTES / 3));
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
});

describe("extractCurriculumFromPdfAuthorized size + auth", () => {
  it("D. oversized input does not call Gemini", async () => {
    const { client } = mockRoleClient("admin");
    let geminiCalls = 0;
    const ai = {
      models: {
        async generateContent() {
          geminiCalls += 1;
          return { text: "{}" };
        },
      },
    };

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
    assert.equal(geminiCalls, 0);
  });

  it("E. non-admin is rejected before Gemini", async () => {
    const { client } = mockRoleClient(null);
    let geminiCalls = 0;
    const ai = {
      models: {
        async generateContent() {
          geminiCalls += 1;
          return { text: "{}" };
        },
      },
    };

    await assert.rejects(
      () =>
        extractCurriculumFromPdfAuthorized(client, TEACHER, base64OfExactBytes(64), {
          ai,
        }),
      (err: unknown) => err instanceof Error && err.message.includes("Administrators"),
    );
    assert.equal(geminiCalls, 0);
  });

  it("F. admin + valid size preserves extraction via mocked Gemini", async () => {
    const { client } = mockRoleClient("admin");
    let geminiCalls = 0;
    const extracted = {
      grade: "الصف الخامس",
      subject: "رياضيات",
      lessons: [{ lessonTitle: "خصائص الضرب" }],
    };
    const ai = {
      models: {
        async generateContent(input: { contents: unknown }) {
          geminiCalls += 1;
          const contents = input.contents as Array<Record<string, unknown>>;
          assert.ok(Array.isArray(contents));
          assert.equal(
            (contents[0] as { inlineData?: { mimeType?: string } }).inlineData?.mimeType,
            "application/pdf",
          );
          return { text: JSON.stringify(extracted) };
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
    assert.deepEqual(result, extracted);
  });
});

describe("curriculum PDF size source contracts", () => {
  it("server validates size before getGemini and keeps assertAdmin", () => {
    const src = readFileSync(FUNCTIONS_FILE, "utf8");
    assert.match(src, /assertCurriculumPdfBase64WithinLimit/);
    assert.match(src, /MAX_CURRICULUM_PDF_BASE64_CHARS/);
    assert.match(src, /await assertAdmin/);

    const authorized = src.slice(
      src.indexOf("export async function extractCurriculumFromPdfAuthorized"),
      src.indexOf("export const extractCurriculumFromPdf"),
    );
    const adminIdx = authorized.indexOf("await assertAdmin");
    const sizeIdx = authorized.indexOf("assertCurriculumPdfBase64WithinLimit");
    const geminiIdx = authorized.indexOf("getGemini");
    const generateIdx = authorized.indexOf("generateContent");
    assert.ok(adminIdx >= 0 && sizeIdx > adminIdx);
    assert.ok(sizeIdx < generateIdx);
    assert.ok(geminiIdx < 0 || sizeIdx < geminiIdx || generateIdx > sizeIdx);
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
