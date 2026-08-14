import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import type { TeacherTest } from "./test.service.ts";
import type { TestQuestion } from "./test-question.service.ts";
import {
  assertNoClientTeacherId,
  draftToQuestionCreateInput,
  emptyQuestionDraft,
  emptyTestForm,
  filterTestsByTitle,
  formStateToCreateInput,
  questionToDraft,
  TEST_EMPTY_TITLE,
  TEST_ERROR_TITLE,
  TEST_STATUS_LABELS,
  TEST_STATUS_OPTIONS,
  testToFormState,
  toTestListItemView,
  validateQuestionDraft,
} from "./tests-ui.logic.ts";

const sample: TeacherTest = {
  id: "test-1",
  teacherId: "11111111-1111-4111-8111-111111111111",
  lessonSessionId: "session-1",
  sourceAiGenerationId: null,
  title: "اختبار الميزان",
  instructions: "اقرأ جيداً",
  subject: "لغة عربية",
  grade: "الأول متوسط",
  className: "1/A",
  dueDate: "2026-08-20",
  status: "draft",
  createdAt: "2026-08-14T00:00:00Z",
  updatedAt: "2026-08-14T00:00:00Z",
};

describe("TASK 22.3 tests UI logic", () => {
  it("1. Arabic status labels", () => {
    assert.equal(TEST_STATUS_LABELS.draft, "مسودة");
    assert.equal(TEST_STATUS_LABELS.published, "منشورة");
    assert.equal(TEST_STATUS_LABELS.closed, "مغلقة");
  });

  it("2. status filter options include الكل-compatible values", () => {
    assert.deepEqual(
      TEST_STATUS_OPTIONS.map((o) => o.value),
      ["draft", "published", "closed"],
    );
    assert.deepEqual(
      TEST_STATUS_OPTIONS.map((o) => o.label),
      ["مسودة", "منشورة", "مغلقة"],
    );
  });

  it("3. create/edit form mapping without teacher_id", () => {
    const created = formStateToCreateInput(
      emptyTestForm({
        title: "اختبار جديد",
        instructions: "تعليمات",
        subject: "علوم",
        grade: "ثاني",
        className: "2/B",
        dueDate: "2026-08-21",
        lessonSessionId: "",
      }),
    );
    assert.deepEqual(created, {
      title: "اختبار جديد",
      instructions: "تعليمات",
      subject: "علوم",
      grade: "ثاني",
      className: "2/B",
      dueDate: "2026-08-21",
      lessonSessionId: null,
    });
    assertNoClientTeacherId(created);

    const form = testToFormState(sample, "2026-08-14");
    assert.equal(form.title, "اختبار الميزان");
    assert.equal(form.lessonSessionId, "session-1");
    const patch = formStateToCreateInput({ ...form, title: "محدّث" });
    assert.equal(patch.title, "محدّث");
    assertNoClientTeacherId(patch);
  });

  it("4. MCQ validation requires prompt, options, exactly one correct", () => {
    const emptyPrompt = emptyQuestionDraft({ prompt: "" });
    assert.equal(validateQuestionDraft(emptyPrompt), "نص السؤال مطلوب.");

    const tooFew = emptyQuestionDraft({
      prompt: "س",
      options: [
        { label: "أ", isCorrect: true },
        { label: "", isCorrect: false },
      ],
    });
    assert.equal(
      validateQuestionDraft(tooFew),
      "سؤال الاختيار من متعدد يحتاج خيارين على الأقل.",
    );

    const noCorrect = emptyQuestionDraft({
      prompt: "س",
      options: [
        { label: "أ", isCorrect: false },
        { label: "ب", isCorrect: false },
      ],
    });
    assert.equal(validateQuestionDraft(noCorrect), "يجب تحديد إجابة صحيحة واحدة فقط.");

    const twoCorrect = emptyQuestionDraft({
      prompt: "س",
      options: [
        { label: "أ", isCorrect: true },
        { label: "ب", isCorrect: true },
      ],
    });
    assert.equal(validateQuestionDraft(twoCorrect), "يجب تحديد إجابة صحيحة واحدة فقط.");

    const ok = emptyQuestionDraft({
      prompt: "س",
      options: [
        { label: "أ", isCorrect: true },
        { label: "ب", isCorrect: false },
      ],
    });
    assert.equal(validateQuestionDraft(ok), null);
  });

  it("5. true/false validation and payload mapping", () => {
    const draft = emptyQuestionDraft({
      type: "true_false",
      prompt: "السماء زرقاء",
      points: "2",
      correctBoolean: false,
      options: [],
    });
    assert.equal(validateQuestionDraft(draft), null);

    const payload = draftToQuestionCreateInput(draft, 0);
    assert.equal(payload.type, "true_false");
    assert.equal(payload.correctBoolean, false);
    assert.equal(payload.points, 2);
    assertNoClientTeacherId(payload);

    const question: TestQuestion = {
      id: "q-tf",
      testId: "test-1",
      type: "true_false",
      prompt: "س",
      position: 0,
      points: 1,
      options: [
        {
          id: "o1",
          questionId: "q-tf",
          label: "صواب",
          isCorrect: false,
          position: 0,
          createdAt: "2026-08-14T00:00:00Z",
          updatedAt: "2026-08-14T00:00:00Z",
        },
        {
          id: "o2",
          questionId: "q-tf",
          label: "خطأ",
          isCorrect: true,
          position: 1,
          createdAt: "2026-08-14T00:00:00Z",
          updatedAt: "2026-08-14T00:00:00Z",
        },
      ],
      createdAt: "2026-08-14T00:00:00Z",
      updatedAt: "2026-08-14T00:00:00Z",
    };
    const hydrated = questionToDraft(question);
    assert.equal(hydrated.correctBoolean, false);
  });

  it("6. publish/close/delete action flags follow status", () => {
    const draft = toTestListItemView(sample);
    assert.equal(draft.canPublish, true);
    assert.equal(draft.canDelete, true);
    assert.equal(draft.canClose, false);
    assert.equal(draft.canEdit, true);
    assert.equal(draft.canManageQuestions, true);

    const published = toTestListItemView({ ...sample, status: "published" });
    assert.equal(published.canPublish, false);
    assert.equal(published.canClose, true);
    assert.equal(published.canDelete, false);
    assert.equal(published.canEdit, true);
    assert.equal(published.statusLabel, "منشورة");

    const closed = toTestListItemView({ ...sample, status: "closed" });
    assert.equal(closed.canEdit, false);
    assert.equal(closed.canPublish, false);
    assert.equal(closed.canClose, false);
    assert.equal(closed.canDelete, false);
    assert.equal(closed.canManageQuestions, false);
    assert.equal(closed.statusLabel, "مغلقة");
  });

  it("7. delete confirmation uses list identity", () => {
    const view = toTestListItemView(sample);
    assert.equal(view.id, sample.id);
    assert.ok(view.title.length > 0);
  });

  it("8. title filter and loading/empty/error copy", () => {
    const rows = [
      sample,
      { ...sample, id: "t2", title: "اختبار علوم" },
    ];
    assert.equal(filterTestsByTitle(rows, "ميزان").length, 1);
    assert.equal(filterTestsByTitle(rows, "").length, 2);
    assert.match(TEST_EMPTY_TITLE, /لا توجد اختبارات/);
    assert.match(TEST_ERROR_TITLE, /تعذر تحميل الاختبارات/);
  });

  it("9. no teacher_id client authority in UI sources; publish/close via services", () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const files = [
      path.join(here, "tests-ui.logic.ts"),
      path.join(here, "../hooks/useTests.ts"),
      path.join(here, "../hooks/useTestQuestions.ts"),
      path.join(here, "../components/test-form-dialog.tsx"),
      path.join(here, "../components/tests-page-content.tsx"),
      path.join(here, "../components/test-question-builder.tsx"),
      path.join(here, "../../../routes/_authenticated/tests.tsx"),
    ];

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      assert.equal(
        /\bteacherId\s*[:=]|\bteacher_id\s*[:=]/.test(source),
        false,
        `${path.basename(file)} must not set/pass teacher_id`,
      );
      assert.equal(
        /from\(["']tests["']\)|from\(["']test_questions["']\)/.test(source),
        false,
        `${path.basename(file)} must not write Supabase tables directly`,
      );
    }

    const hooks = readFileSync(path.join(here, "../hooks/useTests.ts"), "utf8");
    assert.match(hooks, /TestService\.publish/);
    assert.match(hooks, /TestService\.close/);
    assert.match(hooks, /TestService\.delete/);

    const page = readFileSync(
      path.join(here, "../components/tests-page-content.tsx"),
      "utf8",
    );
    assert.match(page, /publish\.mutateAsync/);
    assert.match(page, /close\.mutateAsync/);
    assert.match(page, /حذف الاختبار\؟/);
  });
});
