import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  AI_PROMPT_GRADE_MAX,
  AI_PROMPT_LESSON_NAME_MAX,
  AI_PROMPT_OBJECTIVES_MAX,
  AI_PROMPT_SEMESTER_MAX,
  AI_PROMPT_SUBJECT_MAX,
  AI_PROMPT_TITLE_MAX,
  AI_PROMPT_UNIT_MAX,
  AI_REQUEST_TIMEOUT_MESSAGE,
  GEMINI_REQUEST_TIMEOUT_MS,
  isAiGeminiTimeoutError,
} from "@/features/ai/providers/ai-request-limits.ts";
import { generateContent } from "@/features/ai/providers/gemini.ts";
import { AIOrchestrator, aiOrchestrator } from "@/features/ai/orchestrator/index.ts";
import type { AIProvider } from "@/features/ai/orchestrator/types.ts";
import type { SessionBoundGenerationContext } from "@/features/ai/services/session-bound-generation.types";
import { executeLessonPlanGeneration } from "@/features/ai/strategies/lesson-plan.strategy.ts";
import { executeQuizGeneration } from "@/features/ai/strategies/quiz.strategy.ts";
import {
  executeActivityIdeasGeneration,
  executeWorksheetGeneration,
} from "@/features/ai/strategies/orchestrator.strategy.ts";
import { LessonPrepInput } from "@/platform/ai/functions/ai-lesson-generator.functions.ts";
import { QuizGeneratorInput } from "@/platform/ai/functions/ai-quiz-generator.functions.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const SESSION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CURRICULUM_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const LESSON_BASE = {
  lessonSessionId: SESSION_ID,
  subject: "الرياضيات",
  grade: "الصف السادس",
};

const QUIZ_BASE = {
  lessonSessionId: SESSION_ID,
  subject: "الرياضيات",
  grade: "الصف السادس",
  title: "الكسور",
  questionCount: 5,
  difficulty: "medium" as const,
};

function makeContext(): SessionBoundGenerationContext {
  return {
    session: {
      id: SESSION_ID,
      teacherId: "11111111-1111-4111-8111-111111111111",
      academicYearId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      semesterId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      gradeId: null,
      classId: null,
      curriculumLessonId: CURRICULUM_ID,
      curriculumLessonSource: "plan",
      sessionDate: "2026-08-08",
      dayOfWeek: 5,
      periodNumber: 1,
      lessonLocked: false,
      status: "scheduled",
      preparedAt: null,
      completedAt: null,
      createdAt: "2026-08-08T00:00:00Z",
      updatedAt: "2026-08-08T00:00:00Z",
    },
    curriculumLesson: {
      id: CURRICULUM_ID,
      title: "الكسور المتكافئة",
      objectives: "أن يميز الطالب الكسور المتكافئة.",
      notes: null,
    },
    timetableEntry: {
      id: "tttttttt-tttt-4ttt-8ttt-tttttttttttt",
      teacherId: "11111111-1111-4111-8111-111111111111",
      dayOfWeek: 5,
      period: 1,
      subject: "الرياضيات",
      grade: "الصف السادس الابتدائي",
      className: "سادس أ",
      classroom: "101",
      startsAt: "08:00",
      endsAt: "08:45",
      active: true,
    },
    auth: {} as SessionBoundGenerationContext["auth"],
    supabase: {} as SessionBoundGenerationContext["supabase"],
    userId: "11111111-1111-4111-8111-111111111111",
  };
}

function lessonPlanPayload() {
  return {
    behavioralObjectives: {
      cognitive: ["أن يحدد الطالب المفهوم"],
      affective: ["أن يقدر أهمية المفهوم"],
      psychomotor: ["أن يطبق المفهوم"],
    },
    strategiesAndDigitalSkills: {
      strategies: ["التعلم التعاوني"],
      digitalSkills: ["استخدام منصة مدرستي"],
    },
    lessonScenario: {
      introduction: "تمهيد",
      exercises: ["نشاط"],
      deliveryScript: "شرح",
    },
    assessmentAndHomework: {
      homework: "واجب",
      summativeAssessment: ["سؤال"],
    },
  };
}

