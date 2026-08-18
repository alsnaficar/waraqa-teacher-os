import type { MadrasatiTeacher } from "../provider/models.ts";

export type MadrasatiLabeledValue = {
  readonly label: string;
  readonly value: string;
};

export type MadrasatiTableRow = {
  readonly headers: readonly string[];
  readonly cells: readonly string[];
};

/**
 * Semantic snapshot of a Madrasati page.
 * Must never include HTML, cookies, passwords, or Playwright objects.
 */
export type MadrasatiPageLandmarks = {
  readonly url: string;
  readonly title: string;
  readonly text: string;
  readonly accessibleNames: readonly string[];
  readonly labeledValues: readonly MadrasatiLabeledValue[];
  readonly tableRows?: readonly MadrasatiTableRow[];
};

const NAV_NOISE = [
  "جدولي",
  "المقررات",
  "المقررات والمصادر",
  "الواجبات",
  "الاختبارات",
  "تسجيل الخروج",
  "الرئيسية",
  "الصفحة الرئيسية",
  "لوحة التحكم",
  "قائمة المدارس",
  "قائمة الأبناء",
  "الإعلانات",
  "الفصول",
  "المواد",
  "الملف الشخصي",
  "تعديل بياناتي",
  "حسابي",
  "مدرستي",
  "الكادر التعليمي",
  "التالي",
  "حفظ",
  "إغلاق",
] as const;

const SCHOOL_LABELS = ["اسم المدرسة", "المدرسة"];
const YEAR_LABELS = ["العام الدراسي", "السنة الدراسية"];
const SEMESTER_LABELS = ["الفصل الدراسي", "الفصل"];

const MAX_FIELD = 200;

export const MADRASATI_TEACHER_PROFILE_UNAVAILABLE_CODE =
  "TEACHER_PROFILE_UNAVAILABLE" as const;

export const MADRASATI_TEACHER_PROFILE_UNAVAILABLE_MESSAGE =
  "تعذر قراءة ملف المعلم من الصفحة الرئيسية لمدرستي.";

export function sanitizePageLandmarks(raw: MadrasatiPageLandmarks): MadrasatiPageLandmarks {
  return {
    url: clip(raw.url, 300),
    title: clip(raw.title, MAX_FIELD),
    text: clip(raw.text, 8000),
    accessibleNames: uniqueClipped(raw.accessibleNames, 40),
    labeledValues: raw.labeledValues
      .map((row) => ({
        label: clip(row.label, 80),
        value: clip(row.value, MAX_FIELD),
      }))
      .filter((row) => row.label.length > 0 && row.value.length > 0)
      .slice(0, 40),
    tableRows: (raw.tableRows ?? [])
      .map((row) => ({
        headers: row.headers.map((header) => clip(header, 80)).slice(0, 12),
        cells: row.cells.map((cell) => clip(cell, MAX_FIELD)).slice(0, 12),
      }))
      .filter((row) => row.cells.some((cell) => cell.length > 0))
      .slice(0, 80),
  };
}

/**
 * Maps a semantic Madrasati page snapshot to a teacher profile.
 * Fail-closed: returns null unless a display name can be read.
 */
export function extractMadrasatiTeacher(
  snapshot: MadrasatiPageLandmarks,
): MadrasatiTeacher | null {
  const landmarks = sanitizePageLandmarks(snapshot);
  const firstName = pickLabeled(landmarks.labeledValues, ["الاسم الأول"]);
  const familyName = pickLabeled(landmarks.labeledValues, ["اسم العائلة", "اسم العائله"]);
  const labeledFullName = pickLabeled(landmarks.labeledValues, [
    "اسم المعلم",
    "اسم المستخدم",
    "الاسم الكامل",
    "الاسم",
  ]);
  const displayName =
    firstName && familyName
      ? `${firstName} ${familyName}`.trim()
      : labeledFullName ??
        pickGreetingName(landmarks.text) ??
        pickGreetingName(landmarks.accessibleNames.join("\n")) ??
        pickPersonAccessibleName(landmarks.accessibleNames);

  if (!displayName) {
    return null;
  }

  const teacher: MadrasatiTeacher = {
    displayName,
  };

  const schoolName =
    pickLabeled(landmarks.labeledValues, SCHOOL_LABELS) ??
    pickLabeledFromText(landmarks.text, SCHOOL_LABELS);
  if (schoolName && !isNoise(schoolName)) {
    teacher.schoolName = schoolName;
  }

  const labeledYear = pickLabeled(landmarks.labeledValues, YEAR_LABELS);
  const academicYear = normalizeAcademicYear(
    labeledYear ?? pickLabeledFromText(landmarks.text, YEAR_LABELS) ?? landmarks.text,
  );
  if (academicYear) {
    teacher.academicYear = academicYear;
  }

  const labeledSemester = pickLabeled(landmarks.labeledValues, SEMESTER_LABELS);
  const semester = labeledSemester
    ? mapSemesterToken(labeledSemester)
    : normalizeSemesterFromText(landmarks.text);
  if (semester) {
    teacher.semester = semester;
  }

  return teacher;
}

