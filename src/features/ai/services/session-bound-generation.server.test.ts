import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildSessionCurriculumPrefix,
  runSessionBoundGeneration,
} from "./session-bound-generation.server.ts";
import { LessonSessionBindingError } from "@/features/lesson-sessions/services/require-owned-lesson-session.ts";
import type { SupabaseUserContext } from "@/platform/database/supabase/context";
import type { LessonSession } from "@/features/lesson-sessions/types";

const TEACHER_A = "11111111-1111-4111-8111-111111111111";
const TEACHER_B = "22222222-2222-4222-8222-222222222222";
const SESSION_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CURRICULUM_LESSON = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function makeSessionRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: SESSION_A,
    teacher_id: TEACHER_A,
    academic_year_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    semester_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    grade_id: null,
    class_id: null,
    curriculum_lesson_id: CURRICULUM_LESSON,
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

function mockAuth(
  userId: string,
  sessionRow: ReturnType<typeof makeSessionRow> | null,
  curriculum: { id: string; title: string; objectives: string | null; notes: string | null } | null,
): {
  auth: SupabaseUserContext;
  inserted: { current: Record<string, unknown> | null };
} {
  const inserted: { current: Record<string, unknown> | null } = { current: null };

  const client = {
    from(table: string) {
      if (table === "lesson_sessions") {
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
            if (!sessionRow) return { data: null, error: null };
            if (state.filters.teacher_id && sessionRow.teacher_id !== state.filters.teacher_id) {
              return { data: null, error: null };
            }
            if (state.filters.id && sessionRow.id !== state.filters.id) {
              return { data: null, error: null };
            }
            return { data: sessionRow, error: null };
          },
        };
        return chain;
      }

      if (table === "curriculum_lessons") {
        const chain = {
          select() {
            return chain;
          },
          eq() {
            return chain;
          },
          async maybeSingle() {
            return { data: curriculum, error: null };
          },
        };
        return chain;
      }

      if (table === "ai_generations") {
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
      }

      throw new Error(`unexpected table ${table}`);
    },
  };

  return { auth: { client: client as never, userId }, inserted };
}

describe("P3 Step 3 unified session-bound generation", () => {
  it("runs bind → curriculum → strategy → persist for owned session", async () => {
    const { auth, inserted } = mockAuth(TEACHER_A, makeSessionRow(), {
      id: CURRICULUM_LESSON,
      title: "درس الجلسة",
      objectives: "هدف",
      notes: null,
    });

    const result = await runSessionBoundGeneration(
      {
        lessonSessionId: SESSION_A,
        kind: "worksheet",
        auth,
        supabase: auth.client,
        userId: TEACHER_A,
      },
      async (ctx) => {
        assert.equal(ctx.session.id, SESSION_A);
        assert.equal(ctx.session.teacherId, TEACHER_A);
        assert.equal(ctx.curriculumLesson?.title, "درس الجلسة");
        return {
          content: "markdown",
          model: "gemini-2.5-flash",
          prompt: "test",
          input: { title: ctx.curriculumLesson?.title },
          curriculumContextUsed: true,
        };
      },
    );

    assert.equal(result.lessonSessionId, SESSION_A);
    assert.equal(result.curriculumLessonId, CURRICULUM_LESSON);
    assert.equal(result.content, "markdown");
    assert.ok(inserted.current);
    assert.equal(inserted.current.lesson_session_id, SESSION_A);
    assert.equal(inserted.current.kind, "worksheet");
    assert.equal(inserted.current.user_id, TEACHER_A);
  });

  it("rejects cross-teacher session before strategy runs", async () => {
    const { auth } = mockAuth(TEACHER_B, makeSessionRow(), null);
    let strategyCalled = false;

    await assert.rejects(
      () =>
        runSessionBoundGeneration(
          {
            lessonSessionId: SESSION_A,
            kind: "lesson_plan",
            auth,
            supabase: auth.client,
            userId: TEACHER_B,
          },
          async () => {
            strategyCalled = true;
            return {
              content: {},
              model: "x",
              prompt: "x",
              input: {},
            };
          },
        ),
      (err: unknown) => err instanceof LessonSessionBindingError && err.code === "NOT_FOUND",
    );

    assert.equal(strategyCalled, false);
  });

  it("rejects missing lessonSessionId", async () => {
    const { auth } = mockAuth(TEACHER_A, makeSessionRow(), null);
    await assert.rejects(
      () =>
        runSessionBoundGeneration(
          {
            lessonSessionId: "",
            kind: "quiz",
            auth,
            supabase: auth.client,
            userId: TEACHER_A,
          },
          async () => ({ content: {}, model: "x", prompt: "x", input: {} }),
        ),
      (err: unknown) => err instanceof LessonSessionBindingError && err.code === "MISSING",
    );
  });

  it("buildSessionCurriculumPrefix prefers session curriculum content", () => {
    const { promptPrefix, used } = buildSessionCurriculumPrefix({
      id: CURRICULUM_LESSON,
      title: "عنوان",
      objectives: "أهداف",
      notes: null,
    });
    assert.equal(used, true);
    assert.match(promptPrefix, /عنوان/);
    assert.match(promptPrefix, /أهداف/);
    assert.equal(buildSessionCurriculumPrefix(null).used, false);
  });

  it("session fields remain authoritative for binding identity", async () => {
    const { auth } = mockAuth(TEACHER_A, makeSessionRow(), {
      id: CURRICULUM_LESSON,
      title: "من الجلسة",
      objectives: null,
      notes: null,
    });

    const result = await runSessionBoundGeneration(
      {
        lessonSessionId: SESSION_A,
        kind: "activity_ideas",
        auth,
        supabase: auth.client,
        userId: TEACHER_A,
      },
      async (ctx) => {
        // Client cannot override curriculum identity through the pipeline.
        const binding: Pick<LessonSession, "id" | "curriculumLessonId"> = ctx.session;
        assert.equal(binding.curriculumLessonId, CURRICULUM_LESSON);
        return {
          content: "ideas",
          model: "gemini-2.5-flash",
          prompt: "ideas",
          input: { title: "client-title-ignored-for-binding" },
        };
      },
    );

    assert.equal(result.curriculumLessonId, CURRICULUM_LESSON);
  });
});
