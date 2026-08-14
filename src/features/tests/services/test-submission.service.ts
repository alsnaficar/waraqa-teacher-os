import { resolveUserContext, type SupabaseUserContext } from "@/platform/database/supabase/context";
import type { Database } from "@/platform/database/supabase/types";

import { assertOwnedTest, type TeacherTest } from "./test.service";

type SubmissionRow = Database["public"]["Tables"]["test_submissions"]["Row"];
type SubmissionInsert = Database["public"]["Tables"]["test_submissions"]["Insert"];
type SubmissionUpdate = Database["public"]["Tables"]["test_submissions"]["Update"];

export type TestSubmissionStatus = "pending" | "submitted" | "graded";

const SUBMISSION_STATUSES: readonly TestSubmissionStatus[] = [
  "pending",
  "submitted",
  "graded",
];

export function toTestSubmissionStatus(value: string): TestSubmissionStatus {
  return (SUBMISSION_STATUSES as readonly string[]).includes(value)
    ? (value as TestSubmissionStatus)
    : "pending";
}

export function assertTestSubmissionStatus(
  value: string,
): asserts value is TestSubmissionStatus {
  if (!(SUBMISSION_STATUSES as readonly string[]).includes(value)) {
    throw new Error("حالة التسليم غير صالحة. القيم المسموحة: pending و submitted و graded.");
  }
}

export class TestSubmissionConflictError extends Error {
  constructor(message = "يوجد تسليم لهذا الطالب على نفس الاختبار مسبقاً.") {
    super(message);
    this.name = "TestSubmissionConflictError";
  }
}

export function isTestSubmissionUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  if (code === "23505") return true;
  const message = "message" in error ? String((error as { message?: unknown }).message ?? "") : "";
  return /unique|duplicate|test_submissions_test_student_unique/i.test(message);
}

