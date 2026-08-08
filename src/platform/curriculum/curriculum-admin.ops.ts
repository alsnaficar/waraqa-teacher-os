/**
 * Curriculum admin catalog operations (W1).
 * Order: assertAdmin → then supabaseAdmin curriculum I/O.
 */
import { assertAdmin } from "@/platform/auth/assert-admin";
import type { Database } from "@/platform/database/supabase/types";
import { deserializeLessonNotes, serializeLessonNotes } from "./curriculum-lesson-notes.ts";

type CurriculumAdminClient = Awaited<
  typeof import("@/platform/database/supabase/client.server")
>["supabaseAdmin"];

type CurriculumFileRow = Database["public"]["Tables"]["curriculum_files"]["Row"];

export type CurriculumAdminAuth = {
  userId: string;
  email: string;
};

export type AdminCurriculumLessonView = {
  id: string;
  lessonTitle: string;
  objectives: string;
  unitNumber: string;
  unitName: string;
  lessonNumber: string;
  outcomes: string;
  activities: string;
  assessment: string;
  periods: string;
  notes: string;
};

/** List all curriculum files — admin only. */
export async function adminListCurriculumFiles(
  admin: CurriculumAdminClient,
  auth: CurriculumAdminAuth,
): Promise<CurriculumFileRow[]> {
  await assertAdmin(admin, auth.userId, auth.email);

  const { data, error } = await admin
    .from("curriculum_files")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

/** List lessons for any fileId — admin only. */
export async function adminGetCurriculumLessons(
  admin: CurriculumAdminClient,
  auth: CurriculumAdminAuth,
  fileId: string,
): Promise<AdminCurriculumLessonView[]> {
  await assertAdmin(admin, auth.userId, auth.email);

  const { data: lessons, error } = await admin
    .from("curriculum_lessons")
    .select("*")
    .eq("curriculum_file_id", fileId)
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
}

/** Publish file + archive peer published set — admin only. */
export async function adminPublishCurriculum(
  admin: CurriculumAdminClient,
  auth: CurriculumAdminAuth,
  fileId: string,
): Promise<{ success: true }> {
  await assertAdmin(admin, auth.userId, auth.email);

  const { data: file, error: fetchErr } = await admin
    .from("curriculum_files")
    .select("*")
    .eq("id", fileId)
    .single();

  if (fetchErr || !file) throw new Error("Curriculum file not found.");
  if (!file.subject || !file.grade || !file.semester) {
    throw new Error("Curriculum file is missing subject, grade, or semester.");
  }

  const { error: archiveErr } = await admin
    .from("curriculum_files")
    .update({ status: "archived" })
    .eq("subject", file.subject)
    .eq("grade", file.grade)
    .eq("semester", file.semester)
    .eq("status", "published");

  if (archiveErr) throw archiveErr;

  const { error: publishErr } = await admin
    .from("curriculum_files")
    .update({ status: "published" })
    .eq("id", fileId);

  if (publishErr) throw publishErr;

  return { success: true };
}

/** Archive any file — admin only. */
export async function adminArchiveCurriculum(
  admin: CurriculumAdminClient,
  auth: CurriculumAdminAuth,
  fileId: string,
): Promise<{ success: true }> {
  await assertAdmin(admin, auth.userId, auth.email);

  const { error } = await admin
    .from("curriculum_files")
    .update({ status: "archived" })
    .eq("id", fileId);

  if (error) throw error;
  return { success: true };
}

/**
 * Delete draft only — admin only + status === 'draft'.
 * Published/archived/other → DENY with no lesson/file deletes.
 */
export async function adminDeleteCurriculumDraft(
  admin: CurriculumAdminClient,
  auth: CurriculumAdminAuth,
  fileId: string,
): Promise<{ success: true }> {
  await assertAdmin(admin, auth.userId, auth.email);

  const { data: file, error: fetchErr } = await admin
    .from("curriculum_files")
    .select("id, status")
    .eq("id", fileId)
    .maybeSingle();

  if (fetchErr) throw fetchErr;
  if (!file) throw new Error("Curriculum file not found.");

  if (file.status !== "draft") {
    throw new Error("يمكن حذف مسودات المنهج فقط (status = draft).");
  }

  const { error: lessonsErr } = await admin
    .from("curriculum_lessons")
    .delete()
    .eq("curriculum_file_id", fileId);

  if (lessonsErr) throw lessonsErr;

  const { error: fileErr } = await admin.from("curriculum_files").delete().eq("id", fileId);

  if (fileErr) throw fileErr;

  return { success: true };
}

/** Save draft — admin only (existing behavior; shared assertAdmin). */
export async function adminSaveCurriculumDraft(
  admin: CurriculumAdminClient,
  auth: CurriculumAdminAuth,
  data: {
    id?: string;
    originalName: string;
    academicYear: string;
    semester: string;
    grade: string;
    subject: string;
    lessons: Array<{
      lessonTitle: string;
      objectives?: string;
      unitNumber?: string;
      unitName?: string;
      lessonNumber?: string;
      outcomes?: string;
      activities?: string;
      assessment?: string;
      periods?: string;
      notes?: string;
    }>;
  },
): Promise<{ fileId: string }> {
  await assertAdmin(admin, auth.userId, auth.email);

  let fileId = data.id;

  if (fileId) {
    const { error: fileUpdateErr } = await admin
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

    const { error: deleteErr } = await admin
      .from("curriculum_lessons")
      .delete()
      .eq("curriculum_file_id", fileId);

    if (deleteErr) throw deleteErr;
  } else {
    const { data: newFile, error: fileInsertErr } = await admin
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
        user_id: auth.userId,
      })
      .select("id")
      .single();

    if (fileInsertErr) throw fileInsertErr;
    fileId = newFile.id;
  }

  const lessonsData = data.lessons.map((lesson, idx) => ({
    curriculum_file_id: fileId!,
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
    user_id: auth.userId,
  }));

  const { error: lessonsInsertErr } = await admin.from("curriculum_lessons").insert(lessonsData);

  if (lessonsInsertErr) throw lessonsInsertErr;

  return { fileId: fileId! };
}
