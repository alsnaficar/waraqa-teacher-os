import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { assertAdmin } from "@/platform/auth/assert-admin";
import { requireSupabaseAuth } from "@/platform/database/supabase/auth-middleware";
import { getGemini } from "@/features/ai/providers/gemini";
import {
  adminArchiveCurriculum,
  adminDeleteCurriculumDraft,
  adminGetCurriculumLessons,
  adminListCurriculumFiles,
  adminPublishCurriculum,
  adminSaveCurriculumDraft,
} from "./curriculum-admin.ops.ts";
import {
  acquireCurriculumPdfExtraction,
  CURRICULUM_PDF_ADMIN_BUSY_MESSAGE,
  CURRICULUM_PDF_COOLDOWN_MESSAGE,
  CURRICULUM_PDF_GLOBAL_BUSY_MESSAGE,
  curriculumPdfGuardReasonMessage,
} from "./curriculum-pdf-guard.ts";
import {
  assertCurriculumPdfMagicBytes,
  CURRICULUM_PDF_INVALID_MESSAGE,
  CURRICULUM_PDF_TIMEOUT_MESSAGE,
  CURRICULUM_PDF_TOO_LARGE_MESSAGE,
  GEMINI_EXTRACTION_TIMEOUT_MS,
  isCurriculumGeminiTimeoutError,
  MAX_CURRICULUM_PDF_BASE64_CHARS,
  MAX_CURRICULUM_PDF_BYTES,
} from "./curriculum-pdf-limits.ts";

export { deserializeLessonNotes, serializeLessonNotes } from "./curriculum-lesson-notes.ts";
export {
  acquireCurriculumPdfExtraction,
  curriculumPdfGuardReasonMessage,
  CURRICULUM_PDF_ADMIN_BUSY_MESSAGE,
  CURRICULUM_PDF_COOLDOWN_MESSAGE,
  CURRICULUM_PDF_GLOBAL_BUSY_MESSAGE,
  MAX_CONCURRENT_PDF_EXTRACTIONS_PER_ADMIN,
  MAX_GLOBAL_CONCURRENT_PDF_EXTRACTIONS,
  PDF_EXTRACTION_COOLDOWN_MS,
  resetCurriculumPdfExtractionGuardForTests,
  setCurriculumPdfGuardNowForTests,
} from "./curriculum-pdf-guard.ts";
export {
  assertCurriculumPdfMagicBytes,
  CURRICULUM_PDF_INVALID_MESSAGE,
  CURRICULUM_PDF_TIMEOUT_MESSAGE,
  CURRICULUM_PDF_TOO_LARGE_MESSAGE,
  GEMINI_EXTRACTION_TIMEOUT_MS,
  isCurriculumGeminiTimeoutError,
  MAX_CURRICULUM_PDF_BASE64_CHARS,
  MAX_CURRICULUM_PDF_BYTES,
} from "./curriculum-pdf-limits.ts";

type AdminClient = Awaited<
  typeof import("@/platform/database/supabase/client.server")
>["supabaseAdmin"];

type GeminiLike = {
  models: {
    generateContent: (input: {
      model: string;
      contents: unknown;
      config?: unknown;
    }) => Promise<{ text?: string | null }>;
  };
};

export type CurriculumPdfExtractedLesson = {
  unitNumber?: string;
  unitName?: string;
  lessonNumber?: string;
  lessonTitle: string;
  objectives?: string;
  outcomes?: string;
  activities?: string;
  assessment?: string;
  periods?: string;
  notes?: string;
};

export type CurriculumPdfExtractionResult = {
  academicYear?: string;
  semester?: string;
  stage?: string;
  grade: string;
  subject: string;
  lessons: CurriculumPdfExtractedLesson[];
};

/**
 * Reject oversized, empty, or non-PDF Base64 payloads before any Gemini call.
 * Order: Base64 length → decode → decoded size → PDF magic bytes.
 * Throws an Error with a stable Arabic message (no internals).
 */
