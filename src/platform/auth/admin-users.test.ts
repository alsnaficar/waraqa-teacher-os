import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  isValidAppRole,
  isValidUuid,
  listAdminUsersOp,
  mapSetUserRoleError,
  resolveSingleAppRole,
  setUserRoleOp,
} from "./admin-users.ops.ts";
import { pickPostLoginPath } from "./post-login-path.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const ADMIN_SET_ROLE_MIGRATION = join(
  ROOT,
  "supabase/migrations/20260810010000_admin_set_user_role.sql",
);
const USER_ROLES_FOUNDATION_MIGRATION = join(
  ROOT,
  "supabase/migrations/20260721102943_094f219a-cf02-4555-a9d8-7cc269f1923b.sql",
);
const BROWSER_SUPABASE_CLIENT = join(ROOT, "src/platform/database/supabase/client.ts");
const SERVER_SUPABASE_CLIENT = join(ROOT, "src/platform/database/supabase/client.server.ts");

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const TEACHER_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_ADMIN_ID = "33333333-3333-4333-8333-333333333333";
const MISSING_ID = "44444444-4444-4444-8444-444444444444";

type CallLog = string[];

function mockAssertAdminClient(options: {
  callerIsAdmin: boolean;
  callLog: CallLog;
  listUsers?: Array<{ id: string; email?: string; created_at: string }>;
  profiles?: Array<{ id: string; full_name: string | null; created_at: string }>;
  roles?: Array<{ user_id: string; role: string }>;
  listUsersError?: string;
  profilesError?: string;
  rolesError?: string;
}) {
  return {
    from(table: string) {
      options.callLog.push(`from:${table}`);
      if (table === "user_roles" && !options.callLog.includes("assertAdmin-done")) {
        // assertAdmin query path
        return {
          select() {
            return {
              eq(column: string, value: string) {
                assert.equal(column, "user_id");
                return {
                  eq(column2: string, value2: string) {
                    assert.equal(column2, "role");
                    assert.equal(value2, "admin");
                    return {
                      async maybeSingle() {
                        options.callLog.push("assertAdmin-done");
                        return {
                          data: options.callerIsAdmin ? { role: "admin" } : null,
                          error: null,
                        };
                      },
                    };
                  },
                };
              },
            };
          },
        };
      }

      if (table === "profiles") {
        return {
          select() {
            options.callLog.push("profiles:select");
            return Promise.resolve({
              data: options.profilesError ? null : (options.profiles ?? []),
              error: options.profilesError ? { message: options.profilesError } : null,
            });
          },
        };
      }

      if (table === "user_roles") {
        return {
          select() {
            options.callLog.push("roles:select");
            return Promise.resolve({
              data: options.rolesError ? null : (options.roles ?? []),
              error: options.rolesError ? { message: options.rolesError } : null,
            });
          },
        };
      }

      throw new Error(`unexpected table ${table}`);
    },
    auth: {
      admin: {
        async listUsers() {
          options.callLog.push("auth.admin.listUsers");
          if (options.listUsersError) {
            return { data: null, error: { message: options.listUsersError } };
          }
          return {
            data: { users: options.listUsers ?? [] },
            error: null,
          };
        },
      },
    },
  } as never;
}

describe("admin-users helpers", () => {
  it("resolves single application role preferring admin", () => {
    assert.equal(resolveSingleAppRole(["teacher", "admin"]), "admin");
    assert.equal(resolveSingleAppRole(["teacher"]), "teacher");
    assert.equal(resolveSingleAppRole([]), null);
  });

  it("validates app roles and UUIDs", () => {
    assert.equal(isValidAppRole("admin"), true);
    assert.equal(isValidAppRole("teacher"), true);
    assert.equal(isValidAppRole("superadmin"), false);
    assert.equal(isValidAppRole(""), false);
    assert.equal(isValidUuid(ADMIN_ID), true);
    assert.equal(isValidUuid("not-a-uuid"), false);
  });

  it("maps RPC errors to safe Arabic messages", () => {
    assert.match(mapSetUserRoleError("SELF_ROLE_CHANGE_FORBIDDEN").message, /حسابك الإداري/);
    assert.match(mapSetUserRoleError("LAST_ADMIN").message, /آخر مدير/);
    assert.match(mapSetUserRoleError("ADMIN_REQUIRED").message, /غير مصرح/);
    assert.match(mapSetUserRoleError("INVALID_ROLE").message, /غير صالح/);
    assert.match(mapSetUserRoleError("USER_NOT_FOUND").message, /غير موجود/);
  });
});

