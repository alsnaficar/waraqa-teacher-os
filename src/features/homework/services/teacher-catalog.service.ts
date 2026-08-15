import { resolveUserContext, type SupabaseUserContext } from "@/platform/database/supabase/context";

export type TeacherCatalogItem = {
  id: string;
  name: string;
  /** Present for classes only — optional grade binding. */
  gradeId?: string | null;
};

/**
 * Read-only teacher catalogs for class/grade pickers.
 * Ownership via resolveUserContext — never accepts client teacher_id.
 */
export class TeacherCatalogService {
  static async listClasses(context?: SupabaseUserContext): Promise<TeacherCatalogItem[]> {
    const resolved = await resolveUserContext(context);
    if (!resolved) return [];

    const { data, error } = await resolved.client
      .from("classes")
      .select("id, name, grade_id")
      .eq("user_id", resolved.userId)
      .order("name");

    if (error) throw error;
    return (data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      gradeId: row.grade_id,
    }));
  }

  static async listGrades(context?: SupabaseUserContext): Promise<TeacherCatalogItem[]> {
    const resolved = await resolveUserContext(context);
    if (!resolved) return [];

    const { data, error } = await resolved.client
      .from("grades")
      .select("id, name")
      .eq("user_id", resolved.userId)
      .order("order_index")
      .order("name");

    if (error) throw error;
    return (data ?? []).map((row) => ({ id: row.id, name: row.name }));
  }
}
