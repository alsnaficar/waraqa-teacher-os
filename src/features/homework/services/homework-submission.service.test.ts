import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";

import type { SupabaseUserContext } from "@/platform/database/supabase/context";
import {
  assertHomeworkSubmissionStatus,
  HomeworkSubmissionConflictError,
  HomeworkSubmissionService,
  isHomeworkSubmissionUniqueViolation,
  toHomeworkSubmissionStatus,
} from "./homework-submission.service.ts";

const TEACHER_A = "11111111-1111-4111-8111-111111111111";
const TEACHER_B = "22222222-2222-4222-8222-222222222222";
const HW_A = "hhhhhhhh-hhhh-4hhh-8hhh-hhhhhhhhhhhh";
const HW_B = "iiiiiiii-iiii-4iii-8iii-iiiiiiiiiiii";
const STU_A = "ssssssss-ssss-4sss-8sss-ssssssssssss";
const STU_B = "tttttttt-tttt-4ttt-8ttt-tttttttttttt";
const STU_C = "uuuuuuuu-uuuu-4uuu-8uuu-uuuuuuuuuuuu";
const STU_D = "vvvvvvvv-vvvv-4vvv-8vvv-vvvvvvvvvvvv";
const CLASS_A = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const CLASS_B = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const GRADE_A = "gggggggg-gggg-4ggg-8ggg-gggggggggggg";

type Row = Record<string, unknown>;
type Db = {
  homework_submissions: Row[];
  homework: Row[];
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

            if (table === "homework_submissions") {
              const clash = target.some(
                (existing) =>
                  existing.homework_id === row.homework_id &&
                  existing.student_id === row.student_id,
              );
              if (clash) {
                return {
                  data: null,
                  error: {
                    code: "23505",
                    message:
                      "duplicate key value violates unique constraint homework_submissions_homework_student_unique",
                  },
                };
              }
            }

            const inserted = {
              id: `${table}-${target.length + 1}`,
              created_at: "2026-08-14T00:00:00Z",
              updated_at: "2026-08-14T00:00:00Z",
              status: "pending",
              score: null,
              feedback: null,
              submitted_at: null,
              graded_at: null,
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
            Object.assign(current, state.patch, { updated_at: "2026-08-14T12:00:00Z" });
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
    homework_submissions: [],
    homework: [
      { id: HW_A, teacher_id: TEACHER_A, title: "واجب أ", status: "draft" },
      { id: HW_B, teacher_id: TEACHER_B, title: "واجب ب", status: "draft" },
    ],
    students: [
      {
        id: STU_A,
        teacher_id: TEACHER_A,
        full_name: "طالب أ",
        class_id: null,
        grade_id: null,
        student_code: null,
        active: true,
        created_at: "2026-08-14T00:00:00Z",
        updated_at: "2026-08-14T00:00:00Z",
      },
      {
        id: STU_B,
        teacher_id: TEACHER_B,
        full_name: "طالب ب",
        class_id: null,
        grade_id: null,
        student_code: null,
        active: true,
        created_at: "2026-08-14T00:00:00Z",
        updated_at: "2026-08-14T00:00:00Z",
      },
    ],
    classes: [
      { id: CLASS_A, user_id: TEACHER_A, name: "1/أ", grade_id: GRADE_A },
      { id: CLASS_B, user_id: TEACHER_B, name: "2/ب", grade_id: null },
    ],
    grades: [{ id: GRADE_A, user_id: TEACHER_A, name: "أول متوسط" }],
    ...overrides,
  };
}

function classRosterDb(overrides: Partial<Db> = {}): Db {
  return emptyDb({
    students: [
      {
        id: STU_A,
        teacher_id: TEACHER_A,
        full_name: "أحمد",
        class_id: CLASS_A,
        grade_id: GRADE_A,
        student_code: "A1",
        active: true,
        created_at: "2026-08-14T00:00:00Z",
        updated_at: "2026-08-14T00:00:00Z",
      },
      {
        id: STU_C,
        teacher_id: TEACHER_A,
        full_name: "خالد",
        class_id: CLASS_A,
        grade_id: GRADE_A,
        student_code: "A2",
        active: true,
        created_at: "2026-08-14T00:00:00Z",
        updated_at: "2026-08-14T00:00:00Z",
      },
      {
        id: STU_D,
        teacher_id: TEACHER_A,
        full_name: "سارة",
        class_id: CLASS_A,
        grade_id: GRADE_A,
        student_code: "A3",
        active: false,
        created_at: "2026-08-14T00:00:00Z",
        updated_at: "2026-08-14T00:00:00Z",
      },
      {
        id: STU_B,
        teacher_id: TEACHER_B,
        full_name: "أجنبي",
        class_id: CLASS_A,
        grade_id: null,
        student_code: "B1",
        active: true,
        created_at: "2026-08-14T00:00:00Z",
        updated_at: "2026-08-14T00:00:00Z",
      },
    ],
    ...overrides,
  });
}

