export type DayKey = "sun" | "mon" | "tue" | "wed" | "thu";

export type Lesson = {
  id: string;
  day: DayKey;
  period: number;
  grade: string;
  klass: string;
  title: string;
};

export const DAYS: { key: DayKey; label: string }[] = [
  { key: "sun", label: "الأحد" },
  { key: "mon", label: "الاثنين" },
  { key: "tue", label: "الثلاثاء" },
  { key: "wed", label: "الأربعاء" },
  { key: "thu", label: "الخميس" },
];

export const PERIOD_LABELS = [
  "الحصة الأولى",
  "الحصة الثانية",
  "الحصة الثالثة",
  "الحصة الرابعة",
  "الحصة الخامسة",
  "الحصة السادسة",
  "الحصة السابعة",
];

export const PERIOD_TIMES = [
  "7:00 - 7:45",
  "7:50 - 8:35",
  "8:40 - 9:25",
  "9:40 - 10:25",
  "10:30 - 11:15",
  "11:20 - 12:05",
  "12:10 - 12:55",
];

export const PERIODS = [1, 2, 3, 4, 5, 6, 7];
