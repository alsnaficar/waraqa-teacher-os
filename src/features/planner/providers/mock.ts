/**
 * Mock schedule provider — returns a static weekly timetable.
 *
 * Used until a real provider (e.g. Google Drive) is wired up. The Planner
 * depends only on the ScheduleProvider contract, so swapping providers
 * requires no UI changes.
 */

import { startOfWeekSunday, addDays } from "@/shared/utils/date";
import type {
  GetDayOptions,
  GetWeekOptions,
  ScheduleDayKey,
  ScheduleEntry,
  ScheduleProvider,
} from "../types";

const DAY_INDEX: Record<ScheduleDayKey, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
};

function toGregorianISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function toHijriISO(d: Date): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US-u-ca-islamic-umalqura", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(d);
    const y = parts.find((p) => p.type === "year")?.value ?? "";
    const m = parts.find((p) => p.type === "month")?.value ?? "";
    const day = parts.find((p) => p.type === "day")?.value ?? "";
    return `${y}-${m}-${day}`;
  } catch {
    return "";
  }
}

// Static weekly template — same slots every week for now.
const TEMPLATE: Array<Omit<ScheduleEntry, "id" | "hijriDate" | "gregorianDate" | "week">> = [
  {
    day: "sun",
    period: 1,
    stage: "intermediate",
    grade: "الصف الأول المتوسط",
    subject: "اللغة العربية",
    lessonTitle: "نص الانطلاق: زراعة اللؤلؤ",
    klass: "1",
  },
  {
    day: "sun",
    period: 2,
    stage: "intermediate",
    grade: "الصف الثاني المتوسط",
    subject: "اللغة العربية",
    lessonTitle: "الفهم القرائي: الصدقة والكوب",
    klass: "2",
  },
  {
    day: "sun",
    period: 3,
    stage: "intermediate",
    grade: "الصف الثالث المتوسط",
    subject: "اللغة العربية",
    lessonTitle: "إستراتيجية قراءة: قراءة التمشيط",
    klass: "1",
  },
  {
    day: "sun",
    period: 4,
    stage: "intermediate",
    grade: "الصف الأول المتوسط",
    subject: "اللغة العربية",
    lessonTitle: "الصنف اللغوي: الأفعال الناسخة",
    klass: "2",
  },
  {
    day: "sun",
    period: 5,
    stage: "intermediate",
    grade: "الصف الثاني المتوسط",
    subject: "اللغة العربية",
    lessonTitle: "الأسلوب اللغوي: الجملة الخبرية المنفية",
    klass: "1",
  },
  {
    day: "sun",
    period: 6,
    stage: "intermediate",
    grade: "الصف الثالث المتوسط",
    subject: "اللغة العربية",
    lessonTitle: "الرسم الإملائي: رسم بعض الكلمات الموصولة خطاً",
    klass: "2",
  },
  {
    day: "sun",
    period: 7,
    stage: "intermediate",
    grade: "الصف الأول المتوسط",
    subject: "اللغة العربية",
    lessonTitle: "التواصل الكتابي: كتابة نهاية قصة",
    klass: "3",
  },
  {
    day: "mon",
    period: 1,
    stage: "intermediate",
    grade: "الصف الأول المتوسط",
    subject: "اللغة العربية",
    lessonTitle: "الاسم المجرور",
    klass: "1",
  },
  {
    day: "tue",
    period: 3,
    stage: "intermediate",
    grade: "الصف الأول المتوسط",
    subject: "اللغة العربية",
    lessonTitle: "المفعول به",
    klass: "1",
  },
  {
    day: "wed",
    period: 4,
    stage: "intermediate",
    grade: "الصف الأول المتوسط",
    subject: "اللغة العربية",
    lessonTitle: "مراجعة",
    klass: "1",
  },
  {
    day: "thu",
    period: 6,
    stage: "intermediate",
    grade: "الصف الأول المتوسط",
    subject: "اللغة العربية",
    lessonTitle: "اختبار قصير",
    klass: "1",
  },
];

function weekNumber(weekStart: Date): number {
  // Simple week-of-year approximation for mock data.
  const start = new Date(weekStart.getFullYear(), 0, 1);
  const diff = (weekStart.getTime() - start.getTime()) / 86400000;
  return Math.floor(diff / 7) + 1;
}

function buildWeek(weekOf: Date): ScheduleEntry[] {
  const weekStart = startOfWeekSunday(weekOf);
  const wk = weekNumber(weekStart);
  return TEMPLATE.map((t) => {
    const date = addDays(weekStart, DAY_INDEX[t.day]);
    return {
      ...t,
      id: `${toGregorianISO(date)}-p${t.period}`,
      week: wk,
      gregorianDate: toGregorianISO(date),
      hijriDate: toHijriISO(date),
    };
  });
}

export class MockScheduleProvider implements ScheduleProvider {
  readonly id = "mock" as const;

  async getWeek({ weekOf }: GetWeekOptions): Promise<ScheduleEntry[]> {
    return buildWeek(weekOf);
  }

  async getDay({ gregorianDate }: GetDayOptions): Promise<ScheduleEntry[]> {
    const iso = toGregorianISO(gregorianDate);
    return buildWeek(gregorianDate).filter((e) => e.gregorianDate === iso);
  }
}
