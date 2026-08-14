import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import {
  buildSessionCurriculumPrefix,
  runSessionBoundGeneration,
} from "./session-bound-generation.server.ts";
import { resetPaidAiRequestGuardForTests } from "@/features/ai/providers/paid-ai-request-guard.ts";
import { BillingError } from "@/features/billing/types.ts";
import { LessonSessionBindingError } from "@/features/lesson-sessions/services/require-owned-lesson-session.ts";
import type { SupabaseUserContext } from "@/platform/database/supabase/context";
import type { LessonSession } from "@/features/lesson-sessions/types";
import {
  allowEntitlementTables,
  createEntitlementTableHandler,
  emptyEntitlementTables,
  type EntitlementMockTables,
} from "@/features/billing/entitlement.test-support.ts";

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

function mockAuth(
  userId: string,
  sessionRow: ReturnType<typeof makeSessionRow> | null,
  curriculum: { id: string; title: string; objectives: string | null; notes: string | null } | null,
  timetable: Array<{
    id: string;
    teacher_id: string;
    day_of_week: number;
    period: number;
    subject: string;
    grade: string;
    class_name: string;
    classroom?: string | null;
    starts_at?: string | null;
    ends_at?: string | null;
    active: boolean;
  }> = [],
  entitlementTables: EntitlementMockTables = allowEntitlementTables(userId),
): {
  auth: SupabaseUserContext;
  inserted: { current: Record<string, unknown> | null };
} {
  const inserted: { current: Record<string, unknown> | null } = { current: null };
  const billingFrom = createEntitlementTableHandler(entitlementTables);

  const client = {
    from(table: string) {
      const billing = billingFrom(table);
      if (billing) return billing;

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

      if (table === "teacher_timetable") {
        const state: { filters: Record<string, string | boolean> } = {
          filters: {},
        };

        const chain = {
          select() {
            return chain;
          },
          eq(column: string, value: string | boolean) {
            state.filters[column] = value;
            return chain;
          },
          order() {
            return chain;
          },
          then(resolve: (value: unknown) => unknown) {
            const data = timetable.filter((entry) => {
              if (
                state.filters.teacher_id !== undefined &&
                entry.teacher_id !== state.filters.teacher_id
              ) {
                return false;
              }

              if (state.filters.active !== undefined && entry.active !== state.filters.active) {
                return false;
              }

              return true;
            });

            return Promise.resolve(resolve({ data, error: null }));
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
  beforeEach(() => {
    resetPaidAiRequestGuardForTests();
  });

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

  it("resolves the timetable entry from session day and period", async () => {
    const { auth } = mockAuth(
      TEACHER_A,
      makeSessionRow({
        day_of_week: 5,
        period_number: 1,
      }),
      {
        id: CURRICULUM_LESSON,
        title: "درس الجلسة",
        objectives: "هدف",
        notes: null,
      },
      [
        {
          id: "11111111-1111-4111-8111-111111111111",
          teacher_id: TEACHER_A,
          day_of_week: 5,
          period: 2,
          subject: "رياضيات",
          grade: "الأول المتوسط",
          class_name: "أ",
          active: true,
        },
        {
          id: "22222222-2222-4222-8222-222222222222",
          teacher_id: TEACHER_A,
          day_of_week: 4,
          period: 1,
          subject: "علوم",
          grade: "الثاني المتوسط",
          class_name: "ب",
          active: true,
        },
        {
          id: "33333333-3333-4333-8333-333333333333",
          teacher_id: TEACHER_A,
          day_of_week: 5,
          period: 1,
          subject: "لغتي",
          grade: "الأول المتوسط",
          class_name: "ج",
          classroom: "3",
          starts_at: "08:00",
          ends_at: "08:45",
          active: true,
        },
      ],
    );

    const result = await runSessionBoundGeneration(
      {
        lessonSessionId: SESSION_A,
        kind: "worksheet",
        auth,
        supabase: auth.client,
        userId: TEACHER_A,
      },
      async (ctx) => {
        assert.equal(ctx.timetableEntry?.id, "33333333-3333-4333-8333-333333333333");
        assert.equal(ctx.timetableEntry?.dayOfWeek, 5);
        assert.equal(ctx.timetableEntry?.period, 1);
        assert.equal(ctx.timetableEntry?.subject, "لغتي");
        assert.equal(ctx.timetableEntry?.grade, "الأول المتوسط");
        assert.equal(ctx.timetableEntry?.className, "ج");

        return {
          content: "markdown",
          model: "gemini-2.5-flash",
          prompt: "test",
          input: {
            subject: ctx.timetableEntry?.subject,
            grade: ctx.timetableEntry?.grade,
            className: ctx.timetableEntry?.className,
          },
        };
      },
    );

    assert.equal(result.id, "99999999-9999-4999-8999-999999999999");
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

  it("denies generation before strategy and persist when entitlement is missing", async () => {
    const { auth, inserted } = mockAuth(
      TEACHER_A,
      makeSessionRow(),
      {
        id: CURRICULUM_LESSON,
        title: "درس الجلسة",
        objectives: null,
        notes: null,
      },
      [],
      emptyEntitlementTables(),
    );
    let strategyCalled = false;

    await assert.rejects(
      () =>
        runSessionBoundGeneration(
          {
            lessonSessionId: SESSION_A,
            kind: "worksheet",
            auth,
            supabase: auth.client,
            userId: TEACHER_A,
          },
          async () => {
            strategyCalled = true;
            return { content: "x", model: "x", prompt: "x", input: {} };
          },
        ),
      (err: unknown) => err instanceof BillingError && err.code === "FEATURE_ENTITLEMENT_REQUIRED",
    );

    assert.equal(strategyCalled, false);
    assert.equal(inserted.current, null);
  });

  it("promotion failure fails closed before Gemini", async () => {
    const { auth, inserted } = mockAuth(
      TEACHER_A,
      makeSessionRow(),
      {
        id: CURRICULUM_LESSON,
        title: "درس الجلسة",
        objectives: null,
        notes: null,
      },
      [],
      allowEntitlementTables(TEACHER_A, {
        status: "scheduled",
        startsOn: "2026-08-23",
        endsOn: "2027-01-07",
      }),
    );
    let strategyCalled = false;
    const failingWrite = {
      from() {
        throw new Error("promotion write failed");
      },
    };

    await assert.rejects(
      () =>
        runSessionBoundGeneration(
          {
            lessonSessionId: SESSION_A,
            kind: "lesson_plan",
            auth,
            supabase: auth.client,
            userId: TEACHER_A,
            billingWriteClient: failingWrite as never,
            today: "2026-08-23",
          },
          async () => {
            strategyCalled = true;
            return { content: "x", model: "x", prompt: "x", input: {} };
          },
        ),
      (err: unknown) => err instanceof BillingError && err.code === "FEATURE_ENTITLEMENT_REQUIRED",
    );

    assert.equal(strategyCalled, false);
    assert.equal(inserted.current, null);
  });
});
