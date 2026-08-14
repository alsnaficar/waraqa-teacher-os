/**
 * Curriculum admin catalog operations (W1).
 * Order: assertAdmin → then supabaseAdmin curriculum I/O.
 */
import { assertAdmin } from "../auth/assert-admin.ts";
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
  await assertAdmin(admin, auth.userId);

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
  await assertAdmin(admin, auth.userId);

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
  await assertAdmin(admin, auth.userId);

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
  await assertAdmin(admin, auth.userId);

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
  await assertAdmin(admin, auth.userId);

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

/** Save draft — admin only, using the atomic server-side RPC. */
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
  await assertAdmin(admin, auth.userId);

  const { data: fileId, error } = await admin.rpc("save_curriculum_draft_atomic", {
    p_user_id: auth.userId,
    p_file_id: data.id ?? null,
    p_original_name: data.originalName,
    p_academic_year: data.academicYear,
    p_semester: data.semester,
    p_grade: data.grade,
    p_subject: data.subject,
    p_lessons: data.lessons,
  });

  if (error) {
    if (error.code === "ADMIN_REQUIRED") {
      throw new Error("عذراً، هذا الإجراء متاح فقط لمديري النظام (Administrators).");
    }

    if (error.code === "CURRICULUM_NOT_DRAFT") {
      throw new Error("لا يمكن تعديل منهج غير مسودة.");
    }

    throw error;
  }

  if (!fileId) {
    throw new Error("تعذر حفظ المنهج.");
  }

  return { fileId };
}
