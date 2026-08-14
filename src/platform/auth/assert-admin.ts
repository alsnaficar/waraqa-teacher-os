/**
 * Server-side admin authorization (canonical project pattern).
 *
 * - identity: caller userId from JWT (passed by server handlers)
 * - decision: public.user_roles contains role === 'admin' for that userId
 * - never authorize by email
 *
 * Call BEFORE any service_role curriculum (or other admin) elevation.
 */

type AdminClient = Awaited<
  typeof import("@/platform/database/supabase/client.server")
>["supabaseAdmin"];

export async function assertAdmin(client: AdminClient, userId: string): Promise<void> {
  const { data, error } = await client
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();

  if (error) {
    console.error("[assertAdmin] user_roles lookup failed:", error.message);
    throw new Error("عذراً، هذا الإجراء متاح فقط لمديري النظام (Administrators).");
  }

  if (data?.role === "admin") return;

  throw new Error("عذراً، هذا الإجراء متاح فقط لمديري النظام (Administrators).");
}
