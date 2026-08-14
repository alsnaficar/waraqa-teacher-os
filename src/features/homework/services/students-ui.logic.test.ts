import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import type { HomeworkSubmission } from "./homework-submission.service.ts";
import type { Student } from "./student.service.ts";
import {
  assertNoClientTeacherId,
  emptyStudentForm,
  filterStudents,
  formStateToStudentInput,
  STUDENTS_EMPTY_TITLE,
  SUBMISSION_STATUS_LABELS,
  SUBMISSIONS_EMPTY_TITLE,
  studentToFormState,
  studentsWithoutSubmission,
  toStudentListItemView,
  toSubmissionListItemView,
} from "./students-ui.logic.ts";

const sampleStudent: Student = {
  id: "stu-1",
  teacherId: "11111111-1111-4111-8111-111111111111",
  fullName: "أحمد محمد",
  classId: "class-a",
  gradeId: "grade-1",
  studentCode: "S-01",
  active: true,
  createdAt: "2026-08-14T00:00:00Z",
  updatedAt: "2026-08-14T00:00:00Z",
};

const inactiveStudent: Student = {
  ...sampleStudent,
  id: "stu-2",
  fullName: "سارة علي",
  classId: "class-b",
  studentCode: "S-02",
  active: false,
};

const sampleSubmission: HomeworkSubmission = {
  id: "sub-1",
  teacherId: "11111111-1111-4111-8111-111111111111",
  homeworkId: "hw-1",
  studentId: "stu-1",
  status: "submitted",
  score: 8,
  feedback: "جيد",
  submittedAt: "2026-08-14T12:00:00Z",
  gradedAt: null,
  createdAt: "2026-08-14T00:00:00Z",
  updatedAt: "2026-08-14T00:00:00Z",
};

describe("TASK 20.6 students + submissions UI logic", () => {
  it("1. student list maps roster fields", () => {
    const view = toStudentListItemView(sampleStudent, {
      classNameById: new Map([["class-a", "1/أ"]]),
      gradeNameById: new Map([["grade-1", "أول متوسط"]]),
    });
    assert.equal(view.fullName, "أحمد محمد");
    assert.equal(view.studentCodeLabel, "S-01");
    assert.equal(view.classLabel, "1/أ");
    assert.equal(view.gradeLabel, "أول متوسط");
    assert.equal(view.activeLabel, "نشط");
  });

  it("2. student search filters by name and code", () => {
    const rows = [sampleStudent, inactiveStudent];
    assert.equal(filterStudents(rows, { search: "أحمد" }).length, 1);
    assert.equal(filterStudents(rows, { search: "s-02" }).length, 1);
    assert.equal(filterStudents(rows, { search: "غير موجود" }).length, 0);
  });

  it("3. student creation payload omits teacher_id", () => {
    const input = formStateToStudentInput(
      emptyStudentForm({
        fullName: "طالب جديد",
        classId: "class-a",
        gradeId: "grade-1",
        studentCode: "S-99",
        active: true,
      }),
    );
    assert.deepEqual(input, {
      fullName: "طالب جديد",
      classId: "class-a",
      gradeId: "grade-1",
      studentCode: "S-99",
      active: true,
    });
    assertNoClientTeacherId(input);
  });

  it("4. student edit hydrates form state", () => {
    const form = studentToFormState(sampleStudent);
    assert.equal(form.fullName, "أحمد محمد");
    assert.equal(form.classId, "class-a");
    assert.equal(form.studentCode, "S-01");
    assert.equal(form.active, true);
  });

  it("5. active/inactive filter", () => {
    const rows = [sampleStudent, inactiveStudent];
    assert.equal(filterStudents(rows, { active: "active" }).length, 1);
    assert.equal(filterStudents(rows, { active: "inactive" })[0]?.id, "stu-2");
    assert.equal(filterStudents(rows, { active: "all" }).length, 2);
  });

  it("6. class filtering", () => {
    const rows = [sampleStudent, inactiveStudent];
    assert.equal(filterStudents(rows, { classId: "class-a" }).length, 1);
    assert.equal(filterStudents(rows, { classId: "all" }).length, 2);
  });

  it("7. homework submission list view joins student", () => {
    const view = toSubmissionListItemView(sampleSubmission, sampleStudent);
    assert.equal(view.studentName, "أحمد محمد");
    assert.equal(view.studentCodeLabel, "S-01");
    assert.equal(view.scoreLabel, "8");
    assert.equal(view.feedbackLabel, "جيد");
    assert.notEqual(view.submittedAtLabel, "—");
  });

  it("8. status display labels", () => {
    assert.equal(SUBMISSION_STATUS_LABELS.pending, "لم يسلّم");
    assert.equal(SUBMISSION_STATUS_LABELS.submitted, "مُسلّم");
    assert.equal(SUBMISSION_STATUS_LABELS.graded, "مُصحّح");
    assert.equal(toSubmissionListItemView({ ...sampleSubmission, status: "pending" }, sampleStudent).statusLabel, "لم يسلّم");
    assert.equal(toSubmissionListItemView({ ...sampleSubmission, status: "graded" }, sampleStudent).statusLabel, "مُصحّح");
  });

  it("9. ownership/security: UI helpers reject client teacher_id", () => {
    assert.throws(() => assertNoClientTeacherId({ teacherId: "x" }));
    assert.throws(() => assertNoClientTeacherId({ teacher_id: "x" }));
    const page = readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), "../components/students-panel.tsx"),
      "utf8",
    );
    const submissionsPanel = readFileSync(
      path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "../components/homework-submissions-panel.tsx",
      ),
      "utf8",
    );
    assert.doesNotMatch(page, /teacher_id\s*[:=]/);
    assert.doesNotMatch(submissionsPanel, /teacher_id\s*[:=]/);
    assert.match(page, /useStudents/);
    assert.match(submissionsPanel, /useHomeworkSubmissions/);
  });

  it("10. empty states Arabic copy", () => {
    assert.match(STUDENTS_EMPTY_TITLE, /لا يوجد طلاب/);
    assert.match(SUBMISSIONS_EMPTY_TITLE, /لا توجد تسليمات/);
    assert.equal(
      studentsWithoutSubmission([sampleStudent, inactiveStudent], [sampleSubmission]).length,
      0,
    );
    assert.equal(
      studentsWithoutSubmission(
        [sampleStudent, { ...inactiveStudent, active: true, id: "stu-3" }],
        [sampleSubmission],
      ).length,
      1,
    );
  });
});
