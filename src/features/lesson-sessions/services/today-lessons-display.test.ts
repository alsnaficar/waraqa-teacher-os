import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { LessonSessionView } from "../types.ts";
import {
  resolveTodayLessonDisplay,
  type TodayLessonDisplay,
} from "./today-lessons-display.ts";

const LESSON_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LESSON_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function sessionView(overrides: Partial<LessonSessionView> = {}): LessonSessionView {
  return {
    id: "session-1",
    teacherId: "teacher-1",
    academicYearId: "year-1",
    semesterId: "sem-1",
    gradeId: null,
    classId: null,
    curriculumLessonId: LESSON_A,
    curriculumLessonSource: "plan",
    sessionDate: "2026-08-14",
    dayOfWeek: 5,
    periodNumber: 1,
    lessonLocked: false,
    status: "scheduled",
    preparedAt: null,
    completedAt: null,
    createdAt: "2026-08-01T00:00:00Z",
    updatedAt: "2026-08-01T00:00:00Z",
    lessonTitle: "درس أ",
    lessonObjectives: null,
    unitTitle: "وحدة",
    subject: "لغة عربية",
    grade: "الأول متوسط",
    className: "1/A",
    classroom: null,
    startsAt: null,
    endsAt: null,
    ...overrides,
  };
}

describe("TASK 17 resolveTodayLessonDisplay", () => {
  it("A. TODAY_WITH_SESSION — sessions win over timetable", () => {
    const rows = resolveTodayLessonDisplay({
      sessions: [sessionView({ id: "s1", periodNumber: 2, lessonTitle: "من الجلسة" })],
      timetableSlots: [
        {
          id: "tt1",
          dayOfWeek: 5,
          period: 2,
          grade: "الأول متوسط",
          className: "1/A",
          subject: "لغة عربية",
          active: true,
        },
      ],
      todayDayOfWeek: 5,
      mockFallback: [
        {
          id: "mock",
          period: 9,
          grade: "x",
          klass: "y",
          lessonTitle: "وهمي",
          subject: "وهمي",
        },
      ],
    });

    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.id, "s1");
    assert.equal(rows[0]?.lessonTitle, "من الجلسة");
    assert.equal(rows[0]?.lessonSessionId, "s1");
    assert.equal(rows[0]?.curriculumLessonId, LESSON_A);
  });

  it("B. TODAY_WITH_NO_SESSION — timetable fallback, then mock", () => {
    const fromTimetable = resolveTodayLessonDisplay({
      sessions: [],
      timetableSlots: [
        {
          id: "tt1",
          dayOfWeek: 5,
          period: 1,
          grade: "الأول متوسط",
          className: "1/A",
          subject: "لغة عربية",
          active: true,
        },
      ],
      todayDayOfWeek: 5,
    });
    assert.equal(fromTimetable.length, 1);
    assert.equal(fromTimetable[0]?.id, "tt1");
    assert.equal(fromTimetable[0]?.lessonSessionId, undefined);

    const mock: TodayLessonDisplay[] = [
      {
        id: "mock",
        period: 1,
        grade: "g",
        klass: "c",
        lessonTitle: "mock",
        subject: "s",
      },
    ];
    const fromMock = resolveTodayLessonDisplay({
      sessions: [],
      timetableSlots: [],
      todayDayOfWeek: 5,
      mockFallback: mock,
    });
    assert.deepEqual(fromMock, mock);

    const empty = resolveTodayLessonDisplay({
      sessions: [],
      timetableSlots: [{ id: "other-day", dayOfWeek: 0, period: 1, grade: "g", className: "c", subject: "s", active: true }],
      todayDayOfWeek: 5,
    });
    assert.equal(empty.length, 0);
  });

  it("C. MULTIPLE_SESSIONS_SAME_DATE — ordered by period", () => {
    const rows = resolveTodayLessonDisplay({
      sessions: [
        sessionView({ id: "p3", periodNumber: 3, lessonTitle: "ثالث" }),
        sessionView({ id: "p1", periodNumber: 1, lessonTitle: "أول" }),
        sessionView({ id: "p2", periodNumber: 2, lessonTitle: "ثاني" }),
      ],
      timetableSlots: [],
      todayDayOfWeek: 5,
    });

    assert.deepEqual(
      rows.map((r) => r.id),
      ["p1", "p2", "p3"],
    );
  });

  it("E. MANUAL_CURRICULUM_OVERRIDE — display preserves manual source + lesson id", () => {
    const rows = resolveTodayLessonDisplay({
      sessions: [
        sessionView({
          curriculumLessonId: LESSON_B,
          curriculumLessonSource: "manual",
          lessonTitle: "يدوي",
        }),
      ],
      timetableSlots: [],
      todayDayOfWeek: 5,
    });
    assert.equal(rows[0]?.curriculumLessonSource, "manual");
    assert.equal(rows[0]?.curriculumLessonId, LESSON_B);
  });

  it("F. LOCKED_SESSION — display preserves lock", () => {
    const rows = resolveTodayLessonDisplay({
      sessions: [sessionView({ lessonLocked: true, status: "prepared" })],
      timetableSlots: [],
      todayDayOfWeek: 5,
    });
    assert.equal(rows[0]?.lessonLocked, true);
    assert.equal(rows[0]?.status, "prepared");
  });

  it("G. PREPARING_SESSION — display preserves preparing", () => {
    const rows = resolveTodayLessonDisplay({
      sessions: [sessionView({ status: "preparing", lessonLocked: false })],
      timetableSlots: [],
      todayDayOfWeek: 5,
    });
    assert.equal(rows[0]?.status, "preparing");
  });
});