export interface TestSubmission {
  id: string;
  teacherId: string;
  testId: string;
  studentId: string;
  status: TestSubmissionStatus;
  score: number | null;
  maxScore: number | null;
  feedback: string | null;
  submittedAt: string | null;
  gradedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type TestSubmissionCreateInput = {
  testId: string;
  studentId: string;
  status?: TestSubmissionStatus;
  score?: number | null;
  maxScore?: number | null;
  feedback?: string | null;
  submittedAt?: string | null;
  gradedAt?: string | null;
};

export type TestSubmissionUpdateInput = Partial<
  Omit<TestSubmissionCreateInput, "testId" | "studentId">
> & {
  testId?: string;
  studentId?: string;
};

function toSubmission(row: SubmissionRow): TestSubmission {
  return {
    id: row.id,
    teacherId: row.teacher_id,
    testId: row.test_id,
    studentId: row.student_id,
    status: toTestSubmissionStatus(row.status),
    score: row.score == null ? null : Number(row.score),
    maxScore: row.max_score == null ? null : Number(row.max_score),
    feedback: row.feedback,
    submittedAt: row.submitted_at,
    gradedAt: row.graded_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toInsertRow(teacherId: string, input: TestSubmissionCreateInput): SubmissionInsert {
  return {
    teacher_id: teacherId,
    test_id: input.testId,
    student_id: input.studentId,
    status: input.status ?? "pending",
    score: input.score ?? null,
    max_score: input.maxScore ?? null,
    feedback: input.feedback?.trim() ? input.feedback.trim() : null,
    submitted_at: input.submittedAt ?? null,
    graded_at: input.gradedAt ?? null,
  };
}

function toUpdatePatch(patch: TestSubmissionUpdateInput): SubmissionUpdate {
  const row: SubmissionUpdate = {};
  if (patch.testId !== undefined) row.test_id = patch.testId;
  if (patch.studentId !== undefined) row.student_id = patch.studentId;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.score !== undefined) row.score = patch.score ?? null;
  if (patch.maxScore !== undefined) row.max_score = patch.maxScore ?? null;
  if (patch.feedback !== undefined) {
    row.feedback = patch.feedback?.trim() ? patch.feedback.trim() : null;
  }
  if (patch.submittedAt !== undefined) row.submitted_at = patch.submittedAt ?? null;
  if (patch.gradedAt !== undefined) row.graded_at = patch.gradedAt ?? null;
  return row;
}

/**
 * Teacher-owned test submissions (no auto-grading in this task).
 */
export class TestSubmissionService {
  static async listByTest(
    testId: string,
    context?: SupabaseUserContext,
  ): Promise<TestSubmission[]> {
    const resolved = await resolveUserContext(context);
    if (!resolved) return [];

    await assertOwnedTest(resolved, testId);

    const { data, error } = await resolved.client
      .from("test_submissions")
      .select("*")
      .eq("teacher_id", resolved.userId)
      .eq("test_id", testId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (data ?? []).map(toSubmission);
  }

  /**
   * Teacher-wide submitted tests needing auto-grade.
   * Single filtered query — no per-test N+1.
   */
  static async listSubmittedForTeacher(
    context?: SupabaseUserContext,
  ): Promise<TestSubmission[]> {
    const resolved = await resolveUserContext(context);
    if (!resolved) return [];

    const { data, error } = await resolved.client
      .from("test_submissions")
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
  ): Promise<TestSubmission | null> {
    const resolved = await resolveUserContext(context);
    if (!resolved) return null;

    const { data, error } = await resolved.client
      .from("test_submissions")
      .select("*")
      .eq("id", id)
      .eq("teacher_id", resolved.userId)
      .maybeSingle();

    if (error) throw error;
    return data ? toSubmission(data) : null;
  }

  /**
   * Assignment path for TASK 22.4 — published + active student only.
   * Forces pending; ignores any client status/score/feedback authority.
   */
  static async assignPending(
    testId: string,
    studentId: string,
    context?: SupabaseUserContext,
  ): Promise<TestSubmission | null> {
    const resolved = await resolveUserContext(context);
    if (!resolved) return null;

    const test = await assertOwnedTest(resolved, testId);
    assertTestAcceptsSubmissions(test);
    await assertOwnedActiveStudent(resolved, studentId);

    const { data, error } = await resolved.client
      .from("test_submissions")
      .insert(
        toInsertRow(resolved.userId, {
          testId,
          studentId,
          status: "pending",
        }),
      )
      .select("*")
      .maybeSingle();

    if (error) {
      if (isTestSubmissionUniqueViolation(error)) {
        throw new TestSubmissionConflictError();
      }
      throw error;
    }

    return data ? toSubmission(data) : null;
  }

  static async create(
    input: TestSubmissionCreateInput,
    context?: SupabaseUserContext,
  ): Promise<TestSubmission | null> {
    const resolved = await resolveUserContext(context);
    if (!resolved) return null;

    if (input.status !== undefined) assertTestSubmissionStatus(input.status);

    const test = await assertOwnedTest(resolved, input.testId);
    assertTestAcceptsSubmissions(test);
    await assertOwnedStudent(resolved, input.studentId);

    const { data, error } = await resolved.client
      .from("test_submissions")
      .insert(toInsertRow(resolved.userId, input))
      .select("*")
      .maybeSingle();

    if (error) {
      if (isTestSubmissionUniqueViolation(error)) {
        throw new TestSubmissionConflictError();
      }
      throw error;
    }

    return data ? toSubmission(data) : null;
  }

  static async update(
    id: string,
    patch: TestSubmissionUpdateInput,
    context?: SupabaseUserContext,
  ): Promise<TestSubmission | null> {
    const resolved = await resolveUserContext(context);
    if (!resolved) return null;

    if (patch.status !== undefined) assertTestSubmissionStatus(patch.status);

    if (patch.testId !== undefined) {
      const test = await assertOwnedTest(resolved, patch.testId);
      assertTestAcceptsSubmissions(test);
    }
    if (patch.studentId !== undefined) {
      await assertOwnedStudent(resolved, patch.studentId);
    }

    const row = toUpdatePatch(patch);
    if (Object.keys(row).length === 0) {
      return this.getById(id, resolved);
    }

    const { data, error } = await resolved.client
      .from("test_submissions")
      .update(row)
      .eq("id", id)
      .eq("teacher_id", resolved.userId)
      .select("*")
      .maybeSingle();

    if (error) {
      if (isTestSubmissionUniqueViolation(error)) {
        throw new TestSubmissionConflictError();
      }
      throw error;
    }

    return data ? toSubmission(data) : null;
  }

  static async delete(id: string, context?: SupabaseUserContext): Promise<boolean> {
    const resolved = await resolveUserContext(context);
    if (!resolved) return false;

    const { data, error } = await resolved.client
      .from("test_submissions")
      .delete()
      .eq("id", id)
      .eq("teacher_id", resolved.userId)
      .select("id")
      .maybeSingle();

    if (error) throw error;
    return Boolean(data);
  }

  /**
   * TASK 22.7 — Mark a pending submission as submitted.
   * Does not change score / max_score / feedback / graded_at / answers.
   */
  static async markSubmitted(
    submissionId: string,
    context?: SupabaseUserContext,
  ): Promise<TestSubmission | null> {
    const resolved = await resolveUserContext(context);
    if (!resolved) return null;

    const existing = await this.getById(submissionId, resolved);
    if (!existing) {
      throw new Error("التسليم غير موجود أو لا تملك صلاحية الوصول إليه.");
    }

    const test = await assertOwnedTest(resolved, existing.testId);
    assertTestAllowsAnswerEntry(test);

    if (existing.status === "graded") {
      throw new Error("لا يمكن تعليم تسليم مُصحَّح كمُسلّم.");
    }
    if (existing.status === "submitted") {
      throw new Error("التسليم مُعلَّم كمُسلّم مسبقاً.");
    }
    if (existing.status !== "pending") {
      throw new Error("لا يمكن تعليم التسليم كمُسلّم إلا إذا كانت حالته «لم يبدأ».");
    }

    const submittedAt = new Date().toISOString();
    const { data, error } = await resolved.client
      .from("test_submissions")
      .update({
        status: "submitted",
        submitted_at: submittedAt,
      })
      .eq("id", submissionId)
      .eq("teacher_id", resolved.userId)
      .select("*")
      .maybeSingle();

    if (error) throw error;
    return data ? toSubmission(data) : null;
  }

  /**
   * TASK 22.9 — Teacher feedback on a graded submission only.
   * Updates feedback; never touches score, max_score, status, graded_at, or answers.
   */
  static async setFeedback(
    submissionId: string,
    feedback: string | null | undefined,
    context?: SupabaseUserContext,
  ): Promise<TestSubmission | null> {
    const resolved = await resolveUserContext(context);
    if (!resolved) {
      throw new Error("يجب تسجيل الدخول لحفظ الملاحظة.");
    }

    const existing = await this.getById(submissionId, resolved);
    if (!existing) {
      throw new Error("التسليم غير موجود أو لا تملك صلاحية الوصول إليه.");
    }

    if (existing.status === "pending") {
      throw new Error("لا يمكن إضافة ملاحظات لتسليم لم يبدأ بعد.");
    }
    if (existing.status === "submitted") {
      throw new Error("لا يمكن إضافة ملاحظات قبل التصحيح. صحّح التسليم أولاً.");
    }
    if (existing.status !== "graded") {
      throw new Error("الملاحظات متاحة للتسليمات المُصحَّحة فقط.");
    }

    const nextFeedback =
      typeof feedback === "string" && feedback.trim() ? feedback.trim() : null;

    const { data, error } = await resolved.client
      .from("test_submissions")
      .update({
        feedback: nextFeedback,
      })
      .eq("id", submissionId)
      .eq("teacher_id", resolved.userId)
      .select("*")
      .maybeSingle();

    if (error) throw error;
    return data ? toSubmission(data) : null;
  }
}

function assertTestAcceptsSubmissions(test: TeacherTest): void {
  if (test.status === "draft") {
    throw new Error("لا يمكن إنشاء تسليم لاختبار ما زال مسودة.");
  }
  if (test.status === "closed") {
    throw new Error("لا يمكن إنشاء تسليم لاختبار مغلق.");
  }
}

function assertTestAllowsAnswerEntry(test: TeacherTest): void {
  if (test.status === "draft") {
    throw new Error("لا يمكن تسليم إجابات لاختبار ما زال مسودة.");
  }
  if (test.status === "closed") {
    throw new Error("لا يمكن تسليم إجابات لاختبار مغلق.");
  }
}

async function assertOwnedStudent(
  context: SupabaseUserContext,
  studentId: string,
): Promise<{ id: string; active: boolean }> {
  const { data, error } = await context.client
    .from("students")
    .select("id, active")
    .eq("id", studentId)
    .eq("teacher_id", context.userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new Error("الطالب غير موجود أو لا تملك صلاحية الوصول إليه.");
  }
  return { id: data.id as string, active: Boolean(data.active) };
}

async function assertOwnedActiveStudent(
  context: SupabaseUserContext,
  studentId: string,
): Promise<void> {
  const student = await assertOwnedStudent(context, studentId);
  if (!student.active) {
    throw new Error("لا يمكن إسناد الاختبار لطالب غير نشط.");
  }
}