export function assertCurriculumPdfBase64WithinLimit(pdfBase64: string): void {
  const payload = pdfBase64.trim();
  if (!payload) {
    throw new Error(CURRICULUM_PDF_INVALID_MESSAGE);
  }

  if (payload.length > MAX_CURRICULUM_PDF_BASE64_CHARS) {
    throw new Error(CURRICULUM_PDF_TOO_LARGE_MESSAGE);
  }

  // Node Buffer.from(base64) does not throw on invalid alphabet; empty output
  // from a non-empty input is treated as invalid.
  const bytes = Buffer.from(payload, "base64");
  if (bytes.byteLength === 0) {
    throw new Error(CURRICULUM_PDF_INVALID_MESSAGE);
  }

  if (bytes.byteLength > MAX_CURRICULUM_PDF_BYTES) {
    throw new Error(CURRICULUM_PDF_TOO_LARGE_MESSAGE);
  }

  assertCurriculumPdfMagicBytes(bytes);
}

// Schema for curriculum save inputs
const LessonInput = z.object({
  id: z.string().optional(),
  unitNumber: z.string().optional().default(""),
  unitName: z.string().optional().default(""),
  lessonNumber: z.string().optional().default(""),
  lessonTitle: z.string(),
  objectives: z.string().optional().default(""),
  outcomes: z.string().optional().default(""),
  activities: z.string().optional().default(""),
  assessment: z.string().optional().default(""),
  periods: z.string().optional().default("1"),
  notes: z.string().optional().default(""),
});

const SaveCurriculumInput = z.object({
  id: z.string().optional(),
  originalName: z.string(),
  academicYear: z.string(),
  semester: z.string(),
  stage: z.string(),
  grade: z.string(),
  subject: z.string(),
  version: z.string().optional().default("1.0"),
  lessons: z.array(LessonInput),
});

const extractCurriculumPdfInputSchema = z.object({
  pdfBase64: z
    .string()
    .min(1)
    .max(MAX_CURRICULUM_PDF_BASE64_CHARS, "حجم ملف PDF يتجاوز الحد المسموح وهو 10 ميجابايت."),
});

const CURRICULUM_PDF_EXTRACTION_PROMPT = `You are an expert curriculum analyst for the Saudi Ministry of Education (وزارة التعليم).
Extract all lessons and syllabus metadata from the uploaded official curriculum PDF.

Ensure you extract the text in Arabic.
Please map or determine:
- academicYear (e.g. "1446" or "1445")
- semester (must map to string: "1" or "2" or "3")
- stage (must map to string: "primary" or "intermediate" or "secondary")
- grade (e.g. "الصف الخامس الابتدائي")
- subject (e.g. "الرياضيات")
- lessons: list of lessons containing:
  - unitNumber: Unit number/index (e.g., "1")
  - unitName: Unit name (e.g., "الضرب")
  - lessonNumber: Lesson number (e.g., "1-2")
  - lessonTitle: Title of the lesson (Arabic name, e.g. "خصائص الضرب")
  - objectives: Detailed learning objectives for this lesson
  - outcomes: Intended learning outcomes for this lesson
  - activities: Suggested teaching or learning activities
  - assessment: Suggested assessment strategy
  - periods: Number of class periods (e.g. "2")
  - notes: Extra notes or context


You MUST return valid JSON matching this schema structure. Do not wrap in markdown code blocks other than json.`;

/**
 * Admin-authorized PDF → Gemini extraction.
 * Size + magic-byte validation runs after assertAdmin and before any Gemini call.
 * Process-local concurrency/cooldown guard runs after validation and before Gemini.
 * Gemini generateContent is bounded by GEMINI_EXTRACTION_TIMEOUT_MS.
 */
