import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { resetPaidAiRequestGuardForTests } from "@/features/ai/providers/paid-ai-request-guard.ts";
import { getCurrentLessonPlanPreparation } from "./current-preparation.ts";
import {
  LessonSessionAlreadyPreparedError,
  LessonSessionAlreadyPreparingError,
  LessonSessionPrepareStateError,
  prepareOwnedLessonSession,
} from "./prepare-lesson-session.server.ts";
import { LessonSessionService } from "./lesson-session.service.ts";
import { BillingError } from "@/features/billing/types.ts";
import { LessonSessionBindingError } from "./require-owned-lesson-session.ts";
import type { SupabaseUserContext } from "@/platform/database/supabase/context";
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
const CURRICULUM_OTHER = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const GEN_ID = "99999999-9999-4999-8999-999999999999";

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

type SessionRow = ReturnType<typeof makeSessionRow>;

function mockAuth(options: {
  userId: string;
  sessionRow: SessionRow | null;
  curriculum?: {
    id: string;
    title: string;
    objectives: string | null;
    notes: string | null;
  } | null;
  timetable?: Array<{
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
  }>;
  generations?: Array<Record<string, unknown>>;
  failMarkPrepared?: boolean;
  /**
   * When set, both claim attempts wait here until `arrived === 2`,
   * then serialized CAS updates run — models concurrent Prepare.
   */
  concurrentClaimBarrier?: {
    arrived: number;
    open: Promise<void>;
    release: () => void;
  };
  entitlementTables?: EntitlementMockTables;
}): {
  auth: SupabaseUserContext;
  inserted: { current: Record<string, unknown> | null; rows: Record<string, unknown>[] };
  deletedGenerations: { count: number };
  sessionState: { current: SessionRow | null };
} {
  const inserted: {
    current: Record<string, unknown> | null;
    rows: Record<string, unknown>[];
  } = { current: null, rows: [] };
  const deletedGenerations = { count: 0 };
  const sessionState: { current: SessionRow | null } = {
    current: options.sessionRow ? { ...options.sessionRow } : null,
  };
  const generations = [...(options.generations ?? [])];
  const curriculum =
    options.curriculum === undefined
      ? {
          id: CURRICULUM_LESSON,
          title: "درس الجلسة",
          objectives: "هدف",
          notes: null,
        }
      : options.curriculum;

  // Serialize status-changing updates (simulates atomic row UPDATE).
  let writeChain: Promise<void> = Promise.resolve();
  const billingFrom = createEntitlementTableHandler(
    options.entitlementTables ?? allowEntitlementTables(options.userId),
  );

  const client = {
    from(table: string) {
      const billing = billingFrom(table);
      if (billing) return billing;

      if (table === "lesson_sessions") {
        const state: {
          filters: Record<string, string | boolean>;
          patch: Record<string, unknown>;
        } = { filters: {}, patch: {} };

        const chain = {
          select() {
            return chain;
          },
          update(patch: Record<string, unknown>) {
            state.patch = patch;
            return chain;
          },
          eq(column: string, value: string | boolean) {
            state.filters[column] = value;
            return chain;
          },
          async maybeSingle() {
            const row = sessionState.current;
            if (!row) return { data: null, error: null };

            if (state.filters.teacher_id && row.teacher_id !== state.filters.teacher_id) {
              return { data: null, error: null };
            }
            if (state.filters.id && row.id !== state.filters.id) {
              return { data: null, error: null };
            }

            if (Object.keys(state.patch).length === 0) {
              return { data: row, error: null };
            }

            const isClaim =
              state.patch.status === "preparing" && state.filters.status === "scheduled";

            if (isClaim && options.concurrentClaimBarrier) {
              options.concurrentClaimBarrier.arrived += 1;
              if (options.concurrentClaimBarrier.arrived >= 2) {
                options.concurrentClaimBarrier.release();
              }
              await options.concurrentClaimBarrier.open;
            }

            const prev = writeChain;
            let releaseWrite!: () => void;
            writeChain = new Promise<void>((r) => {
              releaseWrite = r;
            });
            await prev;
            try {
              const latest = sessionState.current;
              if (!latest) return { data: null, error: null };

              if (options.failMarkPrepared && state.patch.status === "prepared") {
                return { data: null, error: null };
              }
              if (state.filters.status !== undefined && latest.status !== state.filters.status) {
                return { data: null, error: null };
              }
              if (
                state.filters.lesson_locked !== undefined &&
                latest.lesson_locked !== state.filters.lesson_locked
              ) {
                return { data: null, error: null };
              }
              if (state.filters.teacher_id && latest.teacher_id !== state.filters.teacher_id) {
                return { data: null, error: null };
              }

              sessionState.current = { ...latest, ...state.patch };
              return { data: sessionState.current, error: null };
            } finally {
              releaseWrite();
            }
          },
        };
        return chain;
      }

      if (table === "teacher_timetable") {
        const filters: Record<string, string | boolean> = {};

        const chain = {
          select() {
            return chain;
          },
          eq(column: string, value: string | boolean) {
            filters[column] = value;
            return chain;
          },
          order() {
            return chain;
          },
          then(resolve: (value: unknown) => unknown) {
            const data = (options.timetable ?? []).filter((entry) => {
              if (filters.teacher_id !== undefined && entry.teacher_id !== filters.teacher_id) {
                return false;
              }
              if (filters.active !== undefined && entry.active !== filters.active) {
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
        const state: {
          filters: Record<string, string>;
          orderDesc?: boolean;
          limitN?: number;
        } = { filters: {} };

        const chain = {
          insert(row: Record<string, unknown>) {
            inserted.current = row;
            const full = {
              id: `${GEN_ID}-${inserted.rows.length}`,
              created_at: `2026-08-08T12:00:0${inserted.rows.length}Z`,
              ...row,
            };
            inserted.rows.push(full);
            generations.unshift(full);
            return {
              select() {
                return {
                  async single() {
                    return {
                      data: { id: full.id, created_at: full.created_at },
                      error: null,
                    };
                  },
                };
              },
            };
          },
          select() {
            return chain;
          },
          eq(column: string, value: string) {
            state.filters[column] = value;
            return chain;
          },
          order(_column: string, opts?: { ascending?: boolean }) {
            state.orderDesc = opts?.ascending === false;
            return chain;
          },
          limit(n: number) {
            state.limitN = n;
            return chain;
          },
          delete() {
            deletedGenerations.count += 1;
            return {
              eq() {
                return {
                  async then() {
                    return { error: null };
                  },
                };
              },
            };
          },
          async maybeSingle() {
            let rows = generations.filter((g) => {
              if (
                state.filters.lesson_session_id &&
                g.lesson_session_id !== state.filters.lesson_session_id
              ) {
                return false;
              }
              if (state.filters.kind && g.kind !== state.filters.kind) return false;
              if (state.filters.status && g.status !== state.filters.status) return false;
              return true;
            });
            if (state.orderDesc) {
              rows = [...rows].sort((a, b) =>
                String(b.created_at).localeCompare(String(a.created_at)),
              );
            }
            if (state.limitN) rows = rows.slice(0, state.limitN);
            return { data: rows[0] ?? null, error: null };
          },
        };
        return chain;
      }

      throw new Error(`unexpected table ${table}`);
    },
  };

  return {
    auth: { client: client as never, userId: options.userId },
    inserted,
    deletedGenerations,
    sessionState,
  };
}

describe("P3 Step 4 preparing-state claim", () => {
  beforeEach(() => {
    resetPaidAiRequestGuardForTests();
  });

  it("A. scheduled owned session claims successfully", async () => {
    const { auth, sessionState } = mockAuth({
      userId: TEACHER_A,
      sessionRow: makeSessionRow(),
    });

    const result = await prepareOwnedLessonSession(
      {
        lessonSessionId: SESSION_A,
        auth,
        supabase: auth.client,
        userId: TEACHER_A,
      },
      async () => ({
        content: { ok: true },
        model: "gemini-2.5-flash",
        prompt: "تحضير",
        input: {},
      }),
    );

    assert.equal(result.session.status, "prepared");
    assert.equal(sessionState.current?.status, "prepared");
  });

  it("B/C/D/E. concurrent Prepare: one provider call, one generation, loser ALREADY_PREPARING", async () => {
    let releaseBarrier!: () => void;
    const barrierOpen = new Promise<void>((resolve) => {
      releaseBarrier = resolve;
    });
    const concurrentClaimBarrier = {
      arrived: 0,
      open: barrierOpen,
      release: releaseBarrier,
    };

    const { auth, inserted, sessionState } = mockAuth({
      userId: TEACHER_A,
      sessionRow: makeSessionRow(),
      concurrentClaimBarrier,
    });

    let providerCalls = 0;
    let releaseProvider!: () => void;
    const providerHold = new Promise<void>((resolve) => {
      releaseProvider = resolve;
    });

    const execute = async () => {
      providerCalls += 1;
      await providerHold;
      return {
        content: { ok: true },
        model: "gemini-2.5-flash",
        prompt: "تحضير",
        input: {},
      };
    };

    const params = {
      lessonSessionId: SESSION_A,
      auth,
      supabase: auth.client,
      userId: TEACHER_A,
    };

    const p1 = prepareOwnedLessonSession(params, execute);
    const p2 = prepareOwnedLessonSession(params, execute);
    // Attach settlement handlers immediately to avoid unhandledRejection races.
    const settled = Promise.allSettled([p1, p2]);

    for (let i = 0; i < 100 && concurrentClaimBarrier.arrived < 2; i++) {
      await new Promise((r) => setTimeout(r, 5));
    }
    assert.equal(concurrentClaimBarrier.arrived, 2, "both requests must reach claim");

    for (let i = 0; i < 100 && providerCalls < 1; i++) {
      await new Promise((r) => setTimeout(r, 5));
    }
    assert.equal(providerCalls, 1, "C. exactly one provider invocation after claim");

    // Give the loser time to observe preparing and reject without AI.
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(providerCalls, 1, "C. loser must NOT call provider");

    releaseProvider();
    const final = await settled;

    assert.equal(inserted.rows.length, 1, "D/E. exactly one generation");
    assert.equal(inserted.rows[0]?.kind, "lesson_plan");

    const fulfilled = final.filter((r) => r.status === "fulfilled");
    const rejected = final.filter((r) => r.status === "rejected");
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.ok(
      rejected[0]?.status === "rejected" &&
        rejected[0].reason instanceof LessonSessionAlreadyPreparingError,
    );
    assert.equal(sessionState.current?.status, "prepared");
    assert.equal(sessionState.current?.lesson_locked, true);
  });

  it("F. successful generation: preparing → prepared, locked, prepared_at", async () => {
    const { auth, sessionState } = mockAuth({
      userId: TEACHER_A,
      sessionRow: makeSessionRow(),
    });

    const result = await prepareOwnedLessonSession(
      {
        lessonSessionId: SESSION_A,
        auth,
        supabase: auth.client,
        userId: TEACHER_A,
      },
      async () => {
        assert.equal(sessionState.current?.status, "preparing");
        assert.equal(sessionState.current?.lesson_locked, false);
        return {
          content: {},
          model: "x",
          prompt: "x",
          input: {},
        };
      },
    );

    assert.equal(result.session.status, "prepared");
    assert.equal(result.session.lessonLocked, true);
    assert.ok(result.session.preparedAt);
  });

  it("G. provider failure: preparing → scheduled, unlocked", async () => {
    const { auth, sessionState, inserted } = mockAuth({
      userId: TEACHER_A,
      sessionRow: makeSessionRow(),
    });

    await assert.rejects(
      () =>
        prepareOwnedLessonSession(
          {
            lessonSessionId: SESSION_A,
            auth,
            supabase: auth.client,
            userId: TEACHER_A,
          },
          async () => {
            assert.equal(sessionState.current?.status, "preparing");
            throw new Error("مزود الذكاء الاصطناعي فشل");
          },
        ),
      /مزود الذكاء الاصطناعي فشل/,
    );

    assert.equal(sessionState.current?.status, "scheduled");
    assert.equal(sessionState.current?.lesson_locked, false);
    assert.equal(sessionState.current?.prepared_at, null);
    assert.equal(inserted.rows.length, 0);
  });

  it("H. already prepared: no claim, no AI call", async () => {
    const { auth, inserted } = mockAuth({
      userId: TEACHER_A,
      sessionRow: makeSessionRow({
        status: "prepared",
        lesson_locked: true,
        prepared_at: "2026-08-08T10:00:00Z",
      }),
    });
    let providerCalls = 0;

    await assert.rejects(
      () =>
        prepareOwnedLessonSession(
          {
            lessonSessionId: SESSION_A,
            auth,
            supabase: auth.client,
            userId: TEACHER_A,
          },
          async () => {
            providerCalls += 1;
            return { content: {}, model: "x", prompt: "x", input: {} };
          },
        ),
      (err: unknown) => err instanceof LessonSessionAlreadyPreparedError,
    );
    assert.equal(providerCalls, 0);
    assert.equal(inserted.rows.length, 0);
  });

  it("I. reset prepared → scheduled unlocked prepared_at null", async () => {
    const { auth } = mockAuth({
      userId: TEACHER_A,
      sessionRow: makeSessionRow({
        status: "prepared",
        lesson_locked: true,
        prepared_at: "2026-08-08T10:00:00Z",
        completed_at: "2026-08-08T11:00:00Z",
      }),
    });

    const result = await LessonSessionService.resetPreparation(SESSION_A, auth);
    assert.ok(result);
    assert.equal(result.status, "scheduled");
    assert.equal(result.lessonLocked, false);
    assert.equal(result.preparedAt, null);
    assert.equal(result.completedAt, null);
  });

  it("21.2-B reset preserves session identity curriculum and does not invent deletes", async () => {
    const row = makeSessionRow({
      status: "prepared",
      lesson_locked: true,
      prepared_at: "2026-08-08T10:00:00Z",
      curriculum_lesson_id: CURRICULUM_LESSON,
      curriculum_lesson_source: "manual",
    });
    const { auth, sessionState, deletedGenerations } = mockAuth({
      userId: TEACHER_A,
      sessionRow: row,
      generations: [
        {
          id: "gen-keep",
          kind: "lesson_plan",
          status: "completed",
          created_at: "2026-08-08T09:00:00Z",
          lesson_session_id: SESSION_A,
          output: { content: { kept: true } },
        },
      ],
    });

    const beforeId = sessionState.current?.id;
    const result = await LessonSessionService.resetPreparation(SESSION_A, auth);
    assert.ok(result);
    assert.equal(result.id, beforeId);
    assert.equal(result.curriculumLessonId, CURRICULUM_LESSON);
    assert.equal(result.curriculumLessonSource, "manual");
    assert.equal(sessionState.current?.id, SESSION_A);
    assert.equal(deletedGenerations.count, 0);
    assert.equal(
      await getCurrentLessonPlanPreparation(
        { id: SESSION_A, status: "scheduled" },
        auth,
      ),
      null,
    );
  });

  it("J. reset preserves historical generations", async () => {
    const historical = {
      id: "88888888-8888-4888-8888-888888888888",
      kind: "lesson_plan",
      status: "completed",
      created_at: "2026-08-08T09:00:00Z",
      lesson_session_id: SESSION_A,
      output: { content: { kept: true } },
    };
    const { auth, deletedGenerations } = mockAuth({
      userId: TEACHER_A,
      sessionRow: makeSessionRow({
        status: "prepared",
        lesson_locked: true,
        prepared_at: "2026-08-08T10:00:00Z",
      }),
      generations: [historical],
    });

    await LessonSessionService.resetPreparation(SESSION_A, auth);
    assert.equal(deletedGenerations.count, 0);
  });

  it("K. current preparation only when prepared", async () => {
    const gens = [
      {
        id: "newer-gen",
        kind: "lesson_plan",
        status: "completed",
        created_at: "2026-08-08T12:00:00Z",
        lesson_session_id: SESSION_A,
        output: { content: { v: 2 } },
      },
    ];
    const preparedAuth = mockAuth({
      userId: TEACHER_A,
      sessionRow: makeSessionRow({ status: "prepared", lesson_locked: true }),
      generations: gens,
    }).auth;
    const preparingAuth = mockAuth({
      userId: TEACHER_A,
      sessionRow: makeSessionRow({ status: "preparing" }),
      generations: gens,
    }).auth;
    const scheduledAuth = mockAuth({
      userId: TEACHER_A,
      sessionRow: makeSessionRow(),
      generations: gens,
    }).auth;

    const whenPrepared = await getCurrentLessonPlanPreparation(
      { id: SESSION_A, status: "prepared" },
      preparedAuth,
    );
    assert.equal(whenPrepared?.id, "newer-gen");

    assert.equal(
      await getCurrentLessonPlanPreparation({ id: SESSION_A, status: "preparing" }, preparingAuth),
      null,
    );
    assert.equal(
      await getCurrentLessonPlanPreparation({ id: SESSION_A, status: "scheduled" }, scheduledAuth),
      null,
    );
  });

  it("L. client curriculum identity cannot override session", async () => {
    const { auth, inserted } = mockAuth({
      userId: TEACHER_A,
      sessionRow: makeSessionRow(),
    });

    const result = await prepareOwnedLessonSession(
      {
        lessonSessionId: SESSION_A,
        auth,
        supabase: auth.client,
        userId: TEACHER_A,
      },
      async (ctx) => {
        assert.equal(ctx.session.curriculumLessonId, CURRICULUM_LESSON);
        assert.notEqual(ctx.session.curriculumLessonId, CURRICULUM_OTHER);
        return {
          content: { ok: true },
          model: "gemini-2.5-flash",
          prompt: "x",
          input: { forgedCurriculumLessonId: CURRICULUM_OTHER },
        };
      },
    );

    assert.equal(result.generation.curriculumLessonId, CURRICULUM_LESSON);
    assert.equal(
      (inserted.current?.output as { lessonContext?: { curriculumLessonId?: string } })
        ?.lessonContext?.curriculumLessonId,
      CURRICULUM_LESSON,
    );
  });

  it("entitlement denied before claim, Gemini, and persist", async () => {
    const { auth, inserted, sessionState } = mockAuth({
      userId: TEACHER_A,
      sessionRow: makeSessionRow(),
      entitlementTables: emptyEntitlementTables(),
    });
    let providerCalls = 0;

    await assert.rejects(
      () =>
        prepareOwnedLessonSession(
          {
            lessonSessionId: SESSION_A,
            auth,
            supabase: auth.client,
            userId: TEACHER_A,
          },
          async () => {
            providerCalls += 1;
            return { content: {}, model: "x", prompt: "x", input: {} };
          },
        ),
      (err: unknown) => err instanceof BillingError && err.code === "FEATURE_ENTITLEMENT_REQUIRED",
    );

    assert.equal(providerCalls, 0);
    assert.equal(inserted.current, null);
    assert.equal(sessionState.current?.status, "scheduled");
  });

  it("cross-teacher rejected before claim/AI", async () => {
    const { auth } = mockAuth({ userId: TEACHER_B, sessionRow: makeSessionRow() });
    let providerCalls = 0;
    await assert.rejects(
      () =>
        prepareOwnedLessonSession(
          {
            lessonSessionId: SESSION_A,
            auth,
            supabase: auth.client,
            userId: TEACHER_B,
          },
          async () => {
            providerCalls += 1;
            return { content: {}, model: "x", prompt: "x", input: {} };
          },
        ),
      (err: unknown) => err instanceof LessonSessionBindingError,
    );
    assert.equal(providerCalls, 0);
  });

  it("partial finalize after persist reports PARTIAL_STATE without deleting generation", async () => {
    const { auth, inserted, sessionState } = mockAuth({
      userId: TEACHER_A,
      sessionRow: makeSessionRow(),
      failMarkPrepared: true,
    });

    await assert.rejects(
      () =>
        prepareOwnedLessonSession(
          {
            lessonSessionId: SESSION_A,
            auth,
            supabase: auth.client,
            userId: TEACHER_A,
          },
          async () => ({ content: {}, model: "x", prompt: "x", input: {} }),
        ),
      (err: unknown) =>
        err instanceof LessonSessionPrepareStateError && err.code === "PARTIAL_STATE",
    );
    assert.equal(inserted.rows.length, 1);
    assert.equal(sessionState.current?.status, "preparing");
  });

  it("reset from preparing recovers to scheduled", async () => {
    const { auth } = mockAuth({
      userId: TEACHER_A,
      sessionRow: makeSessionRow({ status: "preparing", lesson_locked: false }),
    });
    const result = await LessonSessionService.resetPreparation(SESSION_A, auth);
    assert.ok(result);
    assert.equal(result.status, "scheduled");
    assert.equal(result.lessonLocked, false);
  });

  it("H. prepared + reset works", async () => {
    const { auth } = mockAuth({
      userId: TEACHER_A,
      sessionRow: makeSessionRow({
        status: "prepared",
        lesson_locked: true,
        prepared_at: "2026-08-08T10:00:00Z",
      }),
    });
    const result = await LessonSessionService.resetPreparation(SESSION_A, auth);
    assert.ok(result);
    assert.equal(result.status, "scheduled");
    assert.equal(result.lessonLocked, false);
    assert.equal(result.preparedAt, null);
  });

  it("I. preparing + reset works without touching completed_at", async () => {
    const { auth, sessionState } = mockAuth({
      userId: TEACHER_A,
      sessionRow: makeSessionRow({
        status: "preparing",
        lesson_locked: false,
        completed_at: null,
      }),
    });
    const result = await LessonSessionService.resetPreparation(SESSION_A, auth);
    assert.ok(result);
    assert.equal(result.status, "scheduled");
    assert.equal(sessionState.current?.completed_at, null);
  });

  it("J. changeLesson while preparing denied", async () => {
    const { auth } = mockAuth({
      userId: TEACHER_A,
      sessionRow: makeSessionRow({ status: "preparing" }),
    });
    await assert.rejects(
      () => LessonSessionService.changeLesson(SESSION_A, CURRICULUM_OTHER, auth),
      (err: unknown) => err instanceof Error && err.name === "LessonSessionPreparingError",
    );
  });

  it("K. completeSession while preparing denied", async () => {
    const { auth } = mockAuth({
      userId: TEACHER_A,
      sessionRow: makeSessionRow({ status: "preparing" }),
    });
    await assert.rejects(
      () => LessonSessionService.completeSession(SESSION_A, auth),
      (err: unknown) => err instanceof Error && err.name === "LessonSessionPreparingError",
    );
  });

  it("L. cancelSession while preparing denied", async () => {
    const { auth } = mockAuth({
      userId: TEACHER_A,
      sessionRow: makeSessionRow({ status: "preparing" }),
    });
    await assert.rejects(
      () => LessonSessionService.cancelSession(SESSION_A, auth),
      (err: unknown) => err instanceof Error && err.name === "LessonSessionPreparingError",
    );
  });
});
