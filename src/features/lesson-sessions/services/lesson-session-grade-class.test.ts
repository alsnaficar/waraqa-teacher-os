import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";

import type { SupabaseUserContext } from "@/platform/database/supabase/context";
import { LessonSessionService } from "./lesson-session.service.ts";

const TEACHER_A = "11111111-1111-4111-8111-111111111111";
const TEACHER_B = "22222222-2222-4222-8222-222222222222";
const SESSION_A = "ssssssss-ssss-4sss-8sss-ssssssssssss";
const GRADE_A = "gggggggg-gggg-4ggg-8ggg-gggggggggggg";
const GRADE_B = "hhhhhhhh-hhhh-4hhh-8hhh-hhhhhhhhhhhh";
const CLASS_A = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const CLASS_B = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const FOREIGN_GRADE = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const FOREIGN_CLASS = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

type Row = Record<string, unknown>;
type Db = {
  lesson_sessions: Row[];
  grades: Row[];
  classes: Row[];
};

function matchesEq(row: Row, filters: Record<string, unknown>): boolean {
  return Object.entries(filters).every(([column, value]) => row[column] === value);
}

function createMockClient(db: Db) {
  const client = {
    from(table: string) {
      const state: {
        filters: Record<string, unknown>;
        op: "select" | "update" | null;
        patch: Record<string, unknown>;
      } = { filters: {}, op: null, patch: {} };

      const runSelect = (): Row[] => {
        let rows = [...((db as Record<string, Row[]>)[table] ?? [])];
        for (const [column, value] of Object.entries(state.filters)) {
          rows = rows.filter((row) => row[column] === value);
        }
        return rows;
      };

      const chain = {
        select(_columns?: string) {
          if (state.op !== "update") state.op = "select";
          return chain;
        },
        update(patch: Record<string, unknown>) {
          state.op = "update";
          state.patch = patch;
          return chain;
        },
        eq(column: string, value: unknown) {
          state.filters[column] = value;
          return chain;
        },
        async maybeSingle() {
          if (state.op === "update") {
            const target = ((db as Record<string, Row[]>)[table] ?? []).filter((row) =>
              matchesEq(row, state.filters),
            );
            const current = target[0];
            if (!current) return { data: null, error: null };
            Object.assign(current, state.patch, { updated_at: "2026-08-15T00:00:00Z" });
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

function emptyDb(overrides: Partial<Db> = {}): Db {
  return {
    lesson_sessions: [
      {
        id: SESSION_A,
        teacher_id: TEACHER_A,
        academic_year_id: "yyyyyyyy-yyyy-4yyy-8yyy-yyyyyyyyyyyy",
        semester_id: "ssssssss-ssss-4sss-8sss-ssssssssssss",
        grade_id: null,
        class_id: null,
        curriculum_lesson_id: "llllllll-llll-4lll-8lll-llllllllllll",
        curriculum_lesson_source: "plan",
        session_date: "2026-08-09",
        day_of_week: 0,
        period_number: 1,
        lesson_locked: false,
        status: "scheduled",
        prepared_at: null,
        completed_at: null,
        created_at: "2026-08-09T00:00:00Z",
        updated_at: "2026-08-09T00:00:00Z",
      },
    ],
    grades: [
      { id: GRADE_A, user_id: TEACHER_A, name: "الأول متوسط" },
      { id: GRADE_B, user_id: TEACHER_A, name: "الثاني متوسط" },
    ],
    classes: [
      { id: CLASS_A, user_id: TEACHER_A, name: "1/أ", grade_id: GRADE_A },
      { id: CLASS_B, user_id: TEACHER_A, name: "2/ب", grade_id: GRADE_B },
    ],
    ...overrides,
  };
}

describe("TASK 25.4 LessonSessionService.updateGradeAndClass", () => {
  it("9. update preserves/sets valid owned IDs", async () => {
    const db = emptyDb();
    const updated = await LessonSessionService.updateGradeAndClass(
      SESSION_A,
      { gradeId: GRADE_A, classId: CLASS_A },
      authFor(db),
    );
    assert.ok(updated);
    assert.equal(updated.gradeId, GRADE_A);
    assert.equal(updated.classId, CLASS_A);
    assert.equal(db.lesson_sessions[0]?.grade_id, GRADE_A);
    assert.equal(db.lesson_sessions[0]?.class_id, CLASS_A);
  });

  it("10. changing class syncs grade relationship", async () => {
    const db = emptyDb({
      lesson_sessions: [
        {
          ...emptyDb().lesson_sessions[0]!,
          grade_id: GRADE_A,
          class_id: CLASS_A,
        },
      ],
    });

    const updated = await LessonSessionService.updateGradeAndClass(
      SESSION_A,
      { classId: CLASS_B },
      authFor(db),
    );
    assert.ok(updated);
    assert.equal(updated.classId, CLASS_B);
    assert.equal(updated.gradeId, GRADE_B);
  });

  it("foreign grade rejected", async () => {
    const db = emptyDb();
    await assert.rejects(
      () =>
        LessonSessionService.updateGradeAndClass(
          SESSION_A,
          { gradeId: FOREIGN_GRADE },
          authFor(db),
        ),
      /الصف غير موجود/,
    );
  });

  it("foreign class rejected", async () => {
    const db = emptyDb();
    await assert.rejects(
      () =>
        LessonSessionService.updateGradeAndClass(
          SESSION_A,
          { classId: FOREIGN_CLASS },
          authFor(db),
        ),
      /الفصل غير موجود/,
    );
  });

  it("mismatched grade/class rejected", async () => {
    const db = emptyDb();
    await assert.rejects(
      () =>
        LessonSessionService.updateGradeAndClass(
          SESSION_A,
          { gradeId: GRADE_A, classId: CLASS_B },
          authFor(db),
        ),
      /لا ينتمي/,
    );
  });

  it("11. unauthenticated follows existing convention (return null)", () => {
    const source = readFileSync(
      new URL("./lesson-session.service.ts", import.meta.url),
      "utf8",
    );
    assert.match(
      source,
      /static async updateGradeAndClass[\s\S]*?if \(!resolved\) return null;/,
    );
  });

  it("foreign teacher session rejected", async () => {
    const db = emptyDb({
      lesson_sessions: [
        {
          ...emptyDb().lesson_sessions[0]!,
          teacher_id: TEACHER_B,
        },
      ],
    });
    await assert.rejects(
      () =>
        LessonSessionService.updateGradeAndClass(
          SESSION_A,
          { gradeId: GRADE_A, classId: CLASS_A },
          authFor(db, TEACHER_A),
        ),
      /الحصة غير موجودة/,
    );
  });
});
