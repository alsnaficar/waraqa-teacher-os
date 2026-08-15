import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  assertNoClientTeacherId,
  classToFormState,
  emptyClassForm,
  emptyGradeForm,
  formStateToClassInput,
  formStateToGradeInput,
  gradeToFormState,
  toClassListItemView,
} from "./classes-ui.logic.ts";

describe("TASK 25.1 classes UI logic", () => {
  it("maps grade form state", () => {
    assert.deepEqual(emptyGradeForm(), { name: "", orderIndex: "0" });
    assert.deepEqual(
      gradeToFormState({
        id: "g1",
        teacherId: "t",
        name: "أول",
        orderIndex: 3,
        createdAt: "",
        updatedAt: "",
      }),
      { name: "أول", orderIndex: "3" },
    );
    assert.deepEqual(formStateToGradeInput({ name: "  أول  ", orderIndex: "2" }), {
      name: "أول",
      orderIndex: 2,
    });
    assert.deepEqual(formStateToGradeInput({ name: "أ", orderIndex: "x" }), {
      name: "أ",
      orderIndex: 0,
    });
  });

  it("maps class form state and list view", () => {
    assert.deepEqual(emptyClassForm(), { name: "", gradeId: "" });
    assert.deepEqual(
      classToFormState({
        id: "c1",
        teacherId: "t",
        name: "1/أ",
        gradeId: "g1",
        createdAt: "",
        updatedAt: "",
      }),
      { name: "1/أ", gradeId: "g1" },
    );
    assert.deepEqual(formStateToClassInput({ name: " 1/ب ", gradeId: "" }), {
      name: "1/ب",
      gradeId: null,
    });

    const view = toClassListItemView(
      {
        id: "c1",
        teacherId: "t",
        name: "1/أ",
        gradeId: "g1",
        createdAt: "",
        updatedAt: "",
      },
      new Map([["g1", "أول متوسط"]]),
    );
    assert.equal(view.gradeLabel, "أول متوسط");
    assertNoClientTeacherId(view);
  });

  it("UI sources never write teacher_id or touch Supabase directly", () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const panel = readFileSync(
      path.join(here, "../components/grades-classes-panel.tsx"),
      "utf8",
    );
    const gradeDialog = readFileSync(
      path.join(here, "../components/grade-form-dialog.tsx"),
      "utf8",
    );
    const classDialog = readFileSync(
      path.join(here, "../components/class-form-dialog.tsx"),
      "utf8",
    );
    const settings = readFileSync(
      path.join(here, "../../../routes/_authenticated/settings.tsx"),
      "utf8",
    );

    for (const src of [panel, gradeDialog, classDialog]) {
      assert.equal(/\bteacherId\s*[:=]|\bteacher_id\s*[:=]/.test(src), false);
      assert.equal(/from\(["']grades["']\)|from\(["']classes["']\)/.test(src), false);
    }

    assert.match(settings, /GradesClassesPanel/);
    assert.match(panel, /useGrades|useClasses/);
  });
});