export async function extractCurriculumFromPdfAuthorized(
  client: AdminClient,
  actorId: string,
  pdfBase64: string,
  deps: { ai?: GeminiLike } = {},
): Promise<CurriculumPdfExtractionResult> {
  await assertAdmin(client, actorId);
  assertCurriculumPdfBase64WithinLimit(pdfBase64);

  const guard = acquireCurriculumPdfExtraction(actorId);
  if (!guard.ok) {
    throw new Error(curriculumPdfGuardReasonMessage(guard.reason));
  }

  try {
    const ai = deps.ai ?? getGemini();
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          inlineData: {
            data: pdfBase64.trim(),
            mimeType: "application/pdf",
          },
        },
        CURRICULUM_PDF_EXTRACTION_PROMPT,
      ],
      config: {
        httpOptions: {
          timeout: GEMINI_EXTRACTION_TIMEOUT_MS,
        },
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            academicYear: { type: "STRING" },
            semester: { type: "STRING" },
            stage: { type: "STRING" },
            grade: { type: "STRING" },
            subject: { type: "STRING" },
            lessons: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  unitNumber: { type: "STRING" },
                  unitName: { type: "STRING" },
                  lessonNumber: { type: "STRING" },
                  lessonTitle: { type: "STRING" },
                  objectives: { type: "STRING" },
                  outcomes: { type: "STRING" },
                  activities: { type: "STRING" },
                  assessment: { type: "STRING" },
                  periods: { type: "STRING" },
                  notes: { type: "STRING" },
                },
                required: ["lessonTitle"],
              },
            },
          },
          required: ["grade", "subject", "lessons"],
        },
      },
    });

    const text = response.text?.trim() ?? "{}";
    return JSON.parse(text) as CurriculumPdfExtractionResult;
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      (err.message === CURRICULUM_PDF_TOO_LARGE_MESSAGE ||
        err.message === CURRICULUM_PDF_INVALID_MESSAGE ||
        err.message === CURRICULUM_PDF_TIMEOUT_MESSAGE ||
        err.message === CURRICULUM_PDF_ADMIN_BUSY_MESSAGE ||
        err.message === CURRICULUM_PDF_GLOBAL_BUSY_MESSAGE ||
        err.message === CURRICULUM_PDF_COOLDOWN_MESSAGE ||
        err.message.includes("حجم ملف PDF") ||
        err.message.includes("ملف PDF غير صالح"))
    ) {
      throw err;
    }
    if (isCurriculumGeminiTimeoutError(err)) {
      throw new Error(CURRICULUM_PDF_TIMEOUT_MESSAGE);
    }
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[curriculum-management] PDF extraction failed:", err);
    throw new Error(`Failed to extract curriculum details: ${errMsg}`);
  } finally {
    guard.release();
  }
}

// 1. Extract curriculum from PDF using Gemini
// Application-level size guards protect Gemini processing; they are not a
// transport-level HTTP body limit unless the host adds one separately.
export const extractCurriculumFromPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => extractCurriculumPdfInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/platform/database/supabase/client.server");
    return extractCurriculumFromPdfAuthorized(supabaseAdmin, context.userId, data.pdfBase64);
  });

// 2. Fetch all curriculum files (for the admin management UI)
export const getAdminCurriculumFiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/platform/database/supabase/client.server");
    return adminListCurriculumFiles(supabaseAdmin, {
      userId: context.userId,
      email: context.claims.email ?? "",
    });
  });

// 3. Fetch lessons for a specific curriculum file
export const getAdminCurriculumLessons = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ fileId: z.string() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/platform/database/supabase/client.server");
    return adminGetCurriculumLessons(
      supabaseAdmin,
      { userId: context.userId, email: context.claims.email ?? "" },
      data.fileId,
    );
  });

// 4. Save a curriculum draft (inserts or updates draft in Supabase)
export const saveCurriculumDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => SaveCurriculumInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/platform/database/supabase/client.server");
    return adminSaveCurriculumDraft(
      supabaseAdmin,
      { userId: context.userId, email: context.claims.email ?? "" },
      data,
    );
  });

// 5. Publish curriculum (Archives other versions of the same subject, grade, semester, publishes target)
export const publishCurriculum = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ fileId: z.string() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/platform/database/supabase/client.server");
    return adminPublishCurriculum(
      supabaseAdmin,
      { userId: context.userId, email: context.claims.email ?? "" },
      data.fileId,
    );
  });

// 6. Archive a curriculum
export const archiveCurriculum = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ fileId: z.string() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/platform/database/supabase/client.server");
    return adminArchiveCurriculum(
      supabaseAdmin,
      { userId: context.userId, email: context.claims.email ?? "" },
      data.fileId,
    );
  });

// 7. Delete curriculum draft
export const deleteCurriculumDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ fileId: z.string() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/platform/database/supabase/client.server");
    return adminDeleteCurriculumDraft(
      supabaseAdmin,
      { userId: context.userId, email: context.claims.email ?? "" },
      data.fileId,
    );
  });
