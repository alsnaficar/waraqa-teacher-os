import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { beforeEach, describe, it } from "node:test";

import { runSessionBoundGeneration } from "./session-bound-generation.server.ts";
import { prepareOwnedLessonSession } from "@/features/lesson-sessions/services/prepare-lesson-session.server.ts";
import { resetPaidAiRequestGuardForTests } from "@/features/ai/providers/paid-ai-request-guard.ts";
import { BillingError } from "@/features/billing/types.ts";
import type { AiGenerationKind } from "./persistence.server.ts";
import type { SupabaseUserContext } from "@/platform/database/supabase/context";
import {
  allowEntitlementTables,
  createEntitlementTableHandler,
  emptyEntitlementTables,
  type EntitlementMockTables,
} from "@/features/billing/entitlement.test-support.ts";

const TEACHER_A = "11111111-1111-4111-8111-111111111111";
const SESSION_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CURRICULUM_LESSON = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const ENTRY_POINTS: Array<{
  name: string;
  file: string;
  kind: AiGenerationKind;
  via: "pipeline" | "prepare";
}> = [
  {
    name: "prepareLessonSession",
    file: "src/platform/lesson-sessions/prepare-lesson-session.functions.ts",
    kind: "lesson_plan",
    via: "prepare",
  },
  {
    name: "generateLessonPreparation",
    file: "src/platform/ai/functions/ai-lesson-generator.functions.ts",
    kind: "lesson_plan",
    via: "pipeline",
  },
  {
    name: "generateWorksheet",
    file: "src/platform/ai/functions/ai.functions.ts",
    kind: "worksheet",
    via: "pipeline",
  },
  {
    name: "generateQuizAndAssignment",
    file: "src/platform/ai/functions/ai-quiz-generator.functions.ts",
    kind: "quiz",
    via: "pipeline",
  },
  {
    name: "generateActivityIdeas",
    file: "src/platform/ai/functions/ai.functions.ts",
    kind: "activity_ideas",
    via: "pipeline",
  },
];

function makeSessionRow() {
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
  };
}

function mockPaidAi(entitlementTables: EntitlementMockTables): {
  auth: SupabaseUserContext;
  geminiCalls: { count: number };
  persistCalls: { count: number };
} {
  const geminiCalls = { count: 0 };
  const persistCalls = { count: 0 };
  const sessionRow = makeSessionRow();
  const billingFrom = createEntitlementTableHandler(entitlementTables);

  const client = {
    from(table: string) {
      const billing = billingFrom(table);
      if (billing) return billing;

      if (table === "lesson_sessions") {
        const state: {
          filters: Record<string, string | boolean>;
          patch: Record<string, unknown>;
        } = {
          filters: {},
          patch: {},
        };
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
            if (state.filters.teacher_id && sessionRow.teacher_id !== state.filters.teacher_id) {
              return { data: null, error: null };
            }
            if (Object.keys(state.patch).length > 0) {
              if (state.filters.status && sessionRow.status !== state.filters.status) {
                return { data: null, error: null };
              }
              Object.assign(sessionRow, state.patch);
            }
            return { data: sessionRow, error: null };
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

      if (table === "ai_generations") {
        return {
          insert() {
            persistCalls.count += 1;
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

  return {
    auth: { client: client as never, userId: TEACHER_A },
    geminiCalls,
    persistCalls,
  };
}

async function runEntry(
  via: "pipeline" | "prepare",
  kind: AiGenerationKind,
  auth: SupabaseUserContext,
  geminiCalls: { count: number },
) {
  const execute = async () => {
    geminiCalls.count += 1;
    return {
      content: kind === "worksheet" || kind === "activity_ideas" ? "md" : { ok: true },
      model: "gemini-2.5-flash",
      prompt: "test",
      input: {},
    };
  };

  if (via === "prepare") {
    return prepareOwnedLessonSession(
      {
        lessonSessionId: SESSION_A,
        auth,
        supabase: auth.client,
        userId: TEACHER_A,
      },
      execute,
    );
  }

  return runSessionBoundGeneration(
    {
      lessonSessionId: SESSION_A,
      kind,
      auth,
      supabase: auth.client,
      userId: TEACHER_A,
    },
    execute,
  );
}

describe("paid AI entry points — entitlement gate", () => {
  beforeEach(() => {
    resetPaidAiRequestGuardForTests();
  });

  for (const entry of ENTRY_POINTS) {
    it(`${entry.name} denied → Gemini=0 persist=0`, async () => {
      const { auth, geminiCalls, persistCalls } = mockPaidAi(emptyEntitlementTables());

      await assert.rejects(
        () => runEntry(entry.via, entry.kind, auth, geminiCalls),
        (err: unknown) =>
          err instanceof BillingError && err.code === "FEATURE_ENTITLEMENT_REQUIRED",
      );

      assert.equal(geminiCalls.count, 0, `${entry.name} must not call Gemini`);
      assert.equal(persistCalls.count, 0, `${entry.name} must not persist`);
    });

    it(`${entry.name} allowed → generation path continues`, async () => {
      const { auth, geminiCalls, persistCalls } = mockPaidAi(allowEntitlementTables(TEACHER_A));
      const result = await runEntry(entry.via, entry.kind, auth, geminiCalls);
      assert.ok(result);
      assert.equal(geminiCalls.count, 1);
      assert.equal(persistCalls.count, 1);
    });

    it(`${entry.name} wires ${entry.kind} without client billing fields`, () => {
      const src = readFileSync(entry.file, "utf8");
      assert.match(src, new RegExp(entry.name));
      if (entry.via === "prepare") {
        assert.match(src, /prepareOwnedLessonSession/);
      } else {
        assert.match(src, /runSessionBoundGeneration/);
        assert.match(src, new RegExp(`kind: "${entry.kind}"`));
      }
      assert.doesNotMatch(src, /subscriptionId/);
      assert.doesNotMatch(src, /planId/);
      assert.doesNotMatch(src, /featureKey/);
      assert.doesNotMatch(src, /getGemini/);
    });
  }
});
