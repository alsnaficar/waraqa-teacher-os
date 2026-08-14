import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { TestAnswerService } from "./test-answer.service.ts";
import { TestQuestionService } from "./test-question.service.ts";
import { TestService } from "./test.service.ts";
import { TestSubmissionService } from "./test-submission.service.ts";
import {
  STUDENT_A,
  TEACHER_A,
  TEACHER_B,
  authFor,
  createEmptyTestsDb,
} from "./tests-mock.ts";

async function seedAnswerContext() {
  const db = createEmptyTestsDb();
  const test = await TestService.create({ title: "اختبار الإجابات" }, authFor(db));
  assert.ok(test, "test create");
  const published = await TestService.publish(test.id, authFor(db));
  assert.ok(published, "publish");

  const question = await TestQuestionService.create(
    {
      testId: test.id,
      type: "multiple_choice",
      prompt: "اختر",
      position: 0,
      options: [
        { label: "أ", isCorrect: true },
        { label: "ب", isCorrect: false },
      ],
    },
    authFor(db),
  );
  assert.ok(question, "question create");

  db.students.push({ id: STUDENT_A, teacher_id: TEACHER_A, full_name: "أحمد", active: true });

  const submission = await TestSubmissionService.create(
    { testId: test.id, studentId: STUDENT_A },
    authFor(db),
  );
  assert.ok(submission, "submission create");

  // Second test/question for foreign relationship checks.
  const otherTest = await TestService.create({ title: "اختبار آخر" }, authFor(db));
  assert.ok(otherTest, "other test");
  await TestService.publish(otherTest.id, authFor(db));
  const foreignQuestion = await TestQuestionService.create(
    {
      testId: otherTest.id,
      type: "true_false",
      prompt: "أجنبي",
      position: 0,
      correctBoolean: true,
    },
    authFor(db),
  );
  assert.ok(foreignQuestion, "foreign question");

  return { db, test, question, foreignQuestion, submission };
}

describe("TASK 22.2 TestAnswerService", () => {
  it("upserts answer for owned submission + matching question/option", async () => {
    const { db, question, submission } = await seedAnswerContext();
    const correct = question.options.find((o) => o.isCorrect);
    assert.ok(correct);

    const answer = await TestAnswerService.upsertAnswer(
      {
        submissionId: submission.id,
        questionId: question.id,
        selectedOptionId: correct.id,
      },
      authFor(db),
    );

    assert.ok(answer);
    assert.equal(answer.selectedOptionId, correct.id);
    assert.equal(answer.isCorrect, null);

    const listed = await TestAnswerService.listBySubmission(submission.id, authFor(db));
    assert.equal(listed.length, 1);
  });

  it("rejects question from another test", async () => {
    const { db, submission, foreignQuestion } = await seedAnswerContext();
    await assert.rejects(
      () =>
        TestAnswerService.upsertAnswer(
          {
            submissionId: submission.id,
            questionId: foreignQuestion.id,
            booleanAnswer: true,
          },
          authFor(db),
        ),
      /غير مرتبط/,
    );
  });

  it("rejects selected option from another question", async () => {
    const { db, question, foreignQuestion, submission } = await seedAnswerContext();
    const foreignOption = foreignQuestion.options[0];
    assert.ok(foreignOption);

    await assert.rejects(
      () =>
        TestAnswerService.upsertAnswer(
          {
            submissionId: submission.id,
            questionId: question.id,
            selectedOptionId: foreignOption.id,
          },
          authFor(db),
        ),
      /لا ينتمي إلى السؤال/,
    );
  });

  it("rejects foreign submission ownership", async () => {
    const { db, question, submission } = await seedAnswerContext();
    await assert.rejects(
      () =>
        TestAnswerService.upsertAnswer(
          {
            submissionId: submission.id,
            questionId: question.id,
            selectedOptionId: question.options[0]?.id,
          },
          authFor(db, TEACHER_B),
        ),
      /التسليم غير موجود/,
    );
  });

  it("updates existing answer on second upsert", async () => {
    const { db, question, submission } = await seedAnswerContext();
    const first = question.options[0];
    const second = question.options[1];
    assert.ok(first && second);

    await TestAnswerService.upsertAnswer(
      {
        submissionId: submission.id,
        questionId: question.id,
        selectedOptionId: first.id,
      },
      authFor(db),
    );

    const updated = await TestAnswerService.upsertAnswer(
      {
        submissionId: submission.id,
        questionId: question.id,
        selectedOptionId: second.id,
      },
      authFor(db),
    );

    assert.equal(updated?.selectedOptionId, second.id);
    assert.equal(db.test_answers.length, 1);
  });

  it("TASK 22.7 saves true/false answer", async () => {
    const { db, test, submission } = await seedAnswerContext();
    const tf = await TestQuestionService.create(
      {
        testId: test.id,
        type: "true_false",
        prompt: "صواب؟",
        position: 1,
        correctBoolean: false,
      },
      authFor(db),
    );
    assert.ok(tf);

    const answer = await TestAnswerService.upsertAnswer(
      {
        submissionId: submission.id,
        questionId: tf.id,
        booleanAnswer: false,
      },
      authFor(db),
    );
    assert.ok(answer);
    assert.equal(answer.booleanAnswer, false);
  });

  it("TASK 22.7 rejects upsert when submission is submitted", async () => {
    const { db, question, submission } = await seedAnswerContext();
    await TestSubmissionService.markSubmitted(submission.id, authFor(db));
    const correct = question.options.find((o) => o.isCorrect);
    assert.ok(correct);
    await assert.rejects(
      () =>
        TestAnswerService.upsertAnswer(
          {
            submissionId: submission.id,
            questionId: question.id,
            selectedOptionId: correct.id,
          },
          authFor(db),
        ),
      /لم يبدأ/,
    );
  });
});