describe("HomeworkSubmission status helpers", () => {
  it("17. status constraint — known map + reject unknown", () => {
    assert.equal(toHomeworkSubmissionStatus("graded"), "graded");
    assert.equal(toHomeworkSubmissionStatus("weird"), "pending");
    assert.throws(() => assertHomeworkSubmissionStatus("invalid"), /حالة التسليم غير صالحة/);
    assert.doesNotThrow(() => assertHomeworkSubmissionStatus("pending"));
  });

  it("detects unique violations", () => {
    assert.equal(isHomeworkSubmissionUniqueViolation({ code: "23505" }), true);
    assert.equal(
      isHomeworkSubmissionUniqueViolation({
        message: "homework_submissions_homework_student_unique",
      }),
      true,
    );
  });
});

describe("TASK 20.5-B HomeworkSubmissionService", () => {
  it("10. create submission", async () => {
    const db = emptyDb();
    const created = await HomeworkSubmissionService.create(
      { homeworkId: HW_A, studentId: STU_A, status: "submitted", score: 8 },
      authFor(db),
    );
    assert.ok(created);
    assert.equal(created.teacherId, TEACHER_A);
    assert.equal(created.homeworkId, HW_A);
    assert.equal(created.studentId, STU_A);
    assert.equal(created.status, "submitted");
    assert.equal(created.score, 8);
  });

  it("11. list by homework", async () => {
    const db = emptyDb({
      homework_submissions: [
        {
          id: "sub-1",
          teacher_id: TEACHER_A,
          homework_id: HW_A,
          student_id: STU_A,
          status: "pending",
          score: null,
          feedback: null,
          submitted_at: null,
          graded_at: null,
          created_at: "2026-08-14T01:00:00Z",
          updated_at: "2026-08-14T01:00:00Z",
        },
        {
          id: "sub-other",
          teacher_id: TEACHER_B,
          homework_id: HW_B,
          student_id: STU_B,
          status: "pending",
          score: null,
          feedback: null,
          submitted_at: null,
          graded_at: null,
          created_at: "2026-08-14T02:00:00Z",
          updated_at: "2026-08-14T02:00:00Z",
        },
      ],
    });

    const list = await HomeworkSubmissionService.listByHomework(HW_A, authFor(db));
    assert.equal(list.length, 1);
    assert.equal(list[0]?.id, "sub-1");
  });

  it("12. update submission", async () => {
    const db = emptyDb({
      homework_submissions: [
        {
          id: "sub-1",
          teacher_id: TEACHER_A,
          homework_id: HW_A,
          student_id: STU_A,
          status: "pending",
          score: null,
          feedback: null,
          submitted_at: null,
          graded_at: null,
          created_at: "2026-08-14T01:00:00Z",
          updated_at: "2026-08-14T01:00:00Z",
        },
      ],
    });

    const updated = await HomeworkSubmissionService.update(
      "sub-1",
      { status: "graded", score: 9.5, feedback: "ممتاز", gradedAt: "2026-08-14T15:00:00Z" },
      authFor(db),
    );
    assert.equal(updated?.status, "graded");
    assert.equal(updated?.score, 9.5);
    assert.equal(updated?.feedback, "ممتاز");
  });

  it("13. delete submission", async () => {
    const db = emptyDb({
      homework_submissions: [
        {
          id: "sub-1",
          teacher_id: TEACHER_A,
          homework_id: HW_A,
          student_id: STU_A,
          status: "pending",
          score: null,
          feedback: null,
          submitted_at: null,
          graded_at: null,
          created_at: "2026-08-14T01:00:00Z",
          updated_at: "2026-08-14T01:00:00Z",
        },
      ],
    });
    assert.equal(await HomeworkSubmissionService.delete("sub-1", authFor(db)), true);
    assert.equal(db.homework_submissions.length, 0);
  });

  it("14. duplicate homework/student rejected", async () => {
    const db = emptyDb({
      homework_submissions: [
        {
          id: "sub-1",
          teacher_id: TEACHER_A,
          homework_id: HW_A,
          student_id: STU_A,
          status: "pending",
          score: null,
          feedback: null,
          submitted_at: null,
          graded_at: null,
          created_at: "2026-08-14T01:00:00Z",
          updated_at: "2026-08-14T01:00:00Z",
        },
      ],
    });

    await assert.rejects(
      () =>
        HomeworkSubmissionService.create(
          { homeworkId: HW_A, studentId: STU_A },
          authFor(db),
        ),
      (err: unknown) => err instanceof HomeworkSubmissionConflictError,
    );
  });

  it("15. foreign-teacher homework rejected", async () => {
    const db = emptyDb();
    await assert.rejects(
      () =>
        HomeworkSubmissionService.create(
          { homeworkId: HW_B, studentId: STU_A },
          authFor(db, TEACHER_A),
        ),
      /الواجب غير موجود/,
    );
  });

  it("16. foreign-teacher student rejected", async () => {
    const db = emptyDb();
    await assert.rejects(
      () =>
        HomeworkSubmissionService.create(
          { homeworkId: HW_A, studentId: STU_B },
          authFor(db, TEACHER_A),
        ),
      /الطالب غير موجود/,
    );
  });

  it("18. teacher ownership on update/delete", async () => {
    const db = emptyDb({
      homework_submissions: [
        {
          id: "sub-b",
          teacher_id: TEACHER_B,
          homework_id: HW_B,
          student_id: STU_B,
          status: "pending",
          score: null,
          feedback: null,
          submitted_at: null,
          graded_at: null,
          created_at: "2026-08-14T01:00:00Z",
          updated_at: "2026-08-14T01:00:00Z",
        },
      ],
    });

    assert.equal(await HomeworkSubmissionService.getById("sub-b", authFor(db, TEACHER_A)), null);
    assert.equal(
      await HomeworkSubmissionService.update("sub-b", { status: "graded" }, authFor(db)),
      null,
    );
    assert.equal(await HomeworkSubmissionService.delete("sub-b", authFor(db)), false);
    assert.equal(db.homework_submissions.length, 1);
  });

  it("rejects invalid status on create", async () => {
    const db = emptyDb();
    await assert.rejects(
      () =>
        HomeworkSubmissionService.create(
          {
            homeworkId: HW_A,
            studentId: STU_A,
            // @ts-expect-error intentional invalid status for constraint test
            status: "done",
          },
          authFor(db),
        ),
      /حالة التسليم غير صالحة/,
    );
  });
});

