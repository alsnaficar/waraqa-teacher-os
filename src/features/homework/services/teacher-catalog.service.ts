import { resolveUserContext, type SupabaseUserContext } from "@/platform/database/supabase/context";

export type TeacherCatalogItem = {
  id: string;
  name: string;
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
      .select("id, name")
      .eq("user_id", resolved.userId)
      .order("name");

    if (error) throw error;
    return (data ?? []).map((row) => ({ id: row.id, name: row.name }));
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
