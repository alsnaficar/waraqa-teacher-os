import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { assertAdmin } from "./assert-admin.ts";

/**
 * Phase 2 gate semantics: dashboard/route access must use the same
 * role-only assertAdmin decision as other Admin server ops.
 */
describe("admin route gate semantics (Phase 2)", () => {
  function mockRoleClient(role: "admin" | null) {
    return {
      from(table: string) {
        assert.equal(table, "user_roles");
        return {
          select() {
            return {
              eq(column: string, value: string) {
                if (column === "user_id") {
                  return {
                    eq(column2: string, value2: string) {
                      assert.equal(column2, "role");
                      assert.equal(value2, "admin");
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
                }
                assert.equal(column, "role");
                assert.equal(value, "admin");
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
    } as never;
  }

  it("teacher cannot pass admin gate", async () => {
    await assert.rejects(() => assertAdmin(mockRoleClient(null), "teacher-id"));
  });

  it("missing role cannot pass admin gate", async () => {
    await assert.rejects(() => assertAdmin(mockRoleClient(null), "orphan-id"));
  });

  it("admin role passes admin gate", async () => {
    await assertAdmin(mockRoleClient("admin"), "admin-id");
  });
});
