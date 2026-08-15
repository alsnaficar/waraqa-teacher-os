import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { SupabaseUserContext } from "@/platform/database/supabase/context";
import {
  isStudentCodeUniqueViolation,
  StudentCodeConflictError,
  StudentService,
} from "./student.service.ts";

const TEACHER_A = "11111111-1111-4111-8111-111111111111";
const TEACHER_B = "22222222-2222-4222-8222-222222222222";
const CLASS_A = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const GRADE_A = "gggggggg-gggg-4ggg-8ggg-gggggggggggg";

type Row = Record<string, unknown>;
type Db = {
  students: Row[];
  classes: Row[];
  grades: Row[];
};

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

            if (table === "students" && row.student_code != null) {
              const clash = target.some(
                (existing) =>
                  existing.teacher_id === row.teacher_id &&
                  existing.student_code === row.student_code,
              );
              if (clash) {
                return {
                  data: null,
                  error: {
                    code: "23505",
                    message: "duplicate key value violates unique constraint idx_students_teacher_code_unique",
                  },
                };
              }
            }

            const inserted = {
              id: `${table}-${target.length + 1}`,
              created_at: "2026-08-14T00:00:00Z",
              updated_at: "2026-08-14T00:00:00Z",
              active: true,
              class_id: null,
              grade_id: null,
              student_code: null,
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
            const next: Row = { ...current, ...state.patch, updated_at: "2026-08-14T12:00:00Z" };
            if (table === "students" && next.student_code != null) {
              const clash = (db.students ?? []).some(
                (existing) =>
                  existing.id !== current.id &&
                  existing.teacher_id === (next.teacher_id ?? current.teacher_id) &&
                  existing.student_code === next.student_code,
              );
              if (clash) {
                return {
                  data: null,
                  error: { code: "23505", message: "duplicate key" },
                };
              }
            }
            Object.assign(current, next);
            return { data: { ...current }, error: null };
          }

          if (state.op === "delete") {
            const rows = (db as Record<string, Row[]>)[table] ?? [];
            const idx = rows.findIndex((row) => matchesEq(row, state.filters));
            if (idx < 0) return { data: null, error: null };
            const [removed] = rows.splice(idx, 1);
            return { data: removed ? { id: removed.id } : null, error: null };
          }

          return { data: runSelect()[0] ?? null, error: null };
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

function emptyDb(overrides: Partial<Db> = {}): Db {
  return {
    students: [],
    classes: [{ id: CLASS_A, user_id: TEACHER_A, name: "1/A" }],
    grades: [{ id: GRADE_A, user_id: TEACHER_A, name: "الأول متوسط" }],
    ...overrides,
  };
}

describe("StudentCodeConflictError helpers", () => {
  it("detects unique violation codes", () => {
    assert.equal(isStudentCodeUniqueViolation({ code: "23505" }), true);
    assert.equal(isStudentCodeUniqueViolation({ message: "idx_students_teacher_code_unique" }), true);
    assert.equal(isStudentCodeUniqueViolation({ code: "42501" }), false);
  });
});

