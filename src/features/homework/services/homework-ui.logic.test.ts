import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import type { Homework } from "./homework.service.ts";
import {
  assertNoClientTeacherId,
  emptyHomeworkForm,
  formStateToCreateInput,
  formatSessionOptionLabel,
  HOMEWORK_EMPTY_TITLE,
  HOMEWORK_ERROR_TITLE,
  HOMEWORK_STATUS_LABELS,
  homeworkToFormState,
  toHomeworkListItemView,
} from "./homework-ui.logic.ts";

const sample: Homework = {
  id: "hw-1",
  teacherId: "11111111-1111-4111-8111-111111111111",
  lessonSessionId: "session-1",
  title: "واجب الميزان",
  instructions: "حل التمارين",
  subject: "لغة عربية",
  grade: "الأول متوسط",
  className: "1/A",
  dueDate: "2026-08-20",
  status: "assigned",
  createdAt: "2026-08-14T00:00:00Z",
  updatedAt: "2026-08-14T00:00:00Z",
};

describe("TASK 20.4 homework UI logic", () => {
  it("1. empty state Arabic copy", () => {
    assert.match(HOMEWORK_EMPTY_TITLE, /لا توجد واجبات/);
  });

  it("2. list rendering maps homework rows", () => {
    const view = toHomeworkListItemView(sample);
    assert.equal(view.id, "hw-1");
    assert.equal(view.title, "واجب الميزان");
    assert.equal(view.statusLabel, "مكلّف");
    assert.equal(view.hasLessonSession, true);
    assert.match(view.metaLabel, /لغة عربية/);
    assert.match(view.dueDateLabel, /2026|أغسطس|8/);
  });

  it("3. create payload from form state", () => {
    const input = formStateToCreateInput(
      emptyHomeworkForm({
        title: "واجب جديد",
        instructions: "تعليمات",
        subject: "علوم",
        grade: "ثاني",
        className: "2/B",
        dueDate: "2026-08-21",
        status: "draft",
        lessonSessionId: "",
      }),
    );

    assert.deepEqual(input, {
      title: "واجب جديد",
      instructions: "تعليمات",
      subject: "علوم",
      grade: "ثاني",
      className: "2/B",
      dueDate: "2026-08-21",
      status: "draft",
      lessonSessionId: null,
    });
    assertNoClientTeacherId(input);
  });

  it("4. edit form hydrates from homework", () => {
    const form = homeworkToFormState(sample, "2026-08-14");
    assert.equal(form.title, "واجب الميزان");
    assert.equal(form.status, "assigned");
    assert.equal(form.lessonSessionId, "session-1");
    assert.equal(form.sessionPickerDate, "2026-08-14");

    const patch = formStateToCreateInput({
      ...form,
      title: "واجب محدّث",
      status: "collected",
    });
    assert.equal(patch.title, "واجب محدّث");
    assert.equal(patch.status, "collected");
    assert.equal(patch.lessonSessionId, "session-1");
  });

  it("5. delete confirmation uses homework identity from list view", () => {
    const view = toHomeworkListItemView(sample);
    assert.equal(view.id, sample.id);
    assert.ok(view.title.length > 0);
  });

  it("6. Arabic status labels", () => {
    assert.equal(HOMEWORK_STATUS_LABELS.draft, "مسودة");
    assert.equal(HOMEWORK_STATUS_LABELS.assigned, "مكلّف");
    assert.equal(HOMEWORK_STATUS_LABELS.collected, "مُسلّم");
    assert.equal(HOMEWORK_STATUS_LABELS.corrected, "مُصحّح");
  });

  it("7. lesson-session association formatting and optional null", () => {
    const withSession = toHomeworkListItemView(sample);
    assert.equal(withSession.hasLessonSession, true);

    const withoutSession = toHomeworkListItemView({ ...sample, lessonSessionId: null });
    assert.equal(withoutSession.hasLessonSession, false);

    const label = formatSessionOptionLabel({
      periodNumber: 2,
      lessonTitle: "الميزان الصرفي",
      subject: "لغة عربية",
      sessionDate: "2026-08-14",
    });
    assert.match(label, /الحصة 2/);
    assert.match(label, /الميزان الصرفي/);

    const input = formStateToCreateInput(
      emptyHomeworkForm({
        title: "مرتبط",
        lessonSessionId: "session-9",
      }),
    );
    assert.equal(input.lessonSessionId, "session-9");
  });

  it("8. no teacher_id client authority in UI sources", () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const files = [
      path.join(here, "homework-ui.logic.ts"),
      path.join(here, "../hooks/useHomework.ts"),
      path.join(here, "../components/homework-form-dialog.tsx"),
      path.join(here, "../components/homework-page-content.tsx"),
      path.join(here, "../../../routes/_authenticated/homework.tsx"),
    ];

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      assert.equal(
        /\bteacherId\s*[:=]|\bteacher_id\s*[:=]/.test(source),
        false,
        `${path.basename(file)} must not set/pass teacher_id`,
      );
      assert.equal(
        /HomeworkService\.(create|update|list|delete)\([^)]*teacher/i.test(source),
        false,
        `${path.basename(file)} must not pass teacher into HomeworkService`,
      );
    }

    assert.match(HOMEWORK_ERROR_TITLE, /تعذر تحميل الواجبات/);
  });
});
