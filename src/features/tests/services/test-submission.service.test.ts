import assert from "node:assert/strict";
import { describe, it } from "node:test";

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

async function seedPublished(db = createEmptyTestsDb()) {
  const test = await TestService.create({ title: "اختبار التسليم" }, authFor(db));
  assert.ok(test);
  await TestService.publish(test.id, authFor(db));
  db.students.push({
    id: STUDENT_A,
    teacher_id: TEACHER_A,
    full_name: "أحمد",
    active: true,
  });
  db.students.push({
    id: STUDENT_B,
    teacher_id: TEACHER_B,
    full_name: "سارة",
    active: true,
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
