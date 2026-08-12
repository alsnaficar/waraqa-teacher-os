import type {
  MadrasatiClass,
  MadrasatiSubject,
  MadrasatiTeacher,
  MadrasatiTimetableEntry,
} from "../provider/models.ts";

/**
 * Fixture data for the mock Madrasati provider.
 * Keep all demo payloads here so application code stays free of scattered hard-codes.
 */
export const MOCK_MADRASATI_TEACHER: MadrasatiTeacher = {
  displayName: "معلم تجريبي",
  externalId: "mock-teacher-001",
  schoolName: "مدرسة ورقاء التجريبية",
  academicYear: "1447",
  semester: "1",
};

export const MOCK_MADRASATI_SUBJECTS: MadrasatiSubject[] = [
  { name: "لغتي الخالدة", code: "AR" },
  { name: "الرياضيات", code: "MATH" },
  { name: "العلوم", code: "SCI" },
  { name: "التربية الإسلامية", code: "ISLAM" },
];

export const MOCK_MADRASATI_CLASSES: MadrasatiClass[] = [
  { grade: "الصف الأول المتوسط", className: "1", stage: "intermediate" },
  { grade: "الصف الأول المتوسط", className: "2", stage: "intermediate" },
  { grade: "الصف الثاني المتوسط", className: "1", stage: "intermediate" },
];

/** Valid weekly slots used by the mock provider. */
export const MOCK_MADRASATI_TIMETABLE: MadrasatiTimetableEntry[] = [
  {
    dayOfWeek: 0,
    period: 1,
    subject: "لغتي الخالدة",
    grade: "الصف الأول المتوسط",
    className: "1",
    classroom: "أ-101",
  },
  {
    dayOfWeek: 0,
    period: 3,
    subject: "الرياضيات",
    grade: "الصف الأول المتوسط",
    className: "2",
    classroom: "ب-203",
  },
  {
    dayOfWeek: 1,
    period: 2,
    subject: "العلوم",
    grade: "الصف الأول المتوسط",
    className: "1",
  },
  {
    dayOfWeek: 2,
    period: 4,
    subject: "التربية الإسلامية",
    grade: "الصف الثاني المتوسط",
    className: "1",
    classroom: "ج-12",
  },
  {
    dayOfWeek: 3,
    period: 1,
    subject: "لغتي الخالدة",
    grade: "الصف الأول المتوسط",
    className: "2",
  },
  {
    dayOfWeek: 4,
    period: 5,
    subject: "الرياضيات",
    grade: "الصف الثاني المتوسط",
    className: "1",
  },
];

/**
 * Intentionally messy raw rows for normalization tests (duplicates + invalid).
 * Not returned by the mock provider's happy path.
 */
export const MOCK_MADRASATI_TIMETABLE_WITH_ISSUES = [
  ...MOCK_MADRASATI_TIMETABLE,
  // Exact duplicate of first slot
  { ...MOCK_MADRASATI_TIMETABLE[0] },
  // Same day+period as first (slot conflict) with different subject
  {
    dayOfWeek: 0,
    period: 1,
    subject: "العلوم",
    grade: "الصف الأول المتوسط",
    className: "1",
  },
  // Invalid: missing subject
  {
    dayOfWeek: 1,
    period: 4,
    subject: "",
    grade: "الصف الأول المتوسط",
    className: "1",
  },
  // Invalid: bad day
  {
    dayOfWeek: 9,
    period: 2,
    subject: "العلوم",
    grade: "الصف الأول المتوسط",
    className: "1",
  },
  // Invalid: period < 1
  {
    dayOfWeek: 2,
    period: 0,
    subject: "العلوم",
    grade: "الصف الأول المتوسط",
    className: "1",
  },
] as const;
