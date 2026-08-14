import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  matchPlanEntryToTimetableSlot,
  type PlanEntryForTimetableMatch,
  type TimetableSlotForPlanMatch,
} from "./match-plan-entry-to-timetable-slot.ts";

const SUNDAY = 0;
const LESSON_MATH = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LESSON_SCIENCE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const LESSON_CLASS_A = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const LESSON_CLASS_B = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const LESSON_GRADE_A = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const LESSON_GRADE_B = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const LESSON_A = "11111111-1111-4111-8111-111111111111";
const LESSON_B = "22222222-2222-4222-8222-222222222222";

function slot(overrides: Partial<TimetableSlotForPlanMatch> = {}): TimetableSlotForPlanMatch {
  return {
    dayOfWeek: SUNDAY,
    period: 3,
    subject: "رياضيات",
    grade: "الأول متوسط",
    className: "1/A",
    ...overrides,
  };
}

function planEntry(
  overrides: Partial<PlanEntryForTimetableMatch> & { lessonId: string },
): PlanEntryForTimetableMatch {
  return {
    id: `row-${overrides.lessonId}`,
    academicYear: "1447",
    semester: "s1",
    weekNumber: 1,
    teachingWeek: 1,
    suggestedDate: "2026-08-09",
    dayOfWeek: SUNDAY,
    period: 3,
    unit: "U1",
    lessonTitle: "درس",
    lessonOrder: 1,
    periodsCount: 1,
    remainingPeriods: 0,
    status: "Upcoming",
    className: "1/A",
    subject: "رياضيات",
    grade: "الأول متوسط",
    objectives: "",
    teachingResources: "",
    assessmentMethods: "",
    planNotes: "",
    ...overrides,
  };
}

describe("matchPlanEntryToTimetableSlot (DI-02)", () => {
  it("TEST 1 — Math slot rejects Science entry for same date/period", () => {
    const timetableSlot = slot({ subject: "رياضيات" });
    const entries = [
      planEntry({ lessonId: LESSON_MATH, subject: "رياضيات" }),
      planEntry({ lessonId: LESSON_SCIENCE, subject: "علوم" }),
    ];

    const matched = matchPlanEntryToTimetableSlot(timetableSlot, entries, SUNDAY);

    assert.ok(matched);
    assert.equal(matched.lessonId, LESSON_MATH);
  });

  it("TEST 2 — same period/subject selects correct class", () => {
    const timetableSlot = slot({ className: "1/A" });
    const entries = [
      planEntry({ lessonId: LESSON_CLASS_A, className: "1/A" }),
      planEntry({ lessonId: LESSON_CLASS_B, className: "1/B" }),
    ];

    const matched = matchPlanEntryToTimetableSlot(timetableSlot, entries, SUNDAY);

    assert.ok(matched);
    assert.equal(matched.lessonId, LESSON_CLASS_A);
  });

  it("TEST 3 — same period/subject/class selects correct grade when both sides have grade", () => {
    const timetableSlot = slot({ grade: "الأول متوسط" });
    const entries = [
      planEntry({ lessonId: LESSON_GRADE_A, grade: "الأول متوسط" }),
      planEntry({ lessonId: LESSON_GRADE_B, grade: "الثاني متوسط" }),
    ];

    const matched = matchPlanEntryToTimetableSlot(timetableSlot, entries, SUNDAY);

    assert.ok(matched);
    assert.equal(matched.lessonId, LESSON_GRADE_A);
  });

  it("TEST 4 — no match when subject/class differ → null (no unrelated lesson)", () => {
    const timetableSlot = slot({ subject: "لغة عربية", className: "1/A" });
    const entries = [
      planEntry({ lessonId: LESSON_MATH, subject: "رياضيات", className: "1/A" }),
    ];

    const matched = matchPlanEntryToTimetableSlot(timetableSlot, entries, SUNDAY);

    assert.equal(matched, null);
  });

  it("TEST 5 — multiple equally valid candidates → null (no arbitrary first match)", () => {
    const timetableSlot = slot();
    const entries = [
      planEntry({ lessonId: LESSON_A, id: "dup-a" }),
      planEntry({ lessonId: LESSON_B, id: "dup-b" }),
    ];

    const matched = matchPlanEntryToTimetableSlot(timetableSlot, entries, SUNDAY);

    assert.equal(matched, null);
  });

  it("TEST 6 — single-plan flow with period + day + subject + class", () => {
    const timetableSlot = slot({ period: 2, subject: "علوم", className: "2/B" });
    const entries = [
      planEntry({
        lessonId: LESSON_SCIENCE,
        period: 2,
        subject: "علوم",
        className: "2/B",
        dayOfWeek: SUNDAY,
      }),
    ];

    const matched = matchPlanEntryToTimetableSlot(timetableSlot, entries, SUNDAY);

    assert.ok(matched);
    assert.equal(matched.lessonId, LESSON_SCIENCE);
  });

  it("TEST 9 helper — two periods same class/subject bind distinct lessons", () => {
    const entries = [
      planEntry({
        lessonId: LESSON_A,
        period: 1,
        subject: "لغة عربية",
        className: "1/A",
      }),
      planEntry({
        lessonId: LESSON_B,
        period: 4,
        subject: "لغة عربية",
        className: "1/A",
      }),
    ];

    const p1 = matchPlanEntryToTimetableSlot(
      slot({ period: 1, subject: "لغة عربية", className: "1/A" }),
      entries,
      SUNDAY,
    );
    const p4 = matchPlanEntryToTimetableSlot(
      slot({ period: 4, subject: "لغة عربية", className: "1/A" }),
      entries,
      SUNDAY,
    );

    assert.ok(p1);
    assert.ok(p4);
    assert.equal(p1.lessonId, LESSON_A);
    assert.equal(p4.lessonId, LESSON_B);
    assert.notEqual(p1.lessonId, p4.lessonId);
  });

  it("ignores entries with null lessonId", () => {
    const matched = matchPlanEntryToTimetableSlot(
      slot(),
      [planEntry({ lessonId: null as unknown as string })],
      SUNDAY,
    );
    assert.equal(matched, null);
  });

  it("rejects wrong dayOfWeek even when period/subject/class match", () => {
    const matched = matchPlanEntryToTimetableSlot(
      slot(),
      [planEntry({ lessonId: LESSON_A, dayOfWeek: 1 })],
      SUNDAY,
    );
    assert.equal(matched, null);
  });
});
