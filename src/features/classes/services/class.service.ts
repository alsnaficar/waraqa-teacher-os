import { resolveUserContext, type SupabaseUserContext } from "@/platform/database/supabase/context";
import type { Database } from "@/platform/database/supabase/types";

type ClassRow = Database["public"]["Tables"]["classes"]["Row"];
type ClassInsert = Database["public"]["Tables"]["classes"]["Insert"];
type ClassUpdate = Database["public"]["Tables"]["classes"]["Update"];

export interface TeacherClass {
  id: string;
  teacherId: string;
  gradeId: string | null;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export type ClassCreateInput = {
  name: string;
  gradeId?: string | null;
};

export type ClassUpdateInput = Partial<ClassCreateInput>;

export type ClassListFilter = {
  gradeId?: string;
};

function toClass(row: ClassRow): TeacherClass {
  return {
    id: row.id,
    teacherId: row.user_id,
    gradeId: row.grade_id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toInsertRow(teacherId: string, input: ClassCreateInput): ClassInsert {
  return {
    user_id: teacherId,
    name: input.name.trim(),
    grade_id: input.gradeId ?? null,
  };
}

function toUpdatePatch(patch: ClassUpdateInput): ClassUpdate {
  const row: ClassUpdate = {};
  if (patch.name !== undefined) row.name = patch.name.trim();
  if (patch.gradeId !== undefined) row.grade_id = patch.gradeId ?? null;
  return row;
}

/**
 * Teacher-owned classes (الفصول).
 * Ownership always from resolveUserContext — never from client teacher_id.
 * Optional grade_id must belong to the same teacher when provided.
 */
export class ClassService {
  static async list(
    filter: ClassListFilter = {},
    context?: SupabaseUserContext,
  ): Promise<TeacherClass[]> {
    const resolved = await resolveUserContext(context);
    if (!resolved) return [];

    let query = resolved.client
      .from("classes")
      .select("*")
      .eq("user_id", resolved.userId)
      .order("name");

    if (filter.gradeId) {
      query = query.eq("grade_id", filter.gradeId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map(toClass);
  }

  static async getById(id: string, context?: SupabaseUserContext): Promise<TeacherClass | null> {
    const resolved = await resolveUserContext(context);
    if (!resolved) return null;

    const { data, error } = await resolved.client
      .from("classes")
      .select("*")
      .eq("id", id)
      .eq("user_id", resolved.userId)
      .maybeSingle();

    if (error) throw error;
    return data ? toClass(data) : null;
  }

  static async create(
    input: ClassCreateInput,
    context?: SupabaseUserContext,
  ): Promise<TeacherClass | null> {
    const resolved = await resolveUserContext(context);
    if (!resolved) return null;

    if (!input.name?.trim()) {
      throw new Error("اسم الفصل مطلوب.");
    }

    await assertOwnedGrade(resolved, input.gradeId ?? null);

    const { data, error } = await resolved.client
      .from("classes")
      .insert(toInsertRow(resolved.userId, input))
      .select("*")
      .maybeSingle();

    if (error) throw error;
    return data ? toClass(data) : null;
  }

  static async update(
    id: string,
    patch: ClassUpdateInput,
    context?: SupabaseUserContext,
  ): Promise<TeacherClass | null> {
    const resolved = await resolveUserContext(context);
    if (!resolved) return null;

    if (patch.name !== undefined && !patch.name.trim()) {
      throw new Error("اسم الفصل مطلوب.");
    }

    if (patch.gradeId !== undefined) {
      await assertOwnedGrade(resolved, patch.gradeId);
    }

    const row = toUpdatePatch(patch);
    if (Object.keys(row).length === 0) {
      return this.getById(id, resolved);
    }

    const { data, error } = await resolved.client
      .from("classes")
      .update(row)
      .eq("id", id)
      .eq("user_id", resolved.userId)
      .select("*")
      .maybeSingle();

    if (error) throw error;
    return data ? toClass(data) : null;
  }

  static async delete(id: string, context?: SupabaseUserContext): Promise<boolean> {
    const resolved = await resolveUserContext(context);
    if (!resolved) return false;

    const { data, error } = await resolved.client
      .from("classes")
      .delete()
      .eq("id", id)
      .eq("user_id", resolved.userId)
      .select("id")
      .maybeSingle();

    if (error) throw error;
    return Boolean(data);
  }
}

async function assertOwnedGrade(
  context: SupabaseUserContext,
  gradeId: string | null,
): Promise<void> {
  if (!gradeId) return;

  const { data, error } = await context.client
    .from("grades")
    .select("id")
    .eq("id", gradeId)
    .eq("user_id", context.userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new Error("الصف غير موجود أو لا تملك صلاحية الوصول إليه.");
  }
}
