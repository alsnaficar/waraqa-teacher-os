/**
 * Weekly preparation date helpers.
 *
 * Convention (timezone-safe):
 * - Dates are calendar YYYY-MM-DD strings interpreted as **UTC midnight**
 *   (`${iso}T00:00:00Z`), matching `todayIso()` and reports week Sunday math.
 * - Does **not** use local timezone offsets (avoids day shifts across regions).
 * - School week = Sunday (0) through Thursday (4). Friday/Saturday are excluded.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function assertIsoDate(value: string, label: string): void {
  if (!ISO_DATE.test(value)) {
    throw new Error(`${label} must be YYYY-MM-DD, got: ${value}`);
  }
}

function parseUtcIsoDate(iso: string): Date {
  assertIsoDate(iso, "date");
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ISO date: ${iso}`);
  }
  return date;
}

function toUtcIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Sunday YYYY-MM-DD of the UTC week that contains `anchorIso`. */
export function resolveSchoolWeekStart(anchorIso: string): string {
  const anchor = parseUtcIsoDate(anchorIso);
  const sunday = new Date(anchor);
  sunday.setUTCDate(anchor.getUTCDate() - anchor.getUTCDay());
  return toUtcIsoDate(sunday);
}

/**
 * Exactly five school dates from a Sunday week start: Sun → Thu.
 * Throws if `weekStartIso` is not a Sunday.
 */
export function schoolWeekDatesFromSunday(weekStartIso: string): string[] {
  const start = parseUtcIsoDate(weekStartIso);
  if (start.getUTCDay() !== 0) {
    throw new Error(`weekStartIso must be a Sunday (UTC), got: ${weekStartIso}`);
  }

  const dates: string[] = [];
  for (let offset = 0; offset < 5; offset += 1) {
    const day = new Date(start);
    day.setUTCDate(start.getUTCDate() + offset);
    dates.push(toUtcIsoDate(day));
  }
  return dates;
}

/** Move a Sunday week start by `offset` weeks (−1 / +1 → ±7 days). */
export function shiftSchoolWeek(weekStartIso: string, offset: number): string {
  const start = parseUtcIsoDate(weekStartIso);
  if (start.getUTCDay() !== 0) {
    throw new Error(`weekStartIso must be a Sunday (UTC), got: ${weekStartIso}`);
  }
  if (!Number.isInteger(offset)) {
    throw new Error(`offset must be an integer, got: ${offset}`);
  }

  const shifted = new Date(start);
  shifted.setUTCDate(start.getUTCDate() + offset * 7);
  return toUtcIsoDate(shifted);
}

export const SCHOOL_WEEK_DAY_LABELS = [
  "الأحد",
  "الاثنين",
  "الثلاثاء",
  "الأربعاء",
  "الخميس",
] as const;
