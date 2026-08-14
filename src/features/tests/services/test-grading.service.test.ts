import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { TestAnswerService } from "./test-answer.service.ts";
import { TestGradingService } from "./test-grading.service.ts";
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

async function seedPendingGradable() {
  const db = createEmptyTestsDb();
  const test = await TestService.create({ title: "اختبار التصحيح" }, authFor(db));
  assert.ok(test);
  await TestService.publish(test.id, authFor(db));

  const mcq = await TestQuestionService.create(
    {
      testId: test.id,
      type: "multiple_choice",
      prompt: "اختر الصحيح",
      position: 0,
      points: 2,
      options: [
        { label: "أ", isCorrect: true },
        { label: "ب", isCorrect: false },
      ],
    },
    authFor(db),
  );
  assert.ok(mcq);

  const tf = await TestQuestionService.create(
    {
      testId: test.id,
      type: "true_false",
      prompt: "صواب أم خطأ",
      position: 1,
      points: 3,
      correctBoolean: true,
    },
    authFor(db),
  );
  assert.ok(tf);

  db.students.push({
    id: STUDENT_A,
    teacher_id: TEACHER_A,
    full_name: "أحمد",
    active: true,
  });

  const submission = await TestSubmissionService.create(
    {
      testId: test.id,
      studentId: STUDENT_A,
      status: "pending",
    },
    authFor(db),
  );
  assert.ok(submission);

  return { db, test, mcq, tf, submission };
}

async function saveAnswersAndSubmit(
  db: ReturnType<typeof createEmptyTestsDb>,
  submissionId: string,
  answers: Array<{
    questionId: string;
    selectedOptionId?: string | null;
    booleanAnswer?: boolean | null;
  }>,
) {
  for (const answer of answers) {
    await TestAnswerService.upsertAnswer(
      {
        submissionId,
        questionId: answer.questionId,
        selectedOptionId: answer.selectedOptionId,
        booleanAnswer: answer.booleanAnswer,
      },
      authFor(db),
    );
  }
  const submitted = await TestSubmissionService.markSubmitted(submissionId, authFor(db));
  assert.ok(submitted);
  assert.equal(submitted.status, "submitted");
  return submitted;
}

describe("TASK 22.5 TestGradingService", () => {
  it("1. auto-grades a submitted submission with score and maxScore", async () => {
    const { db, mcq, tf, submission } = await seedPendingGradable();
    const correct = mcq.options.find((o) => o.isCorrect);
    assert.ok(correct);

    await saveAnswersAndSubmit(db, submission.id, [
      { questionId: mcq.id, selectedOptionId: correct.id },
      { questionId: tf.id, booleanAnswer: true },
    ]);

    const result = await TestGradingService.gradeSubmission(submission.id, authFor(db));
    assert.ok(result);
    assert.equal(result.submission.status, "graded");
    assert.equal(result.submission.score, 5);
    assert.equal(result.submission.maxScore, 5);
    assert.ok(result.submission.gradedAt);
    assert.equal(result.grading.score, 5);
  });

  it("2. rejects pending submissions", async () => {
    const { db, submission } = await seedPendingGradable();

    await assert.rejects(
      () => TestGradingService.gradeSubmission(submission.id, authFor(db)),
      /لم يُسلَّم/,
    );
  });

  it("3. rejects foreign teacher ownership", async () => {
    const { db, mcq, submission } = await seedPendingGradable();
    const correct = mcq.options.find((o) => o.isCorrect);
    assert.ok(correct);
    await saveAnswersAndSubmit(db, submission.id, [
      { questionId: mcq.id, selectedOptionId: correct.id },
    ]);

    await assert.rejects(
      () => TestGradingService.gradeSubmission(submission.id, authFor(db, TEACHER_B)),
      /التسليم غير موجود/,
    );
  });

  it("4. writes is_correct and points_awarded on each answer", async () => {
    const { db, mcq, tf, submission } = await seedPendingGradable();
    const wrong = mcq.options.find((o) => !o.isCorrect);
    assert.ok(wrong);

    await saveAnswersAndSubmit(db, submission.id, [
      { questionId: mcq.id, selectedOptionId: wrong.id },
      { questionId: tf.id, booleanAnswer: true },
    ]);

    const result = await TestGradingService.gradeSubmission(submission.id, authFor(db));
    assert.ok(result);

    const mcqAnswer = result.answers.find((a) => a.questionId === mcq.id);
    const tfAnswer = result.answers.find((a) => a.questionId === tf.id);
    assert.ok(mcqAnswer && tfAnswer);
    assert.equal(mcqAnswer.isCorrect, false);
    assert.equal(mcqAnswer.pointsAwarded, 0);
    assert.equal(tfAnswer.isCorrect, true);
    assert.equal(tfAnswer.pointsAwarded, 3);
    assert.equal(result.submission.score, 3);
  });

  it("5. treats unanswered questions as zero and still grades", async () => {
    const { db, mcq, submission } = await seedPendingGradable();
    const correct = mcq.options.find((o) => o.isCorrect);
    assert.ok(correct);

    await saveAnswersAndSubmit(db, submission.id, [
      { questionId: mcq.id, selectedOptionId: correct.id },
    ]);

    const result = await TestGradingService.gradeSubmission(submission.id, authFor(db));
    assert.ok(result);
    assert.equal(result.submission.score, 2);
    assert.equal(result.submission.maxScore, 5);
    assert.equal(result.answers.length, 2);
    const blank = result.answers.find((a) => a.questionId !== mcq.id);
    assert.ok(blank);
    assert.equal(blank.isCorrect, false);
    assert.equal(blank.pointsAwarded, 0);
  });

  it("6. allows re-grading an already graded submission (answers read-only)", async () => {
    const { db, mcq, tf, submission } = await seedPendingGradable();
    const correct = mcq.options.find((o) => o.isCorrect);
    assert.ok(correct);

    await saveAnswersAndSubmit(db, submission.id, [
      { questionId: mcq.id, selectedOptionId: correct.id },
      { questionId: tf.id, booleanAnswer: true },
    ]);

    const first = await TestGradingService.gradeSubmission(submission.id, authFor(db));
    assert.ok(first);
    assert.equal(first.submission.score, 5);

    await assert.rejects(
      () =>
        TestAnswerService.upsertAnswer(
          {
            submissionId: submission.id,
            questionId: mcq.id,
            selectedOptionId: correct.id,
          },
          authFor(db),
        ),
      /لم يبدأ/,
    );

    const second = await TestGradingService.gradeSubmission(submission.id, authFor(db));
    assert.ok(second);
    assert.equal(second.submission.status, "graded");
    assert.equal(second.submission.score, 5);
    assert.equal(second.submission.maxScore, 5);
  });
});
