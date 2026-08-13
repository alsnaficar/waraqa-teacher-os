/**
 * Pure academic calendar validation (no DB / no path aliases).
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function assertValidDateRange(startDate: string, endDate: string): void {
  if (!isIsoDate(startDate) || !isIsoDate(endDate)) {
    throw new Error("التواريخ يجب أن تكون بصيغة YYYY-MM-DD.");
  }
  if (startDate > endDate) {
    throw new Error("تاريخ البداية يجب أن يكون قبل أو يساوي تاريخ النهاية.");
  }
}

export function assertSemesterWithinAcademicYear(options: {
  semesterStart: string;
  semesterEnd: string;
  yearStart: string;
  yearEnd: string;
}): void {
  assertValidDateRange(options.semesterStart, options.semesterEnd);
  assertValidDateRange(options.yearStart, options.yearEnd);

  if (options.semesterStart < options.yearStart || options.semesterEnd > options.yearEnd) {
    throw new Error("فترة الفصل يجب أن تكون ضمن حدود السنة الدراسية.");
  }
}

export function normalizeCalendarLabel(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) {
    throw new Error("الاسم مطلوب.");
  }
  if (trimmed.length > 120) {
    throw new Error("الاسم طويل جداً.");
  }
  return trimmed;
}
