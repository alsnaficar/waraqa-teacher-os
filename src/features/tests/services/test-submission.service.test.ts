import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { TestAnswerService } from "./test-answer.service.ts";
import { TestService } from "./test.service.ts";
import {
  TestSubmissionConflictError,
  TestSubmissionService,
} from "./test-submission.service.ts";
import {
  STUDENT_A,
  STUDENT_B,
  TEACHER_A,
  TEACHER_B,
  authFor,
  createEmptyTestsDb,
} from "./tests-mock.ts";

const STUDENT_INACTIVE = "ffffffff-ffff-4fff-8fff-ffffffffffff";

async function seedPublished(db = createEmptyTestsDb()) {
  const test = await TestService.create({ title: "اختبار التسليم" }, authFor(db));
  assert.ok(test);
  await TestService.publish(test.id, authFor(db));
  db.students.push({
    id: STUDENT_A,
    teacher_id: TEACHER_A,
    full_name: "أحمد",
    student_code: "s-01",
    active: true,
  });
  db.students.push({
    id: STUDENT_B,
    teacher_id: TEACHER_B,
    full_name: "سارة",
    active: true,
  });
  db.students.push({
    id: STUDENT_INACTIVE,
    teacher_id: TEACHER_A,
    full_name: "موقوف",
    active: false,
  });
  return { db, test: (await TestService.getById(test.id, authFor(db)))! };
}

describe("TASK 22.2 TestSubmissionService", () => {
  it("creates submission for published owned test + owned student", async () => {
    const { db, test } = await seedPublished();
    const submission = await TestSubmissionService.create(
      { testId: test.id, studentId: STUDENT_A },
      authFor(db),
    );
    assert.ok(submission);
    assert.equal(submission.teacherId, TEACHER_A);
    assert.equal(submission.status, "pending");
  });

  it("rejects foreign student", async () => {
    const { db, test } = await seedPublished();
    await assert.rejects(
      () =>
        TestSubmissionService.create(
          { testId: test.id, studentId: STUDENT_B },
          authFor(db),
        ),
      /الطالب غير موجود/,
    );
  });

  it("rejects foreign test", async () => {
    const { db } = await seedPublished();
    await assert.rejects(
      () =>
        TestSubmissionService.create(
          { testId: "missing", studentId: STUDENT_A },
          authFor(db),
        ),
      /الاختبار غير موجود/,
    );
  });

  it("enforces unique test/student", async () => {
    const { db, test } = await seedPublished();
    await TestSubmissionService.create(
      { testId: test.id, studentId: STUDENT_A },
      authFor(db),
    );
    await assert.rejects(
      () =>
        TestSubmissionService.create(
          { testId: test.id, studentId: STUDENT_A },
          authFor(db),
        ),
      (err: unknown) => err instanceof TestSubmissionConflictError,
    );
  });

  it("draft test rejects submission", async () => {
    const db = createEmptyTestsDb();
    const test = await TestService.create({ title: "مسودة" }, authFor(db));
    assert.ok(test);
    db.students.push({ id: STUDENT_A, teacher_id: TEACHER_A, full_name: "أحمد", active: true });

    await assert.rejects(
      () =>
        TestSubmissionService.create(
          { testId: test.id, studentId: STUDENT_A },
          authFor(db),
        ),
      /مسودة/,
    );
  });

  it("published accepts submission", async () => {
    const { db, test } = await seedPublished();
    assert.equal(test.status, "published");
    const submission = await TestSubmissionService.create(
      { testId: test.id, studentId: STUDENT_A },
      authFor(db),
    );
    assert.ok(submission);
  });

  it("closed rejects submission", async () => {
    const { db, test } = await seedPublished();
    await TestService.close(test.id, authFor(db));
    await assert.rejects(
      () =>
        TestSubmissionService.create(
          { testId: test.id, studentId: STUDENT_A },
          authFor(db),
        ),
      /مغلق/,
    );
  });

  it("lists only owned submissions for a test", async () => {
    const { db, test } = await seedPublished();
    await TestSubmissionService.create(
      { testId: test.id, studentId: STUDENT_A },
      authFor(db),
    );

    const list = await TestSubmissionService.listByTest(test.id, authFor(db));
    assert.equal(list.length, 1);

    await assert.rejects(
      () => TestSubmissionService.listByTest(test.id, authFor(db, TEACHER_B)),
      /الاختبار غير موجود/,
    );
  });
});

