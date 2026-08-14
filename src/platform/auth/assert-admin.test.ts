import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { assertAdmin } from "./assert-admin.ts";

function mockRoleClient(options: { role: string | null; errorMessage?: string }): {
  client: never;
  tables: string[];
  eqs: Array<{ column: string; value: string }>;
} {
  const tables: string[] = [];
  const eqs: Array<{ column: string; value: string }> = [];

  const terminal = {
    async maybeSingle() {
      if (options.errorMessage) {
        return { data: null, error: { message: options.errorMessage } };
      }
      return {
        data: options.role == null ? null : { role: options.role },
        error: null,
      };
    },
  };

  const chain = {
    eq(column: string, value: string) {
      eqs.push({ column, value });
      return {
        eq(column2: string, value2: string) {
          eqs.push({ column: column2, value: value2 });
          return terminal;
        },
        ...terminal,
      };
    },
  };

  const client = {
    from(table: string) {
      tables.push(table);
      return {
        select() {
          return chain;
        },
      };
    },
  };
  return { client: client as never, tables, eqs };
}

describe("assertAdmin (W1)", () => {
  it("denies teacher role", async () => {
    const { client, tables, eqs } = mockRoleClient({ role: null });
    // Simulate "no admin row" (teacher-only users have no role='admin' row match).
    await assert.rejects(
      () => assertAdmin(client, "user-1"),
      (err: unknown) => err instanceof Error && err.message.includes("Administrators"),
    );
    assert.deepEqual(tables, ["user_roles"]);
    assert.deepEqual(eqs, [
      { column: "user_id", value: "user-1" },
      { column: "role", value: "admin" },
    ]);
  });

  it("allows admin role", async () => {
    const { client, tables, eqs } = mockRoleClient({ role: "admin" });
    await assertAdmin(client, "user-1");
    assert.deepEqual(tables, ["user_roles"]);
    assert.deepEqual(eqs, [
      { column: "user_id", value: "user-1" },
      { column: "role", value: "admin" },
    ]);
  });

  it("denies missing role row", async () => {
    const { client, tables } = mockRoleClient({ role: null });
    await assert.rejects(() => assertAdmin(client, "user-1"));
    assert.deepEqual(tables, ["user_roles"]);
  });

  it("does not invent new roles — only role === 'admin' grants", async () => {
    const { client } = mockRoleClient({ role: null });
    await assert.rejects(() => assertAdmin(client, "user-1"));
  });

  it("does not grant admin based on arbitrary email (email is not an auth input)", async () => {
    const { client, tables } = mockRoleClient({ role: null });
    await assert.rejects(() => assertAdmin(client, "user-1"));
    assert.deepEqual(tables, ["user_roles"]);
  });

  it("denies legacy admin email when role is not admin", async () => {
    const { client, tables } = mockRoleClient({ role: null });
    await assert.rejects(() => assertAdmin(client, "user-legacy"));
    assert.deepEqual(tables, ["user_roles"], "must look up user_roles; no email bypass");
  });

  it("denies when role lookup returns an error", async () => {
    const { client } = mockRoleClient({ role: null, errorMessage: "db down" });
    await assert.rejects(() => assertAdmin(client, "user-1"));
  });
});
