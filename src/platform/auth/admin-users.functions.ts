import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/platform/database/supabase/auth-middleware";
import {
  listAdminUsersOp,
  setUserRoleOp,
  type AdminUserListItem,
  type AdminUsersRoleFilter,
  type AppRole,
} from "@/platform/auth/admin-users.ops";

export type { AdminUserListItem, AdminUsersRoleFilter, AppRole };

const ListAdminUsersInput = z.object({
  search: z.string().max(200).optional().default(""),
  roleFilter: z.enum(["all", "admin", "teacher"]).optional().default("all"),
});

/** Shape only — UUID/role validity is enforced after assertAdmin in setUserRoleOp. */
const SetUserRoleInput = z.object({
  targetUserId: z.string().min(1).max(64),
  newRole: z.string().min(1).max(32),
});

/**
 * Admin-only user directory (emails via Auth Admin API after assertAdmin).
 */
export const listAdminUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ListAdminUsersInput.parse(data ?? {}))
  .handler(async ({ context, data }): Promise<{ users: AdminUserListItem[] }> => {
    const { supabaseAdmin } = await import("@/platform/database/supabase/client.server");
    const users = await listAdminUsersOp(supabaseAdmin, context.userId, {
      search: data.search,
      roleFilter: data.roleFilter,
    });
    return { users };
  });

/**
 * Admin-only role mutation via SECURITY DEFINER RPC (auth.uid() = caller).
 * assertAdmin runs inside setUserRoleOp before validation and RPC.
 */
export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => SetUserRoleInput.parse(data))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const { supabaseAdmin } = await import("@/platform/database/supabase/client.server");
    return setUserRoleOp(supabaseAdmin, context.supabase, context.userId, {
      targetUserId: data.targetUserId,
      newRole: data.newRole as AppRole,
    });
  });