describe("TASK 22.4 TestSubmissionService.assignPending", () => {
  it("1. published + active → pending submission", async () => {
    const { db, test } = await seedPublished();
    const submission = await TestSubmissionService.assignPending(
      test.id,
      STUDENT_A,
      authFor(db),
    );
    assert.ok(submission);
    assert.equal(submission.status, "pending");
    assert.equal(submission.teacherId, TEACHER_A);
    assert.equal(submission.testId, test.id);
    assert.equal(submission.studentId, STUDENT_A);
    assert.equal(submission.score, null);
    assert.equal(submission.feedback, null);
  });

  it("2. draft rejects assignment", async () => {
    const db = createEmptyTestsDb();
    const test = await TestService.create({ title: "مسودة" }, authFor(db));
    assert.ok(test);
    db.students.push({ id: STUDENT_A, teacher_id: TEACHER_A, full_name: "أحمد", active: true });
    await assert.rejects(
      () => TestSubmissionService.assignPending(test.id, STUDENT_A, authFor(db)),
      /مسودة/,
    );
  });

  it("3. closed rejects assignment", async () => {
    const { db, test } = await seedPublished();
    await TestService.close(test.id, authFor(db));
    await assert.rejects(
      () => TestSubmissionService.assignPending(test.id, STUDENT_A, authFor(db)),
      /مغلق/,
    );
  });

  it("4. inactive student rejected", async () => {
    const { db, test } = await seedPublished();
    await assert.rejects(
      () => TestSubmissionService.assignPending(test.id, STUDENT_INACTIVE, authFor(db)),
      /غير نشط/,
    );
  });

  it("5. duplicate → conflict", async () => {
    const { db, test } = await seedPublished();
    await TestSubmissionService.assignPending(test.id, STUDENT_A, authFor(db));
    await assert.rejects(
      () => TestSubmissionService.assignPending(test.id, STUDENT_A, authFor(db)),
      (err: unknown) => err instanceof TestSubmissionConflictError,
    );
  });

  it("6/7. foreign test and student rejected", async () => {
    const { db, test } = await seedPublished();
    await assert.rejects(
      () => TestSubmissionService.assignPending("missing", STUDENT_A, authFor(db)),
      /الاختبار غير موجود/,
    );
    await assert.rejects(
      () => TestSubmissionService.assignPending(test.id, STUDENT_B, authFor(db)),
      /الطالب غير موجود/,
    );
  });

  it("8/9/10. teacher_id and grading fields not client-controlled; status pending", async () => {
    const { db, test } = await seedPublished();
    const source = await import("node:fs").then((fs) =>
      fs.readFileSync(new URL("./test-submission.service.ts", import.meta.url), "utf8"),
    );
    const method = source.slice(
      source.indexOf("static async assignPending"),
      source.indexOf("static async create"),
    );
    assert.match(method, /static async assignPending/);
    assert.equal(/\bteacherId\b|\bteacher_id\b/.test(method), false);
    assert.equal(/\bscore\b|\bfeedback\b|\bmaxScore\b|\bmax_score\b/.test(method), false);
    assert.match(method, /status:\s*"pending"/);

    const submission = await TestSubmissionService.assignPending(
      test.id,
      STUDENT_A,
      authFor(db),
    );
    assert.ok(submission);
    assert.equal(submission.status, "pending");
    assert.equal(submission.score, null);
    assert.equal(submission.maxScore, null);
    assert.equal(submission.feedback, null);
    assert.equal(submission.submittedAt, null);
    assert.equal(submission.gradedAt, null);
    assert.equal(submission.teacherId, TEACHER_A);
  });

  it("11/12. existing submitted/graded remain unchanged", async () => {
    const { db, test } = await seedPublished();
    const submitted = await TestSubmissionService.create(
      {
        testId: test.id,
        studentId: STUDENT_A,
        status: "submitted",
        score: 7,
        feedback: "قديم",
        submittedAt: "2026-08-14T10:00:00Z",
      },
      authFor(db),
    );
    assert.ok(submitted);

    const other = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    db.students.push({
      id: other,
      teacher_id: TEACHER_A,
      full_name: "آخر",
      active: true,
    });

    await TestSubmissionService.assignPending(test.id, other, authFor(db));

    const still = await TestSubmissionService.getById(submitted.id, authFor(db));
    assert.ok(still);
    assert.equal(still.status, "submitted");
    assert.equal(still.score, 7);
    assert.equal(still.feedback, "قديم");

    const graded = await TestSubmissionService.update(
      submitted.id,
      { status: "graded", gradedAt: "2026-08-14T12:00:00Z", score: 9 },
      authFor(db),
    );
    assert.ok(graded);
    assert.equal(graded.status, "graded");
    assert.equal(graded.score, 9);

    await assert.rejects(
      () => TestSubmissionService.assignPending(test.id, STUDENT_A, authFor(db)),
      (err: unknown) => err instanceof TestSubmissionConflictError,
    );

    const afterConflict = await TestSubmissionService.getById(submitted.id, authFor(db));
    assert.equal(afterConflict?.status, "graded");
    assert.equal(afterConflict?.score, 9);
  });

  it("13/14. closed list readable; teacher-scoped", async () => {
    const { db, test } = await seedPublished();
    await TestSubmissionService.assignPending(test.id, STUDENT_A, authFor(db));
    await TestService.close(test.id, authFor(db));

    const list = await TestSubmissionService.listByTest(test.id, authFor(db));
    assert.equal(list.length, 1);
    assert.equal(list[0]?.status, "pending");

    await assert.rejects(
      () => TestSubmissionService.listByTest(test.id, authFor(db, TEACHER_B)),
      /الاختبار غير موجود/,
    );
  });

  it("15. answers untouched by assignment", async () => {
    const { db, test } = await seedPublished();
    const submission = await TestSubmissionService.assignPending(
      test.id,
      STUDENT_A,
      authFor(db),
    );
    assert.ok(submission);
    assert.equal(db.test_answers.length, 0);
    const answers = await TestAnswerService.listBySubmission(submission.id, authFor(db));
    assert.equal(answers.length, 0);
  });
});

