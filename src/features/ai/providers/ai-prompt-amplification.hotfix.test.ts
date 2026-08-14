import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  AI_PROMPT_CURRICULUM_NOTES_MAX,
  AI_PROMPT_CURRICULUM_OBJECTIVES_MAX,
  AI_PROMPT_CURRICULUM_TITLE_MAX,
  AI_PROMPT_SUGGESTED_DATE_MAX,
  AI_PROMPT_TRUNCATION_MARKER,
  AI_PROMPT_UNIT_MAX,
  GEMINI_REQUEST_TIMEOUT_MS,
  clampAiPromptText,
} from "./ai-request-limits.ts";
import { LessonPrepInput } from "@/platform/ai/functions/ai-lesson-generator.functions.ts";
import { buildSessionCurriculumPrefix } from "@/features/ai/services/session-bound-generation.server.ts";
import { executeLessonPlanGeneration } from "@/features/ai/strategies/lesson-plan.strategy.ts";
import { executeQuizGeneration } from "@/features/ai/strategies/quiz.strategy.ts";
import {
  executeActivityIdeasGeneration,
  executeWorksheetGeneration,
} from "@/features/ai/strategies/orchestrator.strategy.ts";
import type { SessionBoundGenerationContext } from "@/features/ai/services/session-bound-generation.types";
import {
  MAX_CONCURRENT_PAID_AI_PER_USER,
  MAX_GLOBAL_CONCURRENT_PAID_AI,
  PAID_AI_COOLDOWN_MS,
} from "./paid-ai-request-guard.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const SESSION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CURRICULUM_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const LESSON_BASE = { lessonSessionId: SESSION_ID };

function makeContext(
  curriculum: {
    title: string;
    objectives: string | null;
    notes: string | null;
  } = {
    title: "درس قصير",
    objectives: "هدف قصير",
    notes: "ملاحظة قصيرة",
  },
): SessionBoundGenerationContext {
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
      title: curriculum.title,
      objectives: curriculum.objectives,
      notes: curriculum.notes,
    },
    timetableEntry: {
      id: "tttttttt-tttt-4ttt-8ttt-tttttttttttt",
      teacherId: "11111111-1111-4111-8111-111111111111",
      dayOfWeek: 5,
      period: 1,
      subject: "الرياضيات",
      grade: "الصف السادس",
      className: "أ",
      classroom: undefined,
      startsAt: undefined,
      endsAt: undefined,
      active: true,
    },
    auth: {} as SessionBoundGenerationContext["auth"],
    supabase: {} as SessionBoundGenerationContext["supabase"],
    userId: "11111111-1111-4111-8111-111111111111",
  };
}

