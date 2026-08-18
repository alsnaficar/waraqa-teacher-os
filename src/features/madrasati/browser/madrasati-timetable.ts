import type { MadrasatiTimetableEntry } from "../provider/models.ts";
import {
  findGradeInText,
  isClassNameValue,
  isGradeValue,
  isSubjectName,
  normalizeHeader,
} from "./madrasati-catalog.ts";
import { sanitizePageLandmarks, type MadrasatiPageLandmarks } from "./madrasati-teacher-profile.ts";

export const MADRASATI_TIMETABLE_UNAVAILABLE_CODE = "TIMETABLE_UNAVAILABLE" as const;

export const MADRASATI_TIMETABLE_UNAVAILABLE_MESSAGE =
  "تعذر قراءة الجدول من صفحة جدولي في مدرستي.";

export type MadrasatiTimetableExtractionStatus = "found" | "empty" | "unavailable";

export type MadrasatiTimetableExtraction = {
  readonly status: MadrasatiTimetableExtractionStatus;
  readonly entries: readonly MadrasatiTimetableEntry[];
};

/**
 * Matches teacher-timetable.constants.ts TIMETABLE_DAYS (Sunday = 0).
 * Do not invent a second mapping.
 */
const ARABIC_DAY_TO_WEEKDAY: Record<string, number> = {
  الأحد: 0,
  الاحد: 0,
  الاثنين: 1,
  الإثنين: 1,
  الثلاثاء: 2,
  الأربعاء: 3,
  الاربعاء: 3,
  الخميس: 4,
  الجمعة: 5,
  السبت: 6,
};

const PERIOD_ORDINALS = [
  "الأولى",
  "الثانية",
  "الثالثة",
  "الرابعة",
  "الخامسة",
  "السادسة",
  "السابعة",
  "الثامنة",
  "التاسعة",
  "العاشرة",
  "الحادية عشرة",
  "الثانية عشرة",
] as const;

const EMPTY_TIMETABLE_PHRASES = [
  "لا يوجد جدول",
  "لا توجد حصص",
  "لا يوجد حصص",
  "الجدول فارغ",
  "لا توجد بيانات",
  "لا يوجد بيانات",
] as const;

const TIMETABLE_TITLE_PHRASES = ["جدولي", "الجدول الدراسي", "جدول الحصص"] as const;

const DAY_LABELS = Object.keys(ARABIC_DAY_TO_WEEKDAY);