describe("TASK 22.7 TestSubmissionService.markSubmitted", () => {
  it("1-7. pending → submitted; timestamps and grading fields unchanged", async () => {
    const { db, test } = await seedPublished();
    const submission = await TestSubmissionService.assignPending(
      test.id,
      STUDENT_A,
      authFor(db),
    );
    assert.ok(submission);
    assert.equal(submission.status, "pending");

    const beforeAnswers = db.test_answers.length;
    const marked = await TestSubmissionService.markSubmitted(submission.id, authFor(db));
    assert.ok(marked);
    assert.equal(marked.status, "submitted");
    assert.ok(marked.submittedAt);
    assert.equal(marked.score, null);
    assert.equal(marked.maxScore, null);
    assert.equal(marked.feedback, null);
    assert.equal(marked.gradedAt, null);
    assert.equal(db.test_answers.length, beforeAnswers);

    const again = await TestSubmissionService.getById(submission.id, authFor(db));
    assert.equal(again?.status, "submitted");
    assert.equal(again?.score, null);
    assert.equal(again?.maxScore, null);
    assert.equal(again?.feedback, null);
    assert.equal(again?.gradedAt, null);
  });

  it("8. rejects already submitted", async () => {
    const { db, test } = await seedPublished();
    const submission = await TestSubmissionService.assignPending(
      test.id,
      STUDENT_A,
      authFor(db),
    );
    assert.ok(submission);
    await TestSubmissionService.markSubmitted(submission.id, authFor(db));
    await assert.rejects(
      () => TestSubmissionService.markSubmitted(submission.id, authFor(db)),
      /مُعلَّم كمُسلّم مسبقاً/,
    );
  });

  it("9. rejects graded", async () => {
    const { db, test } = await seedPublished();
    const submission = await TestSubmissionService.create(
      {
        testId: test.id,
        studentId: STUDENT_A,
        status: "graded",
        score: 5,
        gradedAt: "2026-08-15T12:00:00Z",
      },
      authFor(db),
    );
    assert.ok(submission);
    await assert.rejects(
      () => TestSubmissionService.markSubmitted(submission.id, authFor(db)),
      /مُصحَّح/,
    );
  });

  it("10. rejects foreign teacher", async () => {
    const { db, test } = await seedPublished();
    const submission = await TestSubmissionService.assignPending(
      test.id,
      STUDENT_A,
      authFor(db),
    );
    assert.ok(submission);
    await assert.rejects(
      () => TestSubmissionService.markSubmitted(submission.id, authFor(db, TEACHER_B)),
      /التسليم غير موجود/,
    );
  });

  it("11. rejects nonexistent submission", async () => {
    const { db } = await seedPublished();
    await assert.rejects(
      () =>
        TestSubmissionService.markSubmitted(
          "99999999-9999-4999-8999-999999999999",
          authFor(db),
        ),
      /التسليم غير موجود/,
    );
  });

  it("12. rejects closed test", async () => {
    const { db, test } = await seedPublished();
    const submission = await TestSubmissionService.assignPending(
      test.id,
      STUDENT_A,
      authFor(db),
    );
    assert.ok(submission);
    await TestService.close(test.id, authFor(db));
    await assert.rejects(
      () => TestSubmissionService.markSubmitted(submission.id, authFor(db)),
      /مغلق/,
    );
  });
});