function lessonPayload() {
  return {
    behavioralObjectives: {
      cognitive: ["أن يحدد"],
      affective: ["أن يقدر"],
      psychomotor: ["أن يطبق"],
    },
    strategiesAndDigitalSkills: {
      strategies: ["تعاوني"],
      digitalSkills: ["مدرستي"],
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

describe("Hotfix #2.7 — suggestedDate Zod bounds", () => {
  it("1. omitted suggestedDate → accepted", () => {
    const result = LessonPrepInput.safeParse({ ...LESSON_BASE });
    assert.equal(result.success, true);
  });

  it("2. valid short YYYY-MM-DD → accepted", () => {
    const result = LessonPrepInput.safeParse({
      ...LESSON_BASE,
      suggestedDate: "2026-08-09",
    });
    assert.equal(result.success, true);
  });

  it("3. empty string → accepted (fallback path preserved)", () => {
    const result = LessonPrepInput.safeParse({
      ...LESSON_BASE,
      suggestedDate: "",
    });
    assert.equal(result.success, true);
  });

  it("3b. exactly AI_PROMPT_SUGGESTED_DATE_MAX=32 and constant is 32", () => {
    assert.equal(AI_PROMPT_SUGGESTED_DATE_MAX, 32);
    // YYYY-MM-DD is the valid contract; length 10 ≤ 32.
    const valid = LessonPrepInput.safeParse({
      ...LESSON_BASE,
      suggestedDate: "2026-12-31",
    });
    assert.equal(valid.success, true);
  });

  it("4. >32 chars → rejected", () => {
    const geminiCalls = { count: 0 };
    const result = LessonPrepInput.safeParse({
      ...LESSON_BASE,
      suggestedDate: "x".repeat(AI_PROMPT_SUGGESTED_DATE_MAX + 1),
    });
    assert.equal(result.success, false);
    assert.equal(geminiCalls.count, 0);
  });

  it("5. oversized suggestedDate → Gemini calls = 0 (rejected before handler)", () => {
    const geminiCalls = { count: 0 };
    const result = LessonPrepInput.safeParse({
      ...LESSON_BASE,
      suggestedDate: "A".repeat(10_000),
    });
    assert.equal(result.success, false);
    assert.equal(geminiCalls.count, 0);
  });

  it("6. invalid date format (not YYYY-MM-DD) → rejected", () => {
    const bad = ["08/13/2026", "2026/08/13", "not-a-date", "2026-8-1", "20260813"];
    for (const suggestedDate of bad) {
      const result = LessonPrepInput.safeParse({ ...LESSON_BASE, suggestedDate });
      assert.equal(result.success, false, `expected reject for ${suggestedDate}`);
    }
  });
});

describe("Hotfix #2.7 — clampAiPromptText helper", () => {
  it("short text unchanged", () => {
    assert.equal(clampAiPromptText("قصير", 10), "قصير");
  });

  it("oversized text truncated with marker", () => {
    const value = "أ".repeat(10);
    const clamped = clampAiPromptText(value, 4);
    assert.equal(clamped, `أأأأ${AI_PROMPT_TRUNCATION_MARKER}`);
    assert.ok(clamped.includes(AI_PROMPT_TRUNCATION_MARKER));
    assert.equal(value.length, 10);
  });
});

describe("Hotfix #2.7 — curriculum prefix clamps", () => {
  it("7/8/9. short title/objectives/notes unchanged", () => {
    const lesson = {
      id: CURRICULUM_ID,
      title: "عنوان",
      objectives: "أهداف",
      notes: "ملاحظات",
    };
    const { promptPrefix, used } = buildSessionCurriculumPrefix(lesson);
    assert.equal(used, true);
    assert.match(promptPrefix, /عنوان الدرس: عنوان/);
    assert.match(promptPrefix, /أهداف/);
    assert.match(promptPrefix, /ملاحظات: ملاحظات/);
    assert.equal(promptPrefix.includes(AI_PROMPT_TRUNCATION_MARKER), false);
    assert.equal(lesson.title, "عنوان");
    assert.equal(lesson.objectives, "أهداف");
    assert.equal(lesson.notes, "ملاحظات");
  });

  it("10/11/12/13/14. oversized fields bounded; source object unchanged; marker present", () => {
    const lesson = {
      id: CURRICULUM_ID,
      title: "ت".repeat(AI_PROMPT_CURRICULUM_TITLE_MAX + 50),
      objectives: "ه".repeat(AI_PROMPT_CURRICULUM_OBJECTIVES_MAX + 50),
      notes: "م".repeat(AI_PROMPT_CURRICULUM_NOTES_MAX + 50),
    };
    const original = {
      title: lesson.title,
      objectives: lesson.objectives!,
      notes: lesson.notes!,
    };

    const { promptPrefix } = buildSessionCurriculumPrefix(lesson);

    assert.ok(promptPrefix.includes(AI_PROMPT_TRUNCATION_MARKER));
    assert.ok(!promptPrefix.includes(original.title));
    assert.ok(!promptPrefix.includes(original.objectives));
    assert.ok(!promptPrefix.includes(original.notes));

    assert.match(
      promptPrefix,
      new RegExp(
        `عنوان الدرس: ${"ت".repeat(AI_PROMPT_CURRICULUM_TITLE_MAX)}`.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&",
        ),
      ),
    );

    assert.equal(lesson.title, original.title);
    assert.equal(lesson.objectives, original.objectives);
    assert.equal(lesson.notes, original.notes);
    assert.equal(lesson.title.length, AI_PROMPT_CURRICULUM_TITLE_MAX + 50);
  });

  it("15. worksheet/activity prefix uses shared clamped builder", () => {
    const lesson = {
      id: CURRICULUM_ID,
      title: "ع".repeat(AI_PROMPT_CURRICULUM_TITLE_MAX + 20),
      objectives: "أ".repeat(100),
      notes: "ن".repeat(AI_PROMPT_CURRICULUM_NOTES_MAX + 20),
    };
    const prefix = buildSessionCurriculumPrefix(lesson).promptPrefix;
    assert.ok(prefix.includes(AI_PROMPT_TRUNCATION_MARKER));
    assert.ok(!prefix.includes(lesson.title));
    assert.ok(!prefix.includes(lesson.notes!));
    assert.match(prefix, /عنوان الدرس:/);

    // Orchestrator strategies import the same builder — source wiring unchanged.
    const orchSrc = readFileSync(
      join(ROOT, "src/features/ai/strategies/orchestrator.strategy.ts"),
      "utf8",
    );
    assert.match(orchSrc, /buildSessionCurriculumPrefix/);
    assert.match(orchSrc, /retries:\s*0/);
    assert.equal(typeof executeWorksheetGeneration, "function");
    assert.equal(typeof executeActivityIdeasGeneration, "function");
  });
});

describe("Hotfix #2.7 — quiz curriculum title clamp (P1 residual)", () => {
  function quizPayload() {
    return {
      title: "اختبار",
      mcqs: [
        {
          question: "س",
          options: ["أ", "ب", "ج", "د"],
          correctAnswer: "أ",
          explanation: "تفسير",
        },
      ],
      trueFalse: [{ question: "ع", correctAnswer: true, correction: "ص" }],
      shortAnswer: [{ question: "م", sampleAnswer: "إ" }],
      homeworkAssignment: {
        title: "واجب",
        description: "وصف",
        estimatedTime: "10 دقائق",
        evaluationCriteria: "معيار",
      },
    };
  }

  it("1. normal curriculum title remains unchanged in prompt", async () => {
    const ctx = makeContext({
      title: "الكسور المتكافئة",
      objectives: "هدف",
      notes: null,
    });
    let seenPrompt = "";
    const fake = {
      models: {
        async generateContent(input: { contents: string }) {
          seenPrompt = input.contents;
          return { text: JSON.stringify(quizPayload()) };
        },
      },
    };

    const result = await executeQuizGeneration(ctx, {}, fake);
    assert.match(seenPrompt, /لدرس "الكسور المتكافئة"/);
    assert.equal(result.input.title, "الكسور المتكافئة");
    assert.equal(ctx.curriculumLesson!.title, "الكسور المتكافئة");
  });

  it("2/3/4. oversized curriculum title bounded before Gemini; source unchanged", async () => {
    const hugeTitle = "ت".repeat(AI_PROMPT_CURRICULUM_TITLE_MAX + 100);
    const ctx = makeContext({
      title: hugeTitle,
      objectives: "هدف",
      notes: null,
    });
    const sourceTitle = ctx.curriculumLesson!.title;

    let geminiCalls = 0;
    let seenPrompt = "";
    const fake = {
      models: {
        async generateContent(input: { contents: string }) {
          geminiCalls += 1;
          seenPrompt = input.contents;
          return { text: JSON.stringify(quizPayload()) };
        },
      },
    };

    const result = await executeQuizGeneration(ctx, {}, fake);

    assert.equal(geminiCalls, 1);
    assert.ok(seenPrompt.includes(AI_PROMPT_TRUNCATION_MARKER));
    assert.ok(!seenPrompt.includes(hugeTitle));
    assert.ok(
      seenPrompt.includes(
        `لدرس "${"ت".repeat(AI_PROMPT_CURRICULUM_TITLE_MAX)}${AI_PROMPT_TRUNCATION_MARKER}"`,
      ),
    );
    assert.equal(ctx.curriculumLesson!.title, sourceTitle);
    assert.equal(ctx.curriculumLesson!.title.length, AI_PROMPT_CURRICULUM_TITLE_MAX + 100);
    assert.equal(
      result.input.title,
      `${"ت".repeat(AI_PROMPT_CURRICULUM_TITLE_MAX)}${AI_PROMPT_TRUNCATION_MARKER}`,
    );
  });

  it("5/6. client-provided title still preferred; no real Gemini", async () => {
    const ctx = makeContext({
      title: "عنوان المنهج",
      objectives: null,
      notes: null,
    });
    let geminiCalls = 0;
    let seenPrompt = "";
    const fake = {
      models: {
        async generateContent(input: { contents: string }) {
          geminiCalls += 1;
          seenPrompt = input.contents;
          return { text: JSON.stringify(quizPayload()) };
        },
      },
    };

    const result = await executeQuizGeneration(ctx, { title: "عنوان العميل" }, fake);
    assert.equal(geminiCalls, 1);
    assert.match(seenPrompt, /لدرس "عنوان العميل"/);
    assert.equal(result.input.title, "عنوان العميل");
    assert.equal(result.model, "gemini-2.5-flash");
    assert.ok(result.content);
  });
});

describe("Hotfix #2.7 — lesson-plan prompt clamps", () => {
  it("16/17. oversized curriculum is bounded in Gemini prompt; source unchanged", async () => {
    const hugeTitle = "ت".repeat(AI_PROMPT_CURRICULUM_TITLE_MAX + 80);
    const hugeObjectives = "ه".repeat(AI_PROMPT_CURRICULUM_OBJECTIVES_MAX + 80);
    const hugeNotes = JSON.stringify({
      unitName: "و".repeat(AI_PROMPT_UNIT_MAX + 40),
      activities: "ن".repeat(AI_PROMPT_CURRICULUM_NOTES_MAX + 40),
      assessment: "ق".repeat(AI_PROMPT_CURRICULUM_NOTES_MAX + 40),
      notes: "م".repeat(AI_PROMPT_CURRICULUM_NOTES_MAX + 40),
    });

    const ctx = makeContext({
      title: hugeTitle,
      objectives: hugeObjectives,
      notes: hugeNotes,
    });
    const sourceTitle = ctx.curriculumLesson!.title;
    const sourceObjectives = ctx.curriculumLesson!.objectives;
    const sourceNotes = ctx.curriculumLesson!.notes;

    let geminiCalls = 0;
    let seenPrompt = "";
    const fake = {
      models: {
        async generateContent(input: { contents: string }) {
          geminiCalls += 1;
          seenPrompt = input.contents;
          return { text: JSON.stringify(lessonPayload()) };
        },
      },
    };

    await executeLessonPlanGeneration(ctx, {}, fake);

    assert.equal(geminiCalls, 1);
    assert.ok(seenPrompt.includes(AI_PROMPT_TRUNCATION_MARKER));
    assert.ok(!seenPrompt.includes(hugeTitle));
    assert.ok(!seenPrompt.includes(hugeObjectives));
    assert.equal(ctx.curriculumLesson!.title, sourceTitle);
    assert.equal(ctx.curriculumLesson!.objectives, sourceObjectives);
    assert.equal(ctx.curriculumLesson!.notes, sourceNotes);
    assert.equal(ctx.curriculumLesson!.title.length, AI_PROMPT_CURRICULUM_TITLE_MAX + 80);
  });

  it("does not duplicate official title/objectives into curriculumContext block", async () => {
    let seenPrompt = "";
    const fake = {
      models: {
        async generateContent(input: { contents: string }) {
          seenPrompt = input.contents;
          return { text: JSON.stringify(lessonPayload()) };
        },
      },
    };

    await executeLessonPlanGeneration(
      makeContext({
        title: "درس فريد",
        objectives: "هدف فريد للتحضير",
        notes: JSON.stringify({ unitNumber: "1", activities: "نشاط" }),
      }),
      {},
      fake,
    );

    assert.match(seenPrompt, /اسم الدرس الرسمي: درس فريد/);
    assert.match(seenPrompt, /الأهداف الرسمية: هدف فريد للتحضير/);
    assert.doesNotMatch(seenPrompt, /عنوان الدرس الرسمي:/);
    // objectives line must not appear twice under the old curriculumContext label.
    assert.equal((seenPrompt.match(/الأهداف الرسمية:/g) ?? []).length, 1);
  });
});

describe("Hotfix #2.7 — regression protection", () => {
  it("timeout / retries / paid-AI guard / PDF isolation unchanged", () => {
    assert.equal(GEMINI_REQUEST_TIMEOUT_MS, 90_000);
    assert.equal(MAX_CONCURRENT_PAID_AI_PER_USER, 1);
    assert.equal(MAX_GLOBAL_CONCURRENT_PAID_AI, 10);
    assert.equal(PAID_AI_COOLDOWN_MS, 5_000);

    const orchSrc = readFileSync(
      join(ROOT, "src/features/ai/strategies/orchestrator.strategy.ts"),
      "utf8",
    );
    assert.match(orchSrc, /generate\("worksheet"[\s\S]*?retries:\s*0/);
    assert.match(orchSrc, /generate\("activity_ideas"[\s\S]*?retries:\s*0/);

    const paidGuard = readFileSync(
      join(ROOT, "src/features/ai/providers/paid-ai-request-guard.ts"),
      "utf8",
    );
    assert.doesNotMatch(paidGuard, /clampAiPromptText|CURRICULUM_TITLE/);

    const pdfFn = readFileSync(
      join(ROOT, "src/platform/curriculum/curriculum-management.functions.ts"),
      "utf8",
    );
    assert.doesNotMatch(pdfFn, /clampAiPromptText|AI_PROMPT_CURRICULUM/);
    assert.match(pdfFn, /acquireCurriculumPdfExtraction/);

    const quizSrc = readFileSync(join(ROOT, "src/features/ai/strategies/quiz.strategy.ts"), "utf8");
    assert.match(quizSrc, /clampAiPromptText/);
    assert.match(quizSrc, /AI_PROMPT_CURRICULUM_TITLE_MAX/);

    const limitsSrc = readFileSync(
      join(ROOT, "src/features/ai/providers/ai-request-limits.ts"),
      "utf8",
    );
    assert.match(limitsSrc, /GEMINI_REQUEST_TIMEOUT_MS\s*=\s*90_000/);
    assert.match(limitsSrc, /AI_PROMPT_SUGGESTED_DATE_MAX\s*=\s*32/);
  });
});
