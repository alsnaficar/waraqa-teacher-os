import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import type { Student } from "@/features/homework/services/student.service";

import type { TestSubmission } from "./test-submission.service.ts";
import { assertNoClientTeacherId } from "./tests-ui.logic.ts";
import {
  canAssignTestSubmissions,
  canViewTestSubmissions,
  filterAssignableStudents,
  studentsWithoutTestSubmission,
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

describe("TASK 22.4 tests submissions UI logic", () => {
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

  it("5. list view maps student + status without score/feedback fields", () => {
    const view = toTestSubmissionListItemView(submission, studentA);
    assert.equal(view.studentName, "أحمد علي");
    assert.equal(view.studentCodeLabel, "A-01");
    assert.equal(view.statusLabel, "لم يبدأ");
    assert.equal(view.submittedAtLabel, "—");
    assert.equal("scoreLabel" in view, false);
    assert.equal("feedbackLabel" in view, false);
    assertNoClientTeacherId(view);
  });

  it("6. empty copy + source contract", () => {
    assert.match(TEST_SUBMISSIONS_EMPTY_TITLE, /لا توجد تسليمات/);

    const here = path.dirname(fileURLToPath(import.meta.url));
    const files = [
      path.join(here, "tests-submissions-ui.logic.ts"),
      path.join(here, "../hooks/useTestSubmissions.ts"),
      path.join(here, "../components/test-submissions-panel.tsx"),
      path.join(here, "../components/tests-page-content.tsx"),
    ];

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      assert.equal(
        /\bteacherId\s*[:=]|\bteacher_id\s*[:=]/.test(source),
        false,
        `${path.basename(file)} must not set/pass teacher_id`,
      );
      assert.equal(
        /from\(["']test_submissions["']\)|from\(["']students["']\)/.test(source),
        false,
        `${path.basename(file)} must not write tables directly`,
      );
      assert.equal(
        /HomeworkGradeDialog|grade\.mutate|score editing|onGrade/.test(source),
        false,
        `${path.basename(file)} must not expose grading UI`,
      );
    }

    const hook = readFileSync(path.join(here, "../hooks/useTestSubmissions.ts"), "utf8");
    assert.match(hook, /TestSubmissionService\.assignPending/);
    assert.equal(/TestSubmissionService\.create\(/.test(hook), false);

    const panel = readFileSync(
      path.join(here, "../components/test-submissions-panel.tsx"),
      "utf8",
    );
    assert.match(panel, /إسناد للطلاب/);
    assert.equal(/الدرجة|الملاحظات|تصحيح/.test(panel), false);
  });
});
