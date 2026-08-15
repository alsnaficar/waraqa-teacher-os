import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import type { CorrectionInboxItem } from "@/features/corrections/services/corrections-inbox.logic.ts";

import {
  activityFromGraded,
  activityFromSubmittedInbox,
  assertNoClientTeacherId,
  buildActivityFeed,
  buildPendingTasks,
  DASHBOARD_ACTIVITY_LIMIT,
  pendingFeedbackTaskFromGraded,
  type GradedSubmissionForDashboard,
} from "./dashboard-activity.logic.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

const hwInbox: CorrectionInboxItem = {
  id: "homework:sub-hw-1",
  source: "homework",
  submissionId: "sub-hw-1",
  parentId: "hw-1",
  title: "واجب الوحدة",
  studentId: "stu-1",
  studentName: "أحمد",
  submittedAt: "2026-08-15T10:00:00Z",
  status: "submitted",
  statusLabel: "مُسلّم",
  sourceLabel: "واجب",
  score: null,
  maxScore: null,
  feedback: null,
  href: "/homework?homeworkId=hw-1",
};

const testInbox: CorrectionInboxItem = {
  id: "test:sub-t-1",
  source: "test",
  submissionId: "sub-t-1",
  parentId: "test-1",
  title: "اختبار قصير",
  studentId: "stu-2",
  studentName: "سارة",
  submittedAt: "2026-08-15T11:00:00Z",
  status: "submitted",
  statusLabel: "مُسلّم",
  sourceLabel: "اختبار",
  score: null,
  maxScore: 10,
  feedback: null,
  href: "/tests?testId=test-1",
};

const gradedTestNoFeedback: GradedSubmissionForDashboard = {
  submissionId: "sub-t-2",
  parentId: "test-2",
  parentTitle: "اختبار نهائي",
  studentName: "خالد",
  status: "graded",
  feedback: null,
  submittedAt: "2026-08-14T09:00:00Z",
  gradedAt: "2026-08-15T12:00:00Z",
  source: "test",
};

const gradedHwNoFeedback: GradedSubmissionForDashboard = {
  submissionId: "sub-hw-2",
  parentId: "hw-2",
  parentTitle: "واجب منزل",
  studentName: "نورة",
  status: "graded",
  feedback: "   ",
  submittedAt: "2026-08-14T08:00:00Z",
  gradedAt: "2026-08-15T09:00:00Z",
  source: "homework",
};

describe("TASK 25.6 dashboard activity logic", () => {
  it("1-2. own submitted homework and test appear as pending", () => {
    const pending = buildPendingTasks({
      inbox: [hwInbox, testInbox],
      gradedNeedingFeedback: [],
    });
    assert.equal(pending.length, 2);
    assert.equal(pending[0]?.kind, "test_submitted");
    assert.equal(pending[0]?.actionLabel, "يحتاج تصحيح تلقائي");
    assert.equal(pending[1]?.kind, "homework_submitted");
    assert.equal(pending[1]?.actionLabel, "يحتاج تصحيح");
    assert.match(pending[1]?.href ?? "", /homeworkId=hw-1/);
    assert.match(pending[0]?.href ?? "", /testId=test-1/);
  });

  it("3. graded with empty feedback becomes needs-notes pending", () => {
    assert.ok(pendingFeedbackTaskFromGraded(gradedTestNoFeedback));
    assert.ok(pendingFeedbackTaskFromGraded(gradedHwNoFeedback));
    assert.equal(
      pendingFeedbackTaskFromGraded({
        ...gradedTestNoFeedback,
        feedback: "أحسنت",
      }),
      null,
    );
    assert.equal(
      pendingFeedbackTaskFromGraded({
        ...gradedTestNoFeedback,
        status: "submitted",
      }),
      null,
    );
  });

  it("4. non-actionable graded-with-feedback excluded from pending feedback", () => {
    const pending = buildPendingTasks({
      inbox: [],
      gradedNeedingFeedback: [
        { ...gradedTestNoFeedback, feedback: "ملاحظة" },
        { ...gradedHwNoFeedback, status: "pending" },
      ],
    });
    assert.equal(pending.length, 0);
  });

  it("6-8. activity sorting, timestamps, and cap", () => {
    const gradedOlder: GradedSubmissionForDashboard = {
      ...gradedTestNoFeedback,
      submissionId: "sub-old",
      gradedAt: "2026-08-10T00:00:00Z",
      feedback: "x",
    };
    const noTsInbox: CorrectionInboxItem = {
      ...hwInbox,
      id: "homework:no-ts",
      submissionId: "no-ts",
      submittedAt: null,
    };

    assert.equal(activityFromSubmittedInbox(noTsInbox), null);
    assert.equal(
      activityFromGraded({ ...gradedOlder, gradedAt: null }),
      null,
    );

    const many = Array.from({ length: 20 }, (_, i) => ({
      ...hwInbox,
      id: `homework:sub-${i}`,
      submissionId: `sub-${i}`,
      submittedAt: `2026-08-15T${String(i).padStart(2, "0")}:00:00Z`,
      href: `/homework?homeworkId=hw-${i}`,
      parentId: `hw-${i}`,
    }));

    const feed = buildActivityFeed({
      inbox: many,
      graded: [gradedOlder],
      limit: DASHBOARD_ACTIVITY_LIMIT,
    });
    assert.equal(feed.length, DASHBOARD_ACTIVITY_LIMIT);
    assert.ok(Date.parse(feed[0]!.at) >= Date.parse(feed[1]!.at));
    assert.equal(feed.some((row) => row.id.includes("sub-old")), false);
  });

  it("9-10. empty build and deep links preserve ids", () => {
    assert.deepEqual(buildPendingTasks({ inbox: [], gradedNeedingFeedback: [] }), []);
    assert.deepEqual(buildActivityFeed({ inbox: [], graded: [] }), []);

    const activity = activityFromSubmittedInbox(hwInbox);
    assert.ok(activity);
    assert.match(activity.href, /homeworkId=hw-1/);
    assert.doesNotThrow(() => assertNoClientTeacherId(activity));
  });

  it("5. foreign teacher data never enters pure builders (owned inbox only)", () => {
    // Pure layer only maps provided owned rows — service filters by teacher_id.
    const pending = buildPendingTasks({
      inbox: [hwInbox],
      gradedNeedingFeedback: [gradedTestNoFeedback],
    });
    assert.ok(pending.every((row) => !("teacherId" in row) && !("teacher_id" in row)));
  });

  it("11-12. UI sources omit teacher_id and direct supabase writes", () => {
    const uiFiles = [
      path.join(here, "../../../components/dashboard/pending-tasks.tsx"),
      path.join(here, "../../../components/dashboard/dashboard-notifications.tsx"),
      path.join(here, "../hooks/useDashboardActivity.ts"),
    ];
    for (const file of uiFiles) {
      const source = readFileSync(file, "utf8");
      assert.doesNotMatch(source, /\bteacher_id\s*[:=]/);
      assert.doesNotMatch(source, /supabase\.from/);
    }

    const dashboard = readFileSync(
      path.join(here, "../../../routes/_authenticated/dashboard.tsx"),
      "utf8",
    );
    assert.match(dashboard, /useDashboardActivity/);
    assert.match(dashboard, /PendingTasks/);
    assert.match(dashboard, /DashboardNotifications/);
  });
});
