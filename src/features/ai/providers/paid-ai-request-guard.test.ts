import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  acquirePaidAiRequest,
  getPaidAiGuardSnapshotForTests,
  MAX_CONCURRENT_PAID_AI_PER_USER,
  MAX_GLOBAL_CONCURRENT_PAID_AI,
  PAID_AI_COOLDOWN_MESSAGE,
  PAID_AI_COOLDOWN_MS,
  PAID_AI_GLOBAL_BUSY_MESSAGE,
  PAID_AI_USER_BUSY_MESSAGE,
  paidAiGuardReasonMessage,
  resetPaidAiRequestGuardForTests,
  setPaidAiGuardNowForTests,
} from "./paid-ai-request-guard.ts";
import { runSessionBoundGeneration } from "@/features/ai/services/session-bound-generation.server.ts";
import { BillingError } from "@/features/billing/types.ts";
import type { SupabaseUserContext } from "@/platform/database/supabase/context";
import {
  allowEntitlementTables,
  createEntitlementTableHandler,
  emptyEntitlementTables,
  type EntitlementMockTables,
} from "@/features/billing/entitlement.test-support.ts";
import { GEMINI_REQUEST_TIMEOUT_MS } from "./ai-request-limits.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SESSION_A = "11111111-1111-4111-8111-111111111111";
const CURRICULUM_LESSON = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const ENTRY_POINT_FILES = [
  "src/platform/lesson-sessions/prepare-lesson-session.functions.ts",
  "src/platform/ai/functions/ai-lesson-generator.functions.ts",
  "src/platform/ai/functions/ai.functions.ts",
  "src/platform/ai/functions/ai-quiz-generator.functions.ts",
] as const;

function createDeferred<T = void>(): {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function waitFor(predicate: () => boolean, label: string): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 0));
  }
  throw new Error(`timed out waiting for: ${label}`);
}

function makeSessionRow(teacherId: string) {
  return {
    id: SESSION_A,
    teacher_id: teacherId,
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
  };
}

