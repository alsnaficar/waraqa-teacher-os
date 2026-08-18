import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { extractMadrasatiSubjects } from "./madrasati-subjects.ts";
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

describe("Madrasati subject extraction", () => {
  it("extracts a single assigned subject from مقرراتي", () => {
    const result = extractMadrasatiSubjects(
      snapshot({
        tableRows: [
          {
            headers: ["المقرر", "الصف", "الشعبة"],
            cells: ["الرياضيات", "الصف الأول المتوسط", "1"],
          },
        ],
      }),
    );

    assert.equal(result.status, "found");
    assert.deepEqual(result.subjects, [{ name: "الرياضيات" }]);
  });

  it("extracts multiple unique subjects from the course catalog", () => {
    const result = extractMadrasatiSubjects(
      snapshot({
        tableRows: [
          {
            headers: ["المقرر", "الصف", "الشعبة"],
            cells: ["الرياضيات", "الصف الأول المتوسط", "1"],
          },
          {
            headers: ["المقرر", "الصف", "الشعبة"],
            cells: ["العلوم", "الصف الأول المتوسط", "2"],
          },
          {
            headers: ["المقرر", "الصف", "الشعبة"],
            cells: ["لغتي الخالدة", "الصف الثاني المتوسط", "1"],
          },
        ],
      }),
    );

    assert.deepEqual(
      result.subjects.map((item) => item.name),
      ["الرياضيات", "العلوم", "لغتي الخالدة"],
    );
  });

  it("deduplicates the same subject taught to multiple classes", () => {
    const result = extractMadrasatiSubjects(
      snapshot({
        tableRows: [
          {
            headers: ["المقرر", "الصف", "الشعبة"],
            cells: ["الرياضيات", "الصف الأول المتوسط", "1"],
          },
          {
            headers: ["المقرر", "الصف", "الشعبة"],
            cells: ["الرياضيات", "الصف الأول المتوسط", "2"],
          },
        ],
      }),
    );

    assert.equal(result.subjects.length, 1);
    assert.equal(result.subjects[0]?.name, "الرياضيات");
  });

  it("does not treat grade or section as a subject name", () => {
    const result = extractMadrasatiSubjects(
      snapshot({
        tableRows: [
          {
            headers: ["الصف", "الشعبة", "المرحلة"],
            cells: ["الصف الأول المتوسط", "1", "متوسط"],
          },
        ],
      }),
    );

    assert.equal(result.status, "unavailable");
    assert.deepEqual(result.subjects, []);
  });

  it("keeps an explicit course code and ignores invented codes", () => {
    const withCode = extractMadrasatiSubjects(
      snapshot({
        tableRows: [
          {
            headers: ["المقرر", "رمز المقرر", "الصف", "الشعبة"],
            cells: ["الرياضيات", "MATH101", "الصف الأول المتوسط", "1"],
          },
        ],
      }),
    );
    const withoutCode = extractMadrasatiSubjects(
      snapshot({
        labeledValues: [
          { label: "المقرر", value: "العلوم" },
          { label: "الصف", value: "الصف الأول المتوسط" },
          { label: "الشعبة", value: "1" },
        ],
      }),
    );

    assert.deepEqual(withCode.subjects, [{ name: "الرياضيات", code: "MATH101" }]);
    assert.deepEqual(withoutCode.subjects, [{ name: "العلوم" }]);
    assert.equal("code" in (withoutCode.subjects[0] ?? {}), false);
  });

  it("fails closed when the catalog has no identifiable subject names", () => {
    const result = extractMadrasatiSubjects({
      url: "https://schools.madrasati.sa/",
      title: "مدرستي",
      text: "مرحباً، معلم الاختبار\nجدولي\nالمقررات والمصادر\nالواجبات\nالفصل الدراسي الأول",
      accessibleNames: ["جدولي", "المقررات والمصادر", "تسجيل الخروج"],
      labeledValues: [{ label: "الفصل الدراسي", value: "الأول" }],
      tableRows: [],
    });

    assert.equal(result.status, "unavailable");
    assert.deepEqual(result.subjects, []);
  });

  it("returns a confirmed empty مقرراتي catalog instead of mock subjects", () => {
    const result = extractMadrasatiSubjects(
      snapshot({
        text: "مقرراتي\nلا توجد مقررات مسندة",
        accessibleNames: ["مقرراتي"],
      }),
    );

    assert.equal(result.status, "empty");
    assert.deepEqual(result.subjects, []);
  });
});
