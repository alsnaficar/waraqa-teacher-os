import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { extractMadrasatiTimetable } from "./madrasati-timetable.ts";
import type { MadrasatiPageLandmarks } from "./madrasati-teacher-profile.ts";

function snapshot(
  partial: Partial<MadrasatiPageLandmarks> = {},
): MadrasatiPageLandmarks {
  return {
    url: "https://schools.madrasati.sa/Timetable",
    title: "جدولي",
    text: "جدولي",
    accessibleNames: ["جدولي", "الرئيسية"],
    labeledValues: [],
    tableRows: [],
    ...partial,
  };
}

describe("Madrasati timetable extraction", () => {
  it("extracts a single timetable entry", () => {
    const result = extractMadrasatiTimetable(
      snapshot({
        tableRows: [
          {
            headers: ["اليوم", "الحصة", "المقرر", "الصف", "الشعبة"],
            cells: ["الأحد", "الحصة الأولى", "الرياضيات", "الصف الأول المتوسط", "1"],
          },
        ],
      }),
    );

    assert.equal(result.status, "found");
    assert.deepEqual(result.entries, [
      {
        dayOfWeek: 0,
        period: 1,
        subject: "الرياضيات",
        grade: "الصف الأول المتوسط",
        className: "1",
      },
    ]);
  });

  it("extracts multiple days and periods", () => {
    const result = extractMadrasatiTimetable(
      snapshot({
        tableRows: [
          {
            headers: ["اليوم", "الحصة", "المقرر", "الصف", "الشعبة"],
            cells: ["الأحد", "1", "الرياضيات", "الصف الأول المتوسط", "1"],
          },
          {
            headers: ["اليوم", "الحصة", "المقرر", "الصف", "الشعبة"],
            cells: ["الاثنين", "الثانية", "العلوم", "الصف الأول المتوسط", "2"],
          },
          {
            headers: ["اليوم", "الحصة", "المقرر", "الصف", "الشعبة"],
            cells: ["الثلاثاء", "الحصة 3", "اللغة العربية", "الصف الثاني المتوسط", "أ"],
          },
        ],
      }),
    );

    assert.equal(result.status, "found");
    assert.deepEqual(
      result.entries.map((entry) => `${entry.dayOfWeek}:${entry.period}:${entry.subject}`),
      ["0:1:الرياضيات", "1:2:العلوم", "2:3:اللغة العربية"],
    );
  });

  it("normalizes Arabic day labels to Sunday=0", () => {
    const result = extractMadrasatiTimetable(
      snapshot({
        tableRows: ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس"].map(
          (day, index) => ({
            headers: ["اليوم", "الحصة", "المادة", "الصف", "الشعبة"],
            cells: [day, String(index + 1), "الرياضيات", "الصف الأول المتوسط", "1"],
          }),
        ),
      }),
    );

    assert.deepEqual(
      result.entries.map((entry) => entry.dayOfWeek),
      [0, 1, 2, 3, 4],
    );
  });

  it("normalizes period ordinals and numbers from the period column only", () => {
    const result = extractMadrasatiTimetable(
      snapshot({
        tableRows: [
          {
            headers: ["اليوم", "الحصة", "المقرر", "الصف", "الشعبة"],
            cells: ["الأحد", "الأولى", "الرياضيات", "الصف الأول المتوسط", "1"],
          },
          {
            headers: ["اليوم", "الحصة", "المقرر", "الصف", "الشعبة"],
            cells: ["الأحد", "الحصة الثانية", "العلوم", "الصف الأول المتوسط", "1"],
          },
          {
            headers: ["اليوم", "الحصة", "المقرر", "الصف", "الشعبة"],
            cells: ["الأحد", "4", "اللغة الإنجليزية", "الصف الأول المتوسط", "1"],
          },
        ],
      }),
    );

    assert.deepEqual(
      result.entries.map((entry) => entry.period),
      [1, 2, 4],
    );
  });

  it("extracts subject, grade, and section from labeled timetable cells", () => {
    const result = extractMadrasatiTimetable(
      snapshot({
        tableRows: [
          {
            headers: ["اليوم", "الحصة", "التفاصيل"],
            cells: [
              "الأحد",
              "الحصة الأولى",
              "المادة: الرياضيات / الصف: الصف الأول المتوسط / الشعبة: 2",
            ],
          },
        ],
      }),
    );

    assert.equal(result.entries[0]?.subject, "الرياضيات");
    assert.equal(result.entries[0]?.grade, "الصف الأول المتوسط");
    assert.equal(result.entries[0]?.className, "2");
  });

  it("extracts classroom when a room label is present", () => {
    const result = extractMadrasatiTimetable(
      snapshot({
        tableRows: [
          {
            headers: ["اليوم", "الحصة", "المقرر", "الصف", "الشعبة", "قاعة"],
            cells: ["الأحد", "1", "الرياضيات", "الصف الأول المتوسط", "1", "أ-101"],
          },
        ],
      }),
    );

    assert.equal(result.entries[0]?.classroom, "أ-101");
  });

  it("extracts startsAt and endsAt only when times are present", () => {
    const withTimes = extractMadrasatiTimetable(
      snapshot({
        tableRows: [
          {
            headers: ["اليوم", "الحصة", "المقرر", "الصف", "الشعبة", "من", "إلى"],
            cells: ["الأحد", "1", "الرياضيات", "الصف الأول المتوسط", "1", "7:00 ص", "07:45"],
          },
        ],
      }),
    );
    const withoutTimes = extractMadrasatiTimetable(
      snapshot({
        tableRows: [
          {
            headers: ["اليوم", "الحصة", "المقرر", "الصف", "الشعبة"],
            cells: ["الأحد", "1", "الرياضيات", "الصف الأول المتوسط", "1"],
          },
        ],
      }),
    );

    assert.equal(withTimes.entries[0]?.startsAt, "07:00");
    assert.equal(withTimes.entries[0]?.endsAt, "07:45");
    assert.equal("classroom" in (withoutTimes.entries[0] ?? {}), false);
    assert.equal("startsAt" in (withoutTimes.entries[0] ?? {}), false);
    assert.equal("endsAt" in (withoutTimes.entries[0] ?? {}), false);
  });

  it("omits optional classroom when the timetable does not expose a room", () => {
    const result = extractMadrasatiTimetable(
      snapshot({
        tableRows: [
          {
            headers: ["اليوم", "الحصة", "المقرر", "الصف", "الشعبة"],
            cells: ["الأحد", "1", "الرياضيات", "الصف الأول المتوسط", "1"],
          },
        ],
      }),
    );

    assert.equal("classroom" in (result.entries[0] ?? {}), false);
  });

  it("removes exact duplicate timetable entries", () => {
    const result = extractMadrasatiTimetable(
      snapshot({
        tableRows: [
          {
            headers: ["اليوم", "الحصة", "المقرر", "الصف", "الشعبة"],
            cells: ["الأحد", "1", "الرياضيات", "الصف الأول المتوسط", "1"],
          },
          {
            headers: ["اليوم", "الحصة", "المقرر", "الصف", "الشعبة"],
            cells: ["الأحد", "1", "الرياضيات", "الصف الأول المتوسط", "1"],
          },
        ],
      }),
    );

    assert.equal(result.entries.length, 1);
  });

  it("preserves the same subject in different slots", () => {
    const result = extractMadrasatiTimetable(
      snapshot({
        tableRows: [
          {
            headers: ["اليوم", "الحصة", "المقرر", "الصف", "الشعبة"],
            cells: ["الأحد", "1", "الرياضيات", "الصف الأول المتوسط", "1"],
          },
          {
            headers: ["اليوم", "الحصة", "المقرر", "الصف", "الشعبة"],
            cells: ["الأحد", "2", "الرياضيات", "الصف الأول المتوسط", "1"],
          },
        ],
      }),
    );

    assert.equal(result.entries.length, 2);
    assert.deepEqual(
      result.entries.map((entry) => entry.period),
      [1, 2],
    );
  });

  it("preserves the same period with different classes", () => {
    const result = extractMadrasatiTimetable(
      snapshot({
        tableRows: [
          {
            headers: ["اليوم", "الحصة", "المقرر", "الصف", "الشعبة"],
            cells: ["الأحد", "1", "الرياضيات", "الصف الأول المتوسط", "1"],
          },
          {
            headers: ["اليوم", "الحصة", "المقرر", "الصف", "الشعبة"],
            cells: ["الأحد", "1", "العلوم", "الصف الأول المتوسط", "2"],
          },
        ],
      }),
    );

    assert.equal(result.entries.length, 2);
    assert.deepEqual(
      result.entries.map((entry) => entry.className),
      ["1", "2"],
    );
  });

  it("never treats الفصل الدراسي as className", () => {
    const result = extractMadrasatiTimetable(
      snapshot({
        text: "جدولي\nالفصل الدراسي الأول",
        labeledValues: [{ label: "الفصل الدراسي", value: "الأول" }],
        tableRows: [
          {
            headers: ["اليوم", "الحصة", "المقرر", "الصف", "الفصل الدراسي"],
            cells: ["الأحد", "1", "الرياضيات", "الصف الأول المتوسط", "الأول"],
          },
        ],
      }),
    );

    assert.equal(result.status, "unavailable");
    assert.deepEqual(result.entries, []);
  });

  it("fails closed when a period cannot be identified", () => {
    const result = extractMadrasatiTimetable(
      snapshot({
        tableRows: [
          {
            headers: ["اليوم", "المقرر", "الصف", "الشعبة"],
            cells: ["الأحد", "الرياضيات", "الصف الأول المتوسط", "1"],
          },
        ],
      }),
    );

    assert.equal(result.status, "unavailable");
    assert.deepEqual(result.entries, []);
  });

  it("fails closed when a subject cannot be identified", () => {
    const result = extractMadrasatiTimetable(
      snapshot({
        tableRows: [
          {
            headers: ["اليوم", "الحصة", "الصف", "الشعبة"],
            cells: ["الأحد", "1", "الصف الأول المتوسط", "1"],
          },
        ],
      }),
    );

    assert.equal(result.status, "unavailable");
    assert.deepEqual(result.entries, []);
  });

  it("fails closed on an unreadable teacher home that only has جدولي as navigation", () => {
    const result = extractMadrasatiTimetable({
      url: "https://schools.madrasati.sa/",
      title: "مدرستي",
      text: "مرحباً، معلم الاختبار\nجدولي\nالمقررات والمصادر\nالواجبات\nالفصل الدراسي الأول",
      accessibleNames: ["جدولي", "المقررات والمصادر", "تسجيل الخروج"],
      labeledValues: [{ label: "الفصل الدراسي", value: "الأول" }],
      tableRows: [],
    });

    assert.equal(result.status, "unavailable");
    assert.deepEqual(result.entries, []);
  });

  it("returns a confirmed empty timetable instead of inventing entries", () => {
    const result = extractMadrasatiTimetable(
      snapshot({
        title: "جدولي",
        text: "جدولي\nلا توجد حصص",
      }),
    );

    assert.equal(result.status, "empty");
    assert.deepEqual(result.entries, []);
  });

  it("reads a weekly grid without inventing empty cells", () => {
    const result = extractMadrasatiTimetable(
      snapshot({
        tableRows: [
          {
            headers: ["الحصة", "الأحد", "الاثنين"],
            cells: [
              "الأولى",
              "الرياضيات / الصف الأول المتوسط / 1",
              "العلوم / الصف الأول المتوسط / 2",
            ],
          },
          {
            headers: ["الحصة", "الأحد", "الاثنين"],
            cells: ["الثانية", "-", "اللغة العربية الصف الأول المتوسط 1"],
          },
        ],
      }),
    );

    assert.equal(result.status, "found");
    assert.equal(result.entries.length, 3);
    assert.equal(result.entries[0]?.dayOfWeek, 0);
    assert.equal(result.entries[0]?.period, 1);
    assert.equal(result.entries[1]?.dayOfWeek, 1);
    assert.equal(result.entries[2]?.period, 2);
    assert.equal(result.entries[2]?.subject, "اللغة العربية");
  });
});