describe("listAdminUsersOp authorization", () => {
  it("teacher cannot list users (denied before Auth Admin)", async () => {
    const callLog: CallLog = [];
    const client = mockAssertAdminClient({ callerIsAdmin: false, callLog });
    await assert.rejects(
      () => listAdminUsersOp(client, TEACHER_ID),
      (err: unknown) => err instanceof Error && err.message.includes("Administrators"),
    );
    assert.ok(
      !callLog.includes("auth.admin.listUsers"),
      "must not call Auth Admin before/after deny",
    );
    assert.ok(!callLog.includes("profiles:select"));
  });

  it("admin can list users and Auth Admin runs only after assertAdmin", async () => {
    const callLog: CallLog = [];
    const client = mockAssertAdminClient({
      callerIsAdmin: true,
      callLog,
      listUsers: [
        { id: ADMIN_ID, email: "admin@example.com", created_at: "2026-01-01T00:00:00Z" },
        { id: TEACHER_ID, email: "teacher@example.com", created_at: "2026-01-02T00:00:00Z" },
      ],
      profiles: [
        { id: ADMIN_ID, full_name: "مدير تجريبي", created_at: "2026-01-01T00:00:00Z" },
        { id: TEACHER_ID, full_name: "معلم تجريبي", created_at: "2026-01-02T00:00:00Z" },
      ],
      roles: [
        { user_id: ADMIN_ID, role: "admin" },
        { user_id: TEACHER_ID, role: "teacher" },
      ],
    });

    const users = await listAdminUsersOp(client, ADMIN_ID, { roleFilter: "all" });
    assert.equal(users.length, 2);
    assert.equal(
      callLog.indexOf("assertAdmin-done") < callLog.indexOf("auth.admin.listUsers"),
      true,
    );
    assert.ok(!JSON.stringify(users).includes("coonan89"));
    assert.ok(!JSON.stringify(users).includes("coonan899"));
  });

  it("supports search by email/name and role filter without weakening auth", async () => {
    const callLog: CallLog = [];
    const client = mockAssertAdminClient({
      callerIsAdmin: true,
      callLog,
      listUsers: [
        { id: ADMIN_ID, email: "admin@example.com", created_at: "2026-01-01T00:00:00Z" },
        { id: TEACHER_ID, email: "teacher@example.com", created_at: "2026-01-02T00:00:00Z" },
      ],
      profiles: [
        { id: ADMIN_ID, full_name: "مدير تجريبي", created_at: "2026-01-01T00:00:00Z" },
        { id: TEACHER_ID, full_name: "معلم تجريبي", created_at: "2026-01-02T00:00:00Z" },
      ],
      roles: [
        { user_id: ADMIN_ID, role: "admin" },
        { user_id: TEACHER_ID, role: "teacher" },
      ],
    });

    const teachers = await listAdminUsersOp(client, ADMIN_ID, {
      roleFilter: "teacher",
      search: "معلم",
    });
    assert.equal(teachers.length, 1);
    assert.equal(teachers[0]?.role, "teacher");
    assert.ok(callLog.includes("assertAdmin-done"));
  });

  it("fails closed on Auth Admin / DB errors", async () => {
    const callLog: CallLog = [];
    const client = mockAssertAdminClient({
      callerIsAdmin: true,
      callLog,
      listUsersError: "service down",
    });
    await assert.rejects(() => listAdminUsersOp(client, ADMIN_ID));
    assert.ok(callLog.includes("assertAdmin-done"));
    assert.ok(callLog.includes("auth.admin.listUsers"));
  });

  it("does not authorize by email or UUID allowlist", async () => {
    const callLog: CallLog = [];
    const client = mockAssertAdminClient({ callerIsAdmin: false, callLog });
    await assert.rejects(() => listAdminUsersOp(client, "legacy-email-user"));
    assert.deepEqual(
      callLog.filter((c) => c.startsWith("from:")),
      ["from:user_roles"],
    );
  });
});

