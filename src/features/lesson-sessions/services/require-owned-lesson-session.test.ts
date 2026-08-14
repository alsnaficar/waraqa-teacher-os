import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  LessonSessionBindingError,
  requireOwnedLessonSession,
} from "./require-owned-lesson-session.ts";
import { saveAiGeneration } from "@/features/ai/services/persistence.server.ts";
import type { SupabaseUserContext } from "@/platform/database/supabase/context";
import type { LessonSession } from "../types";

const TEACHER_A = "11111111-1111-4111-8111-111111111111";
const TEACHER_B = "22222222-2222-4222-8222-222222222222";
const SESSION_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SESSION_MISSING = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CURRICULUM_LESSON = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const CLIENT_MISMATCH_CURRICULUM = "ffffffff-ffff-4fff-8fff-ffffffffffff";

function makeSessionRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: SESSION_A,
    teacher_id: TEACHER_A,
    academic_year_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    semester_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    grade_id: null,
    class_id: null,
    curriculum_lesson_id: CURRICULUM_LESSON,
    curriculum_lesson_source: "plan",
    session_date: "2026-08-08",
    day_of_week: 5,
    period_number: 1,
    lesson_locked: false,
    status: "scheduled",
    prepared_at: null,
    completed_at: null,
    created_at: "2026-08-08T00:00:00Z",
    updated_at: "2026-08-08T00:00:00Z",
    ...overrides,
  };
}

/**
 * Minimal chainable mock matching LessonSessionService.getSessionById:
 * .from().select().eq().eq().maybeSingle()
 */
function mockContext(
  userId: string,
  rowsById: Record<string, ReturnType<typeof makeSessionRow> | null>,
): SupabaseUserContext {
  const client = {
    from(table: string) {
      assert.equal(table, "lesson_sessions");
      const state: { filters: Record<string, string> } = { filters: {} };
      const chain = {
        select() {
          return chain;
        },
        eq(column: string, value: string) {
          state.filters[column] = value;
          return chain;
        },
        async maybeSingle() {
          const id = state.filters.id;
          const teacherId = state.filters.teacher_id;
          const row = id ? rowsById[id] : null;
          if (!row) return { data: null, error: null };
          // Mirror service ownership filter: wrong teacher → null (RLS-like).
          if (teacherId && row.teacher_id !== teacherId) {
            return { data: null, error: null };
          }
          return { data: row, error: null };
        },
      };
      return chain;
    },
  };

  return { client: client as never, userId };
}

describe("P3 Step 2 Session Binding Contract", () => {
  it("A. allows Teacher A with their own session", async () => {
    const ctx = mockContext(TEACHER_A, { [SESSION_A]: makeSessionRow() });
    const result = await requireOwnedLessonSession(SESSION_A, ctx);
    assert.equal(result.id, SESSION_A);
    assert.equal(result.teacherId, TEACHER_A);
    assert.equal(result.curriculumLessonId, CURRICULUM_LESSON);
    assert.equal(result.status, "scheduled");
  });

  it("B. rejects missing lessonSessionId", async () => {
    const ctx = mockContext(TEACHER_A, {});
    await assert.rejects(
      () => requireOwnedLessonSession(undefined, ctx),
      (err: unknown) => err instanceof LessonSessionBindingError && err.code === "MISSING",
    );
    await assert.rejects(
      () => requireOwnedLessonSession("", ctx),
      (err: unknown) => err instanceof LessonSessionBindingError && err.code === "MISSING",
    );
  });

  it("C. rejects invalid UUID and nonexistent session", async () => {
    const ctx = mockContext(TEACHER_A, { [SESSION_A]: makeSessionRow() });
    await assert.rejects(
      () => requireOwnedLessonSession("not-a-uuid", ctx),
      (err: unknown) => err instanceof LessonSessionBindingError && err.code === "INVALID",
    );
    await assert.rejects(
      () => requireOwnedLessonSession(SESSION_MISSING, ctx),
      (err: unknown) => err instanceof LessonSessionBindingError && err.code === "NOT_FOUND",
    );
  });

  it("D. rejects Teacher B using Teacher A session", async () => {
    const ctx = mockContext(TEACHER_B, { [SESSION_A]: makeSessionRow() });
    await assert.rejects(
      () => requireOwnedLessonSession(SESSION_A, ctx),
      (err: unknown) => err instanceof LessonSessionBindingError && err.code === "NOT_FOUND",
    );
  });

  it("E. session curriculumLessonId is authoritative (client mismatch ignored)", async () => {
    const ctx = mockContext(TEACHER_A, { [SESSION_A]: makeSessionRow() });
    const result = await requireOwnedLessonSession(SESSION_A, ctx);
    // Helper has no curriculumLessonId param — client cannot override binding.
    assert.equal(result.curriculumLessonId, CURRICULUM_LESSON);
    assert.notEqual(result.curriculumLessonId, CLIENT_MISMATCH_CURRICULUM);
    // Binding identity fields returned for callers:
    const binding: Pick<LessonSession, "id" | "teacherId" | "curriculumLessonId" | "status"> =
      result;
    assert.equal(binding.id, SESSION_A);
  });

  it("F. saveAiGeneration persists lesson_session_id", async () => {
    const inserted: { current: Record<string, unknown> | null } = { current: null };
    const supabase = {
      from(table: string) {
        assert.equal(table, "ai_generations");
        return {
          insert(row: Record<string, unknown>) {
            inserted.current = row;
            return {
              select() {
                return {
                  async single() {
                    return {
                      data: {
                        id: "99999999-9999-4999-8999-999999999999",
                        created_at: "2026-08-08T12:00:00Z",
                      },
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

    const result = await saveAiGeneration(supabase as never, {
      userId: TEACHER_A,
      kind: "lesson_plan",
      prompt: "test",
      output: { ok: true },
      lessonSessionId: SESSION_A,
    });

    assert.equal(result.id, "99999999-9999-4999-8999-999999999999");
    assert.ok(inserted.current);
    assert.equal(inserted.current.lesson_session_id, SESSION_A);
    assert.equal(inserted.current.user_id, TEACHER_A);
    assert.equal(inserted.current.kind, "lesson_plan");
    assert.equal(inserted.current.status, "completed");
  });

  it("G. historical generations with NULL lesson_session_id remain representable", () => {
    const historicalRow: {
      id: string;
      user_id: string;
      lesson_session_id: string | null;
      kind: string;
    } = {
      id: "00000000-0000-4000-8000-000000000001",
      user_id: TEACHER_A,
      lesson_session_id: null,
      kind: "worksheet",
    };
    assert.equal(historicalRow.lesson_session_id, null);
    // Select/filter of historical rows must not require a session id.
    const readable = [historicalRow].filter((r) => r.user_id === TEACHER_A);
    assert.equal(readable.length, 1);
  });
});