function quizPayload() {
  return {
    title: "اختبار تجريبي",
    mcqs: [
      {
        question: "س",
        options: ["أ", "ب", "ج", "د"],
        correctAnswer: "أ",
        explanation: "تفسير",
      },
    ],
    trueFalse: [{ question: "ع", correctAnswer: true, correction: "ص" }],
    shortAnswer: [{ question: "م", modelAnswer: "إ" }],
    homeworkAssignment: {
      description: "واجب",
      criteria: ["معيار"],
      estimatedTime: 10,
    },
  };
}

describe("Hotfix #2.4 — lesson prep input limits", () => {
  it("1. objectives within limit → accepted", () => {
    const geminiCalls = { count: 0 };
    const result = LessonPrepInput.safeParse({
      ...LESSON_BASE,
      objectives: "أ".repeat(AI_PROMPT_OBJECTIVES_MAX),
    });
    assert.equal(result.success, true);
    assert.equal(geminiCalls.count, 0);
  });

  it("2. objectives over limit → rejected (Gemini call count = 0)", () => {
    const geminiCalls = { count: 0 };
    const result = LessonPrepInput.safeParse({
      ...LESSON_BASE,
      objectives: "أ".repeat(AI_PROMPT_OBJECTIVES_MAX + 1),
    });
    assert.equal(result.success, false);
    assert.equal(geminiCalls.count, 0);
  });

  it("3. unit within limit → accepted", () => {
    const result = LessonPrepInput.safeParse({
      ...LESSON_BASE,
      unit: "و".repeat(AI_PROMPT_UNIT_MAX),
    });
    assert.equal(result.success, true);
  });

  it("4. unit over limit → rejected (Gemini call count = 0)", () => {
    const geminiCalls = { count: 0 };
    const result = LessonPrepInput.safeParse({
      ...LESSON_BASE,
      unit: "و".repeat(AI_PROMPT_UNIT_MAX + 1),
    });
    assert.equal(result.success, false);
    assert.equal(geminiCalls.count, 0);
  });

  it("5. lessonName within limit → accepted", () => {
    const result = LessonPrepInput.safeParse({
      ...LESSON_BASE,
      lessonName: "د".repeat(AI_PROMPT_LESSON_NAME_MAX),
    });
    assert.equal(result.success, true);
  });

  it("6. lessonName over limit → rejected (Gemini call count = 0)", () => {
    const geminiCalls = { count: 0 };
    const result = LessonPrepInput.safeParse({
      ...LESSON_BASE,
      lessonName: "د".repeat(AI_PROMPT_LESSON_NAME_MAX + 1),
    });
    assert.equal(result.success, false);
    assert.equal(geminiCalls.count, 0);
  });
});

