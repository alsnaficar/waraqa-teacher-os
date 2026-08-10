export const TIMETABLE_DAYS = [
  { value: 0, label: "الأحد" },
  { value: 1, label: "الاثنين" },
  { value: 2, label: "الثلاثاء" },
  { value: 3, label: "الأربعاء" },
  { value: 4, label: "الخميس" },
] as const;

export function getDefaultTimetableDay(): number {
  const today = new Date().getDay();
  return today >= 0 && today <= 4 ? today : 0;
}