describe("setUserRoleOp authorization and rules", () => {
  it("teacher cannot change role", async () => {
    const callLog: CallLog = [];
    const client = mockAssertAdminClient({ callerIsAdmin: false, callLog });
    const rpcCalls: unknown[] = [];
    await assert.rejects(() =>
      setUserRoleOp(
        client,
        {
          async rpc(_fn, args) {
            rpcCalls.push(args);
            return { data: null, error: null };
          },
        },
        TEACHER_ID,
        { targetUserId: ADMIN_ID, newRole: "teacher" },
      ),
    );
    assert.equal(rpcCalls.length, 0, "RPC must not run when assertAdmin fails");
  });

  it("admin can change teacher → admin via RPC after assertAdmin", async () => {
    const callLog: CallLog = [];
    const client = mockAssertAdminClient({ callerIsAdmin: true, callLog });
    const rpcCalls: unknown[] = [];
    const result = await setUserRoleOp(
      client,
      {
        async rpc(fn, args) {
          assert.equal(fn, "admin_set_user_role");
          rpcCalls.push(args);
          callLog.push("rpc");
          return { data: null, error: null };
        },
      },
      ADMIN_ID,
      { targetUserId: TEACHER_ID, newRole: "admin" },
    );
    assert.deepEqual(result, { ok: true });
    assert.equal(callLog.indexOf("assertAdmin-done") < callLog.indexOf("rpc"), true);
    assert.deepEqual(rpcCalls[0], {
      p_target_user_id: TEACHER_ID,
      p_new_role: "admin",
    });
  });

  it("admin can request admin → teacher when another admin remains (RPC allowed)", async () => {
    const callLog: CallLog = [];
    const client = mockAssertAdminClient({ callerIsAdmin: true, callLog });
    await setUserRoleOp(
      client,
      {
        async rpc(_fn, args) {
          assert.equal((args as { p_target_user_id: string }).p_target_user_id, OTHER_ADMIN_ID);
          assert.equal((args as { p_new_role: string }).p_new_role, "teacher");
          return { data: null, error: null };
        },
      },
      ADMIN_ID,
      { targetUserId: OTHER_ADMIN_ID, newRole: "teacher" },
    );
  });

  it("admin cannot demote self", async () => {
    const callLog: CallLog = [];
    const client = mockAssertAdminClient({ callerIsAdmin: true, callLog });
    const rpcCalls: unknown[] = [];
    await assert.rejects(
      () =>
        setUserRoleOp(
          client,
          {
            async rpc(_fn, args) {
              rpcCalls.push(args);
              return { data: null, error: null };
            },
          },
          ADMIN_ID,
          { targetUserId: ADMIN_ID, newRole: "teacher" },
        ),
      (err: unknown) =>
        err instanceof Error && err.message.includes("لا يمكنك تغيير دور حسابك الإداري"),
    );
    assert.equal(rpcCalls.length, 0);
  });

  it("last admin demotion is rejected by RPC mapping", async () => {
    const callLog: CallLog = [];
    const client = mockAssertAdminClient({ callerIsAdmin: true, callLog });
    await assert.rejects(
      () =>
        setUserRoleOp(
          client,
          {
            async rpc() {
              return { data: null, error: { message: "LAST_ADMIN" } };
            },
          },
          ADMIN_ID,
          { targetUserId: OTHER_ADMIN_ID, newRole: "teacher" },
        ),
      (err: unknown) =>
        err instanceof Error && err.message.includes("لا يمكن تغيير دور آخر مدير في النظام"),
    );
  });

  it("invalid role rejected", async () => {
    const callLog: CallLog = [];
    const client = mockAssertAdminClient({ callerIsAdmin: true, callLog });
    await assert.rejects(
      () =>
        setUserRoleOp(
          client,
          {
            async rpc() {
              return { data: null, error: null };
            },
          },
          ADMIN_ID,
          { targetUserId: TEACHER_ID, newRole: "superadmin" as never },
        ),
      (err: unknown) => err instanceof Error && err.message.includes("الدور المحدد غير صالح"),
    );
  });

  it("invalid target UUID rejected", async () => {
    const callLog: CallLog = [];
    const client = mockAssertAdminClient({ callerIsAdmin: true, callLog });
    await assert.rejects(
      () =>
        setUserRoleOp(
          client,
          {
            async rpc() {
              return { data: null, error: null };
            },
          },
          ADMIN_ID,
          { targetUserId: "not-a-uuid", newRole: "teacher" },
        ),
      (err: unknown) => err instanceof Error && err.message.includes("المستخدم غير موجود"),
    );
  });

  it("missing target user rejected via RPC", async () => {
    const callLog: CallLog = [];
    const client = mockAssertAdminClient({ callerIsAdmin: true, callLog });
    await assert.rejects(
      () =>
        setUserRoleOp(
          client,
          {
            async rpc() {
              return { data: null, error: { message: "USER_NOT_FOUND" } };
            },
          },
          ADMIN_ID,
          { targetUserId: MISSING_ID, newRole: "teacher" },
        ),
      (err: unknown) => err instanceof Error && err.message.includes("المستخدم غير موجود"),
    );
  });

  it("DB/service error fails closed", async () => {
    const callLog: CallLog = [];
    const client = mockAssertAdminClient({ callerIsAdmin: true, callLog });
    await assert.rejects(
      () =>
        setUserRoleOp(
          client,
          {
            async rpc() {
              return { data: null, error: { message: "connection reset" } };
            },
          },
          ADMIN_ID,
          { targetUserId: TEACHER_ID, newRole: "admin" },
        ),
      (err: unknown) => err instanceof Error && err.message.includes("تعذّر تغيير دور المستخدم"),
    );
  });

  it("no email bypass and no UUID allowlist in authorization", async () => {
    const callLog: CallLog = [];
    const client = mockAssertAdminClient({ callerIsAdmin: false, callLog });
    await assert.rejects(() =>
      setUserRoleOp(
        client,
        {
          async rpc() {
            return { data: null, error: null };
          },
        },
        "user-with-legacy-email",
        { targetUserId: TEACHER_ID, newRole: "admin" },
      ),
    );
    assert.ok(callLog.includes("assertAdmin-done") || callLog.includes("from:user_roles"));
  });
});