function pickLabeledFromText(
  text: string,
  labels: readonly string[],
): string | undefined {
  const lines = text
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (let index = 0; index < lines.length - 1; index += 1) {
    const line = lines[index] ?? "";
    if (!labels.some((label) => normalizeLabel(line) === normalizeLabel(label))) {
      continue;
    }

    const value = lines[index + 1] ?? "";
    if (value && !isNoise(value) && !isSensitiveIdentifier(value)) {
      return value;
    }
  }

  return undefined;
}

function pickLabeled(
  rows: readonly MadrasatiLabeledValue[],
  labels: readonly string[],
): string | undefined {
  for (const wanted of labels) {
    const match = rows.find((row) => normalizeLabel(row.label) === normalizeLabel(wanted));
    if (match && !isNoise(match.value) && !isSensitiveIdentifier(match.value)) {
      return match.value.trim();
    }
  }

  return undefined;
}

function pickGreetingName(text: string): string | undefined {
  const match = text.match(/مرحبا.{0,3}[،,]?\s*([^\n|]{3,80})/);
  if (!match?.[1]) {
    return undefined;
  }

  let name = match[1].replace(/[.|•]+$/g, "").trim();

  for (const noise of NAV_NOISE) {
    const index = name.indexOf(noise);
    if (index > 0) {
      name = name.slice(0, index).trim();
    }
  }

  name = name.split(/\s+/).slice(0, 5).join(" ");

  if (!name || isNoise(name) || isSensitiveIdentifier(name)) {
    return undefined;
  }

  return name;
}

function pickPersonAccessibleName(names: readonly string[]): string | undefined {
  const candidates = names.filter((name) => isLikelyPersonName(name));
  if (candidates.length === 1) {
    return candidates[0];
  }
  return undefined;
}

function isLikelyPersonName(value: string): boolean {
  const name = value.trim();
  if (isNoise(name) || isSensitiveIdentifier(name)) {
    return false;
  }

  if (!/^[\u0600-\u06FF\s]+$/.test(name)) {
    return false;
  }

  const words = name.split(/\s+/).filter(Boolean);
  return words.length >= 2 && words.length <= 5 && name.length >= 6 && name.length <= 80;
}

function normalizeAcademicYear(source: string): string | undefined {
  const match = source.match(/14[4-9]\d(?:\s*[-–]\s*14[4-9]\d)?/);
  return match?.[0]?.replace(/\s+/g, "") ?? undefined;
}

function mapSemesterToken(source: string): string | undefined {
  const labeled = source.trim();

  if (labeled === "1" || labeled === "2" || labeled === "3") {
    return labeled;
  }
  if (/الأول|الاول/.test(labeled)) {
    return "1";
  }
  if (/الثاني/.test(labeled)) {
    return "2";
  }
  if (/الثالث/.test(labeled)) {
    return "3";
  }

  return undefined;
}

function normalizeSemesterFromText(source: string): string | undefined {
  if (!/الفصل الدراسي/.test(source)) {
    return undefined;
  }

  return mapSemesterToken(source);
}

function isNoise(value: string): boolean {
  const normalized = value.trim();

  if (normalized.includes("مدرستي")) {
    return true;
  }

  return NAV_NOISE.some(
    (item) => normalized === item || (item.length >= 8 && normalized.includes(item)),
  );
}

function isSensitiveIdentifier(value: string): boolean {
  return (
    /^\d{10}$/.test(value.trim()) ||
    /@/.test(value) ||
    /^\+?\d{8,15}$/.test(value.trim())
  );
}

function normalizeLabel(label: string): string {
  return label.replace(/[:：]/g, "").replace(/\s+/g, " ").trim();
}

function clip(value: string, max: number): string {
  return value.trim().slice(0, max);
}

function uniqueClipped(values: readonly string[], maxItems: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const clipped = clip(value, MAX_FIELD);
    if (!clipped || seen.has(clipped)) {
      continue;
    }
    seen.add(clipped);
    result.push(clipped);
    if (result.length >= maxItems) {
      break;
    }
  }

  return result;
}
