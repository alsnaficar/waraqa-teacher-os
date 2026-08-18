import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  extractMadrasatiTeacher,
  sanitizePageLandmarks,
} from "./madrasati-teacher-profile.ts";

describe("Madrasati teacher profile extraction", () => {
  it("reads teacher identity from the authenticated home greeting and labels", () => {
    const teacher = extractMadrasatiTeacher({
      url: "https://schools.madrasati.sa/",
      title: "مدرستي",
      text: "مرحباً، معلم الاختبار\nجدولي\nالمقررات والمصادر\nالواجبات\nالعام الدراسي 1447\nالفصل الدراسي الأول",
      accessibleNames: ["جدولي", "المقررات والمصادر", "تسجيل الخروج"],
      labeledValues: [
        { label: "المدرسة", value: "مدرسة الاختبار الأهلية" },
        { label: "العام الدراسي", value: "1447" },
        { label: "الفصل الدراسي", value: "الأول" },
      ],
    });

    assert.deepEqual(teacher, {
      displayName: "معلم الاختبار",
      schoolName: "مدرسة الاختبار الأهلية",
      academicYear: "1447",
      semester: "1",
    });
  });

  it("reads the name from labeled profile fields when no greeting is present", () => {
    const teacher = extractMadrasatiTeacher({
      url: "https://schools.madrasati.sa/Profile",
      title: "الملف الشخصي",
      text: "تعديل بياناتي",
      accessibleNames: ["تعديل بياناتي", "الرئيسية"],
      labeledValues: [
        { label: "الاسم", value: "معلم الاختبار" },
        { label: "اسم المدرسة", value: "مدرسة الاختبار الأهلية" },
      ],
    });

    assert.equal(teacher?.displayName, "معلم الاختبار");
    assert.equal(teacher?.schoolName, "مدرسة الاختبار الأهلية");
  });

  it("composes first and family name when the full name is absent", () => {
    const teacher = extractMadrasatiTeacher({
      url: "https://schools.madrasati.sa/Profile",
      title: "الملف الشخصي",
      text: "بياناتي",
      accessibleNames: [],
      labeledValues: [
        { label: "الاسم الأول", value: "معلم" },
        { label: "اسم العائلة", value: "الاختبار" },
      ],
    });

    assert.equal(teacher?.displayName, "معلم الاختبار");
  });

  it("fails closed on Microsoft login and navigation-only pages", () => {
    assert.equal(
      extractMadrasatiTeacher({
        url: "https://login.microsoftonline.com/",
        title: "Sign in",
        text: "Sign in to your account",
        accessibleNames: ["Next"],
        labeledValues: [],
      }),
      null,
    );

    assert.equal(
      extractMadrasatiTeacher({
        url: "https://schools.madrasati.sa/",
        title: "مدرستي",
        text: "جدولي المقررات الواجبات تسجيل الخروج",
        accessibleNames: ["جدولي", "المقررات", "تسجيل الخروج"],
        labeledValues: [],
      }),
      null,
    );
  });

  it("does not treat national ids, emails, or cookies as the teacher name", () => {
    const teacher = extractMadrasatiTeacher({
      url: "https://schools.madrasati.sa/",
      title: "مدرستي",
      text: "مرحباً، معلم الاختبار",
      accessibleNames: [],
      labeledValues: [
        { label: "الاسم", value: "1098765432" },
        { label: "البريد", value: "teacher@example.com" },
      ],
    });

    assert.equal(teacher?.displayName, "معلم الاختبار");
    assert.equal("externalId" in (teacher ?? {}), false);
  });

  it("strips oversized landmark payloads without keeping HTML-like fields", () => {
    const sanitized = sanitizePageLandmarks({
      url: "https://schools.madrasati.sa/",
      title: "مدرستي",
      text: "مرحباً، معلم الاختبار",
      accessibleNames: ["جدولي", "جدولي", ""],
      labeledValues: [{ label: "الاسم", value: "معلم الاختبار" }],
    });

    assert.deepEqual(Object.keys(sanitized).sort(), [
      "accessibleNames",
      "labeledValues",
      "tableRows",
      "text",
      "title",
      "url",
    ]);
    assert.deepEqual(sanitized.accessibleNames, ["جدولي"]);
    assert.equal("html" in sanitized, false);
    assert.equal("cookies" in sanitized, false);
  });
});