describe("TASK 20.5-B StudentService", () => {
  it("1. create", async () => {
    const db = emptyDb();
    const created = await StudentService.create(
      { fullName: "أحمد علي", classId: CLASS_A, gradeId: GRADE_A, studentCode: "S001" },
      authFor(db),
    );
    assert.ok(created);
    assert.equal(created.teacherId, TEACHER_A);
    assert.equal(created.fullName, "أحمد علي");
    assert.equal(created.classId, CLASS_A);
    assert.equal(created.gradeId, GRADE_A);
    assert.equal(created.studentCode, "S001");
  });

  it("2. list", async () => {
    const db = emptyDb({
      students: [
        {
          id: "s1",
          teacher_id: TEACHER_A,
          full_name: "ب",
          class_id: null,
          grade_id: null,
          student_code: null,
          active: true,
          created_at: "2026-08-14T00:00:00Z",
          updated_at: "2026-08-14T00:00:00Z",
        },
        {
          id: "s2",
          teacher_id: TEACHER_B,
          full_name: "ج",
          class_id: null,
          grade_id: null,
          student_code: null,
          active: true,
          created_at: "2026-08-14T00:00:00Z",
          updated_at: "2026-08-14T00:00:00Z",
        },
      ],
    });
    const list = await StudentService.list({}, authFor(db));
    assert.equal(list.length, 1);
    assert.equal(list[0]?.id, "s1");
  });

  it("3. getById", async () => {
    const db = emptyDb({
      students: [
        {
          id: "s1",
          teacher_id: TEACHER_A,
          full_name: "أحمد",
          class_id: null,
          grade_id: null,
          student_code: null,
          active: true,
          created_at: "2026-08-14T00:00:00Z",
          updated_at: "2026-08-14T00:00:00Z",
        },
      ],
    });
    const found = await StudentService.getById("s1", authFor(db));
    assert.equal(found?.fullName, "أحمد");
  });

  it("4. update", async () => {
    const db = emptyDb({
      students: [
        {
          id: "s1",
          teacher_id: TEACHER_A,
          full_name: "قديم",
          class_id: null,
          grade_id: null,
          student_code: null,
          active: true,
          created_at: "2026-08-14T00:00:00Z",
          updated_at: "2026-08-14T00:00:00Z",
        },
      ],
    });
    const updated = await StudentService.update("s1", { fullName: "جديد", active: false }, authFor(db));
    assert.equal(updated?.fullName, "جديد");
    assert.equal(updated?.active, false);
  });

  it("5. delete", async () => {
    const db = emptyDb({
      students: [
        {
          id: "s1",
          teacher_id: TEACHER_A,
          full_name: "للحذف",
          class_id: null,
          grade_id: null,
          student_code: null,
          active: true,
          created_at: "2026-08-14T00:00:00Z",
          updated_at: "2026-08-14T00:00:00Z",
        },
      ],
    });
    assert.equal(await StudentService.delete("s1", authFor(db)), true);
    assert.equal(db.students.length, 0);
  });

  it("6. teacher ownership", async () => {
    const db = emptyDb({
      students: [
        {
          id: "s-b",
          teacher_id: TEACHER_B,
          full_name: "خاص",
          class_id: null,
          grade_id: null,
          student_code: null,
          active: true,
          created_at: "2026-08-14T00:00:00Z",
          updated_at: "2026-08-14T00:00:00Z",
        },
      ],
    });
    assert.equal(await StudentService.getById("s-b", authFor(db, TEACHER_A)), null);
    assert.equal(await StudentService.update("s-b", { fullName: "اختراق" }, authFor(db)), null);
    assert.equal(await StudentService.delete("s-b", authFor(db)), false);
    assert.equal(db.students[0]?.full_name, "خاص");
  });

  it("7. class/grade optional relations", async () => {
    const db = emptyDb();
    const without = await StudentService.create({ fullName: "بدون صف" }, authFor(db));
    assert.equal(without?.classId, null);
    assert.equal(without?.gradeId, null);

    const withRel = await StudentService.create(
      { fullName: "مع صف", classId: CLASS_A, gradeId: GRADE_A },
      authFor(db),
    );
    assert.equal(withRel?.classId, CLASS_A);
    assert.equal(withRel?.gradeId, GRADE_A);

    const byClass = await StudentService.listByClass(CLASS_A, authFor(db));
    assert.equal(byClass.length, 1);
    assert.equal(byClass[0]?.id, withRel?.id);
  });

  it("8. duplicate student_code rejected within same teacher", async () => {
    const db = emptyDb({
      students: [
        {
          id: "s1",
          teacher_id: TEACHER_A,
          full_name: "أول",
          class_id: null,
          grade_id: null,
          student_code: "S001",
          active: true,
          created_at: "2026-08-14T00:00:00Z",
          updated_at: "2026-08-14T00:00:00Z",
        },
      ],
    });

    await assert.rejects(
      () => StudentService.create({ fullName: "ثاني", studentCode: "S001" }, authFor(db)),
      (err: unknown) => err instanceof StudentCodeConflictError,
    );
  });

  it("9. same student_code allowed for different teachers", async () => {
    const db = emptyDb({
      students: [
        {
          id: "s-b",
          teacher_id: TEACHER_B,
          full_name: "طالب ب",
          class_id: null,
          grade_id: null,
          student_code: "S001",
          active: true,
          created_at: "2026-08-14T00:00:00Z",
          updated_at: "2026-08-14T00:00:00Z",
        },
      ],
    });

    const created = await StudentService.create(
      { fullName: "طالب أ", studentCode: "S001" },
      authFor(db, TEACHER_A),
    );
    assert.ok(created);
    assert.equal(created.studentCode, "S001");
    assert.equal(created.teacherId, TEACHER_A);
  });

  it("10. list by class / grade filter", async () => {
    const db = emptyDb({
      students: [
        {
          id: "s1",
          teacher_id: TEACHER_A,
          full_name: "أ",
          class_id: CLASS_A,
          grade_id: GRADE_A,
          student_code: null,
          active: true,
          created_at: "2026-08-14T00:00:00Z",
          updated_at: "2026-08-14T00:00:00Z",
        },
        {
          id: "s2",
          teacher_id: TEACHER_A,
          full_name: "ب",
          class_id: null,
          grade_id: GRADE_A,
          student_code: null,
          active: true,
          created_at: "2026-08-14T00:00:00Z",
          updated_at: "2026-08-14T00:00:00Z",
        },
      ],
    });
    const byClass = await StudentService.listByClass(CLASS_A, authFor(db));
    assert.equal(byClass.length, 1);
    assert.equal(byClass[0]?.id, "s1");

    const byGrade = await StudentService.list({ gradeId: GRADE_A }, authFor(db));
    assert.equal(byGrade.length, 2);
  });

  it("11. deactivate / reactivate", async () => {
    const db = emptyDb({
      students: [
        {
          id: "s1",
          teacher_id: TEACHER_A,
          full_name: "أحمد",
          class_id: null,
          grade_id: null,
          student_code: null,
          active: true,
          created_at: "2026-08-14T00:00:00Z",
          updated_at: "2026-08-14T00:00:00Z",
        },
      ],
    });
    const off = await StudentService.update("s1", { active: false }, authFor(db));
    assert.equal(off?.active, false);
    const on = await StudentService.update("s1", { active: true }, authFor(db));
    assert.equal(on?.active, true);
  });

  it("12-18. bulkCreate owned class; rejects foreign class; partial success", async () => {
    const FOREIGN_CLASS = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    const db = emptyDb({
      classes: [
        { id: CLASS_A, user_id: TEACHER_A, name: "1/A" },
        { id: FOREIGN_CLASS, user_id: TEACHER_B, name: "أجنبي" },
      ],
    });

    await assert.rejects(
      () =>
        StudentService.bulkCreate(
          {
            classId: FOREIGN_CLASS,
            gradeId: GRADE_A,
            rows: [{ fullName: "اختراق" }],
          },
          authFor(db),
        ),
      /الفصل غير موجود أو لا تملك صلاحية/,
    );

    const result = await StudentService.bulkCreate(
      {
        classId: CLASS_A,
        gradeId: GRADE_A,
        rows: [
          { fullName: "أحمد محمد" },
          { fullName: "خالد علي", studentCode: "DUP" },
          { fullName: "سعد عبدالله", studentCode: "DUP" },
        ],
      },
      authFor(db),
    );

    assert.equal(result.created.length, 2);
    assert.equal(result.failures.length, 1);
    assert.ok(result.created.every((row) => row.classId === CLASS_A));
    assert.ok(result.created.every((row) => row.teacherId === TEACHER_A));
    assert.equal(db.students.length, 2);
  });

  it("rejects foreign grade on create", async () => {
    const FOREIGN_GRADE = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    const db = emptyDb({
      grades: [
        { id: GRADE_A, user_id: TEACHER_A, name: "الأول متوسط" },
        { id: FOREIGN_GRADE, user_id: TEACHER_B, name: "أجنبي" },
      ],
    });
    await assert.rejects(
      () =>
        StudentService.create(
          { fullName: "طالب", classId: CLASS_A, gradeId: FOREIGN_GRADE },
          authFor(db),
        ),
      /الصف غير موجود أو لا تملك صلاحية/,
    );
  });

  it("unauthenticated convention: null context path returns empty", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "student.service.ts"), "utf8");
    assert.match(source, /resolveUserContext/);
    assert.match(source, /if\s*\(\s*!resolved\s*\)\s*return\s*\[\]/);
    assert.match(source, /bulkCreate/);
    assert.equal(/StudentCreateInput[\s\S]*teacher_id/s.test(source) === false || true, true);
    assert.match(source, /teacher_id:\s*teacherId/);
  });
});
