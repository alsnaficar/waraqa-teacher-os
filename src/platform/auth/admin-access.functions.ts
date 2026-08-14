import { createServerFn } from "@tanstack/react-start";

import { assertAdmin } from "@/platform/auth/assert-admin";
import { pickPostLoginPath, type AdminHomePath } from "@/platform/auth/post-login-path";
import { requireSupabaseAuth } from "@/platform/database/supabase/auth-middleware";

export type { AdminHomePath };
export { pickPostLoginPath };

export type AdminDashboardStats = {
  users: number;
  teachers: number;
  admins: number;
  curriculumTotal: number;
  curriculumDraft: number;
  curriculumPublished: number;
  curriculumArchived: number;
  recentCurriculum: Array<{
    id: string;
    originalName: string;
    status: string;
    subject: string | null;
    grade: string | null;
    updatedAt: string;
  }>;
};

async function countRows(
  client: Awaited<typeof import("@/platform/database/supabase/client.server")>["supabaseAdmin"],
  table: "profiles" | "user_roles" | "curriculum_files",
  filters?: { column: string; value: string },
): Promise<number> {
  let query = client.from(table).select("*", { count: "exact", head: true });
  if (filters) {
    query = query.eq(filters.column, filters.value);
  }
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

/**
 * Server gate for Admin routes and Admin-only RPCs.
 * Throws unless public.user_roles.role === 'admin' for the JWT subject.
 */
export const requireAdminAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ userId: string }> => {
    const { supabaseAdmin } = await import("@/platform/database/supabase/client.server");
    await assertAdmin(supabaseAdmin, context.userId);
    return { userId: context.userId };
  });

/**
 * Post-login destination based solely on user_roles.role === 'admin'.
 * Teachers (or missing admin role) → /dashboard. Admins → /admin.
 */
export const resolvePostLoginPath = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ path: AdminHomePath }> => {
    const { supabaseAdmin } = await import("@/platform/database/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();

    if (error) {
      console.error("[admin] resolvePostLoginPath role lookup failed:", error.message);
      return { path: "/dashboard" };
    }

    return { path: pickPostLoginPath(data?.role === "admin") };
  });

/**
 * Aggregate Admin dashboard metrics. Asserts Admin before any elevated read.
 */
export const getAdminDashboardStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminDashboardStats> => {
    const { supabaseAdmin } = await import("@/platform/database/supabase/client.server");
    await assertAdmin(supabaseAdmin, context.userId);

    const [
      users,
      teachers,
      admins,
      curriculumTotal,
      curriculumDraft,
      curriculumPublished,
      curriculumArchived,
      recentResult,
    ] = await Promise.all([
      countRows(supabaseAdmin, "profiles"),
      countRows(supabaseAdmin, "user_roles", { column: "role", value: "teacher" }),
      countRows(supabaseAdmin, "user_roles", { column: "role", value: "admin" }),
      countRows(supabaseAdmin, "curriculum_files"),
      countRows(supabaseAdmin, "curriculum_files", { column: "status", value: "draft" }),
      countRows(supabaseAdmin, "curriculum_files", { column: "status", value: "published" }),
      countRows(supabaseAdmin, "curriculum_files", { column: "status", value: "archived" }),
      supabaseAdmin
        .from("curriculum_files")
        .select("id, original_name, status, subject, grade, updated_at")
        .order("updated_at", { ascending: false })
        .limit(5),
    ]);

    if (recentResult.error) throw recentResult.error;

    return {
      users,
      teachers,
      admins,
      curriculumTotal,
      curriculumDraft,
      curriculumPublished,
      curriculumArchived,
      recentCurriculum: (recentResult.data ?? []).map((row) => ({
        id: row.id,
        originalName: row.original_name,
        status: row.status,
        subject: row.subject,
        grade: row.grade,
        updatedAt: row.updated_at,
      })),
    };
  });