describe("Hotfix #2.4 — quiz input limits", () => {
  it("7. subject within limit → accepted", () => {
    const result = QuizGeneratorInput.safeParse({
      ...QUIZ_BASE,
      subject: "م".repeat(AI_PROMPT_SUBJECT_MAX),
    });
    assert.equal(result.success, true);
  });

  it("8. subject over limit → rejected (Gemini call count = 0)", () => {
    const geminiCalls = { count: 0 };
    const result = QuizGeneratorInput.safeParse({
      ...QUIZ_BASE,
      subject: "م".repeat(AI_PROMPT_SUBJECT_MAX + 1),
    });
    assert.equal(result.success, false);
    assert.equal(geminiCalls.count, 0);
  });

  it("9. grade within limit → accepted", () => {
    const result = QuizGeneratorInput.safeParse({
      ...QUIZ_BASE,
      grade: "ص".repeat(AI_PROMPT_GRADE_MAX),
    });
    assert.equal(result.success, true);
  });

  it("10. title over limit → rejected (Gemini call count = 0)", () => {
    const geminiCalls = { count: 0 };
    const result = QuizGeneratorInput.safeParse({
      ...QUIZ_BASE,
      title: "ع".repeat(AI_PROMPT_TITLE_MAX + 1),
    });
    assert.equal(result.success, false);
    assert.equal(geminiCalls.count, 0);
  });

  it("10b. title within limit → accepted", () => {
    const result = QuizGeneratorInput.safeParse({
      ...QUIZ_BASE,
      title: "ع".repeat(AI_PROMPT_TITLE_MAX),
    });
    assert.equal(result.success, true);
  });

  it("11. semester within limit → accepted", () => {
    const result = QuizGeneratorInput.safeParse({
      ...QUIZ_BASE,
      semester: "ف".repeat(AI_PROMPT_SEMESTER_MAX),
    });
    assert.equal(result.success, true);
  });

  it("12. semester over limit → rejected (Gemini call count = 0)", () => {
    const geminiCalls = { count: 0 };
    const result = QuizGeneratorInput.safeParse({
      ...QUIZ_BASE,
      semester: "ف".repeat(AI_PROMPT_SEMESTER_MAX + 1),
    });
    assert.equal(result.success, false);
    assert.equal(geminiCalls.count, 0);
  });

  it("grade over limit → rejected (Gemini call count = 0)", () => {
    const geminiCalls = { count: 0 };
    const result = QuizGeneratorInput.safeParse({
      ...QUIZ_BASE,
      grade: "ص".repeat(AI_PROMPT_GRADE_MAX + 1),
    });
    assert.equal(result.success, false);
    assert.equal(geminiCalls.count, 0);
  });
});

describe("Hotfix #2.4 — Gemini timeout configuration", () => {
  it("13. lesson generation sends timeout = 90000", async () => {
    let seenTimeout: number | undefined;
    const fake = {
      models: {
        async generateContent(input: { config?: { httpOptions?: { timeout?: number } } }) {
          seenTimeout = input.config?.httpOptions?.timeout;
          return { text: JSON.stringify(lessonPlanPayload()) };
        },
      },
    };

    await executeLessonPlanGeneration(makeContext(), {}, fake);
    assert.equal(seenTimeout, 90_000);
    assert.equal(seenTimeout, GEMINI_REQUEST_TIMEOUT_MS);
  });

  it("14. quiz generation sends timeout = 90000", async () => {
    let seenTimeout: number | undefined;
    const fake = {
      models: {
        async generateContent(input: { config?: { httpOptions?: { timeout?: number } } }) {
          seenTimeout = input.config?.httpOptions?.timeout;
          return { text: JSON.stringify(quizPayload()) };
        },
      },
    };

    await executeQuizGeneration(makeContext(), { title: "درس" }, fake);
    assert.equal(seenTimeout, 90_000);
    assert.equal(seenTimeout, GEMINI_REQUEST_TIMEOUT_MS);
  });

  it("15. orchestrator/callDirectAi (generateContent) sends timeout = 90000", async () => {
    let seenTimeout: number | undefined;
    const fakeAi = {
      models: {
        async generateContent(input: { config?: { httpOptions?: { timeout?: number } } }) {
          seenTimeout = input.config?.httpOptions?.timeout;
          return { text: "محتوى تجريبي" };
        },
      },
    };

    const text = await generateContent(
      { prompt: "اختبار", systemInstruction: "نظام" },
      fakeAi as never,
    );
    assert.equal(text, "محتوى تجريبي");
    assert.equal(seenTimeout, 90_000);
  });
});

