/**
 * Minimal lesson catalog grouped by unit.
 *
 * Static mock data used by the inline lesson selector in the Planner.
 * Structure mirrors what a Google Drive / distribution document would
 * eventually provide, so the UI contract stays stable.
 */

export interface CatalogLesson {
  title: string;
}

export interface CatalogUnit {
  title: string;
  lessons: CatalogLesson[];
}

const DEFAULT_UNITS: CatalogUnit[] = [
  {
    title: "الوحدة الأولى",
    lessons: [
      { title: "مدخل الوحدة" },
      { title: "نص الانطلاق" },
      { title: "حروف الجر" },
      { title: "الاسم المجرور" },
      { title: "المفعول به" },
      { title: "تطبيقات لغوية" },
    ],
  },
  {
    title: "الوحدة الثانية",
    lessons: [
      { title: "مدخل الوحدة" },
      { title: "النص الشعري" },
      { title: "الفاعل" },
      { title: "نائب الفاعل" },
      { title: "مراجعة" },
      { title: "اختبار قصير" },
    ],
  },
  {
    title: "الوحدة الثالثة",
    lessons: [
      { title: "مدخل الوحدة" },
      { title: "النص المعلوماتي" },
      { title: "الجملة الاسمية" },
      { title: "الجملة الفعلية" },
      { title: "تدريبات إملائية" },
    ],
  },
];

export function getLessonCatalog(_params: {
  stage?: string;
  grade?: string;
  subject?: string;
}): CatalogUnit[] {
  // Single catalog for now; keyed lookup can be added later without
  // changing callers.
  return DEFAULT_UNITS;
}