describe("resolvePostLoginPath single-role semantics", () => {
  it("admin goes to /admin", () => {
    assert.equal(pickPostLoginPath(true), "/admin");
  });

  it("teacher goes to /dashboard", () => {
    assert.equal(pickPostLoginPath(false), "/dashboard");
  });
});

describe("admin_set_user_role SQL security invariants (deterministic; no live PG concurrency)", () => {
  /**
   * Limitation: this environment does not run a real concurrent PostgreSQL
   * integration harness. We therefore verify the migration source guarantees
   * serialization via pg_advisory_xact_lock before count/mutate, plus the
   * post-mutation zero-admin invariant. Do not treat this as a live race test.
   */
  const sql = readFileSync(ADMIN_SET_ROLE_MIGRATION, "utf8");
  const foundation = readFileSync(USER_ROLES_FOUNDATION_MIGRATION, "utf8");
  const browserClient = readFileSync(BROWSER_SUPABASE_CLIENT, "utf8");
  const serverClient = readFileSync(SERVER_SUPABASE_CLIENT, "utf8");

  it("RPC acquires transaction-scoped advisory lock before admin count and mutation", () => {
    const lockIdx = sql.indexOf("pg_advisory_xact_lock(hashtext('waraqa_admin_role_mutation'))");
    const countIdx = sql.indexOf("select count(*)::integer");
    const deleteIdx = sql.indexOf("delete from public.user_roles");
    assert.ok(lockIdx >= 0, "must use pg_advisory_xact_lock with dedicated key");
    assert.ok(countIdx > lockIdx, "admin count must run after advisory lock");
    assert.ok(deleteIdx > lockIdx, "role delete must run after advisory lock");
    assert.ok(deleteIdx > countIdx, "delete must run after last-admin count check");
  });

  it("RPC checks auth.uid() and admin role via has_role", () => {
    assert.match(sql, /v_caller uuid := auth\.uid\(\)/);
    assert.match(sql, /if v_caller is null/);
    assert.match(sql, /has_role\(v_caller,\s*'admin'::public\.app_role\)/);
    assert.match(sql, /SECURITY DEFINER/i);
    assert.match(sql, /set search_path = public/);
  });

  it("RPC prevents self-change, last-admin demotion, and missing target", () => {
    assert.match(sql, /SELF_ROLE_CHANGE_FORBIDDEN/);
    assert.match(sql, /LAST_ADMIN/);
    assert.match(sql, /USER_NOT_FOUND/);
    assert.match(sql, /from auth\.users u where u\.id = p_target_user_id/);
  });

  it("RPC enforces exactly one role (delete then single insert) and post-mutation admin_count >= 1", () => {
    assert.match(sql, /delete from public\.user_roles\s+where user_id = p_target_user_id/i);
    assert.match(
      sql,
      /insert into public\.user_roles \(user_id, role\)\s+values \(p_target_user_id, p_new_role\)/i,
    );
    const postIdx = sql.lastIndexOf("if v_admin_count < 1");
    assert.ok(postIdx > sql.indexOf("insert into public.user_roles"), "post-check after insert");
  });

  it("migration does not mutate existing role data or drop tables", () => {
    assert.doesNotMatch(sql, /\bDROP\s+TABLE\b/i);
    assert.doesNotMatch(sql, /\bALTER\s+TABLE\b/i);
    assert.doesNotMatch(sql, /\bCREATE\s+POLICY\b/i);
    assert.doesNotMatch(sql, /\bDROP\s+POLICY\b/i);
    // No top-level DML against user_roles outside the function body is required;
    // migration should only CREATE OR REPLACE FUNCTION + GRANT/REVOKE/COMMENT.
    assert.match(sql, /create or replace function public\.admin_set_user_role/i);
    assert.match(sql, /revoke all on function public\.admin_set_user_role/i);
    assert.match(
      sql,
      /grant execute on function public\.admin_set_user_role[\s\S]*to authenticated/i,
    );
    assert.match(
      sql,
      /grant execute on function public\.admin_set_user_role[\s\S]*to service_role/i,
    );
  });

  it("authenticated clients have SELECT-only on user_roles (foundation RLS intact)", () => {
    assert.match(foundation, /GRANT SELECT ON public\.user_roles TO authenticated/i);
    assert.match(
      foundation,
      /CREATE POLICY "read own roles" ON public\.user_roles FOR SELECT TO authenticated/i,
    );
    assert.doesNotMatch(foundation, /ON public\.user_roles FOR INSERT TO authenticated/i);
    assert.doesNotMatch(foundation, /ON public\.user_roles FOR UPDATE TO authenticated/i);
    assert.doesNotMatch(foundation, /ON public\.user_roles FOR DELETE TO authenticated/i);
    // Phase 4 migration must not add write policies for authenticated.
    assert.doesNotMatch(sql, /ON public\.user_roles FOR (INSERT|UPDATE|DELETE)/i);
  });

  it("service role is not exposed in browser supabase client", () => {
    assert.doesNotMatch(browserClient, /SERVICE_ROLE/);
    assert.doesNotMatch(browserClient, /service_role/);
    assert.match(serverClient, /SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("anonymous cannot execute RPC (revoke from anon/public)", () => {
    assert.match(
      sql,
      /revoke all on function public\.admin_set_user_role[\s\S]*from public, anon/i,
    );
  });
});
