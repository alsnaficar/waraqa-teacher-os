import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { extractMadrasatiClasses } from "./madrasati-classes.ts";
import type { MadrasatiPageLandmarks } from "./madrasati-teacher-profile.ts";

function snapshot(
  partial: Partial<MadrasatiPageLandmarks> = {},
): MadrasatiPageLandmarks {
  return {
    url: "https://schools.madrasati.sa/Courses",
    title: "مقرراتي",
    text: "مقرراتي",
    accessibleNames: ["مقرراتي", "الرئيسية"],
    labeledValues: [],
    tableRows: [],
    ...partial,
  };
}

describe("Madrasati class extraction", () => {
  it("normalizes multiple assigned classes from a مقرراتي table", () => {
    const result = extractMadrasatiClasses(
      snapshot({
        tableRows: [
          {
            headers: ["المقرر", "الصف", "الشعبة", "المرحلة"],
            cells: ["الرياضيات", "الصف الأول المتوسط", "1", "متوسط"],
          },
          {
            headers: ["المقرر", "الصف", "الشعبة", "المرحلة"],
            cells: ["العلوم", "الصف الأول المتوسط", "2", "متوسط"],
          },
          {
            headers: ["المقرر", "الصف", "الشعبة", "المرحلة"],
            cells: ["الرياضيات", "الصف الثاني المتوسط", "1", "متوسط"],
          },
        ],
      }),
    );

    assert.equal(result.status, "found");
    assert.deepEqual(result.classes, [
      { grade: "الصف الأول المتوسط", className: "1", stage: "intermediate" },
      { grade: "الصف الأول المتوسط", className: "2", stage: "intermediate" },
      { grade: "الصف الثاني المتوسط", className: "1", stage: "intermediate" },
    ]);
  });

  it("reads grade and class name from labeled course cards", () => {
    const result = extractMadrasatiClasses(
      snapshot({
        labeledValues: [
          { label: "الصف", value: "الصف الأول المتوسط" },
          { label: "الشعبة", value: "1" },
          { label: "الصف", value: "الصف الأول المتوسط" },
          { label: "الشعبة", value: "أ" },
        ],
      }),
    );

    assert.equal(result.status, "found");
    assert.equal(result.classes[0]?.grade, "الصف الأول المتوسط");
    assert.equal(result.classes[0]?.className, "1");
    assert.equal(result.classes[1]?.className, "أ");
    assert.equal(result.classes[1]?.stage, "intermediate");
  });

  it("keeps optional stage only when it is present or derivable", () => {
    const withStage = extractMadrasatiClasses(
      snapshot({
        tableRows: [
          {
            headers: ["الصف", "الشعبة"],
            cells: ["الصف الأول الثانوي", "1"],
          },
        ],
      }),
    );
    const withoutStage = extractMadrasatiClasses(
      snapshot({
        tableRows: [
          {
            headers: ["الصف", "الشعبة"],
            cells: ["الصف الأول", "1"],
          },
        ],
      }),
    );

    assert.equal(withStage.classes[0]?.stage, "secondary");
    assert.equal("stage" in (withoutStage.classes[0] ?? {}), false);
  });

  it("deduplicates the same class assigned through multiple courses", () => {
    const result = extractMadrasatiClasses(
      snapshot({
        tableRows: [
          {
            headers: ["المقرر", "الصف", "الشعبة"],
            cells: ["الرياضيات", "الصف الأول المتوسط", "1"],
          },
          {
            headers: ["المقرر", "الصف", "الشعبة"],
            cells: ["العلوم", "الصف الأول المتوسط", "1"],
          },
        ],
      }),
    );

    assert.equal(result.classes.length, 1);
    assert.deepEqual(result.classes[0], {
      grade: "الصف الأول المتوسط",
      className: "1",
      stage: "intermediate",
    });
  });

  it("fails closed when class information cannot be identified", () => {
    const home = extractMadrasatiClasses({
      url: "https://schools.madrasati.sa/",
      title: "مدرستي",
      text: "مرحباً، معلم الاختبار\nجدولي\nالمقررات والمصادر\nالواجبات\nالفصل الدراسي الأول",
      accessibleNames: ["جدولي", "المقررات والمصادر", "تسجيل الخروج"],
      labeledValues: [{ label: "الفصل الدراسي", value: "الأول" }],
      tableRows: [],
    });

    assert.equal(home.status, "unavailable");
    assert.deepEqual(home.classes, []);
  });

  it("returns a confirmed empty catalog instead of inventing classes", () => {
    const result = extractMadrasatiClasses(
      snapshot({
        text: "مقرراتي\nلا توجد مقررات مسندة",
        accessibleNames: ["مقرراتي"],
      }),
    );

    assert.equal(result.status, "empty");
    assert.deepEqual(result.classes, []);
  });

  it("parses combined grade/section text without using the timetable", () => {
    const result = extractMadrasatiClasses(
      snapshot({
        text: "مقرراتي\nالصف الأول المتوسط / 1\nالصف الأول المتوسط - شعبة 2",
      }),
    );

    assert.equal(result.status, "found");
    assert.deepEqual(
      result.classes.map((item) => item.className),
      ["1", "2"],
    );
  });
});
