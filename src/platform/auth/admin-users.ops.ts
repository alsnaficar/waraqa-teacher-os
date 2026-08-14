/**
 * Admin Users & Roles — privileged operations (Phase 4).
 *
 * Authorization order (mandatory):
 *   JWT userId → assertAdmin(adminClient, userId) → validate → elevated work
 *
 * Email / Auth Admin API access MUST NOT happen before assertAdmin.
 */

import { assertAdmin } from "./assert-admin.ts";

type AdminClient = Awaited<
  typeof import("@/platform/database/supabase/client.server")
>["supabaseAdmin"];

type UserScopedClient = {
  rpc: (
    fn: "admin_set_user_role",
    args: { p_target_user_id: string; p_new_role: "admin" | "teacher" },
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

export type AppRole = "admin" | "teacher";
export type AdminUsersRoleFilter = "all" | "admin" | "teacher";

export type AdminUserListItem = {
  id: string;
  fullName: string | null;
  email: string | null;
  role: AppRole | null;
  createdAt: string | null;
};

export type ListAdminUsersInput = {
  search?: string;
  roleFilter?: AdminUsersRoleFilter;
};

export type SetUserRoleInput = {
  targetUserId: string;
  newRole: AppRole;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const APP_ROLES = new Set<AppRole>(["admin", "teacher"]);

export function isValidAppRole(value: unknown): value is AppRole {
  return typeof value === "string" && APP_ROLES.has(value as AppRole);
}

export function isValidUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/** Prefer admin when dual rows still exist historically; else teacher; else null. */
export function resolveSingleAppRole(roles: readonly string[]): AppRole | null {
  if (roles.includes("admin")) return "admin";
  if (roles.includes("teacher")) return "teacher";
  return null;
}

export function mapSetUserRoleError(rawMessage: string): Error {
  const message = rawMessage.toUpperCase();
  if (message.includes("SELF_ROLE_CHANGE_FORBIDDEN")) {
    return new Error("لا يمكنك تغيير دور حسابك الإداري");
  }
  if (message.includes("LAST_ADMIN")) {
    return new Error("لا يمكن تغيير دور آخر مدير في النظام");
  }
  if (message.includes("ADMIN_REQUIRED") || message.includes("NOT_AUTHENTICATED")) {
    return new Error("غير مصرح لك بتنفيذ هذا الإجراء");
  }
  if (message.includes("INVALID_ROLE")) {
    return new Error("الدور المحدد غير صالح");
  }
  if (message.includes("USER_NOT_FOUND") || message.includes("INVALID_TARGET")) {
    return new Error("المستخدم غير موجود");
  }
  return new Error("تعذّر تغيير دور المستخدم");
}

async function listAllAuthUsers(adminClient: AdminClient): Promise<
  Array<{
    id: string;
    email: string | undefined;
    created_at: string;
  }>
> {
  const perPage = 200;
  let page = 1;
  const users: Array<{ id: string; email: string | undefined; created_at: string }> = [];

  for (;;) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.error("[admin-users] listUsers failed:", error.message);
      throw new Error("تعذّر جلب قائمة المستخدمين");
    }
    const batch = data?.users ?? [];
    for (const u of batch) {
      users.push({
        id: u.id,
        email: u.email,
        created_at: u.created_at,
      });
    }
    if (batch.length < perPage) break;
    page += 1;
    if (page > 50) break; // hard safety bound
  }

  return users;
}

/**
 * List application users for Admin UI.
 * assertAdmin MUST run before Auth Admin / service-role reads.
 */
export async function listAdminUsersOp(
  adminClient: AdminClient,
  callerUserId: string,
  input: ListAdminUsersInput = {},
): Promise<AdminUserListItem[]> {
  await assertAdmin(adminClient, callerUserId);

  const search = (input.search ?? "").trim().toLowerCase();
  const roleFilter: AdminUsersRoleFilter = input.roleFilter ?? "all";

  const [authUsers, profilesResult, rolesResult] = await Promise.all([
    listAllAuthUsers(adminClient),
    adminClient.from("profiles").select("id, full_name, created_at"),
    adminClient.from("user_roles").select("user_id, role"),
  ]);

  if (profilesResult.error) {
    console.error("[admin-users] profiles read failed:", profilesResult.error.message);
    throw new Error("تعذّر جلب قائمة المستخدمين");
  }
  if (rolesResult.error) {
    console.error("[admin-users] user_roles read failed:", rolesResult.error.message);
    throw new Error("تعذّر جلب قائمة المستخدمين");
  }

  const profileById = new Map(
    (profilesResult.data ?? []).map((p) => [
      p.id,
      { fullName: p.full_name as string | null, createdAt: p.created_at as string | null },
    ]),
  );

  const rolesByUser = new Map<string, string[]>();
  for (const row of rolesResult.data ?? []) {
    const list = rolesByUser.get(row.user_id) ?? [];
    list.push(row.role);
    rolesByUser.set(row.user_id, list);
  }

  let items: AdminUserListItem[] = authUsers.map((u) => {
    const profile = profileById.get(u.id);
    return {
      id: u.id,
      fullName: profile?.fullName ?? null,
      email: u.email ?? null,
      role: resolveSingleAppRole(rolesByUser.get(u.id) ?? []),
      createdAt: profile?.createdAt ?? u.created_at ?? null,
    };
  });

  if (roleFilter === "admin" || roleFilter === "teacher") {
    items = items.filter((item) => item.role === roleFilter);
  }

  if (search) {
    items = items.filter((item) => {
      const email = (item.email ?? "").toLowerCase();
      const name = (item.fullName ?? "").toLowerCase();
      return email.includes(search) || name.includes(search);
    });
  }

  items.sort((a, b) => {
    const aTime = a.createdAt ? Date.parse(a.createdAt) : 0;
    const bTime = b.createdAt ? Date.parse(b.createdAt) : 0;
    return bTime - aTime;
  });

  return items;
}

/**
 * Change a user's application role (single role).
 * assertAdmin MUST run before RPC / elevated mutation.
 */
export async function setUserRoleOp(
  adminClient: AdminClient,
  userClient: UserScopedClient,
  callerUserId: string,
  input: SetUserRoleInput,
): Promise<{ ok: true }> {
  await assertAdmin(adminClient, callerUserId);

  if (!isValidUuid(input.targetUserId)) {
    throw new Error("المستخدم غير موجود");
  }

  if (!isValidAppRole(input.newRole)) {
    throw new Error("الدور المحدد غير صالح");
  }

  // Phase 4 MVP: never allow self role-change (clear Arabic error before RPC).
  if (callerUserId === input.targetUserId) {
    throw new Error("لا يمكنك تغيير دور حسابك الإداري");
  }

  const { error } = await userClient.rpc("admin_set_user_role", {
    p_target_user_id: input.targetUserId,
    p_new_role: input.newRole,
  });

  if (error) {
    console.error("[admin-users] admin_set_user_role failed:", error.message);
    throw mapSetUserRoleError(error.message);
  }

  return { ok: true };
}
