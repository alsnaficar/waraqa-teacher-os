import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { assertAdmin } from "./assert-admin.ts";

function mockRoleClient(role: string | null): {
  client: never;
  tables: string[];
} {
  const tables: string[] = [];
  const client = {
    from(table: string) {
      tables.push(table);
      return {
        select() {
          return {
            eq() {
              return {
                async maybeSingle() {
                  return {
                    data: role == null ? null : { role },
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
  return { client: client as never, tables };
}

describe("assertAdmin (W1)", () => {
  it("denies teacher role", async () => {
    const { client, tables } = mockRoleClient("teacher");
    await assert.rejects(
      () => assertAdmin(client, "user-1", "teacher@example.com"),
      (err: unknown) => err instanceof Error && err.message.includes("Administrators"),
    );
    assert.deepEqual(tables, ["user_roles"]);
  });

  it("allows admin role", async () => {
    const { client } = mockRoleClient("admin");
    await assertAdmin(client, "user-1", "admin@example.com");
  });

  it("allows legacy hardcoded email without requiring admin role (W4 debt)", async () => {
    const { client, tables } = mockRoleClient(null);
    await assertAdmin(client, "user-1", "coonan89@gmail.com");
    assert.deepEqual(tables, [], "legacy email must short-circuit before role lookup");
  });

  it("denies missing role row", async () => {
    const { client } = mockRoleClient(null);
    await assert.rejects(() => assertAdmin(client, "user-1", "x@y.com"));
  });

  it("does not invent new roles — only role === 'admin' grants", async () => {
    const { client } = mockRoleClient("superuser");
    await assert.rejects(() => assertAdmin(client, "user-1", "x@y.com"));
  });
});
