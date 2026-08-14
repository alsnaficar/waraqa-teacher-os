import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  adminArchiveCurriculum,
  adminDeleteCurriculumDraft,
  adminGetCurriculumLessons,
  adminListCurriculumFiles,
  adminPublishCurriculum,
} from "./curriculum-admin.ops.ts";

const TEACHER = {
  userId: "11111111-1111-4111-8111-111111111111",
  email: "teacher@waraqa.test",
};
const ADMIN = {
  userId: "22222222-2222-4222-8222-222222222222",
  email: "admin@waraqa.test",
};
const FILE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

type Trace = {
  tables: string[];
  curriculumTables: string[];
  deletes: Array<{ table: string; fileId?: string }>;
};

function isCurriculumTable(table: string): boolean {
  return table === "curriculum_files" || table === "curriculum_lessons";
}

/**
 * Minimal supabaseAdmin mock:
 * - user_roles drives assertAdmin
 * - curriculum_* ops are traced for ordering / mutation proofs
 */
function mockAdminClient(options: {
  role: "admin" | "teacher" | null;
  fileStatus?: "draft" | "published" | "archived" | "other";
  fileMeta?: { subject: string; grade: string; semester: string } | null;
}): {
  // Tests pass a behavioral mock; cast at call sites via `as never`.
  client: { from: (table: string) => unknown };
  trace: Trace;
} {
  const trace: Trace = { tables: [], curriculumTables: [], deletes: [] };
  const status = options.fileStatus ?? "draft";
  const meta =
    options.fileMeta === undefined
      ? { subject: "رياضيات", grade: "5", semester: "1" }
      : options.fileMeta;

  const client = {
    from(table: string) {
      trace.tables.push(table);
      if (isCurriculumTable(table)) {
        trace.curriculumTables.push(table);
      }

      if (table === "user_roles") {
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      async maybeSingle() {
                        // assertAdmin queries specifically for role === 'admin'
                        return {
                          data: options.role === "admin" ? { role: "admin" } : null,
                          error: null,
                        };
                      },
                    };
                  },
                  async maybeSingle() {
                    return {
                      data: options.role === "admin" ? { role: "admin" } : null,
                      error: null,
                    };
                  },
                };
              },
            };
          },
        };
      }

      if (table === "curriculum_files") {
        const state: {
          filters: Record<string, string>;
          patch: Record<string, unknown>;
          mode: "select" | "update" | "delete";
        } = { filters: {}, patch: {}, mode: "select" };

        const terminal = {
          async single() {
            if (!meta) {
              return { data: null, error: { message: "not found" } };
            }
            return {
              data: { id: FILE_ID, status, ...meta },
              error: null,
            };
          },
          async maybeSingle() {
            return {
              data: { id: FILE_ID, status },
              error: null,
            };
          },
          then(resolve: (v: unknown) => void, reject?: (e: unknown) => void) {
            return Promise.resolve({ data: [{ id: FILE_ID, status }], error: null }).then(
              resolve,
              reject,
            );
          },
        };

        const chain: Record<string, unknown> = {
          select() {
            state.mode = "select";
            return chain;
          },
          update(patch: Record<string, unknown>) {
            state.mode = "update";
            state.patch = patch;
            return chain;
          },
          delete() {
            state.mode = "delete";
            return chain;
          },
          eq(col: string, value: string) {
            state.filters[col] = value;
            return chain;
          },
          order() {
            return terminal;
          },
          single: terminal.single,
          maybeSingle: terminal.maybeSingle,
          then: terminal.then,
        };

        // Capture deletes when delete().eq() is awaited via thenable chain end
        const originalEq = chain.eq as (col: string, value: string) => typeof chain;
        chain.eq = (col: string, value: string) => {
          state.filters[col] = value;
          if (state.mode === "delete" && col === "id") {
            trace.deletes.push({ table: "curriculum_files", fileId: value });
          }
          return chain;
        };
        void originalEq;

        return chain;
      }

      if (table === "curriculum_lessons") {
        const state: { mode: "select" | "delete"; fileId?: string } = { mode: "select" };
        const chain: Record<string, unknown> = {
          select() {
            state.mode = "select";
            return chain;
          },
          delete() {
            state.mode = "delete";
            return chain;
          },
          eq(col: string, value: string) {
            if (col === "curriculum_file_id") state.fileId = value;
            if (state.mode === "delete") {
              trace.deletes.push({ table: "curriculum_lessons", fileId: value });
            }
            return chain;
          },
          order() {
            return Promise.resolve({ data: [], error: null });
          },
          then(resolve: (v: unknown) => void, reject?: (e: unknown) => void) {
            return Promise.resolve({ data: null, error: null }).then(resolve, reject);
          },
        };
        return chain;
      }

      throw new Error(`unexpected table ${table}`);
    },
  };

  return { client, trace };
}

function asAdmin(client: { from: (table: string) => unknown }) {
  return client as never;
}

function assertDeniedBeforeCurriculum(fn: () => Promise<unknown>, trace: Trace) {
  return assert.rejects(fn, (err: unknown) => {
    assert.ok(err instanceof Error);
    assert.match(err.message, /Administrators/);
    assert.deepEqual(
      trace.curriculumTables,
      [],
      "teacher denial must occur before any curriculum_* privileged I/O",
    );
    assert.ok(trace.tables.includes("user_roles"));
    assert.deepEqual(trace.deletes, []);
    return true;
  });
}

