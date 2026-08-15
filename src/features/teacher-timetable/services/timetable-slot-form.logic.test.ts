import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  applyClassSelection,
  applyGradeSelection,
  assertNoClientTeacherId,
  classesForSelectedGrade,
  emptyTimetableSlotForm,
  formHasRequiredGradeClass,
  timetableEntryToFormState,
} from "./timetable-slot-form.logic.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

const GRADE_A = "gggggggg-gggg-4ggg-8ggg-gggggggggggg";
const GRADE_B = "hhhhhhhh-hhhh-4hhh-8hhh-hhhhhhhhhhhh";
const CLASS_A = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const CLASS_B = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const grades = [
  { id: GRADE_A, name: "الأول متوسط" },
  { id: GRADE_B, name: "الثاني متوسط" },
];

const classes = [
  { id: CLASS_A, name: "1/أ", gradeId: GRADE_A },
  { id: CLASS_B, name: "2/ب", gradeId: GRADE_B },
];

describe("TASK 25.4 timetable slot form grade/class UI logic", () => {
  it("grade selector applies name + clears invalid class", () => {
    const form = emptyTimetableSlotForm({
      gradeId: GRADE_B,
      grade: "الثاني متوسط",
      classId: CLASS_B,
      className: "2/ب",
    });
    const next = applyGradeSelection(form, GRADE_A, grades, classes);
    assert.equal(next.gradeId, GRADE_A);
    assert.equal(next.grade, "الأول متوسط");
    assert.equal(next.classId, "");
    assert.equal(next.className, "");
  });

  it("class selection filters by grade and syncs grade", () => {
    const filtered = classesForSelectedGrade(classes, GRADE_A);
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]?.id, CLASS_A);

    const form = emptyTimetableSlotForm({ gradeId: GRADE_A, grade: "الأول متوسط" });
    const next = applyClassSelection(form, CLASS_A, grades, classes);
    assert.equal(next.classId, CLASS_A);
    assert.equal(next.className, "1/أ");
    assert.equal(next.gradeId, GRADE_A);
  });

  it("preserves selected values when hydrating from entry", () => {
    const state = timetableEntryToFormState(
      {
        id: "tt-1",
        teacherId: "t",
        dayOfWeek: 0,
        period: 2,
        subject: "لغة عربية",
        grade: "الأول متوسط",
        className: "1/أ",
        active: true,
      },
      grades,
      classes,
    );
    assert.equal(state.gradeId, GRADE_A);
    assert.equal(state.classId, CLASS_A);
    assert.equal(formHasRequiredGradeClass(state), true);
  });

  it("rejects client teacher_id; dialog has no direct Supabase writes", () => {
    assert.throws(() => assertNoClientTeacherId({ teacher_id: "x" }));
    assert.throws(() => assertNoClientTeacherId({ teacherId: "x" }));

    const dialog = readFileSync(
      path.join(here, "../components/timetable-slot-form-dialog.tsx"),
      "utf8",
    );
    const logic = readFileSync(path.join(here, "timetable-slot-form.logic.ts"), "utf8");

    assert.match(dialog, /الصف/);
    assert.match(dialog, /الفصل/);
    assert.match(dialog, /useGrades/);
    assert.match(dialog, /useClasses/);
    assert.doesNotMatch(dialog, /teacher_id\s*[:=]/);
    assert.doesNotMatch(dialog, /from\(["']lesson_sessions["']\)/);
    assert.doesNotMatch(dialog, /createClient|supabase\.from/);
    assert.doesNotMatch(logic, /teacher_id\s*[:=]/);
  });
});
