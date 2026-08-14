import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertSubmissionAutoGradable,
  gradeAnswer,
  gradeAnswers,
  isAnswerCorrect,
  normalizeQuestionPoints,
  type GradableQuestion,
} from "./test-grading.logic.ts";

const mcq = (overrides?: Partial<GradableQuestion>): GradableQuestion => ({
  id: "q-mcq",
  type: "multiple_choice",
  points: 2,
  options: [
    { id: "opt-a", isCorrect: true, label: "أ" },
    { id: "opt-b", isCorrect: false, label: "ب" },
  ],
  ...overrides,
});

const tf = (correctBoolean: boolean, points = 1): GradableQuestion => ({
  id: "q-tf",
  type: "true_false",
  points,
  options: [
    { id: "opt-true", isCorrect: correctBoolean === true, label: "صواب" },
    { id: "opt-false", isCorrect: correctBoolean === false, label: "خطأ" },
  ],
});

describe("TASK 22.5 test-grading.logic", () => {
  it("1. awards full points for correct multiple-choice selection", () => {
    const question = mcq();
    const result = gradeAnswer(question, {
      questionId: question.id,
      selectedOptionId: "opt-a",
      booleanAnswer: null,
    });
    assert.equal(result.isCorrect, true);
    assert.equal(result.pointsAwarded, 2);
  });

  it("2. awards zero for incorrect or unanswered multiple-choice", () => {
    const question = mcq();
    const wrong = gradeAnswer(question, {
      questionId: question.id,
      selectedOptionId: "opt-b",
      booleanAnswer: null,
    });
    assert.equal(wrong.isCorrect, false);
    assert.equal(wrong.pointsAwarded, 0);

    const blank = gradeAnswer(question, {
      questionId: question.id,
      selectedOptionId: null,
      booleanAnswer: null,
    });
    assert.equal(blank.isCorrect, false);
    assert.equal(blank.pointsAwarded, 0);
    assert.equal(isAnswerCorrect(question, null), false);
  });

  it("3. grades true/false via selected option or booleanAnswer", () => {
    const question = tf(true, 3);
    const viaOption = gradeAnswer(question, {
      questionId: question.id,
      selectedOptionId: "opt-true",
      booleanAnswer: null,
    });
    assert.equal(viaOption.isCorrect, true);
    assert.equal(viaOption.pointsAwarded, 3);

    const viaBoolean = gradeAnswer(question, {
      questionId: question.id,
      selectedOptionId: null,
      booleanAnswer: true,
    });
    assert.equal(viaBoolean.isCorrect, true);

    const wrongBoolean = gradeAnswer(question, {
      questionId: question.id,
      selectedOptionId: null,
      booleanAnswer: false,
    });
    assert.equal(wrongBoolean.isCorrect, false);
    assert.equal(wrongBoolean.pointsAwarded, 0);
  });

  it("4. aggregates score and maxScore across questions", () => {
    const questions = [mcq({ id: "q1", points: 2 }), tf(false, 5)];
    const result = gradeAnswers(questions, [
      { questionId: "q1", selectedOptionId: "opt-a", booleanAnswer: null },
      { questionId: "q-tf", selectedOptionId: null, booleanAnswer: false },
    ]);
    assert.equal(result.score, 7);
    assert.equal(result.maxScore, 7);
    assert.equal(result.answers.length, 2);
  });

  it("5. treats missing answers as incorrect without changing maxScore", () => {
    const questions = [mcq({ id: "q1", points: 4 }), tf(true, 1)];
    const result = gradeAnswers(questions, [
      { questionId: "q1", selectedOptionId: "opt-b", booleanAnswer: null },
    ]);
    assert.equal(result.score, 0);
    assert.equal(result.maxScore, 5);
    assert.equal(result.answers[1]?.isCorrect, false);
  });

  it("6. validates points and auto-gradable submission statuses", () => {
    assert.equal(normalizeQuestionPoints("3"), 3);
    assert.throws(() => normalizeQuestionPoints(-1), /درجة السؤال/);
    assert.throws(() => normalizeQuestionPoints(Number.NaN), /درجة السؤال/);

    assert.doesNotThrow(() => assertSubmissionAutoGradable("submitted"));
    assert.doesNotThrow(() => assertSubmissionAutoGradable("graded"));
    assert.throws(() => assertSubmissionAutoGradable("pending"), /لم يُسلَّم/);
  });
});
