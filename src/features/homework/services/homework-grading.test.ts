import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import type { SupabaseUserContext } from "@/platform/database/supabase/context";
import {
  assertSubmissionGradable,
  assertValidGradeScore,
  HomeworkSubmissionService,
  parseGradeScore,
} from "./homework-submission.service.ts";
import {
  canOpenGradingDialog,
  formatScoreLabel,
  gradingActionLabel,
  SUBMISSION_STATUS_LABELS,
  toSubmissionListItemView,
} from "./students-ui.logic.ts";
import type { HomeworkSubmission } from "./homework-submission.service.ts";
import type { Student } from "./student.service.ts";

const TEACHER_A = "11111111-1111-4111-8111-111111111111";
const TEACHER_B = "22222222-2222-4222-8222-222222222222";
const HW_A = "hhhhhhhh-hhhh-4hhh-8hhh-hhhhhhhhhhhh";
const HW_B = "iiiiiiii-iiii-4iii-8iii-iiiiiiiiiiii";
const STU_A = "ssssssss-ssss-4sss-8sss-ssssssssssss";
const STU_B = "tttttttt-tttt-4ttt-8ttt-tttttttttttt";

type Row = Record<string, unknown>;
type Db = {
  homework_submissions: Row[];
  homework: Row[];
  students: Row[];
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
          if (state.op === "update") {
            const target = ((db as Record<string, Row[]>)[table] ?? []).filter((row) =>
              matchesEq(row, state.filters),
            );
            const current = target[0];
            if (!current) return { data: null, error: null };
            Object.assign(current, state.patch, { updated_at: "2026-08-14T12:00:00Z" });
            return { data: { ...current }, error: null };
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

function submittedRow(overrides: Row = {}): Row {
  return {
    id: "sub-1",
    teacher_id: TEACHER_A,
    homework_id: HW_A,
    student_id: STU_A,
    status: "submitted",
    score: null,
    feedback: null,
    submitted_at: "2026-08-14T10:00:00Z",
    graded_at: null,
    created_at: "2026-08-14T01:00:00Z",
    updated_at: "2026-08-14T01:00:00Z",
    ...overrides,
  };
}

function emptyDb(overrides: Partial<Db> = {}): Db {
  return {
    homework_submissions: [],
    homework: [
      { id: HW_A, teacher_id: TEACHER_A, title: "واجب أ" },
      { id: HW_B, teacher_id: TEACHER_B, title: "واجب ب" },
    ],
    students: [
      { id: STU_A, teacher_id: TEACHER_A, full_name: "طالب أ" },
      { id: STU_B, teacher_id: TEACHER_B, full_name: "طالب ب" },
    ],
    ...overrides,
  };
}

const sampleStudent: Student = {
  id: STU_A,
  teacherId: TEACHER_A,
  fullName: "أحمد",
  classId: null,
  gradeId: null,
  studentCode: "A1",
  active: true,
  createdAt: "2026-08-14T00:00:00Z",
  updatedAt: "2026-08-14T00:00:00Z",
};

describe("TASK 20.7 manual homework grading", () => {
  it("1. submitted submission can be graded", async () => {
    const db = emptyDb({ homework_submissions: [submittedRow()] });
    const graded = await HomeworkSubmissionService.grade(
      "sub-1",
      { score: 7, feedback: "حسن" },
      authFor(db),
    );
    assert.ok(graded);
    assert.equal(graded.status, "graded");
  });

  it("2. score saved", async () => {
    const db = emptyDb({ homework_submissions: [submittedRow()] });
    const graded = await HomeworkSubmissionService.grade("sub-1", { score: 8.5 }, authFor(db));
    assert.equal(graded?.score, 8.5);
  });

  it("3. feedback saved", async () => {
    const db = emptyDb({ homework_submissions: [submittedRow()] });
    const graded = await HomeworkSubmissionService.grade(
      "sub-1",
      { score: 9, feedback: "ممتاز" },
      authFor(db),
    );
    assert.equal(graded?.feedback, "ممتاز");
  });

  it("4. status becomes graded", async () => {
    const db = emptyDb({ homework_submissions: [submittedRow()] });
    const graded = await HomeworkSubmissionService.grade("sub-1", { score: 6 }, authFor(db));
    assert.equal(graded?.status, "graded");
    assert.equal(db.homework_submissions[0]?.status, "graded");
  });

  it("5. graded_at populated", async () => {
    const db = emptyDb({ homework_submissions: [submittedRow()] });
    const graded = await HomeworkSubmissionService.grade("sub-1", { score: 6 }, authFor(db));
    assert.ok(graded?.gradedAt);
    assert.match(String(graded.gradedAt), /^\d{4}-\d{2}-\d{2}T/);
  });

  it("6. regrading works", async () => {
    const db = emptyDb({
      homework_submissions: [
        submittedRow({
          status: "graded",
          score: 5,
          feedback: "قديم",
          graded_at: "2026-08-14T11:00:00Z",
        }),
      ],
    });
    const graded = await HomeworkSubmissionService.grade(
      "sub-1",
      { score: 10, feedback: "جديد" },
      authFor(db),
    );
    assert.equal(graded?.score, 10);
    assert.equal(graded?.feedback, "جديد");
    assert.equal(graded?.status, "graded");
    assert.ok(graded?.gradedAt);
    assert.notEqual(graded?.gradedAt, "2026-08-14T11:00:00Z");
  });

  it("7. score below zero rejected", () => {
    assert.throws(() => assertValidGradeScore(-1), /أكبر من أو تساوي صفر/);
    assert.equal(parseGradeScore("3"), 3);
    assert.throws(() => parseGradeScore("abc"), /رقماً/);
  });

  it("8. score above max_score rejected", () => {
    assert.throws(() => assertValidGradeScore(11, 10), /الدرجة الكاملة/);
    assert.doesNotThrow(() => assertValidGradeScore(10, 10));
    assert.doesNotThrow(() => assertValidGradeScore(11, null));
  });

  it("9. pending submission cannot be graded", async () => {
    assert.throws(() => assertSubmissionGradable("pending"), /لم يُسلَّم/);
    const db = emptyDb({
      homework_submissions: [submittedRow({ status: "pending", submitted_at: null })],
    });
    await assert.rejects(
      () => HomeworkSubmissionService.grade("sub-1", { score: 5 }, authFor(db)),
      /لم يُسلَّم/,
    );
  });

  it("10. foreign teacher cannot grade submission", async () => {
    const db = emptyDb({
      homework_submissions: [submittedRow({ teacher_id: TEACHER_B, homework_id: HW_B, student_id: STU_B })],
    });
    await assert.rejects(
      () => HomeworkSubmissionService.grade("sub-1", { score: 5 }, authFor(db, TEACHER_A)),
      /لا تملك صلاحية/,
    );
  });

  it("11. UI displays graded status", () => {
    assert.equal(SUBMISSION_STATUS_LABELS.graded, "مُصحّح");
    assert.equal(canOpenGradingDialog("graded"), true);
    assert.equal(canOpenGradingDialog("submitted"), true);
    assert.equal(canOpenGradingDialog("pending"), false);
    assert.equal(gradingActionLabel("graded"), "إعادة التصحيح");
    assert.equal(gradingActionLabel("submitted"), "تصحيح");

    const graded: HomeworkSubmission = {
      id: "sub-1",
      teacherId: TEACHER_A,
      homeworkId: HW_A,
      studentId: STU_A,
      status: "graded",
      score: 8,
      feedback: "جيد",
      submittedAt: "2026-08-14T10:00:00Z",
      gradedAt: "2026-08-14T12:00:00Z",
      createdAt: "2026-08-14T01:00:00Z",
      updatedAt: "2026-08-14T12:00:00Z",
    };
    const view = toSubmissionListItemView(graded, sampleStudent, { maxScore: 10 });
    assert.equal(view.statusLabel, "مُصحّح");
  });

  it("12. UI displays score and feedback", () => {
    assert.equal(formatScoreLabel(8, 10), "8/10");
    assert.equal(formatScoreLabel(8, null), "8");
    const graded: HomeworkSubmission = {
      id: "sub-1",
      teacherId: TEACHER_A,
      homeworkId: HW_A,
      studentId: STU_A,
      status: "graded",
      score: 8,
      feedback: "ملاحظات المعلم",
      submittedAt: "2026-08-14T10:00:00Z",
      gradedAt: "2026-08-14T12:00:00Z",
      createdAt: "2026-08-14T01:00:00Z",
      updatedAt: "2026-08-14T12:00:00Z",
    };
    const view = toSubmissionListItemView(graded, sampleStudent, { maxScore: 10 });
    assert.equal(view.scoreLabel, "8/10");
    assert.equal(view.feedbackLabel, "ملاحظات المعلم");

    const panel = readFileSync(
      path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "../components/homework-submissions-panel.tsx",
      ),
      "utf8",
    );
    const dialog = readFileSync(
      path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "../components/homework-grade-dialog.tsx",
      ),
      "utf8",
    );
    assert.match(panel, /HomeworkGradeDialog/);
    assert.match(dialog, /حفظ التصحيح/);
    assert.match(dialog, /ملاحظات المعلم/);
    assert.doesNotMatch(dialog, /teacher_id\s*[:=]/);
    assert.doesNotMatch(panel, /teacher_id\s*[:=]/);
  });
});
