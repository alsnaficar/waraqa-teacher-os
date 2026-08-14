import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { TestQuestionService } from "./test-question.service.ts";
import { TestService } from "./test.service.ts";
import {
  TEACHER_A,
  TEACHER_B,
  authFor,
  createEmptyTestsDb,
} from "./tests-mock.ts";

async function seedOwnedTest(db = createEmptyTestsDb()) {
  const test = await TestService.create({ title: "اختبار الأسئلة" }, authFor(db));
  assert.ok(test);
  return { db, test };
}

describe("TASK 22.2 TestQuestionService", () => {
  it("creates MCQ with exactly one correct option", async () => {
    const { db, test } = await seedOwnedTest();
    const question = await TestQuestionService.create(
      {
        testId: test.id,
        type: "multiple_choice",
        prompt: "ما ناتج 2+2؟",
        position: 0,
        points: 2,
        options: [
          { label: "3", isCorrect: false },
          { label: "4", isCorrect: true },
          { label: "5", isCorrect: false },
        ],
      },
      authFor(db),
    );

    assert.ok(question);
    assert.equal(question.type, "multiple_choice");
    assert.equal(question.options.length, 3);
    assert.equal(question.options.filter((o) => o.isCorrect).length, 1);
    assert.equal(db.test_options.length, 3);
  });

  it("creates true_false via correctBoolean", async () => {
    const { db, test } = await seedOwnedTest();
    const question = await TestQuestionService.create(
      {
        testId: test.id,
        type: "true_false",
        prompt: "الشمس نجم.",
        position: 0,
        correctBoolean: true,
      },
      authFor(db),
    );

    assert.ok(question);
    assert.equal(question.type, "true_false");
    assert.equal(question.options.length, 2);
    assert.equal(question.options.find((o) => o.label === "صواب")?.isCorrect, true);
  });

  it("rejects MCQ without exactly one correct option", async () => {
    const { db, test } = await seedOwnedTest();
    await assert.rejects(
      () =>
        TestQuestionService.create(
          {
            testId: test.id,
            type: "multiple_choice",
            prompt: "؟",
            position: 0,
            options: [
              { label: "أ", isCorrect: true },
              { label: "ب", isCorrect: true },
            ],
          },
          authFor(db),
        ),
      /إجابة صحيحة واحدة/,
    );
  });

  it("rejects true_false with wrong option count", async () => {
    const { db, test } = await seedOwnedTest();
    await assert.rejects(
      () =>
        TestQuestionService.create(
          {
            testId: test.id,
            type: "true_false",
            prompt: "؟",
            position: 0,
            options: [{ label: "صواب", isCorrect: true }],
          },
          authFor(db),
        ),
      /خيارين فقط/,
    );
  });

  it("enforces ownership through parent test", async () => {
    const { db, test } = await seedOwnedTest();
    await assert.rejects(
      () =>
        TestQuestionService.create(
          {
            testId: test.id,
            type: "true_false",
            prompt: "؟",
            position: 0,
            correctBoolean: false,
          },
          authFor(db, TEACHER_B),
        ),
      /الاختبار غير موجود/,
    );
  });

  it("rejects foreign test id", async () => {
    const db = createEmptyTestsDb();
    await assert.rejects(
      () =>
        TestQuestionService.create(
          {
            testId: "missing-test",
            type: "true_false",
            prompt: "؟",
            position: 0,
            correctBoolean: true,
          },
          authFor(db),
        ),
      /الاختبار غير موجود/,
    );
  });

  it("rejects duplicate positions on same test", async () => {
    const { db, test } = await seedOwnedTest();
    await TestQuestionService.create(
      {
        testId: test.id,
        type: "true_false",
        prompt: "أ",
        position: 1,
        correctBoolean: true,
      },
      authFor(db),
    );

    await assert.rejects(
      () =>
        TestQuestionService.create(
          {
            testId: test.id,
            type: "true_false",
            prompt: "ب",
            position: 1,
            correctBoolean: false,
          },
          authFor(db),
        ),
      (err: unknown) => {
        if (err instanceof Error) return /unique|duplicate|ترتيب/i.test(err.message);
        if (err && typeof err === "object" && "message" in err) {
          return /unique|duplicate/i.test(String((err as { message: unknown }).message));
        }
        return false;
      },
    );
  });

  it("lists questions for owned test only", async () => {
    const { db, test } = await seedOwnedTest();
    await TestQuestionService.create(
      {
        testId: test.id,
        type: "true_false",
        prompt: "أ",
        position: 0,
        correctBoolean: true,
      },
      authFor(db),
    );

    const list = await TestQuestionService.listByTest(test.id, authFor(db));
    assert.equal(list.length, 1);
    assert.equal(list[0]?.prompt, "أ");

    await assert.rejects(
      () => TestQuestionService.listByTest(test.id, authFor(db, TEACHER_B)),
      /الاختبار غير موجود/,
    );
  });

  it("replaceQuestions rebuilds the set", async () => {
    const { db, test } = await seedOwnedTest();
    await TestQuestionService.create(
      {
        testId: test.id,
        type: "true_false",
        prompt: "قديم",
        position: 0,
        correctBoolean: true,
      },
      authFor(db),
    );

    const replaced = await TestQuestionService.replaceQuestions(
      test.id,
      [
        {
          type: "multiple_choice",
          prompt: "جديد",
          position: 0,
          options: [
            { label: "1", isCorrect: true },
            { label: "2", isCorrect: false },
          ],
        },
      ],
      authFor(db),
    );

    assert.equal(replaced.length, 1);
    assert.equal(replaced[0]?.prompt, "جديد");
    assert.equal(db.test_questions.length, 1);
    assert.equal(db.test_options.length, 2);
  });
});