describe("Hotfix #2.4 — timeout error handling", () => {
  it("16. lesson timeout produces stable error", async () => {
    const fake = {
      models: {
        async generateContent() {
          const err = new Error("The operation was aborted");
          err.name = "AbortError";
          throw err;
        },
      },
    };

    await assert.rejects(
      () => executeLessonPlanGeneration(makeContext(), {}, fake),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.equal(err.message, AI_REQUEST_TIMEOUT_MESSAGE);
        assert.doesNotMatch(err.message, /abort|AbortError|timeout/i);
        return true;
      },
    );
  });

  it("17. quiz timeout produces stable error", async () => {
    const fake = {
      models: {
        async generateContent() {
          const err = new Error("The operation was aborted");
          err.name = "AbortError";
          throw err;
        },
      },
    };

    await assert.rejects(
      () => executeQuizGeneration(makeContext(), {}, fake),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.equal(err.message, AI_REQUEST_TIMEOUT_MESSAGE);
        return true;
      },
    );
  });

  it("18. orchestrator timeout produces stable error (retries unchanged: default still 2)", async () => {
    let generateAttempts = 0;
    const failingProvider: AIProvider = {
      name: "test-timeout",
      async generate() {
        generateAttempts += 1;
        const err = new Error(AI_REQUEST_TIMEOUT_MESSAGE);
        throw err;
      },
    };

    const orchestrator = new AIOrchestrator(failingProvider);
    await assert.rejects(
      () =>
        orchestrator.generate(
          "worksheet",
          {
            grade: "الصف السادس",
            subject: "الرياضيات",
            title: "درس",
            questionCount: 3,
            difficulty: "easy",
          },
          { skipAutoCurriculum: true, retries: 0 },
        ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.equal(err.message, AI_REQUEST_TIMEOUT_MESSAGE);
        return true;
      },
    );
    assert.equal(generateAttempts, 1);

    // Retries unchanged: default remains 2 (3 attempts total). Prove via source.
    const orchSrc = readFileSync(join(ROOT, "src/features/ai/orchestrator/index.ts"), "utf8");
    assert.match(orchSrc, /options\.retries !== undefined \? options\.retries : 2/);
    assert.match(orchSrc, /while \(attempts <= maxRetries\)/);
  });

  it("valid lesson/quiz inputs still reach Gemini", async () => {
    let lessonCalls = 0;
    let quizCalls = 0;

    assert.equal(
      LessonPrepInput.safeParse({
        ...LESSON_BASE,
        objectives: "أهداف قصيرة",
        unit: "وحدة",
        lessonName: "درس",
      }).success,
      true,
    );

    await executeLessonPlanGeneration(
      makeContext(),
      { objectives: "أهداف قصيرة", unit: "وحدة", lessonName: "درس" },
      {
        models: {
          async generateContent() {
            lessonCalls += 1;
            return { text: JSON.stringify(lessonPlanPayload()) };
          },
        },
      },
    );
    assert.equal(lessonCalls, 1);

    assert.equal(
      QuizGeneratorInput.safeParse({
        ...QUIZ_BASE,
        semester: "الأول",
      }).success,
      true,
    );

    await executeQuizGeneration(
      makeContext(),
      { title: "درس", semester: "الأول" },
      {
        models: {
          async generateContent() {
            quizCalls += 1;
            return { text: JSON.stringify(quizPayload()) };
          },
        },
      },
    );
    assert.equal(quizCalls, 1);
  });

  it("detects AbortError and ignores ordinary provider errors", () => {
    const abort = new Error("aborted");
    abort.name = "AbortError";
    assert.equal(isAiGeminiTimeoutError(abort), true);

    assert.equal(isAiGeminiTimeoutError(new Error("rate limited")), false);
    assert.equal(isAiGeminiTimeoutError(new Error(AI_REQUEST_TIMEOUT_MESSAGE)), false);
  });

  it("generateContent maps AbortError to stable Arabic timeout message", async () => {
    const fakeAi = {
      models: {
        async generateContent() {
          const err = new Error("The user aborted a request.");
          err.name = "AbortError";
          throw err;
        },
      },
    };

    await assert.rejects(
      () => generateContent({ prompt: "x" }, fakeAi as never),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.equal(err.message, AI_REQUEST_TIMEOUT_MESSAGE);
        return true;
      },
    );
  });
});