describe("TASK 22.9 TestSubmissionService.setFeedback", () => {
  async function seedGraded() {
    const { db, test } = await seedPublished();
    const submission = await TestSubmissionService.create(
      {
        testId: test.id,
        studentId: STUDENT_A,
        status: "graded",
        score: 8,
        maxScore: 10,
        feedback: null,
        submittedAt: "2026-08-15T10:00:00Z",
        gradedAt: "2026-08-15T11:00:00Z",
      },
      authFor(db),
    );
    assert.ok(submission);
    db.test_answers.push({
      id: "ans-1",
      submission_id: submission.id,
      question_id: "q-fixed",
      selected_option_id: null,
      boolean_answer: true,
      is_correct: true,
      points_awarded: 8,
      created_at: "2026-08-15T10:00:00Z",
      updated_at: "2026-08-15T10:00:00Z",
    });
    return { db, test, submission };
  }

  it("1-9. graded accepts feedback; grading fields and answers unchanged", async () => {
    const { db, submission } = await seedGraded();
    const beforeAnswers = structuredClone(db.test_answers);

    const saved = await TestSubmissionService.setFeedback(
      submission.id,
      "  أحسنت في الوحدة  ",
      authFor(db),
    );
    assert.ok(saved);
    assert.equal(saved.feedback, "أحسنت في الوحدة");
    assert.equal(saved.score, 8);
    assert.equal(saved.maxScore, 10);
    assert.equal(saved.status, "graded");
    assert.equal(saved.gradedAt, "2026-08-15T11:00:00Z");
    assert.equal(saved.submittedAt, "2026-08-15T10:00:00Z");
    assert.deepEqual(db.test_answers, beforeAnswers);

    const updated = await TestSubmissionService.setFeedback(
      submission.id,
      "ملاحظة محدّثة",
      authFor(db),
    );
    assert.equal(updated?.feedback, "ملاحظة محدّثة");
    assert.equal(updated?.score, 8);
    assert.equal(updated?.maxScore, 10);
    assert.equal(updated?.status, "graded");
    assert.equal(updated?.gradedAt, "2026-08-15T11:00:00Z");

    const cleared = await TestSubmissionService.setFeedback(submission.id, "   ", authFor(db));
    assert.equal(cleared?.feedback, null);
    assert.equal(cleared?.score, 8);
    assert.equal(cleared?.status, "graded");
    assert.deepEqual(db.test_answers, beforeAnswers);
  });

  it("10. pending rejected", async () => {
    const { db, test } = await seedPublished();
    const submission = await TestSubmissionService.assignPending(
      test.id,
      STUDENT_A,
      authFor(db),
    );
    assert.ok(submission);
    await assert.rejects(
      () => TestSubmissionService.setFeedback(submission.id, "ملاحظة", authFor(db)),
      /لم يبدأ/,
    );
  });

  it("11. submitted rejected", async () => {
    const { db, test } = await seedPublished();
    const submission = await TestSubmissionService.create(
      {
        testId: test.id,
        studentId: STUDENT_A,
        status: "submitted",
        submittedAt: "2026-08-15T10:00:00Z",
      },
      authFor(db),
    );
    assert.ok(submission);
    await assert.rejects(
      () => TestSubmissionService.setFeedback(submission.id, "ملاحظة", authFor(db)),
      /قبل التصحيح/,
    );
  });

  it("12. foreign teacher rejected", async () => {
    const { db, submission } = await seedGraded();
    await assert.rejects(
      () => TestSubmissionService.setFeedback(submission.id, "سرقة", authFor(db, TEACHER_B)),
      /التسليم غير موجود/,
    );
  });

  it("13. missing submission rejected", async () => {
    const { db } = await seedPublished();
    await assert.rejects(
      () =>
        TestSubmissionService.setFeedback(
          "99999999-9999-4999-8999-999999999999",
          "ملاحظة",
          authFor(db),
        ),
      /التسليم غير موجود/,
    );
  });

  it("14. no client teacher_id in setFeedback API", async () => {
    const source = readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), "test-submission.service.ts"),
      "utf8",
    );
    const start = source.indexOf("static async setFeedback");
    assert.ok(start >= 0);
    const method = source.slice(start, start + 1200);
    assert.match(method, /resolveUserContext/);
    assert.match(method, /feedback:\s*nextFeedback/);
    assert.equal(/\bteacherId\s*:/.test(method), false);
    assert.equal(/score\s*:/.test(method), false);
    assert.equal(/max_score\s*:/.test(method), false);
    assert.equal(/status\s*:\s*["']graded["']/.test(method), false);
    assert.equal(/graded_at\s*:/.test(method), false);
  });
});
