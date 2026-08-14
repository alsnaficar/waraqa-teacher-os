import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import type { Student } from "@/features/homework/services/student.service";

import type { TestSubmission } from "./test-submission.service.ts";
import { assertNoClientTeacherId } from "./tests-ui.logic.ts";
import {
  answerEntryActionLabel,
  autoGradeActionLabel,
  canAssignTestSubmissions,
  canAutoGradeTestSubmission,
  canEditTestFeedback,
  canEnterTestAnswers,
  canViewTestSubmissions,
  draftToUpsertInputs,
  filterAssignableStudents,
  formatTestScoreLabel,
  isTestAnswerEntryReadOnly,
  setMcqDraft,
  setTrueFalseDraft,
  studentsWithoutTestSubmission,
  TEST_FEEDBACK_ACTION_LABEL,
  TEST_SUBMISSION_STATUS_LABELS,
  TEST_SUBMISSIONS_EMPTY_TITLE,
  toggleStudentSelection,
  toTestSubmissionListItemView,
} from "./tests-submissions-ui.logic.ts";

const studentA: Student = {
  id: "s1",
  teacherId: "t1",
  fullName: "أحمد علي",
  classId: "c1",
  gradeId: "g1",
  studentCode: "A-01",
  active: true,
  createdAt: "2026-08-14T00:00:00Z",
  updatedAt: "2026-08-14T00:00:00Z",
};

const studentB: Student = {
  ...studentA,
  id: "s2",
  fullName: "سارة",
  classId: "c2",
  studentCode: "B-02",
};

const inactive: Student = {
  ...studentA,
  id: "s3",
  fullName: "موقوف",
  active: false,
};

const submission: TestSubmission = {
  id: "sub-1",
  teacherId: "t1",
  testId: "test-1",
  studentId: "s1",
  status: "pending",
  score: null,
  maxScore: null,
  feedback: null,
  submittedAt: null,
  gradedAt: null,
  createdAt: "2026-08-14T00:00:00Z",
  updatedAt: "2026-08-14T00:00:00Z",
};

const gradedSubmission: TestSubmission = {
  ...submission,
  id: "sub-2",
  status: "graded",
  score: 8,
  maxScore: 10,
  feedback: "ممتاز",
  submittedAt: "2026-08-14T10:00:00Z",
  gradedAt: "2026-08-14T12:00:00Z",
};