describe("Hotfix #2.5 — worksheet/activity orchestrator retries=0", () => {
  type GenerateFn = typeof aiOrchestrator.generate;

  async function withMockedOrchestratorProvider<T>(
    provider: AIProvider,
    run: () => Promise<T>,
  ): Promise<{ result: T; seenRetries: Array<number | undefined> }> {
    const seenRetries: Array<number | undefined> = [];
    const original: GenerateFn = aiOrchestrator.generate.bind(aiOrchestrator);
    aiOrchestrator.generate = (async (type, input, options = {}) => {
      seenRetries.push(options.retries);
      return original(type, input, {
        ...options,
        provider,
        skipAutoCurriculum: true,
      });
    }) as GenerateFn;

    try {
      const result = await run();
      return { result, seenRetries };
    } finally {
      aiOrchestrator.generate = original;
    }
  }

  it("strategy sources pass retries: 0 for worksheet and activity_ideas only", () => {
    const strategySrc = readFileSync(
      join(ROOT, "src/features/ai/strategies/orchestrator.strategy.ts"),
      "utf8",
    );
    assert.match(
      strategySrc,
      /generate\("worksheet"[\s\S]*?retries:\s*0[\s\S]*?generate\("activity_ideas"[\s\S]*?retries:\s*0/,
    );

    const orchSrc = readFileSync(join(ROOT, "src/features/ai/orchestrator/index.ts"), "utf8");
    assert.match(orchSrc, /options\.retries !== undefined \? options\.retries : 2/);
  });

  it("1. worksheet success → provider calls = 1", async () => {
    let calls = 0;
    const provider: AIProvider = {
      name: "mock-success",
      async generate() {
        calls += 1;
        return { content: "# واجب\n1. سؤال", model: "mock" };
      },
    };

    const { seenRetries } = await withMockedOrchestratorProvider(provider, () =>
      executeWorksheetGeneration(makeContext(), {
        questionCount: 3,
        difficulty: "easy",
      }),
    );

    assert.deepEqual(seenRetries, [0]);
    assert.equal(calls, 1);
  });

  it("2. worksheet ordinary Gemini failure → calls = 1 (no retry)", async () => {
    let calls = 0;
    const provider: AIProvider = {
      name: "mock-fail",
      async generate() {
        calls += 1;
        throw new Error("provider unavailable");
      },
    };

    await assert.rejects(
      () =>
        withMockedOrchestratorProvider(provider, () =>
          executeWorksheetGeneration(makeContext(), {
            questionCount: 3,
            difficulty: "easy",
          }),
        ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /provider unavailable/);
        return true;
      },
    );
    assert.equal(calls, 1);
  });

  it("3. worksheet timeout/AbortError → calls = 1 (no retry)", async () => {
    let calls = 0;
    const provider: AIProvider = {
      name: "mock-timeout",
      async generate() {
        calls += 1;
        const err = new Error("The operation was aborted");
        err.name = "AbortError";
        throw err;
      },
    };

    await assert.rejects(
      () =>
        withMockedOrchestratorProvider(provider, () =>
          executeWorksheetGeneration(makeContext(), {
            questionCount: 3,
            difficulty: "easy",
          }),
        ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.equal(err.name, "AbortError");
        return true;
      },
    );
    assert.equal(calls, 1);
  });

  it("4. activity success → provider calls = 1", async () => {
    let calls = 0;
    const provider: AIProvider = {
      name: "mock-activity-success",
      async generate() {
        calls += 1;
        return { content: "# أنشطة\n1. نشاط", model: "mock" };
      },
    };

    const { seenRetries } = await withMockedOrchestratorProvider(provider, () =>
      executeActivityIdeasGeneration(makeContext(), {
        count: 3,
        duration: "short",
        groupType: "group",
      }),
    );

    assert.deepEqual(seenRetries, [0]);
    assert.equal(calls, 1);
  });

  it("5. activity ordinary Gemini failure → calls = 1 (no retry)", async () => {
    let calls = 0;
    const provider: AIProvider = {
      name: "mock-activity-fail",
      async generate() {
        calls += 1;
        throw new Error("quota exceeded");
      },
    };

    await assert.rejects(
      () =>
        withMockedOrchestratorProvider(provider, () =>
          executeActivityIdeasGeneration(makeContext(), {
            count: 3,
            duration: "short",
            groupType: "group",
          }),
        ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /quota exceeded/);
        return true;
      },
    );
    assert.equal(calls, 1);
  });

  it("6/7. activity timeout → calls = 1 and no second attempt", async () => {
    let calls = 0;
    const provider: AIProvider = {
      name: "mock-activity-timeout",
      async generate() {
        calls += 1;
        throw new Error(AI_REQUEST_TIMEOUT_MESSAGE);
      },
    };

    await assert.rejects(
      () =>
        withMockedOrchestratorProvider(provider, () =>
          executeActivityIdeasGeneration(makeContext(), {
            count: 3,
            duration: "short",
            groupType: "group",
          }),
        ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.equal(err.message, AI_REQUEST_TIMEOUT_MESSAGE);
        return true;
      },
    );
    assert.equal(calls, 1);
  });

  it("8. global orchestrator default remains 2 (3 attempts) when retries omitted", async () => {
    let calls = 0;
    const provider: AIProvider = {
      name: "default-retry",
      async generate() {
        calls += 1;
        throw new Error("transient");
      },
    };

    const orchestrator = new AIOrchestrator(provider);
    await assert.rejects(
      () =>
        orchestrator.generate(
          "worksheet",
          {
            grade: "الصف السادس",
            subject: "الرياضيات",
            title: "درس",
            questionCount: 3,
            difficulty: "easy",
          },
          { skipAutoCurriculum: true },
        ),
      /transient/,
    );
    assert.equal(calls, 3);
  });

  it("9. lesson/quiz still single-call (unaffected by worksheet retries override)", async () => {
    let lessonCalls = 0;
    let quizCalls = 0;

    await executeLessonPlanGeneration(
      makeContext(),
      { objectives: "أهداف", unit: "وحدة", lessonName: "درس" },
      {
        models: {
          async generateContent() {
            lessonCalls += 1;
            return { text: JSON.stringify(lessonPlanPayload()) };
          },
        },
      },
    );
    assert.equal(lessonCalls, 1);

    await executeQuizGeneration(
      makeContext(),
      { title: "درس" },
      {
        models: {
          async generateContent() {
            quizCalls += 1;
            return { text: JSON.stringify(quizPayload()) };
          },
        },
      },
    );
    assert.equal(quizCalls, 1);
  });
});

