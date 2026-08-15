import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

import type { SupabaseUserContext } from "@/platform/database/supabase/context";

import { ClassService } from "./class.service.ts";

const TEACHER_A = "11111111-1111-4111-8111-111111111111";
const TEACHER_B = "22222222-2222-4222-8222-222222222222";
const GRADE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const GRADE_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

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
            if (String(av) < String(bv)) return order.ascending ? -1 : 1;
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

function seedOwnedGrade(db: Db, id = GRADE_A, userId = TEACHER_A): void {
  db.grades.push({
    id,
    user_id: userId,
    name: "الأول متوسط",
    order_index: 1,
    created_at: "2026-08-15T00:00:00Z",
    updated_at: "2026-08-15T00:00:00Z",
  });
}

describe("TASK 25.1 ClassService", () => {
  it("5. creates owned class", async () => {
    const db: Db = { grades: [], classes: [] };
    seedOwnedGrade(db);
    const created = await ClassService.create(
      { name: "1/أ", gradeId: GRADE_A },
      authFor(db),
    );
    assert.ok(created);
    assert.equal(created.teacherId, TEACHER_A);
    assert.equal(created.name, "1/أ");
    assert.equal(created.gradeId, GRADE_A);
    assert.equal(db.classes[0]?.user_id, TEACHER_A);
  });

  it("6. lists owned classes only", async () => {
    const db: Db = {
      grades: [],
      classes: [
        {
          id: "c1",
          user_id: TEACHER_A,
          name: "1/أ",
          grade_id: null,
          created_at: "2026-08-15T00:00:00Z",
          updated_at: "2026-08-15T00:00:00Z",
        },
        {
          id: "c2",
          user_id: TEACHER_B,
          name: "2/ب",
          grade_id: null,
          created_at: "2026-08-15T00:00:00Z",
          updated_at: "2026-08-15T00:00:00Z",
        },
      ],
    };
    const listed = await ClassService.list({}, authFor(db));
    assert.equal(listed.length, 1);
    assert.equal(listed[0]?.id, "c1");
  });

  it("7. updates owned class", async () => {
    const db: Db = {
      grades: [],
      classes: [
        {
          id: "c1",
          user_id: TEACHER_A,
          name: "قديم",
          grade_id: null,
          created_at: "2026-08-15T00:00:00Z",
          updated_at: "2026-08-15T00:00:00Z",
        },
      ],
    };
    seedOwnedGrade(db);
    const updated = await ClassService.update(
      "c1",
      { name: "1/ب", gradeId: GRADE_A },
      authFor(db),
    );
    assert.ok(updated);
    assert.equal(updated.name, "1/ب");
    assert.equal(updated.gradeId, GRADE_A);
  });

  it("8. deletes owned class", async () => {
    const db: Db = {
      grades: [],
      classes: [
        {
          id: "c1",
          user_id: TEACHER_A,
          name: "1/أ",
          grade_id: null,
          created_at: "2026-08-15T00:00:00Z",
          updated_at: "2026-08-15T00:00:00Z",
        },
      ],
    };
    assert.equal(await ClassService.delete("c1", authFor(db)), true);
    assert.equal(db.classes.length, 0);
  });

  it("9. class references the correct owned grade", async () => {
    const db: Db = { grades: [], classes: [] };
    seedOwnedGrade(db);
    const created = await ClassService.create(
      { name: "1/أ", gradeId: GRADE_A },
      authFor(db),
    );
    assert.ok(created);
    assert.equal(created.gradeId, GRADE_A);

    const fetched = await ClassService.getById(created.id, authFor(db));
    assert.equal(fetched?.gradeId, GRADE_A);
  });

  it("11. foreign teacher cannot access another teacher's class", async () => {
    const db: Db = {
      grades: [],
      classes: [
        {
          id: "c1",
          user_id: TEACHER_A,
          name: "1/أ",
          grade_id: null,
          created_at: "2026-08-15T00:00:00Z",
          updated_at: "2026-08-15T00:00:00Z",
        },
      ],
    };
    assert.equal(await ClassService.getById("c1", authFor(db, TEACHER_B)), null);
    assert.equal(await ClassService.update("c1", { name: "سرقة" }, authFor(db, TEACHER_B)), null);
    assert.equal(await ClassService.delete("c1", authFor(db, TEACHER_B)), false);
    assert.equal(db.classes[0]?.name, "1/أ");
  });

  it("12. unauthenticated convention: resolveUserContext null → empty/null", async () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(path.join(here, "class.service.ts"), "utf8");
    assert.match(source, /resolveUserContext/);
    assert.match(source, /if\s*\(\s*!resolved\s*\)\s*return\s*\[\]/);
    assert.match(source, /if\s*\(\s*!resolved\s*\)\s*return\s*null/);
    assert.match(source, /if\s*\(\s*!resolved\s*\)\s*return\s*false/);
  });

  it("13. rejects empty names and foreign grade references", async () => {
    const db: Db = { grades: [], classes: [] };
    seedOwnedGrade(db, GRADE_B, TEACHER_B);

    await assert.rejects(() => ClassService.create({ name: "  " }, authFor(db)), /اسم الفصل مطلوب/);

    await assert.rejects(
      () => ClassService.create({ name: "1/أ", gradeId: GRADE_B }, authFor(db)),
      /الصف غير موجود أو لا تملك صلاحية/,
    );

    // Owned class without grade is allowed (grade_id nullable)
    const standalone = await ClassService.create({ name: "مستقل" }, authFor(db));
    assert.ok(standalone);
    assert.equal(standalone.gradeId, null);
  });

  it("14. schema allows duplicate class names", async () => {
    const db: Db = { grades: [], classes: [] };
    const a = await ClassService.create({ name: "1/أ" }, authFor(db));
    const b = await ClassService.create({ name: "1/أ" }, authFor(db));
    assert.ok(a);
    assert.ok(b);
    assert.notEqual(a.id, b.id);
  });

  it("filters by gradeId when requested", async () => {
    const db: Db = {
      grades: [],
      classes: [
        {
          id: "c1",
          user_id: TEACHER_A,
          name: "1/أ",
          grade_id: GRADE_A,
          created_at: "2026-08-15T00:00:00Z",
          updated_at: "2026-08-15T00:00:00Z",
        },
        {
          id: "c2",
          user_id: TEACHER_A,
          name: "2/أ",
          grade_id: GRADE_B,
          created_at: "2026-08-15T00:00:00Z",
          updated_at: "2026-08-15T00:00:00Z",
        },
      ],
    };
    const listed = await ClassService.list({ gradeId: GRADE_A }, authFor(db));
    assert.equal(listed.length, 1);
    assert.equal(listed[0]?.id, "c1");
  });
});
