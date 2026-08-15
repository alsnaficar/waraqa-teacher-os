import { resolveUserContext, type SupabaseUserContext } from "@/platform/database/supabase/context";
import type { Database } from "@/platform/database/supabase/types";

import { StudentService } from "./student.service";

type SubmissionRow = Database["public"]["Tables"]["homework_submissions"]["Row"];
type SubmissionInsert = Database["public"]["Tables"]["homework_submissions"]["Insert"];
type SubmissionUpdate = Database["public"]["Tables"]["homework_submissions"]["Update"];

export type HomeworkSubmissionStatus = "pending" | "submitted" | "graded";

const SUBMISSION_STATUSES: readonly HomeworkSubmissionStatus[] = [
  "pending",
  "submitted",
  "graded",
];

export function toHomeworkSubmissionStatus(value: string): HomeworkSubmissionStatus {
  return (SUBMISSION_STATUSES as readonly string[]).includes(value)
    ? (value as HomeworkSubmissionStatus)
    : "pending";
}

export function assertHomeworkSubmissionStatus(
  value: string,
): asserts value is HomeworkSubmissionStatus {
  if (!(SUBMISSION_STATUSES as readonly string[]).includes(value)) {
    throw new Error("حالة التسليم غير صالحة. القيم المسموحة: pending و submitted و graded.");
  }
}

export class HomeworkSubmissionConflictError extends Error {
  constructor(message = "يوجد تسليم لهذا الطالب على نفس الواجب مسبقاً.") {
    super(message);
    this.name = "HomeworkSubmissionConflictError";
  }
}

export function isHomeworkSubmissionUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  if (code === "23505") return true;
  const message = "message" in error ? String((error as { message?: unknown }).message ?? "") : "";
  return /unique|duplicate|homework_submissions_homework_student_unique/i.test(message);
}

