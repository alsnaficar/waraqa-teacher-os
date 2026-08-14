import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { TestService, assertTestStatus, toTestStatus } from "./test.service.ts";
import {
  SESSION_A,
  SESSION_B,
  TEACHER_A,
  TEACHER_B,
  authFor,
  createEmptyTestsDb,
} from "./tests-mock.ts";

describe("Test status helpers", () => {
  it("maps known statuses and falls back unknown → draft", () => {
    assert.equal(toTestStatus("published"), "published");
    assert.equal(toTestStatus("closed"), "closed");
    assert.equal(toTestStatus("legacy"), "draft");
  });

  it("rejects invalid status assertion", () => {
    assert.throws(() => assertTestStatus("assigned"), /غير صالحة/);
  });
});

describe("TASK 22.2 TestService", () => {
  it("creates test for authenticated teacher only", async () => {
    const db = createEmptyTestsDb();
    const created = await TestService.create({ title: "اختبار الوحدة" }, authFor(db));
    assert.ok(created);
    assert.equal(created.teacherId, TEACHER_A);
    assert.equal(created.status, "draft");
    assert.equal(db.tests[0]?.teacher_id, TEACHER_A);
  });

  it("lists only the authenticated teacher's tests", async () => {
    const db = createEmptyTestsDb();
    db.tests.push(
      {
        id: "mine",
        teacher_id: TEACHER_A,
        title: "اختباري",
        instructions: "",
        subject: null,
        grade: null,
        class_name: null,
        due_date: null,
        status: "draft",
        lesson_session_id: null,
        source_ai_generation_id: null,
        created_at: "2026-08-15T00:00:00Z",
        updated_at: "2026-08-15T00:00:00Z",
      },
      {
        id: "theirs",
        teacher_id: TEACHER_B,
        title: "اختبار آخر",
        instructions: "",
        subject: null,
        grade: null,
        class_name: null,
        due_date: null,
        status: "draft",
        lesson_session_id: null,
        source_ai_generation_id: null,
        created_at: "2026-08-15T00:00:00Z",
        updated_at: "2026-08-15T00:00:00Z",
      },
    );

    const list = await TestService.list({}, authFor(db));
    assert.equal(list.length, 1);
    assert.equal(list[0]?.id, "mine");
  });

  it("updates and deletes owned tests only", async () => {
    const db = createEmptyTestsDb();
    const created = await TestService.create({ title: "قبل" }, authFor(db));
    assert.ok(created);

    const updated = await TestService.update(created.id, { title: "بعد" }, authFor(db));
    assert.equal(updated?.title, "بعد");

    const foreign = await TestService.update(created.id, { title: "سرقة" }, authFor(db, TEACHER_B));
    assert.equal(foreign, null);

    const deleted = await TestService.delete(created.id, authFor(db));
    assert.equal(deleted, true);
    assert.equal(db.tests.length, 0);
  });

  it("publish and close transition status", async () => {
    const db = createEmptyTestsDb();
    const created = await TestService.create({ title: "اختبار" }, authFor(db));
    assert.ok(created);

    const published = await TestService.publish(created.id, authFor(db));
    assert.equal(published?.status, "published");

    const closed = await TestService.close(created.id, authFor(db));
    assert.equal(closed?.status, "closed");
  });

  it("rejects invalid status on update", async () => {
    const db = createEmptyTestsDb();
    const created = await TestService.create({ title: "اختبار" }, authFor(db));
    assert.ok(created);
    await assert.rejects(
      () => TestService.update(created.id, { status: "assigned" as never }, authFor(db)),
      /غير صالحة/,
    );
  });

  it("rejects foreign lesson_session_id", async () => {
    const db = createEmptyTestsDb();
    db.lesson_sessions.push({
      id: SESSION_B,
      teacher_id: TEACHER_B,
    });

    await assert.rejects(
      () =>
        TestService.create(
          { title: "اختبار", lessonSessionId: SESSION_B },
          authFor(db),
        ),
      /الحصة المرتبطة/,
    );

    db.lesson_sessions.push({ id: SESSION_A, teacher_id: TEACHER_A });
    const ok = await TestService.create(
      { title: "اختبار مربوط", lessonSessionId: SESSION_A },
      authFor(db),
    );
    assert.equal(ok?.lessonSessionId, SESSION_A);
  });
});