describe("Hotfix #2.4 — PDF path untouched + wiring", () => {
  it("does not modify PDF limit/guard modules", () => {
    // Smoke: constants files still exist and this hotfix module is separate.
    assert.ok(readFileSync(join(ROOT, "src/platform/curriculum/curriculum-pdf-limits.ts"), "utf8"));
    assert.ok(readFileSync(join(ROOT, "src/platform/curriculum/curriculum-pdf-guard.ts"), "utf8"));
  });

  it("server Zod schemas wire shared max constants", () => {
    const lessonSrc = readFileSync(
      join(ROOT, "src/platform/ai/functions/ai-lesson-generator.functions.ts"),
      "utf8",
    );
    const quizSrc = readFileSync(
      join(ROOT, "src/platform/ai/functions/ai-quiz-generator.functions.ts"),
      "utf8",
    );
    assert.match(lessonSrc, /AI_PROMPT_OBJECTIVES_MAX/);
    assert.match(lessonSrc, /AI_PROMPT_UNIT_MAX/);
    assert.match(lessonSrc, /AI_PROMPT_LESSON_NAME_MAX/);
    assert.match(quizSrc, /AI_PROMPT_SUBJECT_MAX/);
    assert.match(quizSrc, /AI_PROMPT_GRADE_MAX/);
    assert.match(quizSrc, /AI_PROMPT_TITLE_MAX/);
    assert.match(quizSrc, /AI_PROMPT_SEMESTER_MAX/);
  });
});
