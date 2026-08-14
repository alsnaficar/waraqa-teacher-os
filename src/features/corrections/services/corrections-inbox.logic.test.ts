import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertNoClientTeacherId,
  homeworkDeepLink,
  isActionableHomeworkStatus,
  isActionableTestStatus,
  mergeCorrectionInboxItems,
  normalizeHomeworkInboxItem,
  normalizeTestInboxItem,
  testDeepLink,
} from "./corrections-inbox.logic.ts";

describe("TASK 23 corrections-inbox.logic", () => {
  it("1-2. homework and test submitted appear", () => {
    const items = mergeCorrectionInboxItems(
      [
        {
          submissionId: "hs1",
          homeworkId: "hw1",
          studentId: "s1",
          studentName: "أحمد",
          title: "واجب الوحدة",
          status: "submitted",
          submittedAt: "2026-08-15T10:00:00Z",
        },
      ],
      [
        {
          submissionId: "ts1",
          testId: "t1",
          studentId: "s2",
          studentName: "سارة",
          title: "اختبار قصير",
          status: "submitted",
          submittedAt: "2026-08-15T11:00:00Z",
        },
      ],
    );
    assert.equal(items.length, 2);
    assert.equal(items[0]?.source, "test");
    assert.equal(items[1]?.source, "homework");
    assert.equal(items[0]?.sourceLabel, "اختبار");
    assert.equal(items[1]?.sourceLabel, "واجب");
  });

  it("3-5. pending/graded/unrelated excluded", () => {
    assert.equal(isActionableHomeworkStatus("pending"), false);
    assert.equal(isActionableHomeworkStatus("graded"), false);
    assert.equal(isActionableTestStatus("pending"), false);
    assert.equal(isActionableTestStatus("graded"), false);
    assert.equal(isActionableTestStatus("submitted"), true);

    assert.equal(
      normalizeTestInboxItem({
        submissionId: "ts1",
        testId: "t1",
        studentId: "s1",
        status: "pending",
      }),
      null,
    );
    assert.equal(
      normalizeTestInboxItem({
        submissionId: "ts1",
        testId: "t1",
        studentId: "s1",
        status: "graded",
      }),
      null,
    );
    assert.equal(
      normalizeHomeworkInboxItem({
        submissionId: "hs1",
        homeworkId: "hw1",
        studentId: "s1",
        status: "collected",
      }),
      null,
    );
  });

  it("6. newest submissions first", () => {
    const items = mergeCorrectionInboxItems(
      [
        {
          submissionId: "hs-old",
          homeworkId: "hw1",
          studentId: "s1",
          status: "submitted",
          submittedAt: "2026-08-14T08:00:00Z",
          title: "قديم",
        },
      ],
      [
        {
          submissionId: "ts-new",
          testId: "t1",
          studentId: "s1",
          status: "submitted",
          submittedAt: "2026-08-15T12:00:00Z",
          title: "جديد",
        },
      ],
    );
    assert.equal(items[0]?.submissionId, "ts-new");
    assert.equal(items[1]?.submissionId, "hs-old");
  });

  it("7-8. sources preserved; missing optional fields fallback safely", () => {
    const hw = normalizeHomeworkInboxItem({
      submissionId: "hs1",
      homeworkId: "hw1",
      studentId: "s1",
      status: "submitted",
    });
    assert.ok(hw);
    assert.equal(hw.source, "homework");
    assert.equal(hw.title, "واجب بدون عنوان");
    assert.equal(hw.studentName, "طالب غير معروف");
    assert.equal(hw.href, homeworkDeepLink("hw1"));
    assertNoClientTeacherId(hw);

    const tf = normalizeTestInboxItem({
      submissionId: "ts1",
      testId: "t1",
      studentId: "s1",
      status: "submitted",
    });
    assert.ok(tf);
    assert.equal(tf.source, "test");
    assert.equal(tf.title, "اختبار بدون عنوان");
    assert.equal(tf.href, testDeepLink("t1"));
    assertNoClientTeacherId(tf);
  });

  it("9. no teacher_id in view model", () => {
    const item = normalizeHomeworkInboxItem({
      submissionId: "hs1",
      homeworkId: "hw1",
      studentId: "s1",
      studentName: "أحمد",
      title: "واجب",
      status: "submitted",
      submittedAt: "2026-08-15T10:00:00Z",
    });
    assert.ok(item);
    assert.equal("teacherId" in item, false);
    assert.equal("teacher_id" in item, false);
  });

  it("deep-link contracts", () => {
    assert.match(homeworkDeepLink("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"), /homeworkId=/);
    assert.match(testDeepLink("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"), /testId=/);
  });
});