describe("W1 curriculum admin authorization", () => {
  it("A. Non-admin → getAdminCurriculumFiles denied", async () => {
    const { client, trace } = mockAdminClient({ role: "teacher" });
    await assertDeniedBeforeCurriculum(
      () => adminListCurriculumFiles(asAdmin(client), TEACHER),
      trace,
    );
  });

  it("B. Non-admin → getAdminCurriculumLessons denied", async () => {
    const { client, trace } = mockAdminClient({ role: "teacher" });
    await assertDeniedBeforeCurriculum(
      () => adminGetCurriculumLessons(asAdmin(client), TEACHER, FILE_ID),
      trace,
    );
  });

  it("C. Non-admin → publishCurriculum denied", async () => {
    const { client, trace } = mockAdminClient({ role: "teacher" });
    await assertDeniedBeforeCurriculum(
      () => adminPublishCurriculum(asAdmin(client), TEACHER, FILE_ID),
      trace,
    );
  });

  it("D. Non-admin → archiveCurriculum denied", async () => {
    const { client, trace } = mockAdminClient({ role: "teacher" });
    await assertDeniedBeforeCurriculum(
      () => adminArchiveCurriculum(asAdmin(client), TEACHER, FILE_ID),
      trace,
    );
  });

  it("E. Non-admin → deleteCurriculumDraft denied", async () => {
    const { client, trace } = mockAdminClient({ role: "teacher" });
    await assertDeniedBeforeCurriculum(
      () => adminDeleteCurriculumDraft(asAdmin(client), TEACHER, FILE_ID),
      trace,
    );
  });

  it("F. Admin → allowed through the authorization gate (list)", async () => {
    const { client, trace } = mockAdminClient({ role: "admin" });
    const rows = await adminListCurriculumFiles(asAdmin(client), ADMIN);
    assert.ok(Array.isArray(rows));
    assert.equal(trace.tables[0], "user_roles");
    assert.ok(trace.curriculumTables.includes("curriculum_files"));
  });

  it("G. Non-admin denial occurs BEFORE any privileged curriculum query/mutation", async () => {
    const ops = [
      () => {
        const m = mockAdminClient({ role: "teacher" });
        return { trace: m.trace, run: () => adminListCurriculumFiles(asAdmin(m.client), TEACHER) };
      },
      () => {
        const m = mockAdminClient({ role: "teacher" });
        return {
          trace: m.trace,
          run: () => adminGetCurriculumLessons(asAdmin(m.client), TEACHER, FILE_ID),
        };
      },
      () => {
        const m = mockAdminClient({ role: "teacher" });
        return {
          trace: m.trace,
          run: () => adminPublishCurriculum(asAdmin(m.client), TEACHER, FILE_ID),
        };
      },
      () => {
        const m = mockAdminClient({ role: "teacher" });
        return {
          trace: m.trace,
          run: () => adminArchiveCurriculum(asAdmin(m.client), TEACHER, FILE_ID),
        };
      },
      () => {
        const m = mockAdminClient({ role: "teacher" });
        return {
          trace: m.trace,
          run: () => adminDeleteCurriculumDraft(asAdmin(m.client), TEACHER, FILE_ID),
        };
      },
    ];

    for (const make of ops) {
      const { trace, run } = make();
      await assertDeniedBeforeCurriculum(run, trace);
    }
  });

  it("H. deleteCurriculumDraft → published target denied", async () => {
    const { client, trace } = mockAdminClient({ role: "admin", fileStatus: "published" });
    await assert.rejects(
      () => adminDeleteCurriculumDraft(asAdmin(client), ADMIN, FILE_ID),
      (err: unknown) =>
        err instanceof Error && err.message.includes("مسودات") && err.message.includes("draft"),
    );
    assert.deepEqual(trace.deletes, []);
    assert.ok(trace.curriculumTables.includes("curriculum_files"));
    assert.ok(!trace.curriculumTables.includes("curriculum_lessons"));
  });

  it("I. deleteCurriculumDraft → archived target denied", async () => {
    const { client, trace } = mockAdminClient({ role: "admin", fileStatus: "archived" });
    await assert.rejects(
      () => adminDeleteCurriculumDraft(asAdmin(client), ADMIN, FILE_ID),
      (err: unknown) => err instanceof Error && err.message.includes("draft"),
    );
    assert.deepEqual(trace.deletes, []);
  });

  it("J. deleteCurriculumDraft → draft target allowed for admin", async () => {
    const { client, trace } = mockAdminClient({ role: "admin", fileStatus: "draft" });
    const result = await adminDeleteCurriculumDraft(asAdmin(client), ADMIN, FILE_ID);
    assert.deepEqual(result, { success: true });
    assert.equal(trace.tables[0], "user_roles");
    assert.ok(trace.deletes.some((d) => d.table === "curriculum_lessons"));
    assert.ok(trace.deletes.some((d) => d.table === "curriculum_files"));
  });
});
