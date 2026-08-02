import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/platform/database/supabase/auth-middleware";
import { getGemini } from "@/features/ai/providers/gemini";

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

// JSON serializer for extended lesson details to fit existing schema columns
export function serializeLessonNotes(lesson: {
  unitNumber?: string;
  unitName?: string;
  lessonNumber?: string;
  outcomes?: string;
  activities?: string;
  assessment?: string;
  periods?: string;
  notes?: string;
}): string {
  return JSON.stringify({
    unitNumber: lesson.unitNumber || "",
    unitName: lesson.unitName || "",
    lessonNumber: lesson.lessonNumber || "",
    outcomes: lesson.outcomes || "",
    activities: lesson.activities || "",
    assessment: lesson.assessment || "",
    periods: lesson.periods || "1",
    notes: lesson.notes || "",
  });
}

export function deserializeLessonNotes(notesStr: string | null) {
  if (!notesStr) {
    return {
      unitNumber: "",
      unitName: "",
      lessonNumber: "",
      outcomes: "",
      activities: "",
      assessment: "",
      periods: "1",
      notes: "",
    };
  }
  try {
    const trimmed = notesStr.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      return JSON.parse(trimmed);
    }
  } catch (e) {
    // fallback
  }
  return {
    unitNumber: "",
    unitName: "",
    lessonNumber: "",
    outcomes: "",
    activities: "",
    assessment: "",
    periods: "1",
    notes: notesStr,
  };
}

// 1. Extract curriculum from PDF using Gemini
export const extractCurriculumFromPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ pdfBase64: z.string() }).parse(data))
  .handler(async ({ data }) => {
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
    const { data, error } = await supabaseAdmin
      .from("curriculum_files")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  });

// 3. Fetch lessons for a specific curriculum file
export const getAdminCurriculumLessons = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ fileId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/platform/database/supabase/client.server");
    const { data: lessons, error } = await supabaseAdmin
      .from("curriculum_lessons")
      .select("*")
      .eq("curriculum_file_id", data.fileId)
      .order("order_index", { ascending: true });

    if (error) throw error;

    return (lessons || []).map((l) => {
      const extra = deserializeLessonNotes(l.notes);
      return {
        id: l.id,
        lessonTitle: l.title,
        objectives: l.objectives || "",
        unitNumber: extra.unitNumber,
        unitName: extra.unitName,
        lessonNumber: extra.lessonNumber,
        outcomes: extra.outcomes,
        activities: extra.activities,
        assessment: extra.assessment,
        periods: extra.periods,
        notes: extra.notes,
      };
    });
  });

// 4. Save a curriculum draft (inserts or updates draft in Supabase)
export const saveCurriculumDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => SaveCurriculumInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/platform/database/supabase/client.server");

    let fileId = data.id;

    // Check if the current user is permitted (coonan89@gmail.com or has admin role)
    // We can query the user's role
    const { data: userRole } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .maybeSingle();

    const isUserAdmin = context.claims.email === "coonan89@gmail.com" || userRole?.role === "admin";
    if (!isUserAdmin) {
      throw new Error("Only administrators can manage curriculum.");
    }

    if (fileId) {
      // Update existing file
      const { error: fileUpdateErr } = await supabaseAdmin
        .from("curriculum_files")
        .update({
          subject: data.subject,
          grade: data.grade,
          semester: data.semester,
          academic_year: data.academicYear,
          updated_at: new Date().toISOString(),
        })
        .eq("id", fileId);

      if (fileUpdateErr) throw fileUpdateErr;

      // Delete existing lessons to replace them
      const { error: deleteErr } = await supabaseAdmin
        .from("curriculum_lessons")
        .delete()
        .eq("curriculum_file_id", fileId);

      if (deleteErr) throw deleteErr;
    } else {
      // Create a new curriculum file row
      const { data: newFile, error: fileInsertErr } = await supabaseAdmin
        .from("curriculum_files")
        .insert({
          original_name: data.originalName,
          subject: data.subject,
          grade: data.grade,
          semester: data.semester,
          academic_year: data.academicYear,
          status: "draft",
          mime_type: "application/pdf",
          size_bytes: 0,
          storage_path: "admin_upload",
          user_id: context.userId,
        })
        .select("id")
        .single();

      if (fileInsertErr) throw fileInsertErr;
      fileId = newFile.id;
    }

    // Insert all lessons
    const lessonsData = data.lessons.map((lesson, idx) => ({
      curriculum_file_id: fileId,
      title: lesson.lessonTitle,
      objectives: lesson.objectives || "",
      notes: serializeLessonNotes({
        unitNumber: lesson.unitNumber,
        unitName: lesson.unitName,
        lessonNumber: lesson.lessonNumber,
        outcomes: lesson.outcomes,
        activities: lesson.activities,
        assessment: lesson.assessment,
        periods: lesson.periods,
        notes: lesson.notes,
      }),
      order_index: idx,
      user_id: context.userId,
    }));

    const { error: lessonsInsertErr } = await supabaseAdmin
      .from("curriculum_lessons")
      .insert(lessonsData);

    if (lessonsInsertErr) throw lessonsInsertErr;

    return { fileId };
  });

// 5. Publish curriculum (Archives other versions of the same subject, grade, semester, publishes target)
export const publishCurriculum = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ fileId: z.string() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/platform/database/supabase/client.server");

    // Fetch details of file to publish
    const { data: file, error: fetchErr } = await supabaseAdmin
      .from("curriculum_files")
      .select("*")
      .eq("id", data.fileId)
      .single();

    if (fetchErr || !file) throw new Error("Curriculum file not found.");
    if (!file.subject || !file.grade || !file.semester) {
      throw new Error("Curriculum file is missing subject, grade, or semester.");
    }

    // Archive all other active or published curriculum files for the same subject, grade, and semester
    const { error: archiveErr } = await supabaseAdmin
      .from("curriculum_files")
      .update({ status: "archived" })
      .eq("subject", file.subject)
      .eq("grade", file.grade)
      .eq("semester", file.semester)
      .eq("status", "published");

    if (archiveErr) throw archiveErr;

    // Set target curriculum status to published
    const { error: publishErr } = await supabaseAdmin
      .from("curriculum_files")
      .update({ status: "published" })
      .eq("id", data.fileId);

    if (publishErr) throw publishErr;

    return { success: true };
  });

// 6. Archive a curriculum
export const archiveCurriculum = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ fileId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/platform/database/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("curriculum_files")
      .update({ status: "archived" })
      .eq("id", data.fileId);

    if (error) throw error;
    return { success: true };
  });

// 7. Delete curriculum draft
export const deleteCurriculumDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ fileId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/platform/database/supabase/client.server");

    // Delete lessons first (on delete cascade should do this, but being explicit is safer)
    const { error: lessonsErr } = await supabaseAdmin
      .from("curriculum_lessons")
      .delete()
      .eq("curriculum_file_id", data.fileId);

    if (lessonsErr) throw lessonsErr;

    // Delete file record
    const { error: fileErr } = await supabaseAdmin
      .from("curriculum_files")
      .delete()
      .eq("id", data.fileId);

    if (fileErr) throw fileErr;

    return { success: true };
  });
