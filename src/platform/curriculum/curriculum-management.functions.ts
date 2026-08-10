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

export { deserializeLessonNotes, serializeLessonNotes } from "./curriculum-lesson-notes.ts";

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

// 1. Extract curriculum from PDF using Gemini
export const extractCurriculumFromPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ pdfBase64: z.string() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/platform/database/supabase/client.server");
    await assertAdmin(supabaseAdmin, context.userId);

    try {
      const ai = getGemini();
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          {
            inlineData: {
              data: data.pdfBase64,
              mimeType: "application/pdf",
            },
          },
          `You are an expert curriculum analyst for the Saudi Ministry of Education (وزارة التعليم).
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


You MUST return valid JSON matching this schema structure. Do not wrap in markdown code blocks other than json.`,
        ],
        config: {
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
      return JSON.parse(text);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("[curriculum-management] PDF extraction failed:", err);
      throw new Error(`Failed to extract curriculum details: ${errMsg}`);
    }
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
