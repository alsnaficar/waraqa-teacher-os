/**
 * Server-side admin authorization (canonical project pattern).
 *
 * Semantics match billing `assertAdmin` / sheets `validateAdmin`:
 * - identity: caller userId from JWT (passed by server handlers)
 * - decision: user_roles.role === 'admin'
 * - legacy: hardcoded email short-circuit (W4 debt — do not expand)
 *
 * Call BEFORE any service_role curriculum (or other admin) elevation.
 */

type AdminClient = Awaited<
  typeof import("@/platform/database/supabase/client.server")
>["supabaseAdmin"];

/** W4 debt: existing project helper short-circuit. Do not add new email gates. */
const LEGACY_HARDCODED_ADMIN_EMAIL = "coonan89@gmail.com";

export async function assertAdmin(
  client: AdminClient,
  userId: string,
  email: string,
): Promise<void> {
  if (email === LEGACY_HARDCODED_ADMIN_EMAIL) return;

  const { data } = await client
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();

  if (data?.role === "admin") return;

  throw new Error("عذراً، هذا الإجراء متاح فقط لمديري النظام (Administrators).");
}
