import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import type { StructuredQuizAndAssignmentData } from "@/platform/ai/docx";

import { TestAiImportService } from "./test-ai-import.service.ts";
import { TestQuestionService } from "./test-question.service.ts";
import { TestService } from "./test.service.ts";
import {
  GEN_A,
  SESSION_A,
  TEACHER_A,
  TEACHER_B,
  authFor,
  createEmptyTestsDb,
  type TestsMockDb,
} from "./tests-mock.ts";

function quizContent(): StructuredQuizAndAssignmentData {
  return {
    title: "اختبار الوحدة المستورد",
    mcqs: [
      {
        question: "اختر الإجابة الصحيحة",
        options: ["أ", "ب", "ج", "د"],
        correctAnswer: "ب",
        explanation: "ب هي الصحيحة",
      },
    ],
    trueFalse: [
      {
        question: "العبارة صحيحة",
        correctAnswer: true,
        correction: "نعم",
      },
    ],
    shortAnswer: [
      {
        question: "اشرح المفهوم",
        sampleAnswer: "نموذج",
      },
    ],
    homeworkAssignment: {
      title: "واجب",
      description: "وصف",
      estimatedTime: "15 دقيقة",
      evaluationCriteria: "معايير",
    },
  };
}

function seedOwnedQuiz(
  db: TestsMockDb,
  overrides: Partial<Record<string, unknown>> = {},
): string {
  const id = (overrides.id as string) ?? GEN_A;
  db.ai_generations.push({
    id,
    user_id: TEACHER_A,
    kind: "quiz",
    lesson_session_id: SESSION_A,
    prompt: "اختبار وواجب",
    output: {
      content: quizContent(),
      input: {
        lessonSessionId: SESSION_A,
        subject: "رياضيات",
        grade: "خامس",
        title: "درس",
        questionCount: 5,
        difficulty: "medium",
      },
      model: "gemini-2.5-flash",
      lessonContext: {
        lessonSessionId: SESSION_A,
        curriculumLessonId: null,
        sessionStatus: "preparing",
      },
    },
    status: "completed",
    subject: "رياضيات",
    grade: "خامس",
    created_at: "2026-08-15T00:00:00Z",
    updated_at: "2026-08-15T00:00:00Z",
    version: 1,
    ...overrides,
  });
  db.lesson_sessions.push({
    id: SESSION_A,
    teacher_id: TEACHER_A,
    curriculum_lesson_id: null,
    status: "preparing",
    day_of_week: 0,
    period_number: 1,
  });
  return id;
}

