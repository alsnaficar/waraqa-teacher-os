import { resolveUserContext, type SupabaseUserContext } from "@/platform/database/supabase/context";
import type { Database } from "@/platform/database/supabase/types";

type StudentRow = Database["public"]["Tables"]["students"]["Row"];
type StudentInsert = Database["public"]["Tables"]["students"]["Insert"];
type StudentUpdate = Database["public"]["Tables"]["students"]["Update"];

export class StudentCodeConflictError extends Error {
  constructor(message = "يوجد طالب آخر بنفس الرمز لدى هذا المعلم.") {
    super(message);
    this.name = "StudentCodeConflictError";
  }
}

export function isStudentCodeUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  if (code === "23505") return true;
  const message = "message" in error ? String((error as { message?: unknown }).message ?? "") : "";
  return /unique|duplicate|idx_students_teacher_code_unique/i.test(message);
}

export interface Student {
  id: string;
  teacherId: string;
  fullName: string;
  classId: string | null;
  gradeId: string | null;
  studentCode: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export type StudentCreateInput = {
  fullName: string;
  classId?: string | null;
  gradeId?: string | null;
  studentCode?: string | null;
  active?: boolean;
};

export type StudentUpdateInput = Partial<StudentCreateInput>;

export type StudentListFilter = {
  classId?: string;
  active?: boolean;
};

function toStudent(row: StudentRow): Student {
  return {
    id: row.id,
    teacherId: row.teacher_id,
    fullName: row.full_name,
    classId: row.class_id,
    gradeId: row.grade_id,
    studentCode: row.student_code,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toInsertRow(teacherId: string, input: StudentCreateInput): StudentInsert {
  return {
    teacher_id: teacherId,
    full_name: input.fullName.trim(),
    class_id: input.classId ?? null,
    grade_id: input.gradeId ?? null,
    student_code: input.studentCode?.trim() ? input.studentCode.trim() : null,
    active: input.active ?? true,
  };
}

function toUpdatePatch(patch: StudentUpdateInput): StudentUpdate {
  const row: StudentUpdate = {};
  if (patch.fullName !== undefined) row.full_name = patch.fullName.trim();
  if (patch.classId !== undefined) row.class_id = patch.classId ?? null;
  if (patch.gradeId !== undefined) row.grade_id = patch.gradeId ?? null;
  if (patch.studentCode !== undefined) {
    row.student_code = patch.studentCode?.trim() ? patch.studentCode.trim() : null;
  }
  if (patch.active !== undefined) row.active = patch.active;
  return row;
}

/**
 * Teacher-owned student roster.
 * Ownership always from resolveUserContext — never from client teacher_id.
 */
export class StudentService {
  static async list(
    filter: StudentListFilter = {},
    context?: SupabaseUserContext,
  ): Promise<Student[]> {
    const resolved = await resolveUserContext(context);
    if (!resolved) return [];

    let query = resolved.client
      .from("students")
      .select("*")
      .eq("teacher_id", resolved.userId)
      .order("full_name");

    if (filter.classId) query = query.eq("class_id", filter.classId);
    if (filter.active !== undefined) query = query.eq("active", filter.active);

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map(toStudent);
  }

  static async listByClass(classId: string, context?: SupabaseUserContext): Promise<Student[]> {
    return this.list({ classId }, context);
  }

  static async getById(id: string, context?: SupabaseUserContext): Promise<Student | null> {
    const resolved = await resolveUserContext(context);
    if (!resolved) return null;

    const { data, error } = await resolved.client
      .from("students")
      .select("*")
      .eq("id", id)
      .eq("teacher_id", resolved.userId)
      .maybeSingle();

    if (error) throw error;
    return data ? toStudent(data) : null;
  }

  static async create(
    input: StudentCreateInput,
    context?: SupabaseUserContext,
  ): Promise<Student | null> {
    const resolved = await resolveUserContext(context);
    if (!resolved) return null;

    if (!input.fullName?.trim()) {
      throw new Error("اسم الطالب مطلوب.");
    }

    await assertOwnedClassAndGrade(resolved, input.classId ?? null, input.gradeId ?? null);

    const { data, error } = await resolved.client
      .from("students")
      .insert(toInsertRow(resolved.userId, input))
      .select("*")
      .maybeSingle();

    if (error) {
      if (isStudentCodeUniqueViolation(error)) throw new StudentCodeConflictError();
      throw error;
    }

    return data ? toStudent(data) : null;
  }

  static async update(
    id: string,
    patch: StudentUpdateInput,
    context?: SupabaseUserContext,
  ): Promise<Student | null> {
    const resolved = await resolveUserContext(context);
    if (!resolved) return null;

    if (patch.fullName !== undefined && !patch.fullName.trim()) {
      throw new Error("اسم الطالب مطلوب.");
    }

    if (patch.classId !== undefined || patch.gradeId !== undefined) {
      const existing = await this.getById(id, resolved);
      if (!existing) return null;
      await assertOwnedClassAndGrade(
        resolved,
        patch.classId !== undefined ? patch.classId : existing.classId,
        patch.gradeId !== undefined ? patch.gradeId : existing.gradeId,
      );
    }

    const row = toUpdatePatch(patch);
    if (Object.keys(row).length === 0) {
      return this.getById(id, resolved);
    }

    const { data, error } = await resolved.client
      .from("students")
      .update(row)
      .eq("id", id)
      .eq("teacher_id", resolved.userId)
      .select("*")
      .maybeSingle();

    if (error) {
      if (isStudentCodeUniqueViolation(error)) throw new StudentCodeConflictError();
      throw error;
    }

    return data ? toStudent(data) : null;
  }

  static async delete(id: string, context?: SupabaseUserContext): Promise<boolean> {
    const resolved = await resolveUserContext(context);
    if (!resolved) return false;

    const { data, error } = await resolved.client
      .from("students")
      .delete()
      .eq("id", id)
      .eq("teacher_id", resolved.userId)
      .select("id")
      .maybeSingle();

    if (error) throw error;
    return Boolean(data);
  }
}

async function assertOwnedClassAndGrade(
  context: SupabaseUserContext,
  classId: string | null,
  gradeId: string | null,
): Promise<void> {
  if (classId) {
    const { data, error } = await context.client
      .from("classes")
      .select("id")
      .eq("id", classId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("الفصل غير موجود أو لا تملك صلاحية الوصول إليه.");
  }

  if (gradeId) {
    const { data, error } = await context.client
      .from("grades")
      .select("id")
      .eq("id", gradeId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("الصف غير موجود أو لا تملك صلاحية الوصول إليه.");
  }
}
