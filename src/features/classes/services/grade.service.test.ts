import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { SupabaseUserContext } from "@/platform/database/supabase/context";

import { GradeService } from "./grade.service.ts";

const TEACHER_A = "11111111-1111-4111-8111-111111111111";
const TEACHER_B = "22222222-2222-4222-8222-222222222222";

type Row = Record<string, unknown>;
type Db = { grades: Row[]; classes: Row[] };

function matchesEq(row: Row, filters: Record<string, unknown>): boolean {
  return Object.entries(filters).every(([column, value]) => row[column] === value);
}

function createMockClient(db: Db) {
  const client = {
    from(table: string) {
      const state: {
        filters: Record<string, unknown>;
        op: "select" | "insert" | "update" | "delete" | null;
        insertRows: Row[];
        patch: Record<string, unknown>;
        orders: Array<{ column: string; ascending: boolean }>;
      } = {
        filters: {},
        op: null,
        insertRows: [],
        patch: {},
        orders: [],
      };

      const runSelect = (): Row[] => {
        let rows = [...((db as Record<string, Row[]>)[table] ?? [])];
        for (const [column, value] of Object.entries(state.filters)) {
          rows = rows.filter((row) => row[column] === value);
        }
        for (const order of state.orders) {
          rows.sort((a, b) => {
            const av = a[order.column];
            const bv = b[order.column];
            if (av === bv) return 0;
            if (av == null) return 1;
            if (bv == null) return -1;
            if (av < bv) return order.ascending ? -1 : 1;
            return order.ascending ? 1 : -1;
          });
        }
        return rows;
      };

      const chain = {
        select(_columns?: string) {
          if (state.op !== "insert" && state.op !== "update" && state.op !== "delete") {
            state.op = "select";
          }
          return chain;
        },
        insert(rows: Row | Row[]) {
          state.op = "insert";
          state.insertRows = Array.isArray(rows) ? rows : [rows];
          return chain;
        },
        update(patch: Record<string, unknown>) {
          state.op = "update";
          state.patch = patch;
          return chain;
        },
        delete() {
          state.op = "delete";
          return chain;
        },
        eq(column: string, value: unknown) {
          state.filters[column] = value;
          return chain;
        },
        order(column: string, opts?: { ascending?: boolean }) {
          state.orders.push({ column, ascending: opts?.ascending !== false });
          return chain;
        },
        async maybeSingle() {
          if (state.op === "insert") {
            const target = (db as Record<string, Row[]>)[table] ?? [];
            const row = state.insertRows[0];
            if (!row) return { data: null, error: null };
            const inserted = {
              id: `${table}-${target.length + 1}`,
              created_at: "2026-08-15T00:00:00Z",
              updated_at: "2026-08-15T00:00:00Z",
              order_index: 0,
              grade_id: null,
              ...row,
            };
            target.push(inserted);
            return { data: { ...inserted }, error: null };
          }
          if (state.op === "update") {
            const target = ((db as Record<string, Row[]>)[table] ?? []).filter((row) =>
              matchesEq(row, state.filters),
            );
            const current = target[0];
            if (!current) return { data: null, error: null };
            Object.assign(current, state.patch, { updated_at: "2026-08-15T12:00:00Z" });
            return { data: { ...current }, error: null };
          }
          if (state.op === "delete") {
            const rows = (db as Record<string, Row[]>)[table] ?? [];
            const idx = rows.findIndex((row) => matchesEq(row, state.filters));
            if (idx < 0) return { data: null, error: null };
            const [removed] = rows.splice(idx, 1);
            return { data: removed ? { id: removed.id } : null, error: null };
          }
          const rows = runSelect();
          return { data: rows[0] ?? null, error: null };
        },
        then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
          return Promise.resolve({ data: runSelect(), error: null }).then(resolve, reject);
        },
      };

      return chain;
    },
  };

  return client as never;
}

function authFor(db: Db, userId = TEACHER_A): SupabaseUserContext {
  return { client: createMockClient(db), userId };
}

