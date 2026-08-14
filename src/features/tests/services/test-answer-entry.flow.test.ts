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
  authFor,
  createEmptyTestsDb,
} from "./tests-mock.ts";

describe("TASK 22.7 answer entry → submit → grade flow", () => {
  it("17-22. pending → answers → submitted → graded with score", async () => {
    const db = createEmptyTestsDb();
    const test = await TestService.create({ title: "تدفق التسليم" }, authFor(db));
    assert.ok(test);
    await TestService.publish(test.id, authFor(db));

    const mcq = await TestQuestionService.create(
      {
        testId: test.id,
        type: "multiple_choice",
        prompt: "اختر",
        position: 0,
        points: 4,
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
        prompt: "صواب؟",
        position: 1,
        points: 6,
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

    const pending = await TestSubmissionService.assignPending(
      test.id,
      STUDENT_A,
      authFor(db),
    );
    assert.ok(pending);
    assert.equal(pending.status, "pending");

    const correct = mcq.options.find((o) => o.isCorrect);
    assert.ok(correct);
    await TestAnswerService.upsertAnswer(
      {
        submissionId: pending.id,
        questionId: mcq.id,
        selectedOptionId: correct.id,
      },
      authFor(db),
    );
    await TestAnswerService.upsertAnswer(
      {
        submissionId: pending.id,
        questionId: tf.id,
        booleanAnswer: true,
      },
      authFor(db),
    );

    const submitted = await TestSubmissionService.markSubmitted(pending.id, authFor(db));
    assert.ok(submitted);
    assert.equal(submitted.status, "submitted");
    assert.ok(submitted.submittedAt);
    assert.equal(submitted.score, null);

    const graded = await TestGradingService.gradeSubmission(pending.id, authFor(db));
    assert.ok(graded);
    assert.equal(graded.submission.status, "graded");
    assert.equal(graded.submission.score, 10);
    assert.equal(graded.submission.maxScore, 10);
  });
});