describe("TASK 22.4/22.6/22.7 tests submissions UI logic", () => {
  it("1. Arabic status labels", () => {
    assert.equal(TEST_SUBMISSION_STATUS_LABELS.pending, "لم يبدأ");
    assert.equal(TEST_SUBMISSION_STATUS_LABELS.submitted, "مُسلّم");
    assert.equal(TEST_SUBMISSION_STATUS_LABELS.graded, "مُصحّح");
  });

  it("2. search and class filter; inactive excluded", () => {
    const pool = [studentA, studentB, inactive];
    assert.equal(filterAssignableStudents(pool, { search: "أحمد" }).length, 1);
    assert.equal(filterAssignableStudents(pool, { search: "B-02" }).length, 1);
    assert.equal(filterAssignableStudents(pool, { classId: "c2" }).length, 1);
    assert.equal(
      filterAssignableStudents(pool, {}).every((s) => s.active),
      true,
    );
    assert.equal(filterAssignableStudents(pool, {}).some((s) => s.id === "s3"), false);
  });

  it("3. assigned students excluded; selection toggle", () => {
    const available = studentsWithoutTestSubmission(
      [studentA, studentB, inactive],
      [{ studentId: "s1" }],
    );
    assert.deepEqual(
      available.map((s) => s.id),
      ["s2"],
    );

    const filtered = filterAssignableStudents([studentA, studentB], {
      submissions: [{ studentId: "s1" }],
    });
    assert.deepEqual(
      filtered.map((s) => s.id),
      ["s2"],
    );

    assert.deepEqual(toggleStudentSelection([], "s2"), ["s2"]);
    assert.deepEqual(toggleStudentSelection(["s2"], "s2"), []);
  });

  it("4. action gating by test status", () => {
    assert.equal(canAssignTestSubmissions("draft"), false);
    assert.equal(canAssignTestSubmissions("published"), true);
    assert.equal(canAssignTestSubmissions("closed"), false);
    assert.equal(canViewTestSubmissions("draft"), false);
    assert.equal(canViewTestSubmissions("published"), true);
    assert.equal(canViewTestSubmissions("closed"), true);
  });

  it("5. list view maps student + status + score/feedback + answer entry", () => {
    const view = toTestSubmissionListItemView(submission, studentA, "published");
    assert.equal(view.studentName, "أحمد علي");
    assert.equal(view.studentCodeLabel, "A-01");
    assert.equal(view.statusLabel, "لم يبدأ");
    assert.equal(view.submittedAtLabel, "—");
    assert.equal(view.gradedAtLabel, "—");
    assert.equal(view.scoreLabel, "—");
    assert.equal(view.feedbackLabel, "—");
    assert.equal(view.canAutoGrade, false);
    assert.equal(view.canEnterAnswers, true);
    assert.equal(view.answerEntryActionLabel, "تسجيل الإجابات");
    assert.equal(view.canEditFeedback, false);
    assert.equal(view.feedbackActionLabel, TEST_FEEDBACK_ACTION_LABEL);
    assertNoClientTeacherId(view);

    const graded = toTestSubmissionListItemView(gradedSubmission, studentA, "published");
    assert.equal(graded.scoreLabel, "8/10");
    assert.equal(graded.feedbackLabel, "ممتاز");
    assert.equal(graded.canAutoGrade, true);
    assert.equal(graded.canEnterAnswers, false);
    assert.equal(graded.canEditFeedback, true);
    assert.equal(graded.feedbackActionLabel, "ملاحظات المعلم");
    assert.equal(graded.autoGradeActionLabel, "إعادة التصحيح التلقائي");
    assert.notEqual(graded.gradedAtLabel, "—");
  });

  it("6. auto-grade / answer-entry / feedback gates and draft helpers", () => {
    assert.equal(canAutoGradeTestSubmission("pending"), false);
    assert.equal(canAutoGradeTestSubmission("submitted"), true);
    assert.equal(canAutoGradeTestSubmission("graded"), true);
    assert.equal(autoGradeActionLabel("submitted"), "تصحيح تلقائي");
    assert.equal(autoGradeActionLabel("graded"), "إعادة التصحيح التلقائي");
    assert.equal(formatTestScoreLabel(null), "—");
    assert.equal(formatTestScoreLabel(7, 10), "7/10");
    assert.equal(formatTestScoreLabel(7), "7");

    assert.equal(canEnterTestAnswers("pending", "published"), true);
    assert.equal(canEnterTestAnswers("pending", "closed"), false);
    assert.equal(canEnterTestAnswers("submitted", "published"), false);
    assert.equal(canEnterTestAnswers("graded", "published"), false);
    assert.equal(isTestAnswerEntryReadOnly("pending"), false);
    assert.equal(isTestAnswerEntryReadOnly("submitted"), true);
    assert.equal(isTestAnswerEntryReadOnly("graded"), true);
    assert.equal(answerEntryActionLabel("pending"), "تسجيل الإجابات");

    assert.equal(canEditTestFeedback("pending"), false);
    assert.equal(canEditTestFeedback("submitted"), false);
    assert.equal(canEditTestFeedback("graded"), true);
    assert.equal(TEST_FEEDBACK_ACTION_LABEL, "ملاحظات المعلم");

    const questions = [
      {
        id: "q1",
        testId: "t1",
        position: 0,
        type: "multiple_choice" as const,
        prompt: "MCQ",
        points: 1,
        createdAt: "",
        updatedAt: "",
        options: [],
      },
      {
        id: "q2",
        testId: "t1",
        position: 1,
        type: "true_false" as const,
        prompt: "TF",
        points: 1,
        createdAt: "",
        updatedAt: "",
        options: [],
      },
    ];
    let draft = {};
    draft = setMcqDraft(draft, "q1", "opt-1");
    draft = setTrueFalseDraft(draft, "q2", true);
    const inputs = draftToUpsertInputs("sub-1", questions, draft);
    assert.equal(inputs.length, 2);
    assert.equal(inputs[0]?.selectedOptionId, "opt-1");
    assert.equal(inputs[1]?.booleanAnswer, true);
  });

  it("7. empty copy + source contract (22.7/22.9)", () => {
    assert.match(TEST_SUBMISSIONS_EMPTY_TITLE, /لا توجد تسليمات/);

    const here = path.dirname(fileURLToPath(import.meta.url));
    const files = [
      path.join(here, "tests-submissions-ui.logic.ts"),
      path.join(here, "../hooks/useTestSubmissions.ts"),
      path.join(here, "../components/test-submissions-panel.tsx"),
      path.join(here, "../components/tests-page-content.tsx"),
      path.join(here, "../components/test-answer-entry-dialog.tsx"),
      path.join(here, "../components/test-feedback-dialog.tsx"),
    ];

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      assert.equal(
        /\bteacherId\s*[:=]|\bteacher_id\s*[:=]/.test(source),
        false,
        `${path.basename(file)} must not set/pass teacher_id`,
      );
      assert.equal(
        /from\(["']test_submissions["']\)|from\(["']students["']\)|from\(["']test_answers["']\)/.test(
          source,
        ),
        false,
        `${path.basename(file)} must not write tables directly`,
      );
      assert.equal(
        /HomeworkGradeDialog|score editing|onGrade/.test(source),
        false,
        `${path.basename(file)} must not expose homework-style manual grade dialog`,
      );
    }

    const hook = readFileSync(path.join(here, "../hooks/useTestSubmissions.ts"), "utf8");
    assert.match(hook, /TestSubmissionService\.assignPending/);
    assert.match(hook, /TestSubmissionService\.markSubmitted/);
    assert.match(hook, /TestSubmissionService\.setFeedback/);
    assert.match(hook, /TestAnswerService\.upsertAnswer/);
    assert.match(hook, /TestGradingService\.gradeSubmission/);
    assert.equal(/TestSubmissionService\.create\(/.test(hook), false);

    const panel = readFileSync(
      path.join(here, "../components/test-submissions-panel.tsx"),
      "utf8",
    );
    assert.match(panel, /إسناد للطلاب/);
    assert.match(panel, /TestAnswerEntryDialog/);
    assert.match(panel, /TestFeedbackDialog/);
    assert.match(panel, /canEditFeedback|feedbackActionLabel/);
    assert.match(panel, /الدرجة/);

    const dialog = readFileSync(
      path.join(here, "../components/test-answer-entry-dialog.tsx"),
      "utf8",
    );
    assert.match(dialog, /تسليم وتصحيح تلقائي/);
    assert.match(dialog, /تعليم كمُسلّم/);

    const feedbackDialog = readFileSync(
      path.join(here, "../components/test-feedback-dialog.tsx"),
      "utf8",
    );
    assert.match(feedbackDialog, /ملاحظات المعلم/);
    assert.match(feedbackDialog, /حفظ الملاحظة/);
    assert.equal(/type=["']number["']|maxScore|الدرجة الكاملة/.test(feedbackDialog), false);
  });
});