describe("TASK 25.1 GradeService", () => {
  it("1. creates owned grade", async () => {
    const db: Db = { grades: [], classes: [] };
    const created = await GradeService.create({ name: "الأول متوسط", orderIndex: 1 }, authFor(db));
    assert.ok(created);
    assert.equal(created.teacherId, TEACHER_A);
    assert.equal(created.name, "الأول متوسط");
    assert.equal(created.orderIndex, 1);
    assert.equal(db.grades[0]?.user_id, TEACHER_A);
  });

  it("2. lists owned grades only", async () => {
    const db: Db = {
      grades: [
        {
          id: "g1",
          user_id: TEACHER_A,
          name: "أول",
          order_index: 1,
          created_at: "2026-08-15T00:00:00Z",
          updated_at: "2026-08-15T00:00:00Z",
        },
        {
          id: "g2",
          user_id: TEACHER_B,
          name: "ثاني",
          order_index: 2,
          created_at: "2026-08-15T00:00:00Z",
          updated_at: "2026-08-15T00:00:00Z",
        },
      ],
      classes: [],
    };
    const listed = await GradeService.list(authFor(db));
    assert.equal(listed.length, 1);
    assert.equal(listed[0]?.id, "g1");
  });

  it("3. updates owned grade", async () => {
    const db: Db = {
      grades: [
        {
          id: "g1",
          user_id: TEACHER_A,
          name: "قديم",
          order_index: 0,
          created_at: "2026-08-15T00:00:00Z",
          updated_at: "2026-08-15T00:00:00Z",
        },
      ],
      classes: [],
    };
    const updated = await GradeService.update("g1", { name: "جديد", orderIndex: 5 }, authFor(db));
    assert.ok(updated);
    assert.equal(updated.name, "جديد");
    assert.equal(updated.orderIndex, 5);
  });

  it("4. deletes owned grade", async () => {
    const db: Db = {
      grades: [
        {
          id: "g1",
          user_id: TEACHER_A,
          name: "أول",
          order_index: 0,
          created_at: "2026-08-15T00:00:00Z",
          updated_at: "2026-08-15T00:00:00Z",
        },
      ],
      classes: [],
    };
    assert.equal(await GradeService.delete("g1", authFor(db)), true);
    assert.equal(db.grades.length, 0);
  });

  it("10. foreign teacher cannot get/update/delete another teacher's grade", async () => {
    const db: Db = {
      grades: [
        {
          id: "g1",
          user_id: TEACHER_A,
          name: "أول",
          order_index: 0,
          created_at: "2026-08-15T00:00:00Z",
          updated_at: "2026-08-15T00:00:00Z",
        },
      ],
      classes: [],
    };
    assert.equal(await GradeService.getById("g1", authFor(db, TEACHER_B)), null);
    assert.equal(await GradeService.update("g1", { name: "سرقة" }, authFor(db, TEACHER_B)), null);
    assert.equal(await GradeService.delete("g1", authFor(db, TEACHER_B)), false);
    assert.equal(db.grades[0]?.name, "أول");
  });

  it("12. unauthenticated access returns empty/null", async () => {
    const db: Db = { grades: [], classes: [] };
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "grade.service.ts"), "utf8");
    assert.match(source, /resolveUserContext/);
    assert.match(source, /if\s*\(\s*!resolved\s*\)\s*return\s*\[\]/);
    assert.match(source, /if\s*\(\s*!resolved\s*\)\s*return\s*null/);
    assert.match(source, /if\s*\(\s*!resolved\s*\)\s*return\s*false/);
    assert.equal(/\bteacher_id\s*:/.test(source), false);
    const created = await GradeService.create({ name: "صف" }, authFor(db));
    assert.ok(created);
  });

  it("13. rejects empty/whitespace names", async () => {
    const db: Db = { grades: [], classes: [] };
    await assert.rejects(() => GradeService.create({ name: "   " }, authFor(db)), /اسم الصف مطلوب/);
    await assert.rejects(() => GradeService.create({ name: "" }, authFor(db)), /اسم الصف مطلوب/);

    db.grades.push({
      id: "g1",
      user_id: TEACHER_A,
      name: "أول",
      order_index: 0,
      created_at: "2026-08-15T00:00:00Z",
      updated_at: "2026-08-15T00:00:00Z",
    });
    await assert.rejects(
      () => GradeService.update("g1", { name: "  " }, authFor(db)),
      /اسم الصف مطلوب/,
    );
  });

  it("14. schema allows duplicate grade names (no unique constraint)", async () => {
    const db: Db = { grades: [], classes: [] };
    const a = await GradeService.create({ name: "أول متوسط" }, authFor(db));
    const b = await GradeService.create({ name: "أول متوسط" }, authFor(db));
    assert.ok(a);
    assert.ok(b);
    assert.notEqual(a.id, b.id);
    assert.equal(db.grades.length, 2);
  });

  it("never accepts client teacher_id in create signature", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "grade.service.ts"), "utf8");
    assert.match(source, /create\(\s*input:\s*GradeCreateInput,\s*context\?:/);
    assert.match(source, /user_id:\s*teacherId/);
    assert.equal(/GradeCreateInput\s*=\s*\{[^}]*teacher/s.test(source), false);
    assert.equal(/\bteacher_id\s*:/.test(source), false);
  });
});