describe("TASK 22.8 TestAiImportService", () => {
  it("11-17. owned quiz creates draft with provenance and questions", async () => {
    const db = createEmptyTestsDb();
    const generationId = seedOwnedQuiz(db);
    const beforeOutput = structuredClone(db.ai_generations[0]?.output);

    const result = await TestAiImportService.createDraftFromQuizGeneration(
      generationId,
      authFor(db),
    );

    assert.equal(result.reusedExisting, false);
    assert.equal(result.test.status, "draft");
    assert.equal(result.test.sourceAiGenerationId, generationId);
    assert.equal(result.test.lessonSessionId, SESSION_A);
    assert.equal(result.test.title, "اختبار الوحدة المستورد");
    assert.equal(result.test.subject, "رياضيات");
    assert.equal(result.test.grade, "خامس");
    assert.equal(result.test.teacherId, TEACHER_A);
    assert.match(result.test.instructions, /مقالي قصير/);

    assert.equal(result.questions.length, 2);
    assert.equal(result.skippedShortAnswerCount, 1);

    const mcq = result.questions.find((q) => q.type === "multiple_choice");
    assert.ok(mcq);
    assert.equal(mcq.options.length, 4);
    assert.equal(mcq.options.filter((o) => o.isCorrect).length, 1);
    assert.equal(mcq.options.find((o) => o.isCorrect)?.label, "ب");

    const tf = result.questions.find((q) => q.type === "true_false");
    assert.ok(tf);
    assert.ok(tf.options.some((o) => o.label === "صواب" && o.isCorrect));

    // 18. generation is not modified
    assert.deepEqual(db.ai_generations[0]?.output, beforeOutput);
    assert.equal(db.ai_generations[0]?.kind, "quiz");
  });

  it("19. foreign generation rejected", async () => {
    const db = createEmptyTestsDb();
    const generationId = seedOwnedQuiz(db, { user_id: TEACHER_B });
    await assert.rejects(
      () => TestAiImportService.createDraftFromQuizGeneration(generationId, authFor(db)),
      /لا تملك صلاحية/,
    );
    assert.equal(db.tests.length, 0);
  });

  it("20. non-quiz generation rejected", async () => {
    const db = createEmptyTestsDb();
    const generationId = seedOwnedQuiz(db, { kind: "worksheet" });
    await assert.rejects(
      () => TestAiImportService.createDraftFromQuizGeneration(generationId, authFor(db)),
      /quiz/,
    );
  });

  it("21. missing generation rejected", async () => {
    const db = createEmptyTestsDb();
    await assert.rejects(
      () =>
        TestAiImportService.createDraftFromQuizGeneration(
          "ffffffff-ffff-4fff-8fff-ffffffffffff",
          authFor(db),
        ),
      /غير موجود/,
    );
  });

  it("22. unauthenticated access rejected", async () => {
    const source = readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), "test-ai-import.service.ts"),
      "utf8",
    );
    assert.match(source, /resolveUserContext/);
    assert.match(source, /if\s*\(\s*!resolved\s*\)/);
    assert.match(source, /يجب تسجيل الدخول لاستيراد الاختبار/);
    assert.equal(/\bteacher_id\s*:/.test(source), false);

    // No session-bound caller: foreign teacher cannot import owned generation.
    const db = createEmptyTestsDb();
    seedOwnedQuiz(db);
    await assert.rejects(
      () => TestAiImportService.createDraftFromQuizGeneration(GEN_A, authFor(db, TEACHER_B)),
      /لا تملك صلاحية/,
    );
  });

  it("23. duplicate import returns existing draft", async () => {
    const db = createEmptyTestsDb();
    const generationId = seedOwnedQuiz(db);

    const first = await TestAiImportService.createDraftFromQuizGeneration(
      generationId,
      authFor(db),
    );
    assert.equal(first.reusedExisting, false);
    assert.equal(db.tests.length, 1);
    const questionCount = db.test_questions.length;

    const second = await TestAiImportService.createDraftFromQuizGeneration(
      generationId,
      authFor(db),
    );
    assert.equal(second.reusedExisting, true);
    assert.equal(second.test.id, first.test.id);
    assert.equal(db.tests.length, 1);
    assert.equal(db.test_questions.length, questionCount);
  });

  it("24-25. no teacher_id client input; questions via TestQuestionService", async () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const service = readFileSync(path.join(here, "test-ai-import.service.ts"), "utf8");
    const hook = readFileSync(path.join(here, "../hooks/useTestAiImport.ts"), "utf8");

    assert.equal(/\bteacherId\s*[:=]|\bteacher_id\s*[:=]/.test(hook), false);
    assert.match(service, /TestService\.create/);
    assert.match(service, /TestQuestionService\.create/);
    assert.match(hook, /TestAiImportService\.createDraftFromQuizGeneration/);
    assert.equal(/from\(["']tests["']\)/.test(hook), false);
    assert.equal(/from\(["']test_questions["']\)/.test(hook), false);
    assert.equal(/from\(["']ai_generations["']\)/.test(hook), false);

    // Sanity: import still works through public APIs
    const db = createEmptyTestsDb();
    const generationId = seedOwnedQuiz(db);
    const result = await TestAiImportService.createDraftFromQuizGeneration(
      generationId,
      authFor(db),
    );
    const listed = await TestQuestionService.listByTest(result.test.id, authFor(db));
    assert.equal(listed.length, result.questions.length);
    const owned = await TestService.getById(result.test.id, authFor(db));
    assert.equal(owned?.status, "draft");
  });
});