function collapse(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function headerMatches(header: string, needle: string): boolean {
  const normalizedHeader = normalizeHeader(header);
  const normalizedNeedle = normalizeHeader(needle);

  if (normalizedHeader === "الفصل الدراسي" && normalizedNeedle !== "الفصل الدراسي") {
    return false;
  }

  if (normalizedNeedle.length <= 2) {
    return normalizedHeader === normalizedNeedle;
  }

  return (
    normalizedHeader === normalizedNeedle || normalizedHeader.includes(normalizedNeedle)
  );
}

function headerIndex(headers: readonly string[], needles: readonly string[]): number {
  return headers.findIndex((header) => needles.some((needle) => headerMatches(header, needle)));
}

function isDayLabel(value: string): boolean {
  const text = collapse(value);
  return DAY_LABELS.some((day) => text === day || text.startsWith(`${day} `));
}

function parseDayOfWeek(value: string): number | null {
  const text = collapse(value);
  if (!text) {
    return null;
  }

  for (const [label, day] of Object.entries(ARABIC_DAY_TO_WEEKDAY)) {
    if (text === label || text.startsWith(`${label} `)) {
      return day;
    }
  }

  return null;
}

function parsePeriod(value: string): number | null {
  const text = collapse(value);
  if (!text || isGradeValue(text) || /الفصل الدراسي/.test(text)) {
    return null;
  }

  for (let index = 0; index < PERIOD_ORDINALS.length; index += 1) {
    const ordinal = PERIOD_ORDINALS[index];
    if (
      text === ordinal ||
      text === `الحصة ${ordinal}` ||
      text === `الحصة${ordinal}` ||
      text.endsWith(`الحصة ${ordinal}`)
    ) {
      return index + 1;
    }
  }

  const labeledNumber = text.match(/^الحصة\s*(\d{1,2})$/);
  if (labeledNumber) {
    const period = Number(labeledNumber[1]);
    return period >= 1 && period <= 12 ? period : null;
  }

  if (/^\d{1,2}$/.test(text)) {
    const period = Number(text);
    return period >= 1 && period <= 12 ? period : null;
  }

  return null;
}

function parseTime(value: string): string | undefined {
  const match = collapse(value).match(/^(\d{1,2}):(\d{2})(?:\s*([صم]))?$/);
  if (!match) {
    const embedded = collapse(value).match(/(\d{1,2}):(\d{2})(?:\s*([صم]))?/);
    if (!embedded) {
      return undefined;
    }
    return normalizeClock(embedded[1], embedded[2], embedded[3]);
  }

  return normalizeClock(match[1], match[2], match[3]);
}

function normalizeClock(
  hourText: string | undefined,
  minuteText: string | undefined,
  meridian: string | undefined,
): string | undefined {
  if (!hourText || !minuteText) {
    return undefined;
  }

  let hours = Number(hourText);
  const minutes = Number(minuteText);

  if (meridian === "م" && hours < 12) {
    hours += 12;
  }
  if (meridian === "ص" && hours === 12) {
    hours = 0;
  }

  if (!Number.isInteger(hours) || hours > 23 || minutes > 59) {
    return undefined;
  }

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function parseTimeRange(value: string): { startsAt?: string; endsAt?: string } {
  const matches = [...collapse(value).matchAll(/(\d{1,2}:\d{2}(?:\s*[صم])?)/g)].map(
    (match) => match[1],
  );
  if (matches.length === 0) {
    return {};
  }

  const startsAt = parseTime(matches[0] ?? "");
  const endsAt = matches[1] ? parseTime(matches[1]) : undefined;
  return {
    ...(startsAt ? { startsAt } : {}),
    ...(endsAt ? { endsAt } : {}),
  };
}

function looksLikeClassroom(value: string): boolean {
  const text = collapse(value);
  if (!text || /الفصل الدراسي/.test(text) || isGradeValue(text) || isSubjectName(text)) {
    return false;
  }

  if (/^(?:\d{1,3}|[أ-ي])$/.test(text)) {
    return false;
  }

  return /قاعة|غرفة|المكان|قاعة الدرس|^[أ-يA-Za-z]-?\d+[أ-يA-Za-z0-9-]*$/.test(text);
}

function isSemesterText(value: string): boolean {
  return /الفصل الدراسي/.test(collapse(value));
}

function parseLabeledValue(text: string, labels: readonly string[]): string | undefined {
  for (const label of labels) {
    if (label === "الفصل" && /الفصل الدراسي/.test(text)) {
      continue;
    }

    const match = text.match(new RegExp(`${label}\\s*[:：]\\s*([^/|\\n]+)`));
    if (match) {
      const value = collapse(match[1] ?? "");
      if (value && !isSemesterText(value)) {
        return value;
      }
    }
  }

  return undefined;
}

function parseClassName(value: string | undefined): string | undefined {
  if (!value || isSemesterText(value) || looksLikeClassroom(value)) {
    return undefined;
  }

  const trimmed = collapse(value).replace(/^(?:الشعبة|شعبة|الفصل|فصل)\s*/u, "");
  return isClassNameValue(trimmed) ? collapse(trimmed) : undefined;
}

function splitTrailingClass(value: string): { subject?: string; className?: string } {
  const text = collapse(value);
  const parts = text.split(" ").filter((part) => part && part !== "/" && part !== "|");
  if (parts.length < 2) {
    return {
      ...(isSubjectName(text) ? { subject: text } : {}),
    };
  }

  const last = parts[parts.length - 1] ?? "";
  const head = collapse(parts.slice(0, -1).join(" "));
  const className = parseClassName(last);

  if (className && isSubjectName(head)) {
    return { subject: head, className };
  }

  return {
    ...(isSubjectName(text) ? { subject: text } : {}),
  };
}

function parseLessonFields(raw: string): {
  subject?: string;
  grade?: string;
  className?: string;
  classroom?: string;
  startsAt?: string;
  endsAt?: string;
} {
  const text = collapse(raw);
  if (!text) {
    return {};
  }

  const labeledSubject = parseLabeledValue(text, ["اسم المقرر", "المادة", "المقرر"]);
  const labeledGrade = parseLabeledValue(text, ["الصف الدراسي", "الصف"]);
  const labeledClass = parseLabeledValue(text, ["الشعبة", "الفصل"]);
  const labeledClassroom = parseLabeledValue(text, ["قاعة الدرس", "قاعة", "الغرفة", "المكان"]);
  const times = parseTimeRange(text);
  const gradeFromText = findGradeInText(text);
  const withoutGrade = gradeFromText ? collapse(text.replace(gradeFromText, " ")) : text;

  const tokens = withoutGrade
    .split(/[/|،\n]+/)
    .flatMap((token) => collapse(token).split(/\s{2,}/))
    .map((token) => collapse(token))
    .filter(Boolean);

  const trailing = splitTrailingClass(withoutGrade);

  const subject =
    labeledSubject && isSubjectName(labeledSubject)
      ? labeledSubject
      : trailing.subject ??
        tokens.find(
          (token) =>
            isSubjectName(token) &&
            !isGradeValue(token) &&
            !isSemesterText(token) &&
            !parseClassName(token),
        );

  const grade =
    labeledGrade && isGradeValue(labeledGrade)
      ? labeledGrade
      : gradeFromText && isGradeValue(gradeFromText)
        ? gradeFromText
        : tokens.find((token) => isGradeValue(token));

  const className =
    parseClassName(labeledClass) ??
    tokens.map((token) => parseClassName(token)).find(Boolean) ??
    trailing.className;

  const classroom =
    labeledClassroom && looksLikeClassroom(labeledClassroom)
      ? labeledClassroom
      : tokens.find((token) => looksLikeClassroom(token));

  return {
    ...(subject ? { subject } : {}),
    ...(grade ? { grade } : {}),
    ...(className ? { className } : {}),
    ...(classroom ? { classroom } : {}),
    ...times,
  };
}

function timetableIdentity(entry: MadrasatiTimetableEntry): string {
  return [
    entry.dayOfWeek,
    entry.period,
    entry.subject,
    entry.grade,
    entry.className,
    entry.classroom ?? "",
  ].join("|");
}

function dedupeEntries(entries: readonly MadrasatiTimetableEntry[]): MadrasatiTimetableEntry[] {
  const seen = new Set<string>();
  const unique: MadrasatiTimetableEntry[] = [];

  for (const entry of entries) {
    const identity = timetableIdentity(entry);
    if (seen.has(identity)) {
      continue;
    }
    seen.add(identity);
    unique.push(entry);
  }

  return unique;
}

function toEntry(partial: {
  dayOfWeek: number | null;
  period: number | null;
  subject?: string;
  grade?: string;
  className?: string;
  classroom?: string;
  startsAt?: string;
  endsAt?: string;
}): MadrasatiTimetableEntry | null {
  if (
    partial.dayOfWeek == null ||
    partial.period == null ||
    !partial.subject ||
    !partial.grade ||
    !partial.className
  ) {
    return null;
  }

  return {
    dayOfWeek: partial.dayOfWeek,
    period: partial.period,
    subject: partial.subject,
    grade: partial.grade,
    className: partial.className,
    ...(partial.classroom ? { classroom: partial.classroom } : {}),
    ...(partial.startsAt ? { startsAt: partial.startsAt } : {}),
    ...(partial.endsAt ? { endsAt: partial.endsAt } : {}),
  };
}

function isDayGrid(headers: readonly string[]): boolean {
  return headers.some((header) => isDayLabel(header));
}

function parseListRow(
  headers: readonly string[],
  cells: readonly string[],
): MadrasatiTimetableEntry | null {
  if (isDayGrid(headers)) {
    return null;
  }

  const dayIndex = headerIndex(headers, ["اليوم"]);
  const periodIndex = headerIndex(headers, ["الحصة", "الفترة"]);
  const subjectIndex = headerIndex(headers, ["اسم المقرر", "المقرر", "المادة"]);
  const gradeIndex = headerIndex(headers, ["الصف الدراسي", "الصف"]);
  const classIndex = headerIndex(headers, ["اسم الشعبة", "الشعبة", "اسم الفصل", "الفصل"]);
  const classroomIndex = headerIndex(headers, ["قاعة الدرس", "قاعة", "الغرفة", "المكان"]);
  const startIndex = headerIndex(headers, ["من", "البداية"]);
  const endIndex = headerIndex(headers, ["إلى", "الى", "النهاية"]);
  const timeIndex = headerIndex(headers, ["الوقت"]);

  const ignored = new Set(
    [dayIndex, periodIndex, startIndex, endIndex, timeIndex].filter((index) => index >= 0),
  );
  const lesson = parseLessonFields(
    cells.filter((_, index) => !ignored.has(index)).join(" / "),
  );
  const subjectFromHeader =
    subjectIndex >= 0 && isSubjectName(cells[subjectIndex] ?? "")
      ? collapse(cells[subjectIndex] ?? "")
      : undefined;
  const gradeFromHeader =
    gradeIndex >= 0 && isGradeValue(cells[gradeIndex] ?? "")
      ? collapse(cells[gradeIndex] ?? "")
      : undefined;
  const classFromHeader = classIndex >= 0 ? parseClassName(cells[classIndex]) : undefined;
  const classroomFromHeader =
    classroomIndex >= 0 && looksLikeClassroom(cells[classroomIndex] ?? "")
      ? collapse(cells[classroomIndex] ?? "")
      : undefined;

  return toEntry({
    dayOfWeek: dayIndex >= 0 ? parseDayOfWeek(cells[dayIndex] ?? "") : parseDayOfWeek(cells[0] ?? ""),
    period: periodIndex >= 0 ? parsePeriod(cells[periodIndex] ?? "") : null,
    subject: subjectFromHeader ?? lesson.subject,
    grade: gradeFromHeader ?? lesson.grade,
    className: classFromHeader ?? lesson.className,
    classroom: classroomFromHeader ?? lesson.classroom,
    startsAt:
      (startIndex >= 0 ? parseTime(cells[startIndex] ?? "") : undefined) ??
      (timeIndex >= 0 ? parseTimeRange(cells[timeIndex] ?? "").startsAt : undefined) ??
      lesson.startsAt,
    endsAt:
      (endIndex >= 0 ? parseTime(cells[endIndex] ?? "") : undefined) ??
      (timeIndex >= 0 ? parseTimeRange(cells[timeIndex] ?? "").endsAt : undefined) ??
      lesson.endsAt,
  });
}

function parseGridRows(
  rows: readonly { headers: readonly string[]; cells: readonly string[] }[],
): MadrasatiTimetableEntry[] {
  const headerRow = rows.find((row) => isDayGrid(row.headers));
  if (!headerRow) {
    return [];
  }

  const dayColumns = headerRow.headers
    .map((header, index) => ({ index, dayOfWeek: parseDayOfWeek(header) }))
    .filter((column): column is { index: number; dayOfWeek: number } => column.dayOfWeek != null);

  if (dayColumns.length === 0) {
    return [];
  }

  const entries: MadrasatiTimetableEntry[] = [];

  for (const row of rows) {
    if (row.headers.join("|") !== headerRow.headers.join("|")) {
      continue;
    }

    const periodCell = row.cells[0] ?? "";
    const period = parsePeriod(periodCell);
    if (period == null) {
      continue;
    }

    for (const column of dayColumns) {
      const cell = row.cells[column.index] ?? "";
      if (!collapse(cell) || collapse(cell) === "-") {
        continue;
      }

      const lesson = parseLessonFields(cell);
      const entry = toEntry({
        dayOfWeek: column.dayOfWeek,
        period,
        subject: lesson.subject,
        grade: lesson.grade,
        className: lesson.className,
        classroom: lesson.classroom,
        startsAt: lesson.startsAt,
        endsAt: lesson.endsAt,
      });

      if (entry) {
        entries.push(entry);
      }
    }
  }

  return entries;
}

function pageHaystack(landmarks: MadrasatiPageLandmarks): string {
  return `${landmarks.title}\n${landmarks.text}`;
}

function isTimetablePage(landmarks: MadrasatiPageLandmarks): boolean {
  if (
    (landmarks.tableRows ?? []).some(
      (row) =>
        isDayGrid(row.headers) ||
        (headerIndex(row.headers, ["اليوم"]) >= 0 &&
          headerIndex(row.headers, ["الحصة", "الفترة"]) >= 0),
    )
  ) {
    return true;
  }

  const title = collapse(landmarks.title);
  return TIMETABLE_TITLE_PHRASES.some((phrase) => title.includes(phrase));
}

function isConfirmedEmptyTimetable(landmarks: MadrasatiPageLandmarks): boolean {
  if (!isTimetablePage(landmarks)) {
    return false;
  }

  const haystack = pageHaystack(landmarks);
  return EMPTY_TIMETABLE_PHRASES.some((phrase) => haystack.includes(phrase));
}

/**
 * Maps a جدولي snapshot to normalized timetable entries.
 * Fail-closed unless slots can be read or the timetable is confirmed empty.
 */
export function extractMadrasatiTimetable(
  snapshot: MadrasatiPageLandmarks,
): MadrasatiTimetableExtraction {
  const landmarks = sanitizePageLandmarks(snapshot);
  const listEntries = (landmarks.tableRows ?? [])
    .map((row) => parseListRow(row.headers, row.cells))
    .filter((entry): entry is MadrasatiTimetableEntry => entry != null);
  const entries = dedupeEntries([...listEntries, ...parseGridRows(landmarks.tableRows ?? [])]);

  if (entries.length > 0) {
    return { status: "found", entries };
  }

  if (isConfirmedEmptyTimetable(landmarks)) {
    return { status: "empty", entries: [] };
  }

  return { status: "unavailable", entries: [] };
}
