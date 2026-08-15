import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import type { Student } from "./student.service.ts";
import {
  buildHomeworkBulkAssignPreview,
  formatHomeworkBulkAssignConfirm,
  formatHomeworkBulkAssignResult,
} from "./homework-bulk-assign.logic.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

const activeA: Student = {
  id: "stu-1",
  teacherId: "11111111-1111-4111-8111-111111111111",
  fullName: "أحمد",
  classId: "class-a",
  gradeId: "grade-1",
  studentCode: "S1",
  active: true,
  createdAt: "2026-08-14T00:00:00Z",
  updatedAt: "2026-08-14T00:00:00Z",
};

const activeOtherClass: Student = {
  ...activeA,
  id: "stu-2",
  fullName: "خالد",
  classId: "class-b",
};

const inactive: Student = {
  ...activeA,
  id: "stu-3",
  fullName: "سارة",
  active: false,
};

describe("TASK 25.3 homework bulk assign UI logic", () => {
  it("preview counts only active students in selected class", () => {
    const preview = buildHomeworkBulkAssignPreview({
      classId: "class-a",
      classLabel: "1/أ",
      gradeLabel: "أول متوسط",
      students: [activeA, activeOtherClass, inactive],
    });
    assert.equal(preview.eligibleCount, 1);
    assert.deepEqual(preview.studentNames, ["أحمد"]);
  });

  it("confirm and result Arabic copy", () => {
    assert.match(formatHomeworkBulkAssignConfirm(3), /3 طالبًا/);
    assert.match(formatHomeworkBulkAssignConfirm(0), /لا يوجد طلاب نشطون/);
    assert.match(
      formatHomeworkBulkAssignResult({ createdCount: 2, skippedExistingCount: 1 }),
      /تم الإسناد إلى 2 طالبًا/,
    );
    assert.match(
      formatHomeworkBulkAssignResult({ createdCount: 2, skippedExistingCount: 1 }),
      /تم تجاوز 1/,
    );
  });

  it("class selector + confirmation exist; no client teacher_id; no direct Supabase writes", () => {
    const dialog = readFileSync(
      path.join(here, "../components/homework-bulk-assign-dialog.tsx"),
      "utf8",
    );
    const panel = readFileSync(
      path.join(here, "../components/homework-submissions-panel.tsx"),
      "utf8",
    );
    const hook = readFileSync(path.join(here, "../hooks/useHomeworkSubmissions.ts"), "utf8");

    assert.match(dialog, /إسناد للفصل/);
    assert.match(dialog, /الصف/);
    assert.match(dialog, /الفصل/);
    assert.match(dialog, /عدد الطلاب النشطين/);
    assert.match(dialog, /تأكيد الإسناد/);
    assert.match(panel, /إسناد للفصل/);
    assert.match(panel, /HomeworkBulkAssignDialog/);
    assert.match(hook, /assignToClass/);

    for (const [label, source] of [
      ["dialog", dialog],
      ["panel", panel],
      ["hook", hook],
    ] as const) {
      assert.equal(
        /\bteacher_id\s*[:=]/.test(source),
        false,
        `${label} must not set teacher_id`,
      );
      assert.equal(
        /from\(["']homework_submissions["']\)|createClient|supabase\.from/.test(source),
        false,
        `${label} must not write Supabase directly`,
      );
    }

    assert.match(hook, /HomeworkSubmissionService\.assignToClass/);
  });
});
