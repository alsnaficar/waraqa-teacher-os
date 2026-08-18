import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  matchesMockFixtures,
  sanitizeTeacherSnapshot,
  sanitizeTimetableSnapshots,
  validateTimetableSnapshots,
} from "./madrasati-live-verification.ts";
import { MOCK_MADRASATI_TEACHER, MOCK_MADRASATI_TIMETABLE } from "../mock/fixtures.ts";

describe("Madrasati live verification helpers", () => {
  it("omits empty optional teacher fields and requires a displayName", () => {
    assert.equal(
      sanitizeTeacherSnapshot({ displayName: "   " }),
      null,
    );

    assert.deepEqual(
      sanitizeTeacherSnapshot({
        displayName: "  معلم الاختبار  ",
        schoolName: "مدرسة الاختبار الأهلية",
      }),
      {
        displayName: "معلم الاختبار",
        schoolName: "مدرسة الاختبار الأهلية",
      },
    );
  });

  it("counts invalid timetable fields, duplicates, and الفصل الدراسي as className", () => {
    const validation = validateTimetableSnapshots([
      {
        dayOfWeek: 0,
        period: 1,
        subject: "الرياضيات",
        grade: "الصف الأول المتوسط",
        className: "1",
      },
      {
        dayOfWeek: 0,
        period: 1,
        subject: "الرياضيات",
        grade: "الصف الأول المتوسط",
        className: "1",
      },
      {
        dayOfWeek: 9,
        period: 0,
        subject: "",
        grade: "",
        className: "الفصل الدراسي",
      },
    ]);

    assert.equal(validation.duplicateCount, 1);
    assert.equal(validation.invalidDayCount, 1);
    assert.equal(validation.invalidPeriodCount, 1);
    assert.equal(validation.missingSubjectCount, 1);
    assert.equal(validation.missingGradeCount, 1);
    assert.equal(validation.missingClassCount, 0);
    assert.equal(validation.semesterAsClassNameCount, 1);
  });

  it("detects mock fixtures without treating a live overlap grade as mock by itself", () => {
    assert.equal(
      matchesMockFixtures({
        teacher: {
          displayName: MOCK_MADRASATI_TEACHER.displayName,
          schoolName: MOCK_MADRASATI_TEACHER.schoolName,
        },
      }),
      true,
    );
    assert.equal(
      matchesMockFixtures({
        timetable: sanitizeTimetableSnapshots(MOCK_MADRASATI_TIMETABLE),
      }),
      true,
    );
    assert.equal(
      matchesMockFixtures({
        teacher: {
          displayName: "معلم الاختبار",
          schoolName: "مدرسة الاختبار الأهلية",
        },
        timetable: [
          {
            dayOfWeek: 0,
            period: 1,
            subject: "الرياضيات",
            grade: "الصف الأول المتوسط",
            className: "1",
          },
        ],
      }),
      false,
    );
  });
});