describe("TASK 25.3 HomeworkSubmissionService.assignToClass", () => {
  it("1. assigns homework to all active students in owned class", async () => {
    const db = classRosterDb();
    const result = await HomeworkSubmissionService.assignToClass(HW_A, CLASS_A, authFor(db));
    assert.ok(result);
    assert.equal(result.eligibleCount, 2);
    assert.equal(result.createdCount, 2);
    assert.equal(result.skippedExistingCount, 0);
    assert.equal(db.homework_submissions.length, 2);
    const studentIds = db.homework_submissions.map((row) => row.student_id).sort();
    assert.deepEqual(studentIds, [STU_A, STU_C].sort());
    for (const row of db.homework_submissions) {
      assert.equal(row.status, "pending");
      assert.equal(row.homework_id, HW_A);
      assert.equal(row.teacher_id, TEACHER_A);
      assert.equal(row.score, null);
      assert.equal(row.submitted_at, null);
      assert.equal(row.graded_at, null);
    }
  });

  it("2. inactive students are excluded", async () => {
    const db = classRosterDb();
    await HomeworkSubmissionService.assignToClass(HW_A, CLASS_A, authFor(db));
    assert.equal(
      db.homework_submissions.some((row) => row.student_id === STU_D),
      false,
    );
  });

  it("3–4. existing assignments skipped; no duplicates", async () => {
    const db = classRosterDb({
      homework_submissions: [
        {
          id: "sub-existing",
          teacher_id: TEACHER_A,
          homework_id: HW_A,
          student_id: STU_A,
          status: "submitted",
          score: 7,
          feedback: "جيد",
          submitted_at: "2026-08-14T10:00:00Z",
          graded_at: null,
          created_at: "2026-08-14T01:00:00Z",
          updated_at: "2026-08-14T01:00:00Z",
        },
      ],
    });

    const result = await HomeworkSubmissionService.assignToClass(HW_A, CLASS_A, authFor(db));
    assert.ok(result);
    assert.equal(result.eligibleCount, 2);
    assert.equal(result.createdCount, 1);
    assert.equal(result.skippedExistingCount, 1);
    assert.equal(db.homework_submissions.length, 2);

    const existing = db.homework_submissions.find((row) => row.id === "sub-existing");
    assert.equal(existing?.status, "submitted");
    assert.equal(existing?.score, 7);
    assert.equal(existing?.feedback, "جيد");

    const forA = db.homework_submissions.filter((row) => row.student_id === STU_A);
    assert.equal(forA.length, 1);
  });

  it("5. empty class returns zero created", async () => {
    const db = emptyDb({
      students: [],
    });
    const result = await HomeworkSubmissionService.assignToClass(HW_A, CLASS_A, authFor(db));
    assert.ok(result);
    assert.deepEqual(result, {
      homeworkId: HW_A,
      classId: CLASS_A,
      eligibleCount: 0,
      createdCount: 0,
      skippedExistingCount: 0,
    });
    assert.equal(db.homework_submissions.length, 0);
  });

  it("6. all-already-assigned returns zero created", async () => {
    const db = classRosterDb({
      homework_submissions: [
        {
          id: "sub-1",
          teacher_id: TEACHER_A,
          homework_id: HW_A,
          student_id: STU_A,
          status: "pending",
          score: null,
          feedback: null,
          submitted_at: null,
          graded_at: null,
          created_at: "2026-08-14T01:00:00Z",
          updated_at: "2026-08-14T01:00:00Z",
        },
        {
          id: "sub-2",
          teacher_id: TEACHER_A,
          homework_id: HW_A,
          student_id: STU_C,
          status: "pending",
          score: null,
          feedback: null,
          submitted_at: null,
          graded_at: null,
          created_at: "2026-08-14T01:00:00Z",
          updated_at: "2026-08-14T01:00:00Z",
        },
      ],
    });

    const result = await HomeworkSubmissionService.assignToClass(HW_A, CLASS_A, authFor(db));
    assert.ok(result);
    assert.equal(result.createdCount, 0);
    assert.equal(result.skippedExistingCount, 2);
    assert.equal(db.homework_submissions.length, 2);
  });

  it("7. foreign homework rejected", async () => {
    const db = classRosterDb();
    await assert.rejects(
      () => HomeworkSubmissionService.assignToClass(HW_B, CLASS_A, authFor(db, TEACHER_A)),
      /الواجب غير موجود/,
    );
    assert.equal(db.homework_submissions.length, 0);
  });

  it("8. foreign class rejected", async () => {
    const db = classRosterDb();
    await assert.rejects(
      () => HomeworkSubmissionService.assignToClass(HW_A, CLASS_B, authFor(db, TEACHER_A)),
      /الفصل غير موجود/,
    );
    assert.equal(db.homework_submissions.length, 0);
  });

  it("9. foreign student cannot be injected into assignment", async () => {
    const db = classRosterDb();
    await HomeworkSubmissionService.assignToClass(HW_A, CLASS_A, authFor(db, TEACHER_A));
    assert.equal(
      db.homework_submissions.some((row) => row.student_id === STU_B),
      false,
    );
  });

  it("10. unauthenticated follows create convention (return null)", () => {
    const source = readFileSync(
      new URL("./homework-submission.service.ts", import.meta.url),
      "utf8",
    );
    // create: if (!resolved) return null;
    assert.match(
      source,
      /static async create[\s\S]*?if \(!resolved\) return null;/,
    );
    // assignToClass: same early-return (not throw)
    assert.match(
      source,
      /static async assignToClass[\s\S]*?if \(!resolved\) return null;/,
    );
  });

  it("11–13. lifecycle preserved; created pending; existing unchanged", async () => {
    const db = classRosterDb({
      homework: [
        { id: HW_A, teacher_id: TEACHER_A, title: "واجب أ", status: "draft" },
        { id: HW_B, teacher_id: TEACHER_B, title: "واجب ب", status: "draft" },
      ],
      homework_submissions: [
        {
          id: "sub-keep",
          teacher_id: TEACHER_A,
          homework_id: HW_A,
          student_id: STU_A,
          status: "graded",
          score: 10,
          feedback: "ممتاز",
          submitted_at: "2026-08-14T09:00:00Z",
          graded_at: "2026-08-14T11:00:00Z",
          created_at: "2026-08-14T01:00:00Z",
          updated_at: "2026-08-14T11:00:00Z",
        },
      ],
    });

    await HomeworkSubmissionService.assignToClass(HW_A, CLASS_A, authFor(db));

    assert.equal(db.homework.find((row) => row.id === HW_A)?.status, "draft");

    const kept = db.homework_submissions.find((row) => row.id === "sub-keep");
    assert.equal(kept?.status, "graded");
    assert.equal(kept?.score, 10);
    assert.equal(kept?.feedback, "ممتاز");

    const created = db.homework_submissions.find((row) => row.student_id === STU_C);
    assert.equal(created?.status, "pending");
    assert.equal(created?.score, null);
    assert.equal(created?.submitted_at, null);
    assert.equal(created?.graded_at, null);
  });
});