export interface HomeworkSubmission {
  id: string;
  teacherId: string;
  homeworkId: string;
  studentId: string;
  status: HomeworkSubmissionStatus;
  score: number | null;
  feedback: string | null;
  submittedAt: string | null;
  gradedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type HomeworkSubmissionCreateInput = {
  homeworkId: string;
  studentId: string;
  status?: HomeworkSubmissionStatus;
  score?: number | null;
  feedback?: string | null;
  submittedAt?: string | null;
  gradedAt?: string | null;
};

export type HomeworkSubmissionUpdateInput = Partial<
  Omit<HomeworkSubmissionCreateInput, "homeworkId" | "studentId">
> & {
  homeworkId?: string;
  studentId?: string;
};

/** Manual grading payload. Never includes teacher_id. */
export type HomeworkGradeInput = {
  score: number;
  feedback?: string | null;
  /** Optional ceiling; enforced only when provided (schema has no max_score yet). */
  maxScore?: number | null;
};

export function parseGradeScore(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  throw new Error("الدرجة يجب أن تكون رقماً.");
}

export function assertValidGradeScore(score: number, maxScore?: number | null): void {
  if (!Number.isFinite(score)) {
    throw new Error("الدرجة يجب أن تكون رقماً.");
  }
  if (score < 0) {
    throw new Error("الدرجة يجب أن تكون أكبر من أو تساوي صفر.");
  }
  if (maxScore != null && Number.isFinite(maxScore) && score > maxScore) {
    throw new Error("الدرجة لا يجوز أن تتجاوز الدرجة الكاملة.");
  }
}

export function assertSubmissionGradable(status: HomeworkSubmissionStatus): void {
  if (status === "pending") {
    throw new Error("لا يمكن تصحيح تسليم لم يُسلَّم بعد.");
  }
  if (status !== "submitted" && status !== "graded") {
    throw new Error("حالة التسليم لا تسمح بالتصحيح.");
  }
}

function toSubmission(row: SubmissionRow): HomeworkSubmission {
  return {
    id: row.id,
    teacherId: row.teacher_id,
    homeworkId: row.homework_id,
    studentId: row.student_id,
    status: toHomeworkSubmissionStatus(row.status),
    score: row.score,
    feedback: row.feedback,
    submittedAt: row.submitted_at,
    gradedAt: row.graded_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toInsertRow(teacherId: string, input: HomeworkSubmissionCreateInput): SubmissionInsert {
  return {
    teacher_id: teacherId,
    homework_id: input.homeworkId,
    student_id: input.studentId,
    status: input.status ?? "pending",
    score: input.score ?? null,
    feedback: input.feedback?.trim() ? input.feedback.trim() : null,
    submitted_at: input.submittedAt ?? null,
    graded_at: input.gradedAt ?? null,
  };
}

function toUpdatePatch(patch: HomeworkSubmissionUpdateInput): SubmissionUpdate {
  const row: SubmissionUpdate = {};
  if (patch.homeworkId !== undefined) row.homework_id = patch.homeworkId;
  if (patch.studentId !== undefined) row.student_id = patch.studentId;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.score !== undefined) row.score = patch.score ?? null;
  if (patch.feedback !== undefined) {
    row.feedback = patch.feedback?.trim() ? patch.feedback.trim() : null;
  }
  if (patch.submittedAt !== undefined) row.submitted_at = patch.submittedAt ?? null;
  if (patch.gradedAt !== undefined) row.graded_at = patch.gradedAt ?? null;
  return row;
}

/**
 * Teacher-owned homework submissions.
 * Ownership from resolveUserContext; homework and student must belong to the same teacher.
 */
export class HomeworkSubmissionService {
  static async listByHomework(
    homeworkId: string,
    context?: SupabaseUserContext,
  ): Promise<HomeworkSubmission[]> {
    const resolved = await resolveUserContext(context);
    if (!resolved) return [];

    const { data, error } = await resolved.client
      .from("homework_submissions")
      .select("*")
      .eq("teacher_id", resolved.userId)
      .eq("homework_id", homeworkId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (data ?? []).map(toSubmission);
  }

  /**
   * Teacher-wide submitted homework needing manual grade.
   * Single filtered query — no per-homework N+1.
   */
  static async listSubmittedForTeacher(
    context?: SupabaseUserContext,
  ): Promise<HomeworkSubmission[]> {
    const resolved = await resolveUserContext(context);
    if (!resolved) return [];

    const { data, error } = await resolved.client
      .from("homework_submissions")
      .select("*")
      .eq("teacher_id", resolved.userId)
      .eq("status", "submitted")
      .order("submitted_at", { ascending: false, nullsFirst: false });

    if (error) throw error;
    return (data ?? []).map(toSubmission);
  }

  static async getById(
    id: string,
    context?: SupabaseUserContext,
  ): Promise<HomeworkSubmission | null> {
    const resolved = await resolveUserContext(context);
    if (!resolved) return null;

    const { data, error } = await resolved.client
      .from("homework_submissions")
      .select("*")
      .eq("id", id)
      .eq("teacher_id", resolved.userId)
      .maybeSingle();

    if (error) throw error;
    return data ? toSubmission(data) : null;
  }

  static async create(
    input: HomeworkSubmissionCreateInput,
    context?: SupabaseUserContext,
  ): Promise<HomeworkSubmission | null> {
    const resolved = await resolveUserContext(context);
    if (!resolved) return null;

    if (input.status !== undefined) assertHomeworkSubmissionStatus(input.status);

    await assertOwnedHomework(resolved, input.homeworkId);
    await assertOwnedStudent(resolved, input.studentId);

    const { data, error } = await resolved.client
      .from("homework_submissions")
      .insert(toInsertRow(resolved.userId, input))
      .select("*")
      .maybeSingle();

    if (error) {
      if (isHomeworkSubmissionUniqueViolation(error)) {
        throw new HomeworkSubmissionConflictError();
      }
      throw error;
    }

    return data ? toSubmission(data) : null;
  }

  static async update(
    id: string,
    patch: HomeworkSubmissionUpdateInput,
    context?: SupabaseUserContext,
  ): Promise<HomeworkSubmission | null> {
    const resolved = await resolveUserContext(context);
    if (!resolved) return null;

    if (patch.status !== undefined) assertHomeworkSubmissionStatus(patch.status);

    if (patch.homeworkId !== undefined) {
      await assertOwnedHomework(resolved, patch.homeworkId);
    }
    if (patch.studentId !== undefined) {
      await assertOwnedStudent(resolved, patch.studentId);
    }

    const row = toUpdatePatch(patch);
    if (Object.keys(row).length === 0) {
      return this.getById(id, resolved);
    }

    const { data, error } = await resolved.client
      .from("homework_submissions")
      .update(row)
      .eq("id", id)
      .eq("teacher_id", resolved.userId)
      .select("*")
      .maybeSingle();

    if (error) {
      if (isHomeworkSubmissionUniqueViolation(error)) {
        throw new HomeworkSubmissionConflictError();
      }
      throw error;
    }

    return data ? toSubmission(data) : null;
  }

  static async delete(id: string, context?: SupabaseUserContext): Promise<boolean> {
    const resolved = await resolveUserContext(context);
    if (!resolved) return false;

    const { data, error } = await resolved.client
      .from("homework_submissions")
      .delete()
      .eq("id", id)
      .eq("teacher_id", resolved.userId)
      .select("id")
      .maybeSingle();

    if (error) throw error;
    return Boolean(data);
  }

  /**
   * TASK 25.3 — Assign pending submissions to all active students in an owned class.
   * Idempotent: existing (homework, student) pairs are skipped.
   * Does not mark submitted/graded and does not change homework status.
   */
  static async assignToClass(
    homeworkId: string,
    classId: string,
    context?: SupabaseUserContext,
  ): Promise<HomeworkAssignToClassResult | null> {
    const resolved = await resolveUserContext(context);
    if (!resolved) return null;

    if (!homeworkId?.trim()) {
      throw new Error("معرّف الواجب مطلوب.");
    }
    if (!classId?.trim()) {
      throw new Error("معرّف الفصل مطلوب.");
    }

    await assertOwnedHomework(resolved, homeworkId.trim());
    await assertOwnedClass(resolved, classId.trim());

    const eligible = await StudentService.list(
      { classId: classId.trim(), active: true },
      resolved,
    );

    // Defense: only owned active students in the selected class.
    const students = eligible.filter(
      (student) =>
        student.teacherId === resolved.userId &&
        student.active &&
        student.classId === classId.trim(),
    );

    const existing = await this.listByHomework(homeworkId.trim(), resolved);
    const alreadyAssigned = new Set(existing.map((row) => row.studentId));

    let createdCount = 0;
    let skippedExistingCount = 0;

    for (const student of students) {
      if (alreadyAssigned.has(student.id)) {
        skippedExistingCount += 1;
        continue;
      }

      try {
        const created = await this.create(
          {
            homeworkId: homeworkId.trim(),
            studentId: student.id,
            status: "pending",
          },
          resolved,
        );
        if (created) {
          createdCount += 1;
          alreadyAssigned.add(student.id);
        }
      } catch (error) {
        if (error instanceof HomeworkSubmissionConflictError) {
          skippedExistingCount += 1;
          alreadyAssigned.add(student.id);
          continue;
        }
        throw error;
      }
    }

    return {
      homeworkId: homeworkId.trim(),
      classId: classId.trim(),
      eligibleCount: students.length,
      createdCount,
      skippedExistingCount,
    };
  }

  /**
   * Manual grade / regrade for a teacher-owned submission.
   * Allowed for status submitted|graded only — pending is rejected.
   * Sets status=graded, graded_at=now, score + optional feedback.
   */
  static async grade(
    id: string,
    input: HomeworkGradeInput,
    context?: SupabaseUserContext,
  ): Promise<HomeworkSubmission | null> {
    const resolved = await resolveUserContext(context);
    if (!resolved) return null;

    const existing = await this.getById(id, resolved);
    if (!existing) {
      throw new Error("التسليم غير موجود أو لا تملك صلاحية الوصول إليه.");
    }

    assertSubmissionGradable(existing.status);

    const score = parseGradeScore(input.score);
    assertValidGradeScore(score, input.maxScore);

    const feedback =
      input.feedback === undefined
        ? existing.feedback
        : input.feedback?.trim()
          ? input.feedback.trim()
          : null;

    const { data, error } = await resolved.client
      .from("homework_submissions")
      .update({
        status: "graded",
        score,
        feedback,
        graded_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("teacher_id", resolved.userId)
      .select("*")
      .maybeSingle();

    if (error) throw error;
    return data ? toSubmission(data) : null;
  }
}

export type HomeworkAssignToClassResult = {
  homeworkId: string;
  classId: string;
  eligibleCount: number;
  createdCount: number;
  skippedExistingCount: number;
};

async function assertOwnedHomework(
  context: SupabaseUserContext,
  homeworkId: string,
): Promise<void> {
  const { data, error } = await context.client
    .from("homework")
    .select("id")
    .eq("id", homeworkId)
    .eq("teacher_id", context.userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new Error("الواجب غير موجود أو لا تملك صلاحية الوصول إليه.");
  }
}

async function assertOwnedClass(
  context: SupabaseUserContext,
  classId: string,
): Promise<void> {
  const { data, error } = await context.client
    .from("classes")
    .select("id")
    .eq("id", classId)
    .eq("user_id", context.userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new Error("الفصل غير موجود أو لا تملك صلاحية الوصول إليه.");
  }
}

async function assertOwnedStudent(
  context: SupabaseUserContext,
  studentId: string,
): Promise<void> {
  const { data, error } = await context.client
    .from("students")
    .select("id")
    .eq("id", studentId)
    .eq("teacher_id", context.userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new Error("الطالب غير موجود أو لا تملك صلاحية الوصول إليه.");
  }
}