function mockPipeline(
  userId: string,
  entitlementTables: EntitlementMockTables = allowEntitlementTables(userId),
): {
  auth: SupabaseUserContext;
  executeCalls: { count: number };
} {
  const executeCalls = { count: 0 };
  const sessionRow = makeSessionRow(userId);
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
            return {
              data: {
                id: CURRICULUM_LESSON,
                title: "درس",
                objectives: null,
                notes: null,
              },
              error: null,
            };
          },
        };
        return chain;
      }

      if (table === "teacher_timetable") {
        const chain = {
          select() {
            return chain;
          },
          eq() {
            return chain;
          },
          order() {
            return chain;
          },
          then(resolve: (value: unknown) => unknown) {
            return Promise.resolve(resolve({ data: [], error: null }));
          },
        };
        return chain;
      }

      if (table === "ai_generations") {
        return {
          insert(row: Record<string, unknown>) {
            return {
              select() {
                return {
                  async single() {
                    return {
                      data: {
                        id: "99999999-9999-4999-8999-999999999999",
                        created_at: "2026-08-08T00:00:00Z",
                        ...row,
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

  return {
    auth: { client: client as never, userId },
    executeCalls,
  };
}

describe("Hotfix #2.6 — paid AI request guard (unit)", () => {
  beforeEach(() => {
    resetPaidAiRequestGuardForTests();
  });

  it("1. first request for user A is accepted", () => {
    assert.equal(MAX_CONCURRENT_PAID_AI_PER_USER, 1);
    assert.equal(MAX_GLOBAL_CONCURRENT_PAID_AI, 10);
    assert.equal(PAID_AI_COOLDOWN_MS, 5_000);
    const acquired = acquirePaidAiRequest(USER_A);
    assert.equal(acquired.ok, true);
    if (!acquired.ok) return;
    assert.equal(getPaidAiGuardSnapshotForTests().globalInFlight, 1);
    assert.deepEqual(getPaidAiGuardSnapshotForTests().userInFlight, [USER_A]);
    acquired.release();
  });

  it("2/3/8/9. second concurrent same-user is rejected; no global/cooldown mutate", () => {
    const first = acquirePaidAiRequest(USER_A);
    assert.equal(first.ok, true);
    const snapBefore = getPaidAiGuardSnapshotForTests();
    assert.equal(snapBefore.globalInFlight, 1);
    const lastBefore = snapBefore.lastStartAt[USER_A];

    const second = acquirePaidAiRequest(USER_A);
    assert.equal(second.ok, false);
    if (second.ok) return;
    assert.equal(second.reason, "user_busy");
    assert.equal(paidAiGuardReasonMessage(second.reason), PAID_AI_USER_BUSY_MESSAGE);

    const snapAfter = getPaidAiGuardSnapshotForTests();
    assert.equal(snapAfter.globalInFlight, 1);
    assert.equal(snapAfter.lastStartAt[USER_A], lastBefore);
    if (first.ok) first.release();
  });

  it("4. user A and user B can run concurrently", () => {
    const a = acquirePaidAiRequest(USER_A);
    const b = acquirePaidAiRequest(USER_B);
    assert.equal(a.ok, true);
    assert.equal(b.ok, true);
    assert.equal(getPaidAiGuardSnapshotForTests().globalInFlight, 2);
    if (a.ok) a.release();
    if (b.ok) b.release();
  });

  it("5/6/7/8. global accepts 10; 11th rejected with zero mutate", () => {
    const holders: Array<{ ok: true; release: () => void }> = [];
    for (let i = 0; i < 10; i++) {
      const id = `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
      const acquired = acquirePaidAiRequest(id);
      assert.equal(acquired.ok, true, `request ${i} should acquire`);
      if (acquired.ok) holders.push(acquired);
    }
    assert.equal(getPaidAiGuardSnapshotForTests().globalInFlight, 10);

    const eleventh = acquirePaidAiRequest("00000000-0000-4000-8000-000000000099");
    assert.equal(eleventh.ok, false);
    if (!eleventh.ok) {
      assert.equal(eleventh.reason, "global_busy");
      assert.equal(paidAiGuardReasonMessage(eleventh.reason), PAID_AI_GLOBAL_BUSY_MESSAGE);
    }
    assert.equal(getPaidAiGuardSnapshotForTests().globalInFlight, 10);
    assert.equal(
      getPaidAiGuardSnapshotForTests().lastStartAt["00000000-0000-4000-8000-000000000099"],
      undefined,
    );

    for (const h of holders) h.release();
    assert.equal(getPaidAiGuardSnapshotForTests().globalInFlight, 0);
  });

  it("10. cooldown rejects second accepted start within 5s", () => {
    let now = 1_000_000;
    setPaidAiGuardNowForTests(() => now);
    const first = acquirePaidAiRequest(USER_A);
    assert.equal(first.ok, true);
    if (first.ok) first.release();

    const last = getPaidAiGuardSnapshotForTests().lastStartAt[USER_A];
    assert.equal(last, 1_000_000);

    now += PAID_AI_COOLDOWN_MS - 1;
    const second = acquirePaidAiRequest(USER_A);
    assert.equal(second.ok, false);
    if (!second.ok) {
      assert.equal(second.reason, "cooldown");
      assert.equal(paidAiGuardReasonMessage(second.reason), PAID_AI_COOLDOWN_MESSAGE);
    }
    assert.equal(getPaidAiGuardSnapshotForTests().lastStartAt[USER_A], last);
    assert.equal(getPaidAiGuardSnapshotForTests().globalInFlight, 0);
  });

  it("11. after cooldown expires, user can start again", () => {
    let now = 2_000_000;
    setPaidAiGuardNowForTests(() => now);
    const first = acquirePaidAiRequest(USER_A);
    if (first.ok) first.release();

    now += PAID_AI_COOLDOWN_MS;
    const second = acquirePaidAiRequest(USER_A);
    assert.equal(second.ok, true);
    if (second.ok) second.release();
    assert.equal(getPaidAiGuardSnapshotForTests().lastStartAt[USER_A], now);
  });

  it("15/16. release is idempotent; globalInFlight never negative", () => {
    const acquired = acquirePaidAiRequest(USER_A);
    assert.equal(acquired.ok, true);
    if (!acquired.ok) return;
    acquired.release();
    acquired.release();
    acquired.release();
    assert.equal(getPaidAiGuardSnapshotForTests().globalInFlight, 0);
    assert.equal(getPaidAiGuardSnapshotForTests().userInFlight.includes(USER_A), false);
  });

  it("17. lastStartAt remains after release", () => {
    setPaidAiGuardNowForTests(() => 9_000_000);
    const acquired = acquirePaidAiRequest(USER_A);
    if (!acquired.ok) return;
    acquired.release();
    assert.equal(getPaidAiGuardSnapshotForTests().lastStartAt[USER_A], 9_000_000);
    assert.equal(getPaidAiGuardSnapshotForTests().userInFlight.includes(USER_A), false);
  });

  it("18. different users have isolated cooldowns", () => {
    let now = 3_000_000;
    setPaidAiGuardNowForTests(() => now);
    const a = acquirePaidAiRequest(USER_A);
    if (a.ok) a.release();

    now += 1_000;
    const b = acquirePaidAiRequest(USER_B);
    assert.equal(b.ok, true);
    if (b.ok) b.release();

    const cooldownA = acquirePaidAiRequest(USER_A);
    assert.equal(cooldownA.ok, false);
    if (!cooldownA.ok) assert.equal(cooldownA.reason, "cooldown");
  });
});

describe("Hotfix #2.6 — paid AI guard via runSessionBoundGeneration", () => {
  beforeEach(() => {
    resetPaidAiRequestGuardForTests();
  });

  it("2/3. concurrent same-user second request rejected; execute/Gemini=0", async () => {
    const { auth, executeCalls } = mockPipeline(USER_A);
    const hold = createDeferred<void>();
    let firstEntered = false;

    const first = runSessionBoundGeneration(
      {
        lessonSessionId: SESSION_A,
        kind: "worksheet",
        auth,
        supabase: auth.client,
        userId: USER_A,
      },
      async () => {
        firstEntered = true;
        executeCalls.count += 1;
        await hold.promise;
        return {
          content: "md",
          model: "mock",
          prompt: "p",
          input: {},
        };
      },
    );

    await waitFor(() => firstEntered, "first execute entered");
    assert.equal(getPaidAiGuardSnapshotForTests().globalInFlight, 1);

    const secondCalls = { count: 0 };
    await assert.rejects(
      () =>
        runSessionBoundGeneration(
          {
            lessonSessionId: SESSION_A,
            kind: "worksheet",
            auth,
            supabase: auth.client,
            userId: USER_A,
          },
          async () => {
            secondCalls.count += 1;
            return { content: "md", model: "mock", prompt: "p", input: {} };
          },
        ),
      (err: unknown) => err instanceof Error && err.message === PAID_AI_USER_BUSY_MESSAGE,
    );
    assert.equal(secondCalls.count, 0);
    assert.equal(getPaidAiGuardSnapshotForTests().globalInFlight, 1);

    hold.resolve();
    await first;
    assert.equal(getPaidAiGuardSnapshotForTests().globalInFlight, 0);
  });

  it("4. two different users can run concurrently through the pipeline", async () => {
    const a = mockPipeline(USER_A);
    const b = mockPipeline(USER_B);
    const hold = createDeferred<void>();
    let aEntered = false;
    let bEntered = false;

    const pA = runSessionBoundGeneration(
      {
        lessonSessionId: SESSION_A,
        kind: "quiz",
        auth: a.auth,
        supabase: a.auth.client,
        userId: USER_A,
      },
      async () => {
        aEntered = true;
        a.executeCalls.count += 1;
        await hold.promise;
        return { content: {}, model: "mock", prompt: "p", input: {} };
      },
    );
    const pB = runSessionBoundGeneration(
      {
        lessonSessionId: SESSION_A,
        kind: "quiz",
        auth: b.auth,
        supabase: b.auth.client,
        userId: USER_B,
      },
      async () => {
        bEntered = true;
        b.executeCalls.count += 1;
        await hold.promise;
        return { content: {}, model: "mock", prompt: "p", input: {} };
      },
    );

    await waitFor(() => aEntered && bEntered, "both executes entered");
    assert.equal(getPaidAiGuardSnapshotForTests().globalInFlight, 2);
    hold.resolve();
    await Promise.all([pA, pB]);
    assert.equal(a.executeCalls.count, 1);
    assert.equal(b.executeCalls.count, 1);
  });

  it("6/7. 11th concurrent global request rejected; execute=0", async () => {
    const hold = createDeferred<void>();
    const holders: Promise<unknown>[] = [];

    for (let i = 0; i < 10; i++) {
      const id = `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
      const { auth } = mockPipeline(id);
      holders.push(
        runSessionBoundGeneration(
          {
            lessonSessionId: SESSION_A,
            kind: "activity_ideas",
            auth,
            supabase: auth.client,
            userId: id,
          },
          async () => {
            await hold.promise;
            return { content: "md", model: "mock", prompt: "p", input: {} };
          },
        ),
      );
    }

    await waitFor(
      () => getPaidAiGuardSnapshotForTests().globalInFlight === 10,
      "global in-flight = 10",
    );

    const overflowId = "00000000-0000-4000-8000-000000000099";
    const overflow = mockPipeline(overflowId);
    let overflowExecute = 0;
    await assert.rejects(
      () =>
        runSessionBoundGeneration(
          {
            lessonSessionId: SESSION_A,
            kind: "activity_ideas",
            auth: overflow.auth,
            supabase: overflow.auth.client,
            userId: overflowId,
          },
          async () => {
            overflowExecute += 1;
            return { content: "md", model: "mock", prompt: "p", input: {} };
          },
        ),
      (err: unknown) => err instanceof Error && err.message === PAID_AI_GLOBAL_BUSY_MESSAGE,
    );
    assert.equal(overflowExecute, 0);
    assert.equal(getPaidAiGuardSnapshotForTests().globalInFlight, 10);

    hold.resolve();
    await Promise.all(holders);
    assert.equal(getPaidAiGuardSnapshotForTests().globalInFlight, 0);
  });

  it("12. release occurs after successful generation", async () => {
    const { auth } = mockPipeline(USER_A);
    await runSessionBoundGeneration(
      {
        lessonSessionId: SESSION_A,
        kind: "lesson_plan",
        auth,
        supabase: auth.client,
        userId: USER_A,
      },
      async () => ({ content: {}, model: "mock", prompt: "p", input: {} }),
    );
    assert.equal(getPaidAiGuardSnapshotForTests().globalInFlight, 0);
    assert.equal(getPaidAiGuardSnapshotForTests().userInFlight.includes(USER_A), false);
  });

  it("13. release occurs after ordinary execute error", async () => {
    const { auth } = mockPipeline(USER_A);
    await assert.rejects(() =>
      runSessionBoundGeneration(
        {
          lessonSessionId: SESSION_A,
          kind: "worksheet",
          auth,
          supabase: auth.client,
          userId: USER_A,
        },
        async () => {
          throw new Error("ordinary gemini failure");
        },
      ),
    );
    assert.equal(getPaidAiGuardSnapshotForTests().globalInFlight, 0);
    assert.equal(getPaidAiGuardSnapshotForTests().userInFlight.includes(USER_A), false);
  });

  it("14. release occurs after timeout-like AbortError from execute", async () => {
    const { auth } = mockPipeline(USER_A);
    await assert.rejects(() =>
      runSessionBoundGeneration(
        {
          lessonSessionId: SESSION_A,
          kind: "quiz",
          auth,
          supabase: auth.client,
          userId: USER_A,
        },
        async () => {
          throw new DOMException("This operation was aborted", "AbortError");
        },
      ),
    );
    assert.equal(getPaidAiGuardSnapshotForTests().globalInFlight, 0);
  });

  it("entitlement denial never acquires the guard", async () => {
    const { auth } = mockPipeline(USER_A, emptyEntitlementTables());
    await assert.rejects(
      () =>
        runSessionBoundGeneration(
          {
            lessonSessionId: SESSION_A,
            kind: "worksheet",
            auth,
            supabase: auth.client,
            userId: USER_A,
          },
          async () => ({ content: "x", model: "x", prompt: "x", input: {} }),
        ),
      (err: unknown) => err instanceof BillingError && err.code === "FEATURE_ENTITLEMENT_REQUIRED",
    );
    assert.equal(getPaidAiGuardSnapshotForTests().globalInFlight, 0);
    assert.deepEqual(getPaidAiGuardSnapshotForTests().lastStartAt, {});
  });
});

describe("Hotfix #2.6 — scope / isolation / unchanged limits", () => {
  it("19. all five paid AI entry points pass through runSessionBoundGeneration / prepareOwnedLessonSession", () => {
    const prepareSrc = readFileSync(
      join(ROOT, "src/platform/lesson-sessions/prepare-lesson-session.functions.ts"),
      "utf8",
    );
    assert.match(prepareSrc, /prepareOwnedLessonSession/);

    const prepareService = readFileSync(
      join(ROOT, "src/features/lesson-sessions/services/prepare-lesson-session.server.ts"),
      "utf8",
    );
    assert.match(prepareService, /runSessionBoundGeneration/);

    const lessonSrc = readFileSync(
      join(ROOT, "src/platform/ai/functions/ai-lesson-generator.functions.ts"),
      "utf8",
    );
    assert.match(lessonSrc, /runSessionBoundGeneration/);

    const aiSrc = readFileSync(join(ROOT, "src/platform/ai/functions/ai.functions.ts"), "utf8");
    assert.match(aiSrc, /generateWorksheet[\s\S]*runSessionBoundGeneration/);
    assert.match(aiSrc, /generateActivityIdeas[\s\S]*runSessionBoundGeneration/);

    const quizSrc = readFileSync(
      join(ROOT, "src/platform/ai/functions/ai-quiz-generator.functions.ts"),
      "utf8",
    );
    assert.match(quizSrc, /runSessionBoundGeneration/);

    const pipelineSrc = readFileSync(
      join(ROOT, "src/features/ai/services/session-bound-generation.server.ts"),
      "utf8",
    );
    assert.match(pipelineSrc, /acquirePaidAiRequest\(params\.userId\)/);
    assert.match(pipelineSrc, /finally\s*\{\s*guard\.release\(\)/);
  });

  it("20. PDF extraction does NOT import or use the paid-AI guard", () => {
    const pdfFn = readFileSync(
      join(ROOT, "src/platform/curriculum/curriculum-management.functions.ts"),
      "utf8",
    );
    assert.doesNotMatch(pdfFn, /paid-ai-request-guard/);
    assert.doesNotMatch(pdfFn, /acquirePaidAiRequest/);
    assert.match(pdfFn, /acquireCurriculumPdfExtraction/);

    const paidGuard = readFileSync(
      join(ROOT, "src/features/ai/providers/paid-ai-request-guard.ts"),
      "utf8",
    );
    assert.doesNotMatch(paidGuard, /from\s+["'].*curriculum-pdf-guard/);
    assert.doesNotMatch(paidGuard, /acquireCurriculumPdfExtraction/);
  });

  it("21. 90-second Gemini timeout constant remains 90000", () => {
    assert.equal(GEMINI_REQUEST_TIMEOUT_MS, 90_000);
    const limitsSrc = readFileSync(
      join(ROOT, "src/features/ai/providers/ai-request-limits.ts"),
      "utf8",
    );
    assert.match(limitsSrc, /GEMINI_REQUEST_TIMEOUT_MS\s*=\s*90_000/);
  });

  it("22. worksheet/activity retries remain retries: 0; orchestrator default remains 2", () => {
    const orchStrategySrc = readFileSync(
      join(ROOT, "src/features/ai/strategies/orchestrator.strategy.ts"),
      "utf8",
    );
    assert.match(orchStrategySrc, /generate\("worksheet"[\s\S]*?retries:\s*0/);
    assert.match(orchStrategySrc, /generate\("activity_ideas"[\s\S]*?retries:\s*0/);

    const orchCore = readFileSync(join(ROOT, "src/features/ai/orchestrator/index.ts"), "utf8");
    assert.match(orchCore, /options\.retries !== undefined \? options\.retries : 2/);
  });

  it("23. no real Gemini provider imports in this guard test module path wiring", () => {
    for (const rel of ENTRY_POINT_FILES) {
      const src = readFileSync(join(ROOT, rel), "utf8");
      assert.doesNotMatch(src, /getGemini|@google\/genai/);
    }
    const guardSrc = readFileSync(
      join(ROOT, "src/features/ai/providers/paid-ai-request-guard.ts"),
      "utf8",
    );
    assert.doesNotMatch(guardSrc, /getGemini|@google\/genai|generateContent/);
  });
});
