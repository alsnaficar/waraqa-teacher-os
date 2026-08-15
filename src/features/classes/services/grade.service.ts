import { resolveUserContext, type SupabaseUserContext } from "@/platform/database/supabase/context";
import type { Database } from "@/platform/database/supabase/types";

type GradeRow = Database["public"]["Tables"]["grades"]["Row"];
type GradeInsert = Database["public"]["Tables"]["grades"]["Insert"];
type GradeUpdate = Database["public"]["Tables"]["grades"]["Update"];

export interface TeacherGrade {
  id: string;
  teacherId: string;
  name: string;
  orderIndex: number;
  createdAt: string;
  updatedAt: string;
}

export type GradeCreateInput = {
  name: string;
  orderIndex?: number;
};

export type GradeUpdateInput = Partial<GradeCreateInput>;

function toGrade(row: GradeRow): TeacherGrade {
  return {
    id: row.id,
    teacherId: row.user_id,
    name: row.name,
    orderIndex: row.order_index,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toInsertRow(teacherId: string, input: GradeCreateInput): GradeInsert {
  return {
    user_id: teacherId,
    name: input.name.trim(),
    order_index: input.orderIndex ?? 0,
  };
}

function toUpdatePatch(patch: GradeUpdateInput): GradeUpdate {
  const row: GradeUpdate = {};
  if (patch.name !== undefined) row.name = patch.name.trim();
  if (patch.orderIndex !== undefined) row.order_index = patch.orderIndex;
  return row;
}

/**
 * Teacher-owned grades (الصفوف الدراسية).
 * Ownership always from resolveUserContext — never from client teacher_id.
 */
export class GradeService {
  static async list(context?: SupabaseUserContext): Promise<TeacherGrade[]> {
    const resolved = await resolveUserContext(context);
    if (!resolved) return [];

    const { data, error } = await resolved.client
      .from("grades")
      .select("*")
      .eq("user_id", resolved.userId)
      .order("order_index")
      .order("name");

    if (error) throw error;
    return (data ?? []).map(toGrade);
  }

  static async getById(id: string, context?: SupabaseUserContext): Promise<TeacherGrade | null> {
    const resolved = await resolveUserContext(context);
    if (!resolved) return null;

    const { data, error } = await resolved.client
      .from("grades")
      .select("*")
      .eq("id", id)
      .eq("user_id", resolved.userId)
      .maybeSingle();

    if (error) throw error;
    return data ? toGrade(data) : null;
  }

  static async create(
    input: GradeCreateInput,
    context?: SupabaseUserContext,
  ): Promise<TeacherGrade | null> {
    const resolved = await resolveUserContext(context);
    if (!resolved) return null;

    if (!input.name?.trim()) {
      throw new Error("اسم الصف مطلوب.");
    }

    const { data, error } = await resolved.client
      .from("grades")
      .insert(toInsertRow(resolved.userId, input))
      .select("*")
      .maybeSingle();

    if (error) throw error;
    return data ? toGrade(data) : null;
  }

  static async update(
    id: string,
    patch: GradeUpdateInput,
    context?: SupabaseUserContext,
  ): Promise<TeacherGrade | null> {
    const resolved = await resolveUserContext(context);
    if (!resolved) return null;

    if (patch.name !== undefined && !patch.name.trim()) {
      throw new Error("اسم الصف مطلوب.");
    }

    const row = toUpdatePatch(patch);
    if (Object.keys(row).length === 0) {
      return this.getById(id, resolved);
    }

    const { data, error } = await resolved.client
      .from("grades")
      .update(row)
      .eq("id", id)
      .eq("user_id", resolved.userId)
      .select("*")
      .maybeSingle();

    if (error) throw error;
    return data ? toGrade(data) : null;
  }

  static async delete(id: string, context?: SupabaseUserContext): Promise<boolean> {
    const resolved = await resolveUserContext(context);
    if (!resolved) return false;

    const { data, error } = await resolved.client
      .from("grades")
      .delete()
      .eq("id", id)
      .eq("user_id", resolved.userId)
      .select("id")
      .maybeSingle();

    if (error) throw error;
    return Boolean(data);
  }
}
